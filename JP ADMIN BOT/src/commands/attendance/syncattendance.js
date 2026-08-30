/**
 * Command: !syncattendance
 * Aliases: !backfillattendance, !synchistoricalattendance, !attbackfill, !attendancesync
 * Bulk scans all historical responses from Daily Attendance and Morning Attendance Google Form tabs,
 * populates the Attendance sheet matrix, and recalculates student-wise attendance points.
 */

const GasClient = require('../../services/gasClient');
const ScoringService = require('../../services/scoringService');
const cohortManager = require('../../config/cohortManager');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');
const constants = require('../../config/constants');

module.exports = {
  name: 'syncattendance',
  aliases: ['backfillattendance', 'synchistoricalattendance', 'attbackfill', 'attendancesync'],
  description: 'Bulk syncs historical attendance from Daily & Morning Google Forms and calculates student points',
  usage: '!syncattendance [all | daily | morning | YYYY-MM-DD | YYYY-MM-DD to YYYY-MM-DD]',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const todayDate = DateTimeUtil.getTodayDateStr();

    let syncType = "all";
    let startDate = null;
    let endDate = null;

    const fullArgs = args.join(' ').trim();

    // Check type keywords
    if (args[0]?.toLowerCase() === 'daily') {
      syncType = "daily";
    } else if (args[0]?.toLowerCase() === 'morning') {
      syncType = "morning";
    } else if (args[0]?.toLowerCase() === 'all') {
      syncType = "all";
    }

    // Check date range: "2026-08-20 to 2026-08-30" or "2026-08-20 - 2026-08-30"
    const rangeMatch = fullArgs.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/i);
    const singleDateMatch = fullArgs.match(/(\d{4}-\d{2}-\d{2})/);

    if (rangeMatch) {
      startDate = rangeMatch[1];
      endDate = rangeMatch[2];
    } else if (singleDateMatch && !args.includes('all') && !args.includes('daily') && !args.includes('morning')) {
      startDate = singleDateMatch[1];
      endDate = singleDateMatch[1];
    }

    const filterDesc = startDate
      ? (startDate === endDate ? `date \`${startDate}\`` : `range \`${startDate}\` to \`${endDate}\``)
      : `all historical dates in form responses`;

    const loading = await message.reply(
      `🔄 **Starting Historical Attendance Sync for ${filterDesc} (${syncType.toUpperCase()})...**\n*Parsing Google Form submissions and updating Attendance matrix...*`
    );

    try {
      const res = await GasClient.syncHistoricalAttendance(guild.id, {
        type: syncType,
        startDate: startDate,
        endDate: endDate
      });

      if (!res || res.status !== 'SUCCESS') {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Historical Sync Failed", res?.error || "Could not process historical attendance from Google Forms.")]
        });
      }

      if (res.totalSessionsSynced === 0) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning(
            "No Historical Sessions Found",
            `No matching form submissions were found in Google Forms for the specified criteria (${filterDesc}).\n\n` +
            `• **Daily Attendance Tab:** Checked\n` +
            `• **Morning Attendance Tab:** Checked\n\n` +
            `💡 *Make sure your Google Form responses tab has recorded timestamp entries.*`
          )]
        });
      }

      // If earliest synced date is earlier than current scoringStartDate, rebase scoringStartDate so all past points count
      const currentScoringStart = cohortManager.getScoringStartDate(guild.id);
      let scoringStartUpdated = false;

      if (res.earliestDate && (!currentScoringStart || res.earliestDate < currentScoringStart)) {
        cohortManager.setScoringStartDate(guild.id, res.earliestDate);
        scoringStartUpdated = true;
      }

      // Recalculate full student scores
      const updatedScores = await ScoringService.calculateRTBR(guild.id).catch(() => []);

      // Build student preview list (top 8 by attendance points)
      const topAttStudents = [...updatedScores]
        .sort((a, b) => (b.attendancePoints || 0) - (a.attendancePoints || 0))
        .slice(0, 10);

      const studentScoreLines = topAttStudents.map((s, idx) => {
        const sign = s.attendancePoints >= 0 ? '+' : '';
        return `**${idx + 1}.** <@${s.discordId}> (${s.name}) ➔ **${sign}${s.attendancePoints} pts** *(Total Score: ${s.totalPoints} pts)*`;
      }).join('\n') || "No active student scores found.";

      const dailyDatesStr = res.dailyDates && res.dailyDates.length > 0
        ? res.dailyDates.map(d => `\`${d}\``).join(', ')
        : 'None';

      const morningDatesStr = res.morningDates && res.morningDates.length > 0
        ? res.morningDates.map(d => `\`${d}\``).join(', ')
        : 'None';

      const reportEmbed = Embeds.success(
        "Historical Attendance Synchronized! 📅",
        `✅ Successfully synced **${res.totalSessionsSynced} historical sessions** from Google Form responses into the \`Attendance\` sheet matrix.\n\n` +
        `📊 **Sync Summary:**\n` +
        `• **Daily Attendance Sessions (${res.dailySessionsCount || 0}):** ${dailyDatesStr}\n` +
        `• **Morning Attendance Sessions (${res.morningSessionsCount || 0}):** ${morningDatesStr}\n` +
        `• **Date Range:** \`${res.earliestDate || 'N/A'}\` to \`${res.latestDate || 'N/A'}\`\n` +
        `• **Submissions Processed:** **${res.totalSubmissionsProcessed || 0} form rows**\n` +
        `• **Active Students Updated:** **${res.totalActiveStudents || 0}**\n` +
        `${scoringStartUpdated ? `• **Scoring Start Date:** Automatically rebased to \`${res.earliestDate}\` (all historical points are now active!)\n` : ''}\n` +
        `🏆 **Top Students by Attendance Points (Live Preview):**\n${studentScoreLines}\n\n` +
        `💡 *All points (+1 Present, -1 Absent, 0 Leave/Off) have been added to student scorecards and the leaderboard.*`
      );

      const destChannel = ChannelHelper.findChannel(guild, 'ATTENDANCE');

      if (destChannel && destChannel.id !== message.channel.id) {
        await destChannel.send({ embeds: [reportEmbed] }).catch(() => {});

        const receiptEmbed = Embeds.success(
          "Historical Attendance Synced & Published! 🚀",
          `✅ Synced **${res.totalSessionsSynced} historical sessions** (\`${res.earliestDate}\` to \`${res.latestDate}\`).\n\n` +
          `• **Submissions Processed:** **${res.totalSubmissionsProcessed}**\n` +
          `• **Enrolled Students Updated:** **${res.totalActiveStudents}**\n` +
          `• **Points Awarded:** Student points have been updated on the Leaderboard and Scorecards.\n\n` +
          `📢 **Full Attendance Sync Report posted to <#${destChannel.id}>**`
        );

        return loading.edit({ content: null, embeds: [receiptEmbed] });
      } else {
        return loading.edit({ content: null, embeds: [reportEmbed] });
      }
    } catch (err) {
      return loading.edit({ content: null, embeds: [Embeds.error("Historical Sync Error", err.message)] });
    }
  }
};
