/**
 * JP ADMIN — Google Apps Script API Client
 */

const axios = require('axios');
const Logger = require('../utils/logger');
const cohortManager = require('../config/cohortManager');

class GasClient {
  static async request(guildId, action, data = {}, retries = 3) {
    const cohort = cohortManager.getCohort(guildId);
    const gasUrl = cohort ? cohort.gasUrl : process.env.DEFAULT_GAS_URL;
    const secret = cohort ? cohort.gasSecret : process.env.DEFAULT_GAS_SECRET;

    if (!gasUrl || gasUrl.includes("YOUR_DEPLOYMENT_ID")) {
      throw new Error(`Google Apps Script URL not configured for server ${guildId}`);
    }

    const payload = {
      action: action,
      secret: secret,
      data: data
    };

    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      try {
        const response = await axios.post(gasUrl, payload, {
          timeout: 60000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.data && response.data.success) {
          return response.data.data;
        } else if (response.data && response.data.error) {
          throw new Error(response.data.error);
        } else {
          // In case Apps Script redirects or returns text
          if (typeof response.data === 'string' && response.data.includes('<html')) {
            throw new Error("Received HTML error response from Google Apps Script. Check deployment URL & permissions.");
          }
          return response.data;
        }
      } catch (err) {
        Logger.warn(`[GAS API] Attempt ${attempt}/${retries} failed for action "${action}": ${err.message}`);
        if (err.message.includes("Unknown action") || attempt >= retries) {
          if (attempt >= retries) {
            Logger.error(`[GAS API] Exhausted all ${retries} attempts for action "${action}".`);
          }
          throw err;
        }
        // Exponential backoff wait
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }
  }

  static async getDoctor(guildId) {
    return this.request(guildId, 'doctor');
  }

  static async initSheets(guildId, options = {}) {
    return this.request(guildId, 'initSheets', { options });
  }

  static async getRoster(guildId) {
    return this.request(guildId, 'getRoster');
  }

  static async syncRoster(guildId, members) {
    return this.request(guildId, 'syncRoster', { members });
  }

  static async updateProfile(guildId, profileData) {
    return this.request(guildId, 'updateStudentProfile', profileData);
  }

  static async setStudentStatus(guildId, discordId, status, note) {
    return this.request(guildId, 'setStudentStatus', { discordId, status, note });
  }

  static async recordAttendance(guildId, date, records) {
    return this.request(guildId, 'recordAttendance', { date, records });
  }

  static async getAttendance(guildId) {
    return this.request(guildId, 'getAttendance');
  }

  static async recordDawnAttendance(guildId, date, entries) {
    return this.request(guildId, 'recordDawnAttendance', { date, entries });
  }

  static async getDawnAttendance(guildId) {
    return this.request(guildId, 'getDawnAttendance');
  }

  static async submitLeave(guildId, leaveData) {
    return this.request(guildId, 'submitLeave', leaveData);
  }

  static async updateLeave(guildId, requestId, status, note) {
    return this.request(guildId, 'updateLeave', { requestId, status, note });
  }

  static async getLeaves(guildId, statusFilter) {
    return this.request(guildId, 'getLeaves', { status: statusFilter });
  }

  static async repairLeaves(guildId) {
    return this.request(guildId, 'repairLeaveRequests', {});
  }

  static async submitAppeal(guildId, appealData) {
    return this.request(guildId, 'submitAppeal', appealData);
  }

  static async updateAppeal(guildId, appealId, status, note) {
    return this.request(guildId, 'updateAppeal', { appealId, status, note });
  }

  static async getAppeals(guildId) {
    return this.request(guildId, 'getAppeals');
  }

  static async getQuestions(guildId, category, limit) {
    return this.request(guildId, 'getQuestions', { category, limit });
  }

  static async addQuestions(guildId, questions) {
    return this.request(guildId, 'addQuestions', { questions });
  }

  static async markQuestionUsed(guildId, questionId, date) {
    return this.request(guildId, 'markQuestionUsed', { questionId, usedOn: date });
  }

  static async recordScore(guildId, scoreData) {
    return this.request(guildId, 'recordScore', scoreData);
  }

  static async getScores(guildId, days = 7) {
    return this.request(guildId, 'getScores', { days });
  }

  static async recordJobDaily(guildId, jobData) {
    return this.request(guildId, 'recordJobDaily', jobData);
  }

  static async getJobsDaily(guildId, days = 7) {
    return this.request(guildId, 'getJobsDaily', { days });
  }

  static async recordOutreachDaily(guildId, outreachData) {
    return this.request(guildId, 'recordOutreachDaily', outreachData);
  }

  static async getOutreachDaily(guildId, days = 7) {
    return this.request(guildId, 'getOutreachDaily', { days });
  }

  static async recordInterview(guildId, interviewData) {
    return this.request(guildId, 'recordInterview', interviewData);
  }

  static async getInterviews(guildId, days = 7) {
    return this.request(guildId, 'getInterviews', { days });
  }

  static async getAllInterviews(guildId) {
    // days=0 → all-time (no cutoff filter in GAS)
    return this.request(guildId, 'getInterviews', { days: 0 });
  }

  static async voidInterview(guildId, discordLink, discordId, loggedDate, reason) {
    return this.request(guildId, 'voidInterview', { discordLink, discordId, loggedDate, reason });
  }

  static async recordWorkshop(guildId, workshopData) {
    return this.request(guildId, 'recordWorkshop', workshopData);
  }

  static async recordResume(guildId, resumeData) {
    return this.request(guildId, 'recordResume', resumeData);
  }

  static async recordProject(guildId, projectData) {
    return this.request(guildId, 'recordProject', projectData);
  }

  static async scanDailyAttendance(guildId, date) {
    return this.request(guildId, 'scanDailyAttendance', { date });
  }

  static async scanMorningAttendance(guildId, date) {
    return this.request(guildId, 'scanMorningAttendance', { date });
  }

  static async setMorningOff(guildId, data) {
    return this.request(guildId, 'setMorningOff', data);
  }

  static async scanCustomAttendance(guildId, tabName, date, sessionLabel) {
    return this.request(guildId, 'scanCustomAttendance', { tabName, date, sessionLabel });
  }

  static async syncHistoricalAttendance(guildId, options = {}) {
    return this.request(guildId, 'syncHistoricalAttendance', options);
  }

  static async getHolidays(guildId) {
    return this.request(guildId, 'getHolidays');
  }

  static async setHoliday(guildId, holidayData) {
    return this.request(guildId, 'setHoliday', holidayData);
  }

  static async removeHoliday(guildId, date) {
    return this.request(guildId, 'removeHoliday', { date });
  }

  static async repairAttendance(guildId) {
    return this.request(guildId, 'repairAttendance', {});
  }

  static async recordJobTask(guildId, taskData) {
    return this.request(guildId, 'recordJobTask', taskData);
  }

  static async submitJobTask(guildId, submissionData) {
    return this.request(guildId, 'submitJobTask', submissionData);
  }

  static async reviewJobTask(guildId, taskId, status, note) {
    return this.request(guildId, 'reviewJobTask', { taskId, status, note });
  }

  static async getJobTasks(guildId, statusFilter) {
    return this.request(guildId, 'getJobTasks', { status: statusFilter });
  }

  static async auditOverdueTasks(guildId) {
    return this.request(guildId, 'auditOverdueTasks', {});
  }

  static async saveFormTemplates(guildId, name, config) {
    return this.request(guildId, 'saveFormTemplates', { name, config });
  }

  static async getFormTemplates(guildId) {
    return this.request(guildId, 'getFormTemplates');
  }
}

module.exports = GasClient;
