/**
 * JP ADMIN — Logger Utility
 */

const { DateTime } = require('luxon');

class Logger {
  static getTimestamp() {
    return DateTime.now().setZone('Asia/Dhaka').toFormat('yyyy-MM-dd HH:mm:ss');
  }

  static info(message, ...args) {
    console.log(`[\x1b[36m${this.getTimestamp()}\x1b[0m] [\x1b[32mINFO\x1b[0m] ${message}`, ...args);
  }

  static warn(message, ...args) {
    console.warn(`[\x1b[36m${this.getTimestamp()}\x1b[0m] [\x1b[33mWARN\x1b[0m] ${message}`, ...args);
  }

  static error(message, ...args) {
    console.error(`[\x1b[36m${this.getTimestamp()}\x1b[0m] [\x1b[31mERROR\x1b[0m] ${message}`, ...args);
  }

  static debug(message, ...args) {
    if (process.env.DEBUG === 'true') {
      console.log(`[\x1b[36m${this.getTimestamp()}\x1b[0m] [\x1b[35mDEBUG\x1b[0m] ${message}`, ...args);
    }
  }
}

module.exports = Logger;
