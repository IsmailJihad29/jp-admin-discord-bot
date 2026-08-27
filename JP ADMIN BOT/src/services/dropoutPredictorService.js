/**
 * JP ADMIN — Drop-out Predictor & 1-on-1 Auto-Scheduler Service
 * Analyzes multi-signal performance trends over a 7-day rolling window:
 * 1. Attendance Absences (>= 2 unexcused absences)
 * 2. Job Application Velocity (> 50% drop from target)
 * 3. Delayed / Overdue Task Submissions
 * 4. Overall Score Trajectory
 *
 * Automatically dispatches 1-on-1 booking DMs to high-risk candidates
 * and alerts Mentors in #bot-admin.
 */

const GasClient = require('./gasClient');
const ScoringService = require('./scoringService');
const Embeds = require('../utils/embedBuilder');
const Logger = require('../utils/logger');
const ChannelHelper = require('../utils/channelHelper');
const constants = require('../config/constants');

class DropoutPredictorService {
  /**
   * Analyzes all active students across multiple risk signals
   */
  static async analyzeRiskSignals(guildId) {
    const targetDaily = constants.SCORING.DEFAULT_JOB_TARGET;
    const weeklyTarget = targetDaily * 5; // e.g. 50 applications per week

    const [rosterRes, attendanceRes, jobsRes, tasksRes, scores] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ rows: [], dates: [] })),
      GasClient.getJobsDaily(guildId, 7).catch(() => ({ jobs: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      ScoringService.calculateRTBR(guildId).catch(() => [])
    ]);

    const activeStudents = (rosterRes.students || []).filter(s => s.status === 'active');
    const scoreMap = new Map(scores.map(s => [s.discordId, s]));

    // Map recent 5 session dates
    const recentDates = (attendanceRes.dates || []).slice(-5);
    const attendanceMap = new Map((attendanceRes.rows || []).map(r => [r.discordId, r]));

    // Map weekly jobs by student
    const jobsCountMap = new Map();
    (jobsRes.jobs || []).forEach(j => {
      const current = jobsCountMap.get(j.discordId) || 0;
      jobsCountMap.set(j.discordId, current + (Number(j.count) || 0));
    });

    // Map task issues
    const overdueTasksMap = new Map();
    (tasksRes.tasks || []).forEach(t => {
      if (t.submissionStatus === 'Overdue' || (t.submissionStatus === 'Announced' && t.deadline && t.deadline < new Date().toISOString().substring(0, 10))) {
        const list = overdueTasksMap.get(t.discordId) || [];
        list.push(t);
        overdueTasksMap.set(t.discordId, list);
      }
    });

    const atRiskCandidates = [];

    for (const student of activeStudents) {
      const discordId = student.discordId;
      const attRecord = attendanceMap.get(discordId);
      const studentScore = scoreMap.get(discordId) || { totalPoints: 0, details: '' };

      // Signal 1: Attendance Absences in last 5 sessions
      let absences = 0;
      let presentCount = 0;
      let leavesCount = 0;

      if (attRecord && attRecord.sessions) {
        recentDates.forEach(d => {
          const mark = attRecord.sessions[d];
          if (mark === 'A') absences++;
          else if (mark === 'P') presentCount++;
          else if (mark === 'L') leavesCount++;
        });
      }

      // Signal 2: Job Applications Velocity
      const weeklyApps = jobsCountMap.get(discordId) || 0;
      const appRatePercent = Math.round((weeklyApps / weeklyTarget) * 100);
      const isJobVelocityDrop = weeklyApps < (weeklyTarget * 0.5); // < 50% of target

      // Signal 3: Overdue Tasks
      const overdueTasks = overdueTasksMap.get(discordId) || [];
      const hasOverdueTasks = overdueTasks.length > 0;

      // Risk Scoring Logic
      const riskSignals = [];

      if (absences >= 3) {
        riskSignals.push(`🚨 **Severe Absence:** ${absences}/5 days absent this week`);
      } else if (absences === 2) {
        riskSignals.push(`⚠️ **Attendance Dip:** 2 days absent this week`);
      }

      if (isJobVelocityDrop) {
        riskSignals.push(`📉 **Job Pace Drop:** Only ${weeklyApps}/${weeklyTarget} apps logged (${appRatePercent}% of target)`);
      }

      if (hasOverdueTasks) {
        riskSignals.push(`⏳ **Task Overdue:** ${overdueTasks.length} job task(s) missed deadline`);
      }

      if (studentScore.totalPoints <= 0) {
        riskSignals.push(`🔻 **Low Score:** Current score is ${studentScore.totalPoints} pts`);
      }

      let riskLevel = 'LOW';
      if (riskSignals.length >= 2 || absences >= 3) {
        riskLevel = 'HIGH_RISK';
      } else if (riskSignals.length === 1) {
        riskLevel = 'MODERATE_RISK';
      }

      if (riskLevel !== 'LOW') {
        atRiskCandidates.push({
          discordId: discordId,
          name: student.name || student.username,
          email: student.email,
          riskLevel: riskLevel,
          signals: riskSignals,
          absences: absences,
          weeklyApps: weeklyApps,
          appRatePercent: appRatePercent,
          overdueCount: overdueTasks.length,
          totalPoints: studentScore.totalPoints,
          details: studentScore.details
        });
      }
    }

    // Sort: HIGH_RISK first, then by lowest points
    atRiskCandidates.sort((a, b) => {
      if (a.riskLevel === 'HIGH_RISK' && b.riskLevel !== 'HIGH_RISK') return -1;
      if (b.riskLevel === 'HIGH_RISK' && a.riskLevel !== 'HIGH_RISK') return 1;
      return a.totalPoints - b.totalPoints;
    });

    return atRiskCandidates;
  }

  /**
   * Retrieves the 1-on-1 booking link from #1on1-support channel
   */
  static async getOneOnOneBookingLink(guild) {
    const channel = ChannelHelper.findChannel(guild, 'ONE_ON_ONE');
    if (!channel) return process.env.ONE_ON_ONE_URL || null;

    // Check channel topic
    if (channel.topic) {
      const urlMatch = channel.topic.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) return urlMatch[1];
    }

    // Check pinned messages in #1on1-support
    try {
      const pinned = await channel.messages.fetchPinned();
      for (const msg of pinned.values()) {
        const match = msg.content.match(/(https?:\/\/[^\s]+)/);
        if (match) return match[1];
      }
    } catch (e) {
      Logger.warn("Could not fetch pinned messages in 1-on-1 channel:", e.message);
    }

    return process.env.ONE_ON_ONE_URL || null;
  }

  /**
   * Executes Thursday 18:30 Drop-out Predictor & 1-on-1 Auto-Scheduler
   */
  static async runWeeklyRiskAuditAndSchedule(guild) {
    try {
      const atRiskStudents = await this.analyzeRiskSignals(guild.id);
      const bookingLink = await this.getOneOnOneBookingLink(guild);
      const oneOnOneChannel = ChannelHelper.findChannel(guild, 'ONE_ON_ONE');
      const adminChannel = ChannelHelper.findChannel(guild, 'BOT_ADMIN') || ChannelHelper.findChannel(guild, 'DISCUSSION');

      const highRisk = atRiskStudents.filter(s => s.riskLevel === 'HIGH_RISK');
      const moderateRisk = atRiskStudents.filter(s => s.riskLevel === 'MODERATE_RISK');

      let dmSentCount = 0;

      // 1. Dispatch 1-on-1 Booking DMs to HIGH_RISK candidates
      for (const student of highRisk) {
        try {
          const member = await guild.members.fetch(student.discordId).catch(() => null);
          if (member) {
            const linkText = bookingLink
              ? `🔗 **Book 15-Min 1-on-1 Review:** [Click Here to Schedule](${bookingLink})\n`
              : (oneOnOneChannel ? `💬 **Channel:** Please check <#${oneOnOneChannel.id}> to book your session.\n` : '');

            const dmEmbed = Embeds.warning(
              "Mentorship Support: 1-on-1 Strategy Session",
              `Hello **${student.name}**, your mentors noticed a drop in your recent bootcamp activity:\n\n` +
              student.signals.join('\n') + `\n\n` +
              `We want to make sure you succeed and overcome any blockers! Please schedule a **15-minute 1-on-1 counseling session** with your mentor.\n\n` +
              linkText +
              `*Let's identify the challenge together and get your momentum back!*`
            );

            await member.send({ embeds: [dmEmbed] }).catch(async () => {
              // If DMs closed, send polite fallback in #1on1-support channel
              if (oneOnOneChannel) {
                oneOnOneChannel.send({
                  content: `<@${student.discordId}>`,
                  embeds: [dmEmbed]
                }).catch(() => {});
              }
            });

            dmSentCount++;
          }
        } catch (err) {
          Logger.warn(`Could not dispatch 1-on-1 DM to ${student.discordId}:`, err.message);
        }
      }

      // 2. Post Early Warning Report to Mentors in #bot-admin
      if (adminChannel) {
        const mentorRole = guild.roles.cache.find(r => r.name.toLowerCase() === constants.ROLES.MENTOR.toLowerCase() || r.name.toLowerCase() === constants.ROLES.SUPERVISOR.toLowerCase());
        const tagText = mentorRole ? `<@&${mentorRole.id}>` : `**@Mentors**`;

        if (atRiskStudents.length === 0) {
          const embed = Embeds.success(
            "Drop-out Predictor: ALL COHORT HEALTHY 🎉",
            "Multi-signal 7-day trend analysis complete. Zero students are currently flagged for drop-out risk. Momentum is strong!"
          );
          await adminChannel.send({ content: tagText, embeds: [embed] }).catch(() => {});
          return;
        }

        const highRiskText = highRisk.length > 0
          ? highRisk.map(s => `🔴 <@${s.discordId}> (**${s.name}**) · Score: \`${s.totalPoints} pts\`\n   ${s.signals.join(' · ')}`).join('\n\n')
          : '✅ No high-risk candidates.';

        const modRiskText = moderateRisk.length > 0
          ? moderateRisk.map(s => `🟡 <@${s.discordId}> (**${s.name}**) · Score: \`${s.totalPoints} pts\`\n   ${s.signals.join(' · ')}`).join('\n\n')
          : '✅ None.';

        const embed = Embeds.warning(
          `Early Warning: Drop-out Predictor (${atRiskStudents.length} At-Risk)`,
          `**Analysis Window:** Last 7 Days · **1-on-1 DMs Dispatched:** ${dmSentCount}\n\n` +
          `**🔴 High-Risk Candidates (Auto 1-on-1 Dispatched):**\n${highRiskText}\n\n` +
          `**🟡 Moderate-Risk Candidates (Monitor Closely):**\n${modRiskText}\n\n` +
          `💡 *Mentors: Please follow up in 1-on-1 sessions or WhatsApp to prevent drop-outs!*`
        );

        await adminChannel.send({ content: `${tagText} **Drop-out Early Warning Report:**`, embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      Logger.error(`Error running drop-out prediction for guild ${guild.id}:`, err.message);
    }
  }
}

module.exports = DropoutPredictorService;
