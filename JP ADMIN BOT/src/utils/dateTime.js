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
    const str = String(raw).trim();
    const currentYear = DateTime.now().setZone(timezone).year;

    // 1. YYYY-MM-DD
    let m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

    // 2. DD/MM/YYYY or DD-MM-YYYY
    m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

    // 3. DD/MM/YY or DD-MM-YY
    m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
    if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

    // 4. DD-MMM-YYYY, DD MMM YYYY, or DD-MMM (e.g. 7-Sep-2026, 7 Sep, 07-Sep)
    const monthNames = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    m = str.match(/^(\d{1,2})[-\s]([a-zA-Z]{3,9})(?:[-\s](\d{2,4}))?/);
    if (m) {
      const day = m[1].padStart(2, '0');
      const monStr = m[2].substring(0, 3).toLowerCase();
      const mon = monthNames[monStr];
      if (mon) {
        let yr = currentYear;
        if (m[3]) yr = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${yr}-${mon}-${day}`;
      }
    }

    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return DateTime.fromJSDate(d).setZone(timezone).toFormat('yyyy-MM-dd');
      }
    } catch (e) {}
    return String(raw).substring(0, 10);
  }

  static getCurrentWeekRange(timezone = 'Asia/Dhaka') {
    const nowZone = DateTime.now().setZone(timezone);
    const todayWeekday = nowZone.weekday; // 7 = Sun, 1-4 = Mon-Thu, 5=Fri, 6=Sat
    const daysSinceSunday = todayWeekday === 7 ? 0 : todayWeekday;
    const weekSunday = nowZone.minus({ days: daysSinceSunday }).toFormat('yyyy-MM-dd');
    const weekThursday = nowZone.minus({ days: daysSinceSunday }).plus({ days: 4 }).toFormat('yyyy-MM-dd');
    return { weekSunday, weekThursday };
  }

  static isInCurrentWeek(rawDate, timezone = 'Asia/Dhaka') {
    const norm = this.normalizeDateStr(rawDate, timezone);
    if (!norm) return false;
    const { weekSunday, weekThursday } = this.getCurrentWeekRange(timezone);
    return norm >= weekSunday && norm <= weekThursday;
  }
}

module.exports = DateTimeUtil;
