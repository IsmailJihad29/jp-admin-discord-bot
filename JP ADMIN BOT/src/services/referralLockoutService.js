/**
 * JP ADMIN — Referral Access & 70% Performance Lockout Service
 *
 * Rules:
 * - Computes 7-day rolling performance percentage for each student:
 *   - Attendance Rate (Present + Approved Leaves / 5 days)
 *   - Job Application Rate (Weekly Applications / 50 Target)
 *   - Task Penalty deductions
 * - If Weekly Performance < 70%:
 *   - Assigns role 'Referral Restricted' on Discord
 *   - Locks access to Resume Referral & RTBR channels
 *   - DMs student with performance breakdown and unlock instructions
 * - If Weekly Performance >= 70%:
 *   - Automatically removes 'Referral Restricted' role and restores access
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
   * Calculates 7-day weekly performance percentage for all active students
   */
  static async evaluateCohortPerformance(guildId) {
    const targetDaily = constants.SCORING.DEFAULT_JOB_TARGET;
    const weeklyJobTarget = targetDaily * 5; // e.g. 50 applications
    const cohortManager = require('../config/cohortManager');

    const [rosterRes, attendanceRes, jobsRes, tasksRes, scores] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ rows: [], dates: [] })),
      GasClient.getJobsDaily(guildId, 7).catch(() => ({ jobs: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      ScoringService.calculateRTBR(guildId).catch(() => [])
    ]);

    // Strictly exclude mentors and supervisors
    const activeStudents = (rosterRes.students || []).filter(s =>
      s.status === 'active' && s.status !== 'supervisor' && s.status !== 'mentor' && s.status !== 'staff'
    );
    const scoreMap = new Map(scores.map(s => [s.discordId, s]));

    const recentDates = (attendanceRes.dates || []).slice(-5);
    const attendanceMap = new Map((attendanceRes.rows || []).map(r => [r.discordId, r]));

    // Map weekly jobs
    const jobsCountMap = new Map();
    (jobsRes.jobs || []).forEach(j => {
      const current = jobsCountMap.get(j.discordId) || 0;
      jobsCountMap.set(j.discordId, current + (Number(j.count) || 0));
    });

    // Map overdue tasks
    const overdueTasksMap = new Map();
    (tasksRes.tasks || []).forEach(t => {
      if (t.submissionStatus === 'Overdue' || (t.submissionStatus === 'Announced' && t.deadline && t.deadline < new Date().toISOString().substring(0, 10))) {
        const list = overdueTasksMap.get(t.discordId) || [];
        list.push(t);
        overdueTasksMap.set(t.discordId, list);
      }
    });

    const evaluatedStudents = [];

    for (const student of activeStudents) {
      const discordId = student.discordId;
      const attRecord = attendanceMap.get(discordId);
      const studentScore = scoreMap.get(discordId) || { totalPoints: 0 };

      // 1. Attendance Rate (5 sessions)
      let attendedDays = 0; // P or approved L
      let absentDays = 0;

      if (attRecord && attRecord.sessions) {
        recentDates.forEach(d => {
          const mark = attRecord.sessions[d];
          if (mark === 'P' || mark === 'L') attendedDays++;
          else if (mark === 'A') absentDays++;
        });
      }

      const attendanceRate = Math.min(100, Math.round((attendedDays / 5) * 100));

      // 2. Job Application Rate (50 target)
      const weeklyApps = jobsCountMap.get(discordId) || 0;
      const jobRate = Math.min(100, Math.round((weeklyApps / weeklyJobTarget) * 100));

      // 3. Task Deductions (-10% per overdue task)
      const overdueCount = (overdueTasksMap.get(discordId) || []).length;
      const taskDeduction = overdueCount * 10;

      // 4. Overall Weighted Weekly Performance
      // 40% Attendance + 60% Job Applications - Task deductions
      let rawPerformance = Math.round((attendanceRate * 0.4) + (jobRate * 0.6)) - taskDeduction;
      const overallPerformance = Math.max(0, Math.min(100, rawPerformance));

      const isLocked = overallPerformance < 70;

      evaluatedStudents.push({
        discordId,
        name: student.name || student.username,
        attendanceRate,
        attendedDays,
        absentDays,
        jobRate,
        weeklyApps,
        overdueCount,
        overallPerformance,
        totalPoints: studentScore.totalPoints,
        isLocked
      });
    }

    return evaluatedStudents;
  }

  /**
   * Ensures the 'Referral Restricted' role exists and configures channel overrides
   */
  static async ensureRestrictionRoleAndPermissions(guild) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === constants.ROLES.REFERRAL_RESTRICTED.toLowerCase());

    if (!role) {
      role = await guild.roles.create({
        name: constants.ROLES.REFERRAL_RESTRICTED,
        color: '#EF4444', // red
        mentionable: false,
        reason: 'Auto-created role to restrict Resume Referral channel access for performance < 70%'
      }).catch(err => {
        Logger.error("Failed to create Referral Restricted role:", err.message);
        return null;
      });
    }

    if (!role) return null;

    // Apply ViewChannel: false override ONLY on RESUME_REFERRAL (#resume-needed) channel
    const resumeChannel = ChannelHelper.findChannel(guild, 'RESUME_REFERRAL');
    if (resumeChannel) {
      await resumeChannel.permissionOverwrites.edit(role, {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false
      }).catch(() => {});
    }

    return role;
  }

  /**
   * Enforces role additions/removals based on 70% threshold and notifies students
   */
  static async enforceCohortAccessLocks(guild) {
    const restrictionRole = await this.ensureRestrictionRoleAndPermissions(guild);
    if (!restrictionRole) return { error: "Could not create or find restriction role" };

    const cohortManager = require('../config/cohortManager');

    // Auto-clean: Remove restriction role from any Mentor or Supervisor who might have received it
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
              "🔒 Resume Needed Access Locked (< 70% Performance)",
              `Hello **${s.name}**, your weekly bootcamp performance is currently at **${s.overallPerformance}%** (below the 70% threshold).\n\n` +
              `📊 **Your Weekly Breakdown:**\n` +
              `• 📅 **Attendance Rate:** ${s.attendanceRate}% (${s.attendedDays}/5 days present)\n` +
              `• 💼 **Job Applications:** ${s.jobRate}% (${s.weeklyApps}/50 apps)\n` +
              `• 🛠️ **Overdue Tasks:** ${s.overdueCount}\n\n` +
              `🚫 **Access to <#resume-needed> has been temporarily restricted.**\n\n` +
              `💡 **How to unlock your referral access:**\n` +
              `1. Submit attendance regularly (+1 Present).\n` +
              `2. Hit your daily target of 10 job applications.\n` +
              `3. Raise your rolling weekly score back to 70%+ to unlock referral access automatically!`,
              `JP ADMIN ${constants.BOT_VERSION} · Referral Lockout System`
            );

            await member.send({ embeds: [dmEmbed] }).catch(() => {});
          }
          lockedList.push(s);
        } else {
          // Remove role if performance >= 70%
          if (hasRole) {
            await member.roles.remove(restrictionRole).catch(() => {});

            const unlockEmbed = Embeds.success(
              "🔓 Resume Needed Access Restored (70%+ Performance)!",
              `Congratulations **${s.name}**! Your performance is now at **${s.overallPerformance}%**.\n\n` +
              `✅ Full access to the **#resume-needed** referral channel has been unlocked! Keep up the great work!`,
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
      lockedList,
      unlockedList
    };
  }
}

module.exports = ReferralLockoutService;
