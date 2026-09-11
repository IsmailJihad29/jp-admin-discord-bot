/**
 * JP ADMIN — Date & Time Utility (Asia/Dhaka timezone)
 */

const { DateTime } = require('luxon');

class DateTimeUtil {
  static now(timezone = 'Asia/Dhaka') {
    return DateTime.now().setZone(timezone);
  }

  static getTodayDateStr(timezone = 'Asia/Dhaka') {
    return this.now(timezone).toFormat('yyyy-MM-dd');
  }

  static getCurrentTimeStr(timezone = 'Asia/Dhaka') {
    return this.now(timezone).toFormat('HH:mm');
  }

  static getFullTimestamp(timezone = 'Asia/Dhaka') {
    return this.now(timezone).toFormat('yyyy-MM-dd HH:mm:ss');
  }

  static isWithinWindow(startStr, endStr, timezone = 'Asia/Dhaka') {
    const current = this.getCurrentTimeStr(timezone);
    return current >= startStr && current <= endStr;
  }

  static getDayOfWeek(timezone = 'Asia/Dhaka') {
    return this.now(timezone).toFormat('cccc'); // e.g. "Monday", "Thursday"
  }

  static isWorkingDay(timezone = 'Asia/Dhaka') {
    const weekday = this.now(timezone).weekday; // 1 = Monday ... 7 = Sunday
    // Sunday (7), Monday (1), Tuesday (2), Wednesday (3), Thursday (4) are active working days in Dhaka mentorship schedule
    return weekday >= 1 && weekday <= 4 || weekday === 7;
  }

  static getNextSundayDate(timezone = 'Asia/Dhaka') {
    const dt = this.now(timezone);
    const daysUntilSunday = dt.weekday === 7 ? 7 : (7 - dt.weekday);
    return dt.plus({ days: daysUntilSunday }).toFormat('yyyy-MM-dd');
  }

  static formatRelative(isoString, timezone = 'Asia/Dhaka') {
    const dt = DateTime.fromISO(isoString).setZone(timezone);
    return dt.toRelative();
  }

  static normalizeDateStr(raw, timezone = 'Asia/Dhaka') {
    if (!raw) return null;
    const str = String(raw).trim().replace(/,\s*/g, ' ');
    const nowZone = DateTime.now().setZone(timezone);
    const currentYear = nowZone.year;

    // Relative dates: today, yesterday (Bengali & English)
    if (/^(today|todays|আজকে|আজ)$/i.test(str)) {
      return nowZone.toFormat('yyyy-MM-dd');
    }
    if (/^(yesterday|yesterdays|গতকাল)$/i.test(str)) {
      return nowZone.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    }

    // ISO timestamp (e.g. 2026-09-11T04:30:00.000Z)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    // 1. YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
    let m = str.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }

    const monthNames = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      january: '01', february: '02', march: '03', april: '04', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };

    // 2. Month name first: Sep 11, September 11 2026, Sep-11-2026
    m = str.match(/^([a-zA-Z]{3,9})[-\s]+(\d{1,2})(?:[-\s,]+(\d{2,4}))?/);
    if (m) {
      const mon = monthNames[m[1].toLowerCase()] || monthNames[m[1].substring(0, 3).toLowerCase()];
      if (mon) {
        const day = m[2].padStart(2, '0');
        let yr = currentYear;
        if (m[3]) yr = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${yr}-${mon}-${day}`;
      }
    }

    // 3. Day first with Month name: 11 Sep, 11-Sep-2026, 11 September 2026
    m = str.match(/^(\d{1,2})[-\s]+([a-zA-Z]{3,9})(?:[-\s,]+(\d{2,4}))?/);
    if (m) {
      const mon = monthNames[m[2].toLowerCase()] || monthNames[m[2].substring(0, 3).toLowerCase()];
      if (mon) {
        const day = m[1].padStart(2, '0');
        let yr = currentYear;
        if (m[3]) yr = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${yr}-${mon}-${day}`;
      }
    }

    // 4. DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, or MM/DD/YYYY
    m = str.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
    if (m) {
      const n1 = parseInt(m[1], 10);
      const n2 = parseInt(m[2], 10);
      let day, mon;
      if (n1 > 12 && n2 <= 12) {
        day = String(n1).padStart(2, '0');
        mon = String(n2).padStart(2, '0');
      } else if (n2 > 12 && n1 <= 12) {
        mon = String(n1).padStart(2, '0');
        day = String(n2).padStart(2, '0');
      } else {
        // Default BD / Asia-Dhaka standard: DD.MM.YYYY
        day = String(n1).padStart(2, '0');
        mon = String(n2).padStart(2, '0');
      }
      return `${m[3]}-${mon}-${day}`;
    }

    // 5. DD.MM.YY, DD/MM/YY, DD-MM-YY
    m = str.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2})$/);
    if (m) {
      const n1 = parseInt(m[1], 10);
      const n2 = parseInt(m[2], 10);
      let day, mon;
      if (n1 > 12 && n2 <= 12) {
        day = String(n1).padStart(2, '0');
        mon = String(n2).padStart(2, '0');
      } else if (n2 > 12 && n1 <= 12) {
        mon = String(n1).padStart(2, '0');
        day = String(n2).padStart(2, '0');
      } else {
        day = String(n1).padStart(2, '0');
        mon = String(n2).padStart(2, '0');
      }
      return `20${m[3]}-${mon}-${day}`;
    }

    // 6. DD/MM or DD.MM without year (e.g. 11/09, 11.9, 11-9)
    m = str.match(/^(\d{1,2})[-\/\.](\d{1,2})$/);
    if (m) {
      const n1 = parseInt(m[1], 10);
      const n2 = parseInt(m[2], 10);
      if (n1 <= 31 && n2 <= 12) {
        return `${currentYear}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
      }
    }

    // 7. Fallback JS Date parsing
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const dt = DateTime.fromJSDate(d).setZone(timezone);
        if (dt.isValid && dt.year >= 2020 && dt.year <= 2050) {
          return dt.toFormat('yyyy-MM-dd');
        }
      }
    } catch (e) {}
    return null;
  }

  static getCurrentWeekRange(timezone = 'Asia/Dhaka') {
    const nowZone = DateTime.now().setZone(timezone);
    const todayWeekday = nowZone.weekday; // 7 = Sun, 1-4 = Mon-Thu, 5=Fri, 6=Sat
    const daysSinceSunday = todayWeekday === 7 ? 0 : todayWeekday;
    const weekSunday = nowZone.minus({ days: daysSinceSunday }).toFormat('yyyy-MM-dd');
    const weekThursday = nowZone.minus({ days: daysSinceSunday }).plus({ days: 4 }).toFormat('yyyy-MM-dd');
    const weekSaturday = nowZone.minus({ days: daysSinceSunday }).plus({ days: 6 }).toFormat('yyyy-MM-dd');
    return { weekSunday, weekThursday, weekSaturday };
  }

  static isInCurrentWeek(rawDate, timezone = 'Asia/Dhaka') {
    const norm = this.normalizeDateStr(rawDate, timezone);
    if (!norm) return false;
    const { weekSunday, weekSaturday } = this.getCurrentWeekRange(timezone);
    return norm >= weekSunday && norm <= weekSaturday;
  }
}

module.exports = DateTimeUtil;
