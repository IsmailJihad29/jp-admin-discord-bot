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
    if (cohort && cohort.supervisors.includes(member.id)) return true;

    // Check for Supervisor role
    if (member.roles && member.roles.cache.some(r => r.name.toLowerCase() === 'supervisor' || r.name.toLowerCase() === 'mentor')) {
      return true;
    }

    return false;
  }

  getAllCohorts() {
    return Array.from(this.cohorts.values());
  }
}

module.exports = new CohortManager();
