/**
 * JP ADMIN — Multi-Cohort Dynamic Manager
 */

const fs = require('fs');
const path = require('path');
const constants = require('./constants');

const DEFAULT_FEATURES = {
  morning_attendance: {
    key: 'morning_attendance',
    name: 'Morning Attendance Scan & Points',
    description: '12:00 PM auto-scan, manual scan, and morning points calculation (+1/-1)',
    category: 'Attendance & Briefings',
    enabled: true,
    aliases: ['morning', 'morningattendance', 'morning_scan', 'morning_att', 'morn']
  },
  daily_attendance: {
    key: 'daily_attendance',
    name: 'Daily Attendance Scan & Points',
    description: '23:45 daily attendance form scan, 3-day inactivity warnings, and score calculation',
    category: 'Attendance & Briefings',
    enabled: true,
    aliases: ['daily', 'dailyattendance', 'attendance', 'daily_scan', 'att']
  },
  mentor_briefing: {
    key: 'mentor_briefing',
    name: 'Daily Mentor Morning Briefing',
    description: '09:30 AM daily operations digest posted to #jp-admin',
    category: 'Attendance & Briefings',
    enabled: true,
    aliases: ['briefing', 'adminbriefing', 'morningbriefing']
  },
  job_scraper: {
    key: 'job_scraper',
    name: 'Daily Job Sheet Scraper',
    description: '00:05 daily scraping of student job tracker sheets and score calculation',
    category: 'Job Tracking & Scraper',
    enabled: true,
    aliases: ['scraper', 'jobscraper', 'jobs', 'jobtracking', 'job']
  },
  task_overdue: {
    key: 'task_overdue',
    name: 'Task Overdue Penalty Monitor',
    description: '00:05 task overdue check and penalty deduction',
    category: 'Job Tracking & Scraper',
    enabled: true,
    aliases: ['tasks', 'taskoverdue', 'overdue', 'task']
  },
  job_sheet_hub: {
    key: 'job_sheet_hub',
    name: 'Job Sheet Auto-Linker Hub',
    description: 'Automatic registration of student Google Sheet links shared in #job-tracking',
    category: 'Job Tracking & Scraper',
    enabled: true,
    aliases: ['jobsheet', 'linksheet', 'jobsheets']
  },
  interview_hub: {
    key: 'interview_hub',
    name: 'Interview Preparation Hub',
    description: 'Message listener in #interview-preparation with AI interview tips and verification',
    category: 'Hubs & AI Evaluators',
    enabled: true,
    aliases: ['interview', 'interviews', 'interviewprep']
  },
  job_task_hub: {
    key: 'job_task_hub',
    name: 'Job Task Updates Hub',
    description: 'Message listener in #job-task-update for coding assignments and submissions',
    category: 'Hubs & AI Evaluators',
    enabled: true,
    aliases: ['jobtask', 'jobtasks']
  },
  daily_task_hub: {
    key: 'daily_task_hub',
    name: 'Daily Mentor Task Hub',
    description: 'Message listener in #daily-tasks for mentor target announcements',
    category: 'Hubs & AI Evaluators',
    enabled: true,
    aliases: ['dailytask', 'dailytasks']
  },
  leave_request_hub: {
    key: 'leave_request_hub',
    name: 'Leave Request Hub',
    description: 'Message listener in #leave-request for student leave submissions',
    category: 'Hubs & AI Evaluators',
    enabled: true,
    aliases: ['leave', 'leaves', 'leaverequest']
  },
  ai_feedback: {
    key: 'ai_feedback',
    name: 'Gemini AI Feedback & Advice',
    description: 'AI-powered evaluation, tips, and interview question answering',
    category: 'Hubs & AI Evaluators',
    enabled: true,
    aliases: ['ai', 'gemini', 'aifeedback']
  },
  weekly_closing: {
    key: 'weekly_closing',
    name: 'Weekly Closing & Leaderboard',
    description: 'Thursday night 00:20 weekly closing digest and leaderboard publishing',
    category: 'Governance & Reports',
    enabled: true,
    aliases: ['closing', 'weeklyclosing', 'leaderboard']
  },
  dropout_predictor: {
    key: 'dropout_predictor',
    name: 'Dropout Predictor & 1-on-1s',
    description: 'Thursday 18:30 at-risk audit and 1-on-1 scheduling',
    category: 'Governance & Reports',
    enabled: true,
    aliases: ['atrisk', 'risk', 'dropoutpredictor']
  },
  referral_lockout: {
    key: 'referral_lockout',
    name: 'Referral Lockout Sync',
    description: 'Automated sync of Active/Inactive roles and #resume-needed access gating',
    category: 'Governance & Reports',
    enabled: true,
    aliases: ['lockout', 'referrallockout', 'referralaccess']
  },
  forwarder: {
    key: 'forwarder',
    name: 'Announcement Forwarder Engine',
    description: 'Cross-server announcement broadcasting',
    category: 'Governance & Reports',
    enabled: false,
    aliases: ['forward', 'forwarderengine']
  }
};

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
      // Check for guild-specific environment variable (e.g. GAS_URL_123456789 for Render persistence)
      const guildEnvGasUrl = process.env[`GAS_URL_${guildId}`];
      const guildEnvSecret = process.env[`GAS_SECRET_${guildId}`];

      cohort = {
        serverId: guildId,
        name: "Cohort " + guildId,
        gasUrl: guildEnvGasUrl || process.env.DEFAULT_GAS_URL || "",
        gasSecret: guildEnvSecret || process.env.DEFAULT_GAS_SECRET || "JP_ADMIN_26",
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
        features: {},
        morningOptional: {
          users: [],
          roleId: null
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
    } else {
      // Rehydrate from guild-specific env if present and not set in local disk
      const guildEnvGasUrl = process.env[`GAS_URL_${guildId}`];
      if (guildEnvGasUrl && !cohort.gasUrl) {
        cohort.gasUrl = guildEnvGasUrl;
      }
    }
    return cohort;
  }

  hasConfiguredGas(guildId) {
    const cohort = this.getCohort(guildId);
    if (!cohort || !cohort.gasUrl) return false;
    return cohort.gasUrl.startsWith('https://script.google.com/macros/s/') && !cohort.gasUrl.includes("YOUR_DEPLOYMENT_ID");
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
      scoringStartDate: cohort?.scoringStartDate || "2026-09-06" // Current cohort start date (Sunday)
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
    return cohort?.scoringStartDate || "2026-09-06";
  }

  resetCohortScoring(guildId, newStartDate = "2026-09-06") {
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

  // --- Daily Job Task & Target Management ---
  setDailyJobTarget(guildId, date, targetCount, instructions = '') {
    const cohort = this.getCohort(guildId);
    if (!cohort.dailyTargets) {
      cohort.dailyTargets = {};
    }
    const numTarget = Math.max(1, Number(targetCount) || constants.SCORING.DEFAULT_JOB_TARGET);
    cohort.dailyTargets[date] = {
      target: numTarget,
      instructions: instructions || '',
      setAt: new Date().toISOString()
    };
    this.saveToDisk();
    return cohort.dailyTargets[date];
  }

  getDailyJobTarget(guildId, date) {
    const cohort = this.getCohort(guildId);
    if (cohort.dailyTargets && cohort.dailyTargets[date]) {
      return Number(cohort.dailyTargets[date].target) || cohort.targets?.applications || constants.SCORING.DEFAULT_JOB_TARGET;
    }
    return cohort.targets?.applications || constants.SCORING.DEFAULT_JOB_TARGET;
  }

  getDailyJobTaskDetails(guildId, date) {
    const cohort = this.getCohort(guildId);
    if (cohort.dailyTargets && cohort.dailyTargets[date]) {
      return cohort.dailyTargets[date];
    }
    return null;
  }

  // --- Feature Toggle Management ---
  canonicalizeFeatureKey(rawKey) {
    if (!rawKey) return null;
    const clean = String(rawKey).toLowerCase().trim().replace(/[-\s]/g, '_');
    if (DEFAULT_FEATURES[clean]) return clean;

    for (const [key, def] of Object.entries(DEFAULT_FEATURES)) {
      if (key === clean) return key;
      if (def.aliases && def.aliases.some(a => a.toLowerCase().replace(/[-\s]/g, '_') === clean)) {
        return key;
      }
    }
    return null;
  }

  isFeatureEnabled(guildId, rawKey) {
    const canonKey = this.canonicalizeFeatureKey(rawKey);
    if (!canonKey) return true; // Default unknown feature to enabled

    const cohort = this.getCohort(guildId);
    if (!cohort) return DEFAULT_FEATURES[canonKey]?.enabled ?? true;

    if (cohort.features && cohort.features[canonKey] !== undefined) {
      return Boolean(cohort.features[canonKey]);
    }

    return DEFAULT_FEATURES[canonKey]?.enabled ?? true;
  }

  setFeature(guildId, rawKey, enabled) {
    const canonKey = this.canonicalizeFeatureKey(rawKey);
    if (!canonKey) return null;

    const cohort = this.getCohort(guildId);
    cohort.features = cohort.features || {};
    cohort.features[canonKey] = Boolean(enabled);
    this.saveToDisk();

    return {
      key: canonKey,
      name: DEFAULT_FEATURES[canonKey].name,
      category: DEFAULT_FEATURES[canonKey].category,
      enabled: cohort.features[canonKey]
    };
  }

  toggleFeature(guildId, rawKey) {
    const canonKey = this.canonicalizeFeatureKey(rawKey);
    if (!canonKey) return null;

    const current = this.isFeatureEnabled(guildId, canonKey);
    return this.setFeature(guildId, canonKey, !current);
  }

  getAllFeatures(guildId) {
    const cohort = this.getCohort(guildId);
    const result = [];

    for (const [key, def] of Object.entries(DEFAULT_FEATURES)) {
      const isEnabled = cohort?.features && cohort.features[key] !== undefined
        ? Boolean(cohort.features[key])
        : def.enabled;

      result.push({
        key: key,
        name: def.name,
        description: def.description,
        category: def.category,
        enabled: isEnabled,
        aliases: def.aliases || []
      });
    }

    return result;
  }

  resetFeatures(guildId) {
    const cohort = this.getCohort(guildId);
    cohort.features = {};
    for (const [key, def] of Object.entries(DEFAULT_FEATURES)) {
      cohort.features[key] = def.enabled;
    }
    this.saveToDisk();
    return this.getAllFeatures(guildId);
  }

  // --- Morning Attendance Optional / Exemption Management ---
  getMorningOptional(guildId) {
    const cohort = this.getCohort(guildId);
    cohort.morningOptional = cohort.morningOptional || { users: [], roleId: null };
    if (!Array.isArray(cohort.morningOptional.users)) {
      cohort.morningOptional.users = [];
    }
    return cohort.morningOptional;
  }

  addMorningOptional(guildId, users, addedBy = "Staff") {
    const opt = this.getMorningOptional(guildId);
    const userList = Array.isArray(users) ? users : [users];
    let addedCount = 0;

    userList.forEach(u => {
      const discordId = typeof u === 'string' ? u.trim() : (u.discordId || u.id || '').trim();
      const name = typeof u === 'object' ? (u.name || u.displayName || u.username || discordId) : discordId;
      const reason = typeof u === 'object' && u.reason ? u.reason : "Optional Morning Basecamp";

      if (discordId && !opt.users.some(existing => existing.discordId === discordId)) {
        opt.users.push({
          discordId: discordId,
          name: name,
          reason: reason,
          addedBy: addedBy,
          addedAt: new Date().toISOString()
        });
        addedCount++;
      }
    });

    this.saveToDisk();
    return { addedCount, total: opt.users.length, users: opt.users };
  }

  removeMorningOptional(guildId, discordId) {
    const opt = this.getMorningOptional(guildId);
    const cleanId = String(discordId).trim();
    const initialLen = opt.users.length;
    opt.users = opt.users.filter(u => u.discordId !== cleanId);
    this.saveToDisk();
    return initialLen > opt.users.length;
  }

  clearMorningOptional(guildId) {
    const opt = this.getMorningOptional(guildId);
    const count = opt.users.length;
    opt.users = [];
    this.saveToDisk();
    return count;
  }

  setMorningOptionalRole(guildId, roleId) {
    const opt = this.getMorningOptional(guildId);
    opt.roleId = roleId ? String(roleId).trim() : null;
    this.saveToDisk();
    return opt.roleId;
  }

  getMorningOptionalList(guildId) {
    const opt = this.getMorningOptional(guildId);
    return opt.users || [];
  }

  getMorningOptionalDiscordIds(guildId) {
    const opt = this.getMorningOptional(guildId);
    return (opt.users || []).map(u => u.discordId);
  }

  isMorningOptional(guildId, memberOrDiscordId, guild = null) {
    if (!memberOrDiscordId) return false;
    const opt = this.getMorningOptional(guildId);

    const discordId = typeof memberOrDiscordId === 'string' ? memberOrDiscordId : memberOrDiscordId.id;
    if (opt.users && opt.users.some(u => u.discordId === discordId)) {
      return true;
    }

    // Check by Discord member roles if member object or guild is provided
    let member = typeof memberOrDiscordId === 'object' && memberOrDiscordId.roles ? memberOrDiscordId : null;
    if (!member && guild && discordId) {
      member = guild.members.cache.get(discordId);
    }

    if (member && member.roles && member.roles.cache) {
      if (opt.roleId && member.roles.cache.has(opt.roleId)) {
        return true;
      }
      // Check for generic role names
      const hasNamedRole = member.roles.cache.some(r => {
        const rName = r.name.toLowerCase();
        return rName === 'morning optional' || rName === 'morning-optional' || rName === 'morning exempt' || rName === 'morning-exempt';
      });
      if (hasNamedRole) return true;
    }

    return false;
  }

  getAllCohorts() {
    return Array.from(this.cohorts.values());
  }
}

module.exports = new CohortManager();
