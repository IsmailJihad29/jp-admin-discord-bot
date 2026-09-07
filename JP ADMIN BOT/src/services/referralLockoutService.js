/**
 * JP ADMIN — Referral Access & Negative Point / 3 Consecutive Absence Lockout Service
 *
 * Rules:
 * - A student is restricted from #resume-needed ONLY IF:
 *   1. They have negative total points (totalPoints < 0, e.g. -1 or lower), OR
 *   2. They have been absent CONSECUTIVELY for 3 or more days (consecutiveAbsences >= 3).
 * - EVERYONE ELSE (including students with 0 points or positive points and < 3 consecutive absences) is 100% UNLOCKED and can view #resume-needed.
 */

const { PermissionFlagsBits } = require('discord.js');
const GasClient = require('./gasClient');
const ScoringService = require('./scoringService');
const DateTimeUtil = require('../utils/dateTime');
const Embeds = require('../utils/embedBuilder');
const Logger = require('../utils/logger');
const ChannelHelper = require('../utils/channelHelper');
const constants = require('../config/constants');

class ReferralLockoutService {
  /**
   * Resolves or auto-creates the Active Student role
   */
  static async getActiveRole(guild, autoCreate = true) {
    let role = guild.roles.cache.find(r => r && r.name && (
      r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase() ||
      r.name.toLowerCase() === 'active' ||
      r.name.toLowerCase() === 'active students'
    ));

    if (!role && autoCreate) {
      role = await guild.roles.create({
        name: constants.ROLES.ACTIVE_STUDENT || 'Active Student',
        color: '#10B981',
        mentionable: true,
        reason: 'Auto-created by JP ADMIN for Active Students'
      }).catch(err => {
        Logger.error('Failed to create Active Student role:', err.message);
        return null;
      });
    }

    return role;
  }

  /**
   * Resolves or auto-creates the Inactive Student role
   */
  static async getInactiveRole(guild, autoCreate = true) {
    let role = guild.roles.cache.find(r => r && r.name && (
      r.name.toLowerCase() === (constants.ROLES.INACTIVE_STUDENT || 'inactive student').toLowerCase() ||
      r.name.toLowerCase() === 'inactive' ||
      r.name.toLowerCase() === 'inactive students'
    ));

    if (!role && autoCreate) {
      role = await guild.roles.create({
        name: constants.ROLES.INACTIVE_STUDENT || 'Inactive Student',
        color: '#EF4444',
        mentionable: false,
        reason: 'Auto-created by JP ADMIN for Inactive Students'
      }).catch(err => {
        Logger.error('Failed to create Inactive Student role:', err.message);
        return null;
      });
    }

    return role;
  }

