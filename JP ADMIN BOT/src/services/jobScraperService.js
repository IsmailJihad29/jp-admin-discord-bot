/**
 * JP ADMIN — Student Job Tracking Sheet Scraper Service
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
   * Scrapes and parses a public Google Sheet CSV export
   */
  static async scrapeStudentJobSheet(sheetUrl, studentDiscordId) {
    const parsed = this.parseSheetUrl(sheetUrl);
    if (!parsed || !parsed.sheetId) {
      return { success: false, error: "Invalid Google Sheet URL format" };
    }

    const csvExportUrl = `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/export?format=csv&gid=${parsed.gid}`;

    try {
      const response = await axios.get(csvExportUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const csvData = response.data;
      if (typeof csvData !== 'string' || csvData.includes('<!DOCTYPE html>')) {
        return {
          success: false,
          error: "Sheet is not publicly viewable or requires login. Ensure link sharing is set to Anyone with the link."
        };
      }

      const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        return {
          success: true,
          totalRows: 0,
          datedTodayCount: 0,
          newRows: 0
        };
      }

      // Detect date columns and application entries
      const todayStr = DateTimeUtil.getTodayDateStr(); // e.g. 2026-08-26
      const todayAlt = DateTimeUtil.now().toFormat('dd/MM/yyyy');
      const todayAlt2 = DateTimeUtil.now().toFormat('MM/dd/yyyy');
      const todayAlt3 = DateTimeUtil.now().toFormat('d-MMM'); // e.g. 26-Aug

      let totalValidApps = 0;
      let todayCount = 0;

      // Skip header row (row index 0)
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        // Heuristic: row must have at least company/position and some content
        const cells = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const hasContent = cells.some(c => c.length > 2);

        if (hasContent) {
          totalValidApps++;
          const rowText = row.toLowerCase();
          if (
            rowText.includes(todayStr.toLowerCase()) ||
            rowText.includes(todayAlt.toLowerCase()) ||
            rowText.includes(todayAlt2.toLowerCase()) ||
            rowText.includes(todayAlt3.toLowerCase())
          ) {
            todayCount++;
          }
        }
      }

      return {
        success: true,
        sheetId: parsed.sheetId,
        gid: parsed.gid,
        totalRows: totalValidApps,
        datedTodayCount: todayCount,
        newRows: todayCount // conservative fallback
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
