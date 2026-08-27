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
}

module.exports = DateTimeUtil;
