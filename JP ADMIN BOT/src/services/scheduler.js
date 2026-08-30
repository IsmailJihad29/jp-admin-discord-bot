/**
 * JP ADMIN — Automation Scheduler (Asia/Dhaka Timeline)
 * Streamlined to focus on core requested features:
 * 1. Daily Attendance Point Scanner (23:00 Sun-Thu) + 3-Day Inactivity Warnings
 * 2. Daily Job Tracking Audit & Warnings (23:30 Daily)
 * 3. Job Task Deadline Overdue Monitor (00:05 Daily)
 * 4. Weekly Performance Leaderboard (18:00 Thursday)
 * 5. Weekly Inactive Students Report for Mentors (18:30 Thursday)
 */

const cron = require('node-cron');
const Logger = require('../utils/logger');
const cohortManager = require('../config/cohortManager');
const GasClient = require('./gasClient');
const ScoringService = require('./scoringService');
const JobScraperService = require('./jobScraperService');
const DropoutPredictorService = require('./dropoutPredictorService');
const ReferralLockoutService = require('./referralLockoutService');
const Embeds = require('../utils/embedBuilder');
const constants = require('../config/constants');
const DateTimeUtil = require('../utils/dateTime');

class Scheduler {
  constructor() {
    this.client = null;
  }

  init(discordClient) {
    this.client = discordClient;
    this.scheduleTimeline();
    Logger.info("Asia/Dhaka Automation Timeline initialized.");
  }

  getChannel(guild, channelKey) {
    const ChannelHelper = require('../utils/channelHelper');
    return ChannelHelper.findChannel(guild, channelKey);
  }

  scheduleTimeline() {
    // 0. Daily Mentor Morning Briefing - 09:30 AM Sun-Thu
    cron.schedule('30 9 * * 0-4', () => this.runDailyAdminMorningBriefing(), { timezone: 'Asia/Dhaka' });

    // 1. Morning Attendance Point Scanner from 'Morning Attendance' Google Form Tab - 12:00 PM Sun-Thu
    cron.schedule('0 12 * * 0-4', () => this.runMorningAttendanceScan(), { timezone: 'Asia/Dhaka' });

    // 2. Daily Attendance Point Scanner from 'Daily Attendance' Google Form Tab - 23:00 Sun-Thu
    cron.schedule('0 23 * * 0-4', () => this.runDailyAttendanceScan(), { timezone: 'Asia/Dhaka' });

    // 3. Daily Job Tracking Audit (Tiered Scoring & Warning Alerts) - 23:30 Daily
    cron.schedule('30 23 * * *', () => this.runDailyJobAudit(), { timezone: 'Asia/Dhaka' });

    // 4. Queued Custom Attendance Scanner - 23:30 Daily
    cron.schedule('30 23 * * *', () => this.runQueuedCustomAttendanceScans(), { timezone: 'Asia/Dhaka' });

    // 5. Job Task Deadline Overdue Monitor (-2 pts penalty) - 00:05 Daily
    cron.schedule('5 0 * * *', () => this.runJobTaskDeadlineAudit(), { timezone: 'Asia/Dhaka' });

    // 6. Weekly Performance Leaderboard & Referral Access Sync - 23:30 Thursday (11:30 PM)
    cron.schedule('30 23 * * 4', () => this.runWeeklyLeaderboard(), { timezone: 'Asia/Dhaka' });

    // 7. Drop-out Predictor & 1-on-1 Auto-Scheduler - 18:30 Thursday
    cron.schedule('30 18 * * 4', () => this.runWeeklyRiskAndOneOnOneSchedule(), { timezone: 'Asia/Dhaka' });
  }

