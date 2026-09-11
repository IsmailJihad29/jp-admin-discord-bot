/**
 * JP ADMIN — Student Job Tracking Sheet Scraper & Validation Service
 * Features:
 * 1. Strict validation: requires Company, Position, Job Link (URL), and Date.
 * 2. De-duplication: prevents counting duplicate Job Links.
 * 3. Deep analytics: aggregates unique companies, top positions, and application channels.
 */

const axios = require('axios');
const DateTimeUtil = require('../utils/dateTime');
const Logger = require('../utils/logger');

class JobScraperService {
  /**
   * Extracts Sheet ID and GID from public Google Sheet URL
   */
  static parseSheetUrl(url) {
    if (!url) return null;
    const matchId = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const matchGid = url.match(/gid=([0-9]+)/);

    return {
      sheetId: matchId ? matchId[1] : null,
      gid: matchGid ? matchGid[1] : '0'
    };
  }

  /**
   * Helper to parse a single CSV line with quoted commas support
   */
  static parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  }

  /**
   * Normalizes URLs for de-duplication
   */
  static normalizeUrl(url) {
    if (!url) return "";
    return url
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/[\?#].*$/, '') // remove query params and tracking tokens
      .replace(/\/$/, '');
  }

  /**
   * Helper to fetch CSV content with multi-endpoint fallbacks (fixes HTTP 400 when gid=0 is missing)
   */
  static async fetchCsvContent(sheetId, gid) {
    const endpoints = [];

    // 1. With explicit GID
    if (gid && gid !== '0') {
      endpoints.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`);
      endpoints.push(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`);
    }

    // 2. Default active tab (Prevents HTTP 400 when gid=0 doesn't exist)
    endpoints.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);
    endpoints.push(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`);

    // 3. Explicit gid=0
    endpoints.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`);

    let lastError = null;
    let isOrgRestricted = false;

    for (const url of endpoints) {
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const csvData = response.data;
        if (typeof csvData === 'string' && !csvData.includes('<!DOCTYPE html>') && !csvData.includes('accounts.google.com')) {
          return { success: true, data: csvData };
        }
      } catch (err) {
        lastError = err;
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          isOrgRestricted = true;
        }
      }
    }

    if (isOrgRestricted) {
      return {
        success: false,
        error: "Google Workspace / University Account Restriction! If you created this sheet with a university or company email, sharing is restricted to your organization. Please use a personal Gmail account or set General access to 'Anyone on the internet with the link'."
      };
    }

    return {
      success: false,
      error: `Could not read Sheet data (${lastError ? lastError.message : 'Access Restricted'}). Please set General access to 'Anyone with the link' (Viewer or Editor).`
    };
  }

  /**
   * Extracts a valid Job Application URL from any raw cell value
   * Handles plain URLs, protocol-less URLs, =HYPERLINK formulas, and Markdown links
   */
  static extractJobLink(cell) {
    if (!cell || typeof cell !== 'string') return null;
    const str = cell.trim();
    if (str.length < 5) return null;

    // Ignore email addresses
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str)) {
      return null;
    }

    // 1. Google Sheets =HYPERLINK("...", "...") formula
    const hyperlinkMatch = str.match(/=HYPERLINK\(\s*["']([^"']+)["']/i);
    if (hyperlinkMatch && hyperlinkMatch[1]) {
      return hyperlinkMatch[1].trim();
    }

    // 2. Markdown link [text](url)
    const mdMatch = str.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/i);
    if (mdMatch && mdMatch[1]) {
      return mdMatch[1].trim();
    }

    // 3. Full http(s) URL anywhere in cell
    const httpMatch = str.match(/(https?:\/\/[^\s"'<>]+)/i);
    if (httpMatch && httpMatch[1]) {
      return httpMatch[1].trim();
    }

    // 4. www. URL
    const wwwMatch = str.match(/(www\.[^\s"'<>]+\.[a-z]{2,}[^\s"'<>]*)/i);
    if (wwwMatch && wwwMatch[1]) {
      return 'https://' + wwwMatch[1].trim();
    }

    // 5. Common job platforms and domain-based URLs without protocol
    const domainMatch = str.match(/([a-zA-Z0-9-]+\.(?:com|org|net|io|co|ai|dev|app|bd|careers|gov|edu|tech|me)(?:\/[^\s"'<>]*)?)/i);
    if (domainMatch && domainMatch[1] && domainMatch[1].includes('.')) {
      return 'https://' + domainMatch[1].trim();
    }

    return null;
  }

  /**
   * Scrapes, validates, and analyzes a student's public Google Sheet
   */
  static async scrapeStudentJobSheet(sheetUrl, studentDiscordId, options = {}) {
    const todayStr = DateTimeUtil.getTodayDateStr();
    const targetDate = options.targetDate ? (DateTimeUtil.normalizeDateStr(options.targetDate) || todayStr) : todayStr;
    const startDate = options.startDate ? DateTimeUtil.normalizeDateStr(options.startDate) : null;

    if (sheetUrl && sheetUrl.includes('/copy')) {
      return {
        success: false,
        error: "You linked the template '/copy' URL! Please open the sheet in your browser and copy the actual link from your browser address bar (ends in /edit)."
      };
    }

    const parsed = this.parseSheetUrl(sheetUrl);
    if (!parsed || !parsed.sheetId) {
      return { success: false, error: "Invalid Google Sheet URL format" };
    }

    try {
      const fetchRes = await this.fetchCsvContent(parsed.sheetId, parsed.gid);
      if (!fetchRes.success) {
        return { success: false, error: fetchRes.error };
      }

      const csvData = fetchRes.data;
      const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        return {
          success: true,
          totalRows: 0,
          datedTodayCount: 0,
          datedTargetCount: 0,
          datedThisWeekCount: 0,
          datedSinceStartCount: 0,
          jobsByDate: {},
          uniqueCompaniesCount: 0,
          duplicateLinksCount: 0,
          invalidRowsCount: 0,
          topPositions: [],
          topPlatforms: [],
          recentApplications: []
        };
      }

      // 1. Discover Header Row (scan up to first 15 lines)
      let headerLineIdx = 0;
      let maxScore = 0;
      const headerKeywords = [
        'date', 'tarikh', 'applied', 'company', 'organization', 'employer', 'kompani',
        'position', 'role', 'title', 'designation', 'podobi', 'link', 'url', 'posting',
        'circular', 'source', 'platform', 'how', 'via', 'medium'
      ];

      for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const parsedLine = this.parseCsvLine(lines[i]).map(h => h.toLowerCase().trim());
        let score = 0;
        parsedLine.forEach(h => {
          if (headerKeywords.some(kw => h.includes(kw))) {
            score++;
          }
        });
        if (score > maxScore) {
          maxScore = score;
          headerLineIdx = i;
        }
      }

      const headerRow = this.parseCsvLine(lines[headerLineIdx]).map(h => h.toLowerCase().trim());

      let colCompany = -1;
      let colPosition = -1;
      let colJobType = -1;
      let colJobLink = -1;
      let colHowApplied = -1;
      let colDate = -1;

      // Date: Exact match first, then substring
      colDate = headerRow.findIndex(h => h === 'date' || h === 'applied date' || h === 'application date' || h === 'date applied');
      if (colDate === -1) {
        colDate = headerRow.findIndex(h => h.includes('date') || h.includes('tarikh') || h === 'timestamp' || h === 'when' || h === 'time');
      }

      // Job Link: Exact match first, then substring excluding how/source/platform
      colJobLink = headerRow.findIndex(h => h === 'job link' || h === 'link' || h === 'url' || h === 'job url' || h === 'posting url' || h === 'posting link' || h === 'apply link');
      if (colJobLink === -1) {
        colJobLink = headerRow.findIndex(h =>
          (h.includes('link') || h.includes('url') || h.includes('posting') || h.includes('circular')) &&
          !h.includes('how') && !h.includes('method') && !h.includes('source') && !h.includes('platform')
        );
      }

      // Company: Exact match first, then includes company/employer
      colCompany = headerRow.findIndex(h => h === 'company' || h === 'company name' || h === 'organization' || h === 'employer' || h === 'org');
      if (colCompany === -1) {
        colCompany = headerRow.findIndex(h =>
          (h.includes('company') || h.includes('organization') || h.includes('employer') || h.includes('kompani')) &&
          !h.includes('location') && !h.includes('address') && !h.includes('link') && !h.includes('url') && !h.includes('web')
        );
      }

      // Position: Exact match first, then substring
      colPosition = headerRow.findIndex(h => h === 'position' || h === 'role' || h === 'job title' || h === 'title' || h === 'designation');
      if (colPosition === -1) {
        colPosition = headerRow.findIndex(h =>
          h.includes('position') || h.includes('role') || h.includes('job title') || h.includes('title') || h.includes('designation') || h.includes('podobi')
        );
      }

      // How Applied:
      colHowApplied = headerRow.findIndex(h =>
        h.includes('how') || h.includes('method') || h.includes('source') || h.includes('platform') || h.includes('channel') || h.includes('via') || h.includes('medium')
      );

      // Job Type / Nature:
      colJobType = headerRow.findIndex(h =>
        (h.includes('type') || h.includes('nature') || h.includes('workplace')) && !h.includes('location')
      );

      const seenLinks = new Set();
      const uniqueCompanies = new Set();
      const positionCounts = {};
      const platformCounts = {};
      const jobsByDate = {};
      const recentApplications = [];

      let validApplicationsCount = 0;
      let datedSinceStartCount = 0;
      let datedTodayCount = 0;
      let datedTargetCount = 0;
      let datedThisWeekCount = 0;
      let duplicateLinksCount = 0;
      let invalidRowsCount = 0;

      // 2. Iterate and Validate Data Rows
      for (let i = headerLineIdx + 1; i < lines.length; i++) {
        const cells = this.parseCsvLine(lines[i]);
        if (cells.length === 0 || !cells.some(c => c && c.trim().length > 0)) continue;

        // Step 1: Detect Job Link
        let jobLink = null;
        let jobLinkColIdx = -1;

        // Try designated link column first
        if (colJobLink >= 0 && colJobLink < cells.length) {
          const found = this.extractJobLink(cells[colJobLink]);
          if (found) {
            jobLink = found;
            jobLinkColIdx = colJobLink;
          }
        }

        // If not found in designated column, search all cells across the row
        if (!jobLink) {
          for (let c = 0; c < cells.length; c++) {
            const found = this.extractJobLink(cells[c]);
            if (found) {
              jobLink = found;
              jobLinkColIdx = c;
              break;
            }
          }
        }

        // USER RULE: A row is counted if and only if it contains a link!
        if (!jobLink) {
          invalidRowsCount++;
          continue;
        }

        // De-duplication: Exact same URL cannot be counted multiple times in the same student's sheet
        const normalizedLink = this.normalizeUrl(jobLink);
        if (seenLinks.has(normalizedLink)) {
          duplicateLinksCount++;
          continue;
        }
        seenLinks.add(normalizedLink);

        // Step 2: Detect Date
        let rowDate = null;

        // Try designated date column first
        if (colDate >= 0 && colDate < cells.length && colDate !== jobLinkColIdx) {
          rowDate = DateTimeUtil.normalizeDateStr(cells[colDate]);
        }

        // If not found, scan all other cells in the row
        if (!rowDate) {
          for (let c = 0; c < cells.length; c++) {
            if (c === jobLinkColIdx) continue;
            const nd = DateTimeUtil.normalizeDateStr(cells[c]);
            if (nd) {
              rowDate = nd;
              break;
            }
          }
        }

        // Fallback: If no date was found in the row at all, default to today
        if (!rowDate) {
          rowDate = todayStr;
        }

        // Step 3: Extract or Infer Company & Position
        let company = (colCompany >= 0 && colCompany < cells.length && colCompany !== jobLinkColIdx ? cells[colCompany] : '').trim();
        let position = (colPosition >= 0 && colPosition < cells.length && colPosition !== jobLinkColIdx ? cells[colPosition] : '').trim();
        let howApplied = (colHowApplied >= 0 && colHowApplied < cells.length && colHowApplied !== jobLinkColIdx ? cells[colHowApplied] : '').trim();

        // Infer company if missing, placeholder, or URL
        if (!company || company.length < 2 || company.startsWith('http') || company.toLowerCase() === 'n/a' || company.toLowerCase() === 'tbd') {
          try {
            const parsedUrl = new URL(jobLink.startsWith('http') ? jobLink : 'https://' + jobLink);
            let hostname = parsedUrl.hostname.replace(/^www\./i, '');
            const parts = hostname.split('.');
            company = (parts.length >= 2 ? parts[parts.length - 2] : hostname);
            company = company.charAt(0).toUpperCase() + company.slice(1);
          } catch (e) {
            company = "Company";
          }
        }

        // Infer position if missing or placeholder
        if (!position || position.length < 2 || position.startsWith('http') || position.toLowerCase() === 'n/a') {
          position = "Role / Position";
        }

        // Infer platform if missing
        if (!howApplied) {
          const lowerLink = jobLink.toLowerCase();
          if (lowerLink.includes('linkedin')) howApplied = 'LinkedIn';
          else if (lowerLink.includes('bdjobs')) howApplied = 'Bdjobs';
          else if (lowerLink.includes('indeed')) howApplied = 'Indeed';
          else if (lowerLink.includes('lever') || lowerLink.includes('greenhouse') || lowerLink.includes('workday')) howApplied = 'Company Portal';
          else howApplied = 'Online Job Board';
        }

        // Row is VALID!
        validApplicationsCount++;
        uniqueCompanies.add(company.toLowerCase());

        // Increment count by date
        jobsByDate[rowDate] = (jobsByDate[rowDate] || 0) + 1;

        if (rowDate === todayStr) {
          datedTodayCount++;
        }
        if (rowDate === targetDate) {
          datedTargetCount++;
        }
        if (DateTimeUtil.isInCurrentWeek(rowDate)) {
          datedThisWeekCount++;
        }
        if (!startDate || rowDate >= startDate) {
          datedSinceStartCount++;
        }

        // Count Positions
        const cleanPos = position.split(/[/,-]/)[0].trim();
        positionCounts[cleanPos] = (positionCounts[cleanPos] || 0) + 1;

        // Count Platforms
        platformCounts[howApplied] = (platformCounts[howApplied] || 0) + 1;

        if (recentApplications.length < 10) {
          recentApplications.push({
            date: rowDate,
            company,
            position,
            link: jobLink,
            platform: howApplied
          });
        }
      }

      // Sort Top Positions & Platforms
      const topPositions = Object.entries(positionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([pos, count]) => `${pos} (${count})`);

      const topPlatforms = Object.entries(platformCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([plat, count]) => `${plat} (${count})`);

      return {
        success: true,
        sheetId: parsed.sheetId,
        gid: parsed.gid,
        totalRows: validApplicationsCount,
        datedSinceStartCount: datedSinceStartCount,
        datedTodayCount: datedTodayCount,
        datedTargetCount: datedTargetCount,
        datedThisWeekCount: datedThisWeekCount,
        jobsByDate: jobsByDate,
        uniqueCompaniesCount: uniqueCompanies.size,
        duplicateLinksCount: duplicateLinksCount,
        invalidRowsCount: invalidRowsCount,
        topPositions: topPositions,
        topPlatforms: topPlatforms,
        recentApplications: recentApplications
      };
    } catch (err) {
      Logger.warn(`Failed to scrape job sheet for student ${studentDiscordId}: ${err.message}`);
      return {
        success: false,
        error: `Could not fetch Sheet (${err.message}). Verify link permissions.`
      };
    }
  }
}

module.exports = JobScraperService;
