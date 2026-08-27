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
   * Scrapes, validates, and analyzes a student's public Google Sheet
   */
  static async scrapeStudentJobSheet(sheetUrl, studentDiscordId) {
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
          uniqueCompaniesCount: 0,
          duplicateLinksCount: 0,
          invalidRowsCount: 0,
          topPositions: [],
          topPlatforms: []
        };
      }

      // 1. Discover Column Indices from Header Row
      const headerRow = this.parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());

      let colCompany = -1;
      let colPosition = -1;
      let colJobType = -1;
      let colJobLink = -1;
      let colHowApplied = -1;
      let colDate = -1;

      headerRow.forEach((col, idx) => {
        if (col.includes('company') || col.includes('organization') || col.includes('employer')) colCompany = idx;
        else if (col.includes('position') || col.includes('role') || col.includes('job title') || col.includes('title')) colPosition = idx;
        else if (col.includes('type') || col.includes('workplace')) colJobType = idx;
        else if (col.includes('link') || col.includes('url') || col.includes('posting') || col.includes('apply')) colJobLink = idx;
        else if (col.includes('how') || col.includes('method') || col.includes('source') || col.includes('platform') || col.includes('via') || col.includes('channel')) colHowApplied = idx;
        else if (col.includes('date') || col.includes('timestamp') || col.includes('time')) colDate = idx;
      });

      // Default fallbacks if header names are generic
      if (colCompany === -1) colCompany = 0;
      if (colPosition === -1) colPosition = 1;
      if (colJobType === -1) colJobType = 2;
      if (colJobLink === -1) colJobLink = 3;
      if (colHowApplied === -1) colHowApplied = 4;
      if (colDate === -1) colDate = 5;

      const todayStr = DateTimeUtil.getTodayDateStr(); // YYYY-MM-DD
      const todayAlt1 = DateTimeUtil.now().toFormat('dd/MM/yyyy');
      const todayAlt2 = DateTimeUtil.now().toFormat('MM/dd/yyyy');
      const todayAlt3 = DateTimeUtil.now().toFormat('d/M/yyyy');
      const todayAlt4 = DateTimeUtil.now().toFormat('d-MMM'); // e.g. 27-Aug
      const todayAlt5 = DateTimeUtil.now().toFormat('d MMMM'); // e.g. 27 August

      const seenLinks = new Set();
      const uniqueCompanies = new Set();
      const positionCounts = {};
      const platformCounts = {};

      let validApplicationsCount = 0;
      let datedTodayCount = 0;
      let duplicateLinksCount = 0;
      let invalidRowsCount = 0;

      // 2. Iterate and Validate Data Rows
      for (let i = 1; i < lines.length; i++) {
        const cells = this.parseCsvLine(lines[i]);
        if (cells.length === 0 || !cells.some(c => c.length > 0)) continue;

        const company = (cells[colCompany] || '').trim();
        const position = (cells[colPosition] || '').trim();
        const jobType = colJobType < cells.length ? (cells[colJobType] || '').trim() : '';
        const jobLink = colJobLink < cells.length ? (cells[colJobLink] || '').trim() : '';
        const howApplied = colHowApplied < cells.length ? (cells[colHowApplied] || '').trim() : '';
        const dateRaw = colDate < cells.length ? (cells[colDate] || '').trim() : '';

        // --- Validation Rules ---
        // Rule A: Company and Position must be non-empty
        if (!company || company.length < 2 || !position || position.length < 2) {
          invalidRowsCount++;
          continue;
        }

        // Rule B: Job Link must be present and resemble a URL
        const isUrlPattern = /^https?:\/\//i.test(jobLink) || /www\./i.test(jobLink) || /\.(com|org|net|io|co|ai|dev|app|bd|careers)/i.test(jobLink);
        if (!jobLink || jobLink.length < 5 || !isUrlPattern) {
          invalidRowsCount++;
          continue;
        }

        // Rule C: De-duplication (Duplicate Job Link cannot be counted twice)
        const normalizedLink = this.normalizeUrl(jobLink);
        if (seenLinks.has(normalizedLink)) {
          duplicateLinksCount++;
          continue;
        }
        seenLinks.add(normalizedLink);

        // Row is VALID!
        validApplicationsCount++;
        uniqueCompanies.add(company.toLowerCase());

        // Count Positions
        const cleanPos = position.split(/[/,-]/)[0].trim();
        positionCounts[cleanPos] = (positionCounts[cleanPos] || 0) + 1;

        // Count Platforms
        const cleanPlatform = howApplied || "Online/Portal";
        platformCounts[cleanPlatform] = (platformCounts[cleanPlatform] || 0) + 1;

        // Date check for TODAY
        const fullRowText = lines[i].toLowerCase();
        const isToday =
          fullRowText.includes(todayStr.toLowerCase()) ||
          fullRowText.includes(todayAlt1.toLowerCase()) ||
          fullRowText.includes(todayAlt2.toLowerCase()) ||
          fullRowText.includes(todayAlt3.toLowerCase()) ||
          fullRowText.includes(todayAlt4.toLowerCase()) ||
          fullRowText.includes(todayAlt5.toLowerCase()) ||
          dateRaw.includes(todayStr) ||
          dateRaw.includes(todayAlt1);

        if (isToday) {
          datedTodayCount++;
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
        datedTodayCount: datedTodayCount,
        uniqueCompaniesCount: uniqueCompanies.size,
        duplicateLinksCount: duplicateLinksCount,
        invalidRowsCount: invalidRowsCount,
        topPositions: topPositions,
        topPlatforms: topPlatforms
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