  /**
   * Daily Mentor Morning Briefing (Sunday–Thursday at 09:30 AM in #jp-admin)
   */
  async runDailyAdminMorningBriefing() {
    Logger.info("[AdminBriefing] Running 09:30 AM Daily Admin Morning Briefing.");
    const todayStr = DateTimeUtil.getTodayDateStr();
    const CohortDataService = require('./cohortDataService');

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const adminCh = this.getChannel(guild, 'BOT_ADMIN');
        if (!adminCh) continue;

        const fullData = await CohortDataService.getFullCohortData(guild.id);
        const unlinkedCount = fullData.students.filter(s => !s.hasTrackerLinked).length;
        const onLeaveToday = fullData.students.filter(s => s.hasActiveLeaveToday);
        const interviewsToday = fullData.students.filter(s => s.interviews.some(i => i.interviewDate === todayStr || i.date === todayStr));
        const overdueTasksCount = fullData.students.filter(s => s.overdueTasksCount > 0).length;

        const leaveNames = onLeaveToday.map(s => `• <@${s.discordId}> (${s.name})`).join('\n') || 'None on leave today';
        const intNames = interviewsToday.map(s => `• <@${s.discordId}> (${s.name}) — ${s.interviews[0]?.company || 'Interview'}`).join('\n') || 'None scheduled for today';

        const embed = Embeds.info(
          `🌅 Daily Mentor Morning Briefing · ${todayStr}`,
          `Good morning Mentors! Here is your daily operational summary for **${guild.name}**:\n\n` +
          `👥 **Active Students:** **${fullData.totalActiveStudents} enrolled**\n` +
          `⚠️ **Missing Job Trackers:** **${unlinkedCount} students** ${unlinkedCount > 0 ? '*(Run `!nudge nosheet`)*' : '✅ (All Linked)'}\n` +
          `🛠️ **Overdue Coding Tasks:** **${overdueTasksCount} students**\n\n` +
          `🌴 **Approved Leaves Today (${onLeaveToday.length}):**\n${leaveNames}\n\n` +
          `🎯 **Interviews Today (${interviewsToday.length}):**\n${intNames}\n\n` +
          `──────────────────────────────\n` +
          `💡 *Quick commands:* \`!data summary\` · \`!data nojobs\` · \`!query <question>\``,
          `JP ADMIN ${constants.BOT_VERSION} · Operations Digest`
        );

        await adminCh.send({ embeds: [embed] }).catch(() => {});
      } catch (err) {
        Logger.error(`Admin briefing error for guild ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Morning Attendance Scan from Google Form 'Morning Attendance' tab (Sunday–Thursday at 12:00 PM)
   * Applies +1 Present, -1 Absent, 0 Leave.
   */
  async runMorningAttendanceScan() {
    Logger.info("[MorningAttendanceScan] Running 12:00 PM morning attendance scan.");
    const todayStr = DateTimeUtil.getTodayDateStr();

    for (const guild of this.client.guilds.cache.values()) {
      try {
        if (cohortManager.isOffday(guild.id, todayStr) || cohortManager.isMorningOff(guild.id, todayStr)) {
          Logger.info(`[MorningAttendanceScan] Skipping guild ${guild.id}: Morning Basecamp is set to OFF today (${todayStr}).`);
          continue;
        }

        const res = await GasClient.scanMorningAttendance(guild.id, todayStr);
        if (res && res.status === 'SUCCESS') {
          const channel = this.getChannel(guild, 'ATTENDANCE') || this.getChannel(guild, 'BOT_ADMIN') || this.getChannel(guild, 'DISCUSSION');
          if (channel) {
            const embed = Embeds.attendanceReport("Morning Attendance Synced", todayStr, res);
            channel.send({ embeds: [embed] }).catch(() => {});
          }
        }
      } catch (err) {
        Logger.error(`Morning attendance scan error for guild ${guild.id}:`, err.message);
      }
    }
  }

  async runWeeklyRiskAndOneOnOneSchedule() {
    Logger.info("[WeeklyRiskAudit] Running Thursday 18:30 Drop-out Predictor & 1-on-1 Auto-Scheduler.");
    const todayStr = DateTimeUtil.getTodayDateStr();

    for (const guild of this.client.guilds.cache.values()) {
      const scoringStartDate = cohortManager.getScoringStartDate(guild.id);
      if (scoringStartDate && todayStr < scoringStartDate) {
        Logger.info(`[WeeklyRiskAudit] Skipping Thursday risk audit for guild ${guild.id}: Scoring reset until ${scoringStartDate}.`);
        continue;
      }

      await DropoutPredictorService.runWeeklyRiskAuditAndSchedule(guild);
      await ReferralLockoutService.enforceCohortAccessLocks(guild);
    }
  }

  /**
   * Daily Attendance Scan from Google Form 'Daily Attendance' tab (Sunday–Thursday at 23:00)
   * Applies +1 Present, -1 Absent, 0 Leave, and issues warning if a student hits 3 absences in the week.
   */
  async runDailyAttendanceScan() {
    Logger.info("[DailyAttendanceScan] Running 23:00 attendance scan.");
    const todayStr = DateTimeUtil.getTodayDateStr();

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const res = await GasClient.scanDailyAttendance(guild.id, todayStr);
        if (res && res.status === 'SUCCESS') {
          const channel = this.getChannel(guild, 'ATTENDANCE') || this.getChannel(guild, 'BOT_ADMIN') || this.getChannel(guild, 'DISCUSSION');
          if (channel) {
            const embed = Embeds.attendanceReport("Daily Attendance Synced", todayStr, res);
            channel.send({ embeds: [embed] }).catch(() => {});
          }

          // Check if any student reached 3 absences in the current week
          await this.checkAndWarnInactiveStudents(guild);
        }
      } catch (err) {
        Logger.error(`Attendance scan error for guild ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Checks rolling weekly absences and sends a warning to students with 3+ absences
   */
  async checkAndWarnInactiveStudents(guild) {
    try {
      const todayDate = DateTimeUtil.getTodayDateStr();
      if (cohortManager.isOffday(guild.id, todayDate)) {
        Logger.info(`[AttendanceWarning] Skipping warnings for guild ${guild.id}: Today is an Offday/Holiday.`);
        return;
      }

      const attRes = await GasClient.getAttendance(guild.id);
      const rows = attRes.rows || [];
      const dates = (attRes.dates || []).slice(-5); // last 5 days (current week)

      const scores = await ScoringService.calculateRTBR(guild.id);
      const scoreMap = new Map(scores.map(s => [s.discordId, s]));

      const warnChannel = this.getChannel(guild, 'ATTENDANCE') || this.getChannel(guild, 'DISCUSSION');

      for (const student of rows) {
        if (!student.discordId || student.status !== 'active') continue;
        const member = guild.members.cache.get(student.discordId);
        if (member && cohortManager.isStaff(guild.id, member)) continue;

        let weeklyAbsences = 0;
        dates.forEach(d => {
          if (student.sessions && student.sessions[d] === 'A') {
            weeklyAbsences++;
          }
        });

        if (weeklyAbsences === 3) { // Warn on the 3rd absence of the week
          const stats = scoreMap.get(student.discordId) || { totalPoints: 0, details: '' };
          const embed = Embeds.warning(
            `⚠️ Inactivity Warning: 3 Absences This Week`,
            `Hello <@${student.discordId}> (${student.name}), you have been marked **Absent for 3 days** this week.\n\n` +
            `• **Absences this week:** **3 / 5 days**\n` +
            `• **Current Total Score:** **${stats.totalPoints} pts**\n` +
            `• **Recent Activities Breakdown:**\n  ${stats.details || 'No recent activity logged'}\n\n` +
            `💡 **Action Required:**\n` +
            `1. Make sure to fill out the **Daily Attendance** form on schedule.\n` +
            `2. If you are unwell or facing emergencies, submit a leave request using \`!leave\`.\n` +
            `3. Stay active in your job applications and tasks to avoid dropping behind on the leaderboard!`
          );

          if (warnChannel) {
            warnChannel.send({ content: `<@${student.discordId}>`, embeds: [embed] }).catch(() => {});
          }
        }
      }
    } catch (e) {
      Logger.error(`Error checking inactive student warnings for guild ${guild.id}:`, e.message);
    }
  }

  /**
   * Weekly Inactive Students Report for Mentors (Every Thursday 18:30)
   * Lists all students absent >= 3 days this week and tags @Mentor
   */
  async runWeeklyInactiveStudentsReport(targetChannel = null) {
    Logger.info("[WeeklyInactiveReport] Compiling Thursday Inactive Students Report.");

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const attRes = await GasClient.getAttendance(guild.id);
        const rows = attRes.rows || [];
        const dates = (attRes.dates || []).slice(-5); // last 5 days (Sunday to Thursday)

        const scores = await ScoringService.calculateRTBR(guild.id);
        const scoreMap = new Map(scores.map(s => [s.discordId, s]));

        const inactiveList = [];

        for (const student of rows) {
          if (!student.discordId || student.status !== 'active') continue;
          const member = guild.members.cache.get(student.discordId);
          if (member && cohortManager.isStaff(guild.id, member)) continue;

          let weeklyAbsences = 0;
          dates.forEach(d => {
            if (student.sessions && student.sessions[d] === 'A') {
              weeklyAbsences++;
            }
          });

          if (weeklyAbsences >= 3) {
            const stats = scoreMap.get(student.discordId) || { totalPoints: 0, details: '' };
            inactiveList.push({
              discordId: student.discordId,
              name: student.name,
              absences: weeklyAbsences,
              totalPoints: stats.totalPoints,
              details: stats.details
            });
          }
        }

        const channel = targetChannel || this.getChannel(guild, 'BOT_ADMIN') || this.getChannel(guild, 'DISCUSSION');
        if (!channel) continue;

        // Find Mentor role for tagging
        const mentorRole = guild.roles.cache.find(r => r.name.toLowerCase() === constants.ROLES.MENTOR.toLowerCase() || r.name.toLowerCase() === constants.ROLES.SUPERVISOR.toLowerCase());
        const tagText = mentorRole ? `<@&${mentorRole.id}>` : `**@Mentors**`;

        if (inactiveList.length === 0) {
          const embed = Embeds.success(
            "Weekly Student Activity Report (Thursday Summary)",
            `🎉 **Awesome work!** All active students maintained good attendance this week. No students had 3 or more absences!`
          );
          await channel.send({ content: tagText, embeds: [embed] }).catch(() => {});
          continue;
        }

        const listContent = inactiveList.map(s => {
          return `• <@${s.discordId}> (**${s.name}**)\n  📅 **${s.absences}/5 Days Absent** | ⭐ **${s.totalPoints} pts**\n  ${s.details || 'No recent logs'}`;
        }).join('\n\n');

        const embed = Embeds.warning(
          `🚨 Weekly Inactive Students Report (${inactiveList.length} At-Risk)`,
          `Here is the list of students with **3 or more absences** this week (Sunday to Thursday):\n\n` +
          `${listContent}\n\n` +
          `📌 **Mentor Follow-Up:** Please reach out to these students on Discord/WhatsApp to check their situation and help them get back on track.`
        );

        await channel.send({ content: `${tagText} **Weekly Inactive Students Summary:**`, embeds: [embed] }).catch(() => {});
      } catch (err) {
        Logger.error(`Inactive students report error for guild ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Daily Job Audit at 23:30 with custom Tiered Scoring rules & Warning mentions
   */
  async runDailyJobAudit() {
    Logger.info("[DailyJobAudit] Running 23:30 job tracking audit.");
    const todayDate = DateTimeUtil.getTodayDateStr();

    for (const guild of this.client.guilds.cache.values()) {
      try {
        if (cohortManager.isOffday(guild.id, todayDate)) {
          Logger.info(`[DailyJobAudit] Skipping 23:30 job audit for guild ${guild.id}: Today is an Offday/Holiday.`);
          continue;
        }

        const scoringStartDate = cohortManager.getScoringStartDate(guild.id);
        if (scoringStartDate && todayDate < scoringStartDate) {
          Logger.info(`[DailyJobAudit] Skipping 23:30 job audit for guild ${guild.id}: Scoring reset until ${scoringStartDate}.`);
          continue;
        }

        const cohort = cohortManager.getCohort(guild.id);
        const target = cohort?.targets?.applications || constants.SCORING.DEFAULT_JOB_TARGET;

        const rosterRes = await GasClient.getRoster(guild.id);
        const activeStudents = (rosterRes.students || []).filter(s => s.status === 'active');

        const metTargetList = [];
        const belowTargetList = [];

        for (const student of activeStudents) {
          const member = guild.members.cache.get(student.discordId);
          if (member && cohortManager.isStaff(guild.id, member)) continue;

          let countToday = 0;
          let totalRows = 0;

          // Attempt scrape if student's public sheet is linked
          const sheetRes = await GasClient.request(guild.id, 'getJobSheets', {}).catch(() => ({ sheets: [] }));
          const studentSheet = (sheetRes.sheets || []).find(s => s.discordId === student.discordId);

          if (studentSheet && studentSheet.sheetUrl) {
            const scrape = await JobScraperService.scrapeStudentJobSheet(studentSheet.sheetUrl, student.discordId);
            if (scrape.success) {
              countToday = scrape.datedTodayCount;
              totalRows = scrape.totalRows;
            }
          }

          const points = ScoringService.calculateDailyJobScore(countToday, target);

          // Record daily metric to Google Sheets
          await GasClient.recordJobDaily(guild.id, {
            date: todayDate,
            email: student.email,
            count: countToday,
            name: student.name || student.username,
            discordId: student.discordId,
            totalRows: totalRows,
            newRows: countToday,
            points: points
          }).catch(() => {});

          if (countToday >= target) {
            metTargetList.push({ ...student, count: countToday, points });
          } else {
            belowTargetList.push({ ...student, count: countToday, points });
          }
        }

        const channel = this.getChannel(guild, 'JOB_TRACKING');
        if (channel) {
          const belowMentions = belowTargetList.map(s => `• <@${s.discordId}> (${s.name}): **${s.count}/${target}** apps (\`${s.points >= 0 ? '+' : ''}${s.points} pts\`)`).join('\n');
          const metMentions = metTargetList.slice(0, 10).map(s => `• <@${s.discordId}> (${s.name}): **${s.count}/${target}** apps (\`+${s.points} pts\`)`).join('\n');

          const embed = Embeds.info(
            `Daily Job Application Audit (11:30 PM) · ${todayDate}`,
            `**Target for Today:** **${target} Applications**\n\n` +
            `**🎯 Met / Exceeded Target (${metTargetList.length} students):**\n${metMentions || 'None yet'}\n\n` +
            `**⚠️ Below Target (${belowTargetList.length} students):**\n${belowMentions || '✅ Everyone met their target today!'}\n\n` +
            `*Tiered points calculated and synced to Google Sheets database.*`
          );

          await channel.send({ embeds: [embed] }).catch(() => {});
        }
      } catch (err) {
        Logger.error(`Job audit error for guild ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Daily Job Task Deadline Overdue Monitor (00:05 AM)
   * Applies -2 points penalty if deadline expired without submission
   */
  async runJobTaskDeadlineAudit() {
    Logger.info("[TaskDeadlineAudit] Running 00:05 overdue task audit.");
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const res = await GasClient.auditOverdueTasks(guild.id);
        if (res && res.overdueCount > 0) {
          const taskCh = this.getChannel(guild, 'JOB_TASK');
          if (taskCh) {
            const list = res.overdue.map(o => `• <@${o.discordId}> (${o.studentName}): \`${o.taskId}\` — Deadline was \`${o.deadline}\` (**-2 Pts Penalty**)`).join('\n');
            const embed = Embeds.error(
              `Overdue Job Tasks Alert (${res.overdueCount} Penalized)`,
              `The following job task deadlines have expired without a submission request:\n\n${list}\n\n*Make sure to submit tasks on time with \`!submit\`.*`
            );
            await taskCh.send({ embeds: [embed] }).catch(() => {});
          }
        }
      } catch (err) {
        Logger.error(`Task deadline audit error for guild ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Weekly Performance Leaderboard (Thursday 11:30 PM / 23:30)
   * Publishes full student standings with @everyone mention to #referral-leaderboard
   */
  async runWeeklyLeaderboard() {
    Logger.info("[WeeklyLeaderboard] Publishing Thursday 23:30 weekly leaderboard.");
    const todayStr = DateTimeUtil.getTodayDateStr();

    for (const guild of this.client.guilds.cache.values()) {
      const scoringStartDate = cohortManager.getScoringStartDate(guild.id);
      if (scoringStartDate && todayStr < scoringStartDate) {
        Logger.info(`[WeeklyLeaderboard] Skipping Thursday leaderboard for guild ${guild.id}: Scoring reset until ${scoringStartDate}.`);
        continue;
      }

      const channel = this.getChannel(guild, 'RTBR') || this.getChannel(guild, 'DISCUSSION');
      const adminChannel = this.getChannel(guild, 'BOT_ADMIN');
      if (!channel) continue;

      try {
        const rtbr = await ScoringService.calculateRTBR(guild.id);
        if (!rtbr || rtbr.length === 0) continue;

        const embeds = Embeds.fullWeeklyLeaderboardEmbeds(
          "Weekly Student Performance Leaderboard (Thursday 11:30 PM)",
          rtbr,
          "Score Formula: Attendance (+1/-1) + Jobs/Target + Streak (+3/day) + Interviews (+2) + Tasks"
        );

        const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
        const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

        await channel.send({
          content: `${mentionTag} 📢 **WEEKLY COHORT PERFORMANCE & REFERRAL LEADERBOARD IS LIVE!** 🏆`,
          embeds: embeds
        }).catch(() => {});

        if (adminChannel) {
          const topStudent = rtbr[0];
          const receiptEmbed = Embeds.success(
            "Weekly Performance Leaderboard Published! 🏆",
            `✅ **Scheduled Thursday Leaderboard** published for all **${rtbr.length} active students**.\n\n` +
            `• 🥇 **Top Rank:** ${topStudent ? `<@${topStudent.discordId}> (**${topStudent.totalPoints} pts**)` : 'N/A'}\n` +
            `• 📢 **Published to Channel:** <#${channel.id}> with \`@everyone\` mention.\n` +
            `• ⏰ **Trigger:** Scheduled Thursday 11:30 PM (23:30 Asia/Dhaka) Automation.`
          );
          await adminChannel.send({ embeds: [receiptEmbed] }).catch(() => {});
        }
      } catch (err) {
        Logger.error("Failed weekly leaderboard:", err.message);
      }
    }
  }

  /**
   * Scans and publishes all queued custom attendance tasks for today (Every night at 23:30)
   */
  async runQueuedCustomAttendanceScans() {
    Logger.info("[CustomAttendanceQueue] Checking queued custom attendance scans for 23:30.");
    const todayStr = DateTimeUtil.getTodayDateStr();

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const queue = cohortManager.getQueuedCustomAttendances(guild.id, todayStr);
        if (!queue || queue.length === 0) continue;

        Logger.info(`[CustomAttendanceQueue] Found ${queue.length} queued scan(s) for guild: ${guild.name} (${guild.id})`);
        const completedIds = [];

        for (const item of queue) {
          try {
            Logger.info(`[CustomAttendanceQueue] Scanning custom tab '${item.tabName}' for date '${item.date}'...`);
            const res = await GasClient.scanCustomAttendance(guild.id, item.tabName, item.date, item.sessionLabel);

            const destChannel = this.getChannel(guild, 'ATTENDANCE') || this.getChannel(guild, 'DISCUSSION');
            const adminChannel = this.getChannel(guild, 'BOT_ADMIN');

            if (res && res.status === 'SUCCESS') {
              const reportEmbed = Embeds.attendanceReport(
                `Custom Attendance Synced (${item.sessionLabel || item.tabName})`,
                item.date,
                res
              );

              if (destChannel) {
                await destChannel.send({
                  content: `📢 **Scheduled Custom Attendance Report (${item.sessionLabel || item.tabName})**`,
                  embeds: [reportEmbed]
                }).catch(() => {});
              }

              if (adminChannel) {
                const receiptEmbed = Embeds.success(
                  "Scheduled Custom Attendance Published! 📑",
                  `✅ Automatically scanned queued tab **${res.formTabScanned || item.tabName}** for \`${item.date}\`.\n\n` +
                  `• **Session Label:** \`${res.colHeader || item.sessionLabel || item.tabName}\`\n` +
                  `• **Present (+1 pt):** **${res.present}**\n` +
                  `• **Absent (-1 pt):** **${res.absent}**\n` +
                  `• **Approved Leave (0 pt):** **${res.leave}**\n` +
                  `• **Total Active Students:** **${res.totalActive}**\n\n` +
                  `📢 *Report successfully published to ${destChannel ? `<#${destChannel.id}>` : 'attendance channel'}*`
                );
                await adminChannel.send({ embeds: [receiptEmbed] }).catch(() => {});
              }

              completedIds.push(item.id);
            } else {
              Logger.error(`[CustomAttendanceQueue] Failed to scan tab '${item.tabName}':`, res?.error);
              if (adminChannel) {
                const errEmbed = Embeds.error(
                  "Scheduled Custom Attendance Scan Failed ⚠️",
                  `Could not scan queued custom tab **${item.tabName}** for \`${item.date}\`:\n\`${res?.error || 'Unknown error'}\`\n\n` +
                  `*Please verify that the tab name exists in your Google Sheet.*`
                );
                await adminChannel.send({ embeds: [errEmbed] }).catch(() => {});
              }
            }
          } catch (itemErr) {
            Logger.error(`[CustomAttendanceQueue] Error processing queued tab '${item.tabName}':`, itemErr.message);
          }
        }

        if (completedIds.length > 0) {
          cohortManager.clearCompletedCustomAttendances(guild.id, completedIds);
        }
      } catch (err) {
        Logger.error(`Queued custom attendance error for guild ${guild.id}:`, err.message);
      }
    }
  }
}

module.exports = new Scheduler();
