/**
 * JP ADMIN — Multi-Cohort Dynamic Manager
 */

const fs = require('fs');
const path = require('path');
const constants = require('./constants');

class CohortManager {
  constructor() {
    this.dataPath = path.join(__dirname, '../../data/cohorts.json');
    this.cohorts = new Map();
    this.initStorage();
  }

  initStorage() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.dataPath)) {
      try {
        const raw = fs.readFileSync(this.dataPath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach(c => this.cohorts.set(c.serverId, c));
        }
      } catch (e) {
        console.error("Error reading local cohorts file:", e);
      }
    }
  }

  saveToDisk() {
    try {
      const list = Array.from(this.cohorts.values());
      fs.writeFileSync(this.dataPath, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {
      console.error("Error saving cohorts to disk:", e);
    }
  }

  getCohort(guildId) {
    if (!guildId) return null;
    let cohort = this.cohorts.get(guildId);
    if (!cohort) {
      // Default fallback cohort structure using environment settings
      cohort = {
        serverId: guildId,
        name: "Default Cohort",
        gasUrl: process.env.DEFAULT_GAS_URL || "",
        gasSecret: process.env.DEFAULT_GAS_SECRET || "",
        timezone: process.env.DEFAULT_TIMEZONE || constants.DEFAULT_TIMEZONE,
        supervisors: [],
        targets: {
          applications: constants.SCORING.DEFAULT_JOB_TARGET,
          outreach: constants.SCORING.DEFAULT_OUTREACH_TARGET
        },
        automation: {
          enabled: true,
          forwarder: false,
          activeWindow: "04:50-23:30"
        },
        forwarder: {
          enabled: false,
          sourceChannelId: null,
          destChannelId: null
        },
        customChannels: {}
      };
      this.cohorts.set(guildId, cohort);
      this.saveToDisk();
    }
    return cohort;
  }

  setCohort(guildId, data) {
    const existing = this.getCohort(guildId);
    const updated = { ...existing, ...data, serverId: guildId };
    this.cohorts.set(guildId, updated);
    this.saveToDisk();
    return updated;
  }

  addSupervisor(guildId, userId) {
    const cohort = this.getCohort(guildId);
    if (!cohort.supervisors.includes(userId)) {
      cohort.supervisors.push(userId);
      this.saveToDisk();
    }
    return cohort.supervisors;
  }

  removeSupervisor(guildId, userId) {
    const cohort = this.getCohort(guildId);
    cohort.supervisors = cohort.supervisors.filter(id => id !== userId);
    this.saveToDisk();
    return cohort.supervisors;
  }

  isSupervisor(guildId, member) {
    if (!member) return false;
    // Server owner and Administrator permissions always count as supervisor
    if (member.permissions && member.permissions.has('Administrator')) return true;
    if (member.guild && member.guild.ownerId === member.id) return true;

    const cohort = this.getCohort(guildId);
    if (cohort && cohort.supervisors && cohort.supervisors.includes(member.id)) return true;

    // Check for explicit Supervisor role
    if (member.roles && member.roles.cache.some(r => r.name.toLowerCase() === 'supervisor' || r.name.toLowerCase() === 'admin' || r.name.toLowerCase() === 'administrator')) {
      return true;
    }

    return false;
  }

  isMentor(guildId, member) {
    if (!member) return false;
    if (this.isSupervisor(guildId, member)) return true;

    // Check for Mentor role
    if (member.roles && member.roles.cache.some(r => r.name.toLowerCase() === 'mentor')) {
      return true;
    }

    return false;
  }

  isStaff(guildId, member) {
    return this.isMentor(guildId, member);
  }

  addHoliday(guildId, holiday) {
    const cohort = this.getCohort(guildId);
    if (!cohort.holidays) cohort.holidays = [];
    cohort.holidays.push({
      startDate: holiday.startDate,
      endDate: holiday.endDate || holiday.startDate,
      title: holiday.title || "Offday"
    });
    this.saveToDisk();
    return cohort.holidays;
  }

  removeHoliday(guildId, dateStr) {
    const cohort = this.getCohort(guildId);
    if (!cohort.holidays) cohort.holidays = [];
    cohort.holidays = cohort.holidays.filter(h => {
      return !(h.startDate === dateStr || (dateStr >= h.startDate && dateStr <= h.endDate));
    });
    this.saveToDisk();
    return cohort.holidays;
  }

  getHolidays(guildId) {
    const cohort = this.getCohort(guildId);
    return cohort?.holidays || [];
  }

  isOffday(guildId, dateStr) {
    const holidays = this.getHolidays(guildId);
    return holidays.some(h => {
      const start = h.startDate;
      const end = h.endDate || h.startDate;
      return dateStr >= start && dateStr <= end;
    });
  }

  setMorningOff(guildId, data) {
    const cohort = this.getCohort(guildId);
    if (!cohort.morningOffDays) cohort.morningOffDays = [];
    const dateStr = typeof data === 'string' ? data : data.date;
    const reason = typeof data === 'object' && data.reason ? data.reason : "Morning Basecamp Off";
    const setBy = typeof data === 'object' && data.setBy ? data.setBy : "Mentor";

    // Remove existing if present
    cohort.morningOffDays = cohort.morningOffDays.filter(m => (typeof m === 'string' ? m : m.date) !== dateStr);
    
    cohort.morningOffDays.push({
      date: dateStr,
      reason: reason,
      setBy: setBy,
      createdAt: new Date().toISOString()
    });
    this.saveToDisk();
    return cohort.morningOffDays;
  }

  removeMorningOff(guildId, dateStr) {
    const cohort = this.getCohort(guildId);
    if (!cohort.morningOffDays) cohort.morningOffDays = [];
    const initialLen = cohort.morningOffDays.length;
    cohort.morningOffDays = cohort.morningOffDays.filter(m => (typeof m === 'string' ? m : m.date) !== dateStr);
    this.saveToDisk();
    return cohort.morningOffDays.length < initialLen;
  }

  isMorningOff(guildId, dateStr) {
    if (this.isOffday(guildId, dateStr)) return true;
    const list = this.getMorningOffDays(guildId);
    return list.some(m => (typeof m === 'string' ? m : m.date) === dateStr);
  }

  getMorningOffDays(guildId) {
    const cohort = this.getCohort(guildId);
    return cohort?.morningOffDays || [];
  }

  setTrackerTemplate(guildId, url) {
    const cohort = this.getCohort(guildId);
    cohort.trackerTemplateUrl = url;
    this.saveToDisk();
    return cohort.trackerTemplateUrl;
  }

  getTrackerTemplate(guildId) {
    const cohort = this.getCohort(guildId);
    return cohort?.trackerTemplateUrl || "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/copy";
  }

  getCohortScoring(guildId) {
    const cohort = this.getCohort(guildId);
    return {
      attendancePresent: cohort?.scoring?.attendancePresent ?? constants.SCORING.ATTENDANCE_PRESENT,
      attendanceAbsent: cohort?.scoring?.attendanceAbsent ?? constants.SCORING.ATTENDANCE_ABSENT,
      interviewPoints: cohort?.scoring?.interviewPoints ?? constants.SCORING.INTERVIEW_POINTS,
      taskAnnounced: cohort?.scoring?.taskAnnounced ?? 1,
      taskApproved: cohort?.scoring?.taskApproved ?? 1,
      taskOverduePenalty: cohort?.scoring?.taskOverduePenalty ?? -2,
      jobTarget: cohort?.targets?.applications ?? constants.SCORING.DEFAULT_JOB_TARGET,
      streakBonusPerDay: cohort?.scoring?.streakBonusPerDay ?? constants.SCORING.STREAK_BONUS_PER_DAY,
      streakCap: cohort?.scoring?.streakCap ?? constants.SCORING.STREAK_CAP,
      scoringStartDate: cohort?.scoringStartDate || "2026-08-30" // Next Sunday default reset date
    };
  }

  updateCohortScoring(guildId, updates) {
    const cohort = this.getCohort(guildId);
    cohort.scoring = { ...this.getCohortScoring(guildId), ...updates };
    if (updates.jobTarget !== undefined) {
      cohort.targets = cohort.targets || {};
      cohort.targets.applications = Number(updates.jobTarget);
    }
    if (updates.scoringStartDate !== undefined) {
      cohort.scoringStartDate = updates.scoringStartDate;
    }
    this.saveToDisk();
    return this.getCohortScoring(guildId);
  }

  setScoringStartDate(guildId, dateStr) {
    const cohort = this.getCohort(guildId);
    cohort.scoringStartDate = dateStr;
    this.saveToDisk();
    return cohort.scoringStartDate;
  }

  getScoringStartDate(guildId) {
    const cohort = this.getCohort(guildId);
    return cohort?.scoringStartDate || "2026-08-30";
  }

  resetCohortScoring(guildId, newStartDate = "2026-08-30") {
    const cohort = this.getCohort(guildId);
    delete cohort.scoring;
    cohort.scoringStartDate = newStartDate;
    if (cohort.targets) cohort.targets.applications = constants.SCORING.DEFAULT_JOB_TARGET;
    this.saveToDisk();
    return this.getCohortScoring(guildId);
  }

  queueCustomAttendance(guildId, item) {
    const cohort = this.getCohort(guildId);
    if (!cohort.queuedAttendance) cohort.queuedAttendance = [];

    const queueId = `ATT-${Date.now().toString(36).toUpperCase()}`;
    const entry = {
      id: queueId,
      tabName: item.tabName,
      date: item.date,
      sessionLabel: item.sessionLabel || item.tabName,
      requestedBy: item.requestedBy || "Admin",
      scheduledTime: item.scheduledTime || "23:30",
      createdAt: new Date().toISOString()
    };
    cohort.queuedAttendance.push(entry);
    this.saveToDisk();
    return entry;
  }

  getQueuedCustomAttendances(guildId, dateStr = null) {
    const cohort = this.getCohort(guildId);
    const list = cohort.queuedAttendance || [];
    if (!dateStr) return list;
    return list.filter(item => item.date === dateStr);
  }

  removeQueuedCustomAttendance(guildId, queueIdOrTabName) {
    const cohort = this.getCohort(guildId);
    if (!cohort.queuedAttendance) return false;
    const initialLen = cohort.queuedAttendance.length;
    cohort.queuedAttendance = cohort.queuedAttendance.filter(item => 
      item.id.toLowerCase() !== queueIdOrTabName.toLowerCase() &&
      item.tabName.toLowerCase() !== queueIdOrTabName.toLowerCase()
    );
    this.saveToDisk();
    return cohort.queuedAttendance.length < initialLen;
  }

  clearCompletedCustomAttendances(guildId, completedIds = []) {
    const cohort = this.getCohort(guildId);
    if (!cohort.queuedAttendance) return;
    if (completedIds.length > 0) {
      cohort.queuedAttendance = cohort.queuedAttendance.filter(item => !completedIds.includes(item.id));
    }
    this.saveToDisk();
  }

  getAllCohorts() {
    return Array.from(this.cohorts.values());
  }
}

module.exports = new CohortManager();
