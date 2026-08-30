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
const Embeds = require('../utils/embedBuilder');
const Logger = require('../utils/logger');
const ChannelHelper = require('../utils/channelHelper');
const constants = require('../config/constants');

class ReferralLockoutService {
  /**
   * Evaluates all active students based on:
   * - Total Score (restricted if < 0)
   * - Consecutive Absences (restricted if >= 3 consecutive days)
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

      // Calculate CONSECUTIVE absences working backwards from the latest session
      let consecutiveAbsences = 0;
      let totalAbsencesInWeek = 0;

      if (attRecord && attRecord.sessions) {
        // Consecutive absences check
        for (let i = sortedDates.length - 1; i >= 0; i--) {
          const d = sortedDates[i];
          const mark = attRecord.sessions[d];
          if (mark === 'A') {
            consecutiveAbsences++;
          } else if (mark === 'P' || mark === 'L' || mark === 'H') {
            break; // Active presence breaks the consecutive absence streak
          }
        }

        // Recent 5 days total absences
        const recent5 = sortedDates.slice(-5);
        recent5.forEach(d => {
          if (attRecord.sessions[d] === 'A') totalAbsencesInWeek++;
        });
      }

      // ── STRICT LOCKOUT RULES ──
      // 1. Negative points (< 0, e.g. -1 or lower)
      // 2. 3 consecutive days absent (consecutiveAbsences >= 3)
      const hasNegativeScore = totalPoints < 0;
      const has3ConsecutiveAbsences = consecutiveAbsences >= 3;
      const isLocked = hasNegativeScore || has3ConsecutiveAbsences;

      let lockReason = "";
      if (hasNegativeScore && has3ConsecutiveAbsences) {
        lockReason = `Negative score (${totalPoints} pts) & ${consecutiveAbsences} consecutive days absent`;
      } else if (hasNegativeScore) {
        lockReason = `Negative total score (${totalPoints} pts)`;
      } else if (has3ConsecutiveAbsences) {
        lockReason = `${consecutiveAbsences} consecutive days absent`;
      }

      evaluatedStudents.push({
        discordId,
        name: student.name || student.username,
        consecutiveAbsences,
        totalAbsencesInWeek,
        totalPoints,
        hasNegativeScore,
        has3ConsecutiveAbsences,
        lockReason,
        isLocked
      });
    }

    return evaluatedStudents;
  }

  /**
   * Ensures #resume-needed channel is open to @everyone by default
   */
  static async ensureRestrictionRoleAndPermissions(guild) {
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    if (resumeChannel && guild.roles.everyone) {
      // By default @everyone MUST be able to view and send messages in #resume-needed
      await resumeChannel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true
      }).catch(() => {});
    }

    let restrictionRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());
    if (restrictionRole && resumeChannel) {
      await resumeChannel.permissionOverwrites.edit(restrictionRole, {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false
      }).catch(() => {});
    }

    return restrictionRole;
  }

  /**
   * Enforces locks using direct member overwrites & role:
   * - Locked students get ViewChannel: false specifically
   * - Regular students have full access through @everyone
   */
  static async enforceCohortAccessLocks(guild) {
    await this.ensureRestrictionRoleAndPermissions(guild);
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    const restrictionRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());
    const cohortManager = require('../config/cohortManager');

    const evaluated = await this.evaluateCohortPerformance(guild.id);
    const lockedList = [];
    const unlockedList = [];

    for (const s of evaluated) {
      if (!s.discordId) continue;
      try {
        const member = await guild.members.fetch(s.discordId).catch(() => null);
        if (!member) continue;

        // Skip mentors & supervisors completely
        if (cohortManager.isStaff(guild.id, member)) {
          if (resumeChannel) {
            await resumeChannel.permissionOverwrites.delete(member.id).catch(() => {});
          }
          if (restrictionRole && member.roles.cache.has(restrictionRole.id)) {
            await member.roles.remove(restrictionRole).catch(() => {});
          }
          continue;
        }

        if (s.isLocked) {
          // ── LOCK STUDENT ──
          if (resumeChannel) {
            await resumeChannel.permissionOverwrites.edit(member.id, {
              ViewChannel: false,
              SendMessages: false,
              ReadMessageHistory: false
            }).catch(() => {});
          }
          if (restrictionRole && !member.roles.cache.has(restrictionRole.id)) {
            await member.roles.add(restrictionRole).catch(() => {});
          }

          // Send DM alert to student
          const dmEmbed = Embeds.warning(
            "🔒 Resume Needed Access Restricted",
            `Hello **${s.name}**, your access to the **#resume-needed** referral channel has been temporarily locked.\n\n` +
            `🚫 **Reason:** ${s.lockReason}\n` +
            `• ⭐ **Current Score:** **${s.totalPoints} pts**\n` +
            `• 📅 **Consecutive Absences:** **${s.consecutiveAbsences} days in a row**\n\n` +
            `💡 **How to restore access:**\n` +
            `1. Make sure your score is positive (\`>= 0 pts\`) by submitting attendance, jobs, or tasks.\n` +
            `2. Break your absence streak by attending classes regularly.\n` +
            `*Once your score is 0+ and you are regular, your referral channel will automatically reopen!*`,
            `JP ADMIN ${constants.BOT_VERSION} · Referral Access System`
          );
          await member.send({ embeds: [dmEmbed] }).catch(() => {});

          lockedList.push(s);
        } else {
          // ── UNLOCK STUDENT (Score >= 0 & not 3 consecutive absences) ──
          if (resumeChannel) {
            // Delete member-specific deny overwrite so @everyone permission takes over (unlocked!)
            await resumeChannel.permissionOverwrites.delete(member.id).catch(() => {});
          }
          if (restrictionRole && member.roles.cache.has(restrictionRole.id)) {
            await member.roles.remove(restrictionRole).catch(() => {});
          }

          unlockedList.push(s);
        }
      } catch (err) {
        Logger.warn(`Error enforcing lockout for student ${s.discordId}:`, err.message);
      }
    }

    return {
      totalEvaluated: evaluated.length,
      lockedCount: lockedList.length,
      unlockedCount: unlockedList.length,
      lockedStudents: lockedList,
      unlockedStudents: unlockedList
    };
  }

  /**
   * Force removes all restrictions and resets #resume-needed to open for everyone
   */
  static async unlockAll(guild) {
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    let clearedCount = 0;

    if (resumeChannel) {
      // 1. Ensure @everyone has ViewChannel: true
      if (guild.roles.everyone) {
        await resumeChannel.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          AttachFiles: true,
          EmbedLinks: true
        }).catch(() => {});
      }

      // 2. Clear all member-specific deny overwrites from the channel
      for (const overwrite of resumeChannel.permissionOverwrites.cache.values()) {
        if (overwrite.type === 1) { // 1 = Member overwrite
          await resumeChannel.permissionOverwrites.delete(overwrite.id).catch(() => {});
          clearedCount++;
        }
      }
    }

    // 3. Remove 'Referral Restricted' role if any
    const restrictionRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());
    if (restrictionRole) {
      for (const member of guild.members.cache.values()) {
        if (member.roles.cache.has(restrictionRole.id)) {
          await member.roles.remove(restrictionRole).catch(() => {});
        }
      }
    }

    return { unlocked: clearedCount };
  }
}

module.exports = ReferralLockoutService;