  /**
   * Evaluates all active students based on:
   * - Total Score (inactive if < 0) strictly from their individual attendance start date
   * - Consecutive Absences (inactive if >= 3 consecutive days)
   * - Weekly Absences (inactive if >= 3 days in current week)
   */
  static async evaluateCohortPerformance(guildId) {
    const cohortManager = require('../config/cohortManager');

    const [rosterRes, attendanceRes, scores] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ rows: [], dates: [] })),
      ScoringService.calculateRTBR(guildId).catch(() => [])
    ]);

    // Strictly exclude mentors and supervisors
    const activeStudents = (rosterRes.students || []).filter(s =>
      s.status === 'active' && s.status !== 'supervisor' && s.status !== 'mentor' && s.status !== 'staff'
    );
    const scoreMap = new Map(scores.map(s => [s.discordId, s]));

    const sortedDates = (attendanceRes.dates || []);
    const attendanceMap = new Map((attendanceRes.rows || []).map(r => [r.discordId, r]));

    const evaluatedStudents = [];

    for (const student of activeStudents) {
      const discordId = student.discordId;
      const attRecord = attendanceMap.get(discordId);
      const studentScore = scoreMap.get(discordId) || { totalPoints: 0 };
      const totalPoints = Number(studentScore.totalPoints) || 0;

      // Student's individual start date (when their attendance began)
      const studentStartDate = studentScore.attendanceStartDate ||
        cohortManager.getScoringStartDate(guildId) ||
        '2026-09-06';

      // Calculate CONSECUTIVE absences working backwards from the latest session
      // STRICT RULE: Do not look at any dates before the student's attendance start date!
      let consecutiveAbsences = 0;
      let totalAbsencesInWeek = 0;
      let totalAbsencesSinceStart = 0;

      if (attRecord && attRecord.sessions) {
        // Consecutive absences check (backwards from latest session)
        for (let i = sortedDates.length - 1; i >= 0; i--) {
          const rawCol = sortedDates[i];
          const normDate = DateTimeUtil.normalizeDateStr(rawCol);
          if (studentStartDate && normDate && normDate < studentStartDate) {
            break; // Stop immediately: do not count absences before the student's attendance start date
          }
          const mark = attRecord.sessions[rawCol];
          if (mark === 'A') {
            consecutiveAbsences++;
          } else if (mark === 'P' || mark === 'L' || mark === 'H') {
            break; // Active presence or excused break the consecutive absence streak
          }
        }

        // Recent 5 days total absences (filtered by studentStartDate)
        const recent5 = sortedDates.slice(-5);
        recent5.forEach(rawCol => {
          const normDate = DateTimeUtil.normalizeDateStr(rawCol);
          if (studentStartDate && normDate && normDate < studentStartDate) return;
          if (attRecord.sessions[rawCol] === 'A') totalAbsencesInWeek++;
        });

        // Total absences since student's start date
        sortedDates.forEach(rawCol => {
          const normDate = DateTimeUtil.normalizeDateStr(rawCol);
          if (studentStartDate && normDate && normDate < studentStartDate) return;
          if (attRecord.sessions[rawCol] === 'A') totalAbsencesSinceStart++;
        });
      }

      // ── STRICT LOCKOUT / INACTIVE RULES ──
      // 1. Negative points (< 0, e.g. -1 or lower)
      // 2. 3 consecutive days absent (consecutiveAbsences >= 3)
      // 3. 3 days absent in recent week (totalAbsencesInWeek >= 3)
      const hasNegativeScore = totalPoints < 0;
      const has3ConsecutiveAbsences = consecutiveAbsences >= 3;
      const has3WeeklyAbsences = totalAbsencesInWeek >= 3;
      const isLocked = hasNegativeScore || has3ConsecutiveAbsences || has3WeeklyAbsences;

      const reasons = [];
      if (hasNegativeScore) reasons.push(`Negative points (${totalPoints} pts)`);
      if (has3ConsecutiveAbsences) reasons.push(`${consecutiveAbsences} consecutive days absent`);
      else if (has3WeeklyAbsences) reasons.push(`${totalAbsencesInWeek} days absent this week`);

      const lockReason = reasons.join(' & ') || 'Score/attendance threshold met';

      evaluatedStudents.push({
        discordId,
        name: student.name || student.username,
        attendanceStartDate: studentStartDate,
        consecutiveAbsences,
        absentDays: totalAbsencesInWeek,
        totalAbsencesInWeek,
        totalAbsencesSinceStart,
        totalPoints,
        hasNegativeScore,
        has3ConsecutiveAbsences,
        has3WeeklyAbsences,
        hasExcessiveAbsences: consecutiveAbsences >= 3 || totalAbsencesInWeek >= 3,
        lockReason,
        isLocked
      });
    }

    return evaluatedStudents;
  }

  /**
   * Ensures #resume-needed channel permissions:
   * - Purges all member-specific overwrites (so no member is blocked individually)
   * - Grants view/send to @Active Student, @Mentor, @Supervisor
   * - Denies view to @Inactive Student and @everyone
   */
  static async ensureRestrictionRoleAndPermissions(guild) {
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    if (!resumeChannel) return null;

    // 1. Resolve / Create roles
    const activeRole = await this.getActiveRole(guild, true);
    const inactiveRole = await this.getInactiveRole(guild, true);
    const mentorRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.MENTOR || 'mentor').toLowerCase());
    const supervisorRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.SUPERVISOR || 'supervisor').toLowerCase());
    const legacyRestrictedRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());

    // 2. PURGE ALL INDIVIDUAL MEMBER OVERWRITES on #resume-needed
    // This fixes the bug where students with positive points had lingering member overwrites blocking access!
    try {
      const memberOverwrites = resumeChannel.permissionOverwrites.cache.filter(o => o.type === 1 || o.type === 'member');
      for (const [id, overwrite] of memberOverwrites) {
        await resumeChannel.permissionOverwrites.delete(id).catch(() => {});
      }
    } catch (err) {
      Logger.warn(`Could not purge member overwrites from ${resumeChannel.name}:`, err.message);
    }

    // 3. Deny @everyone from viewing #resume-needed
    if (guild.roles.everyone) {
      await resumeChannel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false
      }).catch(() => {});
    }

    // 4. Grant full access to Active Student role
    if (activeRole) {
      await resumeChannel.permissionOverwrites.edit(activeRole, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true
      }).catch(() => {});
    }

    // 5. Explicitly deny Inactive Student role
    if (inactiveRole) {
      await resumeChannel.permissionOverwrites.edit(inactiveRole, {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false
      }).catch(() => {});
    }

    // 6. Deny legacy Referral Restricted role if exists
    if (legacyRestrictedRole && legacyRestrictedRole.id !== inactiveRole?.id) {
      await resumeChannel.permissionOverwrites.edit(legacyRestrictedRole, {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false
      }).catch(() => {});
    }

    // 7. Grant full access to Mentors & Supervisors
    if (mentorRole) {
      await resumeChannel.permissionOverwrites.edit(mentorRole, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true
      }).catch(() => {});
    }
    if (supervisorRole) {
      await resumeChannel.permissionOverwrites.edit(supervisorRole, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true
      }).catch(() => {});
    }

    return { activeRole, inactiveRole, resumeChannel };
  }

  /**
   * Enforces role locks across the server:
   * - Inactive students (<0 points OR >=3 absences) get @Inactive Student (Active Student removed)
   * - Active students (>=0 points AND <3 absences) get @Active Student (Inactive Student removed)
   * - Clears member-specific overwrites from #resume-needed
   */
  static async enforceCohortAccessLocks(guild) {
    await this.ensureRestrictionRoleAndPermissions(guild);

    const activeRole = await this.getActiveRole(guild, true);
    const inactiveRole = await this.getInactiveRole(guild, true);
    const legacyRestrictedRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());
    const cohortManager = require('../config/cohortManager');

    // Fetch members to ensure full cache
    await guild.members.fetch().catch(() => {});

    const evaluated = await this.evaluateCohortPerformance(guild.id);
    const lockedList = [];
    const unlockedList = [];

    for (const s of evaluated) {
      if (!s.discordId) continue;
      try {
        const member = guild.members.cache.get(s.discordId) || await guild.members.fetch(s.discordId).catch(() => null);
        if (!member) continue;

        // Skip mentors & supervisors completely
        if (cohortManager.isStaff(guild.id, member)) {
          if (inactiveRole && member.roles.cache.has(inactiveRole.id)) {
            await member.roles.remove(inactiveRole).catch(() => {});
          }
          if (legacyRestrictedRole && member.roles.cache.has(legacyRestrictedRole.id)) {
            await member.roles.remove(legacyRestrictedRole).catch(() => {});
          }
          continue;
        }

        if (s.isLocked) {
          // ── ASSIGN INACTIVE STUDENT ROLE (Score < 0 or >=3 absences) ──
          let changed = false;

          if (activeRole && member.roles.cache.has(activeRole.id)) {
            await member.roles.remove(activeRole).catch(() => {});
            changed = true;
          }

          if (inactiveRole && !member.roles.cache.has(inactiveRole.id)) {
            await member.roles.add(inactiveRole).catch(() => {});
            changed = true;

            // Send DM alert to newly locked student
            const dmEmbed = Embeds.warning(
              "🔒 Resume Needed Access Restricted",
              `Hello **${s.name}**, your access to the **#resume-needed** referral channel has been temporarily paused.\n\n` +
              `🚫 **Reason:** ${s.lockReason}\n` +
              `• ⭐ **Current Score:** **${s.totalPoints} pts**\n` +
              `• 📅 **Consecutive Absences:** **${s.consecutiveAbsences} days in a row**\n` +
              `• 🗓️ **Weekly Absences:** **${s.totalAbsencesInWeek} days**\n\n` +
              `💡 **How to restore access:**\n` +
              `1. Submit your daily attendance regularly to break your absence streak.\n` +
              `2. Earn points by submitting daily job tasks and daily job tracker applications.\n` +
              `*Once your score is 0+ and you are regular, your \`Active Student\` role and #resume-needed access will automatically reopen!*`,
              `JP ADMIN ${constants.BOT_VERSION} · Referral Access System`
            );
            await member.send({ embeds: [dmEmbed] }).catch(() => {});
          }

          if (legacyRestrictedRole && member.roles.cache.has(legacyRestrictedRole.id)) {
            await member.roles.remove(legacyRestrictedRole).catch(() => {});
          }

          if (changed) {
            await new Promise(r => setTimeout(r, 60)); // Gentle rate limit protection
          }

          lockedList.push(s);
        } else {
          // ── ASSIGN ACTIVE STUDENT ROLE (Score >= 0 & <3 absences) ──
          let changed = false;

          if (inactiveRole && member.roles.cache.has(inactiveRole.id)) {
            await member.roles.remove(inactiveRole).catch(() => {});
            changed = true;
          }

          if (legacyRestrictedRole && member.roles.cache.has(legacyRestrictedRole.id)) {
            await member.roles.remove(legacyRestrictedRole).catch(() => {});
            changed = true;
          }

          if (activeRole && !member.roles.cache.has(activeRole.id)) {
            await member.roles.add(activeRole).catch(() => {});
            changed = true;
          }

          if (changed) {
            await new Promise(r => setTimeout(r, 60));
          }

          unlockedList.push(s);
        }
      } catch (err) {
        Logger.warn(`Error enforcing roles for student ${s.discordId}:`, err.message);
      }
    }

    return {
      totalEvaluated: evaluated.length,
      lockedCount: lockedList.length,
      unlockedCount: unlockedList.length,
      lockedStudents: lockedList,
      unlockedStudents: unlockedList,
      activeRoleName: activeRole?.name || 'Active Student',
      inactiveRoleName: inactiveRole?.name || 'Inactive Student'
    };
  }

  /**
   * Force removes all inactive restrictions, resets #resume-needed permissions,
   * and gives @Active Student to all eligible students
   */
  static async unlockAll(guild) {
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    await this.ensureRestrictionRoleAndPermissions(guild);

    const activeRole = await this.getActiveRole(guild, true);
    const inactiveRole = await this.getInactiveRole(guild, true);
    const legacyRestrictedRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());

    let clearedOverwrites = 0;
    let rolesRemoved = 0;
    let activeAssigned = 0;

    if (resumeChannel) {
      // Clear all member-specific overwrites from the channel
      for (const [id, overwrite] of resumeChannel.permissionOverwrites.cache) {
        if (overwrite.type === 1 || overwrite.type === 'member') {
          await resumeChannel.permissionOverwrites.delete(id).catch(() => {});
          clearedOverwrites++;
        }
      }
    }

    // Fetch all members from Discord API
    await guild.members.fetch().catch(() => {});

    // Remove Inactive & Legacy Restricted roles from everyone
    if (inactiveRole) {
      for (const member of inactiveRole.members.values()) {
        await member.roles.remove(inactiveRole).catch(() => {});
        rolesRemoved++;
        await new Promise(r => setTimeout(r, 40));
      }
    }

    if (legacyRestrictedRole) {
      for (const member of legacyRestrictedRole.members.values()) {
        await member.roles.remove(legacyRestrictedRole).catch(() => {});
        rolesRemoved++;
        await new Promise(r => setTimeout(r, 40));
      }
    }

    // Assign Active role to all active students in roster
    const cohortManager = require('../config/cohortManager');
    const rosterRes = await GasClient.getRoster(guild.id).catch(() => ({ students: [] }));
    const activeRoster = (rosterRes.students || []).filter(s => s.status === 'active');

    for (const student of activeRoster) {
      if (!student.discordId) continue;
      const member = guild.members.cache.get(student.discordId);
      if (member && !cohortManager.isStaff(guild.id, member) && activeRole && !member.roles.cache.has(activeRole.id)) {
        await member.roles.add(activeRole).catch(() => {});
        activeAssigned++;
        await new Promise(r => setTimeout(r, 40));
      }
    }

    return {
      unlocked: clearedOverwrites,
      rolesRemoved,
      activeAssigned,
      activeRoleName: activeRole?.name || 'Active Student',
      inactiveRoleName: inactiveRole?.name || 'Inactive Student'
    };
  }
}

module.exports = ReferralLockoutService;
