/**
 * JP ADMIN — Referral Access & Negative Point / 3+ Absence Lockout Service
 *
 * Rules:
 * - A student is restricted from #resume-needed ONLY IF:
 *   1. They have negative total points (totalPoints < 0), OR
 *   2. They have been absent for MORE THAN 3 days in the rolling 5-day week (absentDays > 3, i.e., 4 or 5 absences).
 * - EVERYONE ELSE (including students with 0 points or positive points and <= 3 absences) is 100% UNLOCKED and can view #resume-needed.
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
   * - Weekly Absences (restricted if > 3 days)
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

    const recentDates = (attendanceRes.dates || []).slice(-5); // last 5 sessions (rolling week)
    const attendanceMap = new Map((attendanceRes.rows || []).map(r => [r.discordId, r]));

    const evaluatedStudents = [];

    for (const student of activeStudents) {
      const discordId = student.discordId;
      const attRecord = attendanceMap.get(discordId);
      const studentScore = scoreMap.get(discordId) || { totalPoints: 0 };
      const totalPoints = Number(studentScore.totalPoints) || 0;

      // Calculate absences in the current rolling 5-day week
      let attendedDays = 0;
      let absentDays = 0;

      if (attRecord && attRecord.sessions) {
        recentDates.forEach(d => {
          const mark = attRecord.sessions[d];
          if (mark === 'P' || mark === 'L' || mark === 'H') attendedDays++;
          else if (mark === 'A') absentDays++;
        });
      }

      // ── STRICT LOCKOUT RULES ──
      // 1. Negative points (< 0)
      // 2. More than 3 days absent (> 3 days)
      const hasNegativeScore = totalPoints < 0;
      const hasExcessiveAbsences = absentDays > 3;
      const isLocked = hasNegativeScore || hasExcessiveAbsences;

      let lockReason = "";
      if (hasNegativeScore && hasExcessiveAbsences) {
        lockReason = `Negative score (${totalPoints} pts) & ${absentDays} absences (> 3 days)`;
      } else if (hasNegativeScore) {
        lockReason = `Negative total score (${totalPoints} pts)`;
      } else if (hasExcessiveAbsences) {
        lockReason = `More than 3 days absent (${absentDays}/5 days absent)`;
      }

      evaluatedStudents.push({
        discordId,
        name: student.name || student.username,
        attendedDays,
        absentDays,
        totalPoints,
        hasNegativeScore,
        hasExcessiveAbsences,
        lockReason,
        isLocked
      });
    }

    return evaluatedStudents;
  }

  /**
   * Ensures the 'Referral Restricted' role exists and configures channel overrides for #resume-needed
   */
  static async ensureRestrictionRoleAndPermissions(guild) {
    const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
    let restrictionRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());

    if (!restrictionRole) {
      restrictionRole = await guild.roles.create({
        name: constants.ROLES.REFERRAL_RESTRICTED,
        color: '#EF4444', // red
        mentionable: false,
        reason: 'Auto-created role to restrict #resume-needed access for negative points or >3 absences'
      }).catch(err => {
        Logger.error("Failed to create Referral Restricted role:", err.message);
        return null;
      });
    }

    if (!restrictionRole) return null;

    // Ensure #resume-needed channel permission overwrites:
    // 1. @everyone: ViewChannel: false
    // 2. Active Student: ViewChannel: true, ReadMessageHistory: true, SendMessages: true
    // 3. Referral Restricted: ViewChannel: false, ReadMessageHistory: false, SendMessages: false
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    if (resumeChannel) {
      if (guild.roles.everyone) {
        await resumeChannel.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: false
        }).catch(() => {});
      }
      if (studentRole) {
        await resumeChannel.permissionOverwrites.edit(studentRole, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true
        }).catch(() => {});
      }
      await resumeChannel.permissionOverwrites.edit(restrictionRole, {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false
      }).catch(() => {});
    }

    return restrictionRole;
  }

  /**
   * Enforces role additions/removals based on negative point and >3 absence rules
   */
  static async enforceCohortAccessLocks(guild) {
    const restrictionRole = await this.ensureRestrictionRoleAndPermissions(guild);
    if (!restrictionRole) return { error: "Could not create or find restriction role" };

    const cohortManager = require('../config/cohortManager');

    // Auto-clean: Remove restriction role from any Mentor or Supervisor
    for (const member of guild.members.cache.values()) {
      if (cohortManager.isStaff(guild.id, member)) {
        if (member.roles.cache.has(restrictionRole.id)) {
          await member.roles.remove(restrictionRole).catch(() => {});
          Logger.info(`Removed Referral Restricted role from staff member ${member.user.tag}`);
        }
      }
    }

    const evaluated = await this.evaluateCohortPerformance(guild.id);
    const lockedList = [];
    const unlockedList = [];

    for (const s of evaluated) {
      if (!s.discordId) continue;
      try {
        const member = await guild.members.fetch(s.discordId).catch(() => null);
        if (!member || !member.roles) continue;

        // Skip mentors & supervisors completely
        if (cohortManager.isStaff(guild.id, member)) {
          if (member.roles.cache.has(restrictionRole.id)) {
            await member.roles.remove(restrictionRole).catch(() => {});
          }
          continue;
        }

        const hasRole = member.roles.cache.has(restrictionRole.id);

        if (s.isLocked) {
          // Add role if not already present
          if (!hasRole) {
            await member.roles.add(restrictionRole).catch(() => {});

            // Send DM alert to student
            const dmEmbed = Embeds.warning(
              "🔒 Resume Needed Access Restricted",
              `Hello **${s.name}**, your access to the **#resume-needed** referral channel has been temporarily locked.\n\n` +
              `🚫 **Reason:** ${s.lockReason}\n` +
              `• ⭐ **Current Score:** **${s.totalPoints} pts**\n` +
              `• 📅 **Weekly Absences:** **${s.absentDays}/5 days**\n\n` +
              `💡 **How to restore access:**\n` +
              `1. Ensure your total score is positive (>= 0 pts) by logging attendance, daily jobs, or tasks.\n` +
              `2. Keep your weekly absences to 3 days or fewer.\n` +
              `*Once your score is >= 0 and absences <= 3, access will be unlocked automatically!*`,
              `JP ADMIN ${constants.BOT_VERSION} · Referral Access System`
            );

            await member.send({ embeds: [dmEmbed] }).catch(() => {});
          }
          lockedList.push(s);
        } else {
          // Remove role if unlocked (e.g. score >= 0 and absentDays <= 3)
          if (hasRole) {
            await member.roles.remove(restrictionRole).catch(() => {});

            const unlockEmbed = Embeds.success(
              "🔓 Resume Needed Access Restored!",
              `Congratulations **${s.name}**! Your account is now eligible for company referrals.\n\n` +
              `• ⭐ **Current Score:** **${s.totalPoints} pts** (>= 0)\n` +
              `• 📅 **Weekly Absences:** **${s.absentDays}/5 days** (<= 3)\n\n` +
              `✅ Full access to the **#resume-needed** referral channel is now open for you!`,
              `JP ADMIN ${constants.BOT_VERSION} · Referral Access System`
            );

            await member.send({ embeds: [unlockEmbed] }).catch(() => {});
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
   * Force removes 'Referral Restricted' role from all guild members (Instant full unlock)
   */
  static async unlockAll(guild) {
    const restrictionRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());
    if (!restrictionRole) return { unlocked: 0 };

    let count = 0;
    for (const member of guild.members.cache.values()) {
      if (member.roles.cache.has(restrictionRole.id)) {
        await member.roles.remove(restrictionRole).catch(() => {});
        count++;
      }
    }

    // Ensure permissions on #resume-needed are open for Active Student
    await this.ensureRestrictionRoleAndPermissions(guild);

    return { unlocked: count };
  }
}

module.exports = ReferralLockoutService;
