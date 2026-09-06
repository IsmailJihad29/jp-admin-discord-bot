/**
 * Command: !resetscores, !resetpoints, !startweek, !setstartdate, !recalculate, !rescan
 * Clears all cached/manual adjustments, re-fetches everything fresh from Google Sheets,
 * recalculates all student points from scratch, and previews the new scores.
 */

const cohortManager = require('../../config/cohortManager');
const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'resetscores',
  aliases: [
    'resetpoints', 'resetmarking', 'resetmarkings',
    'startweek', 'cleanscores', 'setstartdate', 'scoringstart',
    'recalculate', 'recalc', 'rescan', 'freshscan', 'rescoreall'
  ],
  description: 'Clears all point adjustments, re-fetches fresh data from Google Sheets, and recalculates all student scores from scratch',
  usage: '!resetscores [YYYY-MM-DD] | !recalculate',
  mentorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();

    // --- Mode: !recalculate / !rescan --- Fresh recalculate WITHOUT changing scoringStartDate
    const isRecalcOnly = ['recalculate', 'recalc', 'rescan', 'freshscan', 'rescoreall'].includes(commandName);

    if (isRecalcOnly) {
      const loading = await message.reply(
        `🔄 **Clearing all manual adjustments and re-fetching fresh data from Google Sheets...**\n` +
        `*This may take a moment — pulling attendance, jobs, interviews, and tasks.*`
      );

      try {
        // 1. Clear all manual point adjustments
        const cohort = cohortManager.getCohort(guildId);
        const prevAdjCount = Object.keys(cohort.manualAdjustments || {}).length;
        cohort.manualAdjustments = {};
        cohortManager.saveToDisk();

        // 2. Fresh recalculate from Sheets
        const scores = await ScoringService.calculateRTBR(guildId, message.guild);

        if (!scores || scores.length === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.warning(
              "No Student Data Found",
              "Re-fetch completed but no active student scores were found. Check that Bot_Map has active students."
            )]
          });
        }

        const scoring = cohortManager.getCohortScoring(guildId);
        const topStudents = scores.slice(0, 10);

        const scoreLines = topStudents.map((s, i) => {
          const sign = s.totalPoints >= 0 ? '+' : '';
          const breakdown = `Att:${s.attendancePoints >= 0 ? '+' : ''}${s.attendancePoints} | Jobs:${s.jobPoints >= 0 ? '+' : ''}${s.jobPoints} | Int:+${s.interviewPoints} | Tasks:${s.taskPoints >= 0 ? '+' : ''}${s.taskPoints}`;
          return `**${i + 1}.** <@${s.discordId}> *(${s.name})* → **${sign}${s.totalPoints} pts**\n   └ ${breakdown}`;
        }).join('\n');

        return loading.edit({
          content: null,
          embeds: [Embeds.success(
            `✅ Fresh Recalculation Complete! (${scores.length} Students)`,
            `All point caches cleared and scores recalculated fresh from Google Sheets.\n\n` +
            `• **Manual Adjustments Cleared:** **${prevAdjCount}** students\n` +
            `• **Active Students Recalculated:** **${scores.length}**\n` +
            `• **Scoring Period:** From \`${scoring.scoringStartDate}\` onwards\n\n` +
            `🏆 **Top ${topStudents.length} Students (Fresh Scores):**\n${scoreLines}\n\n` +
            `💡 *All future leaderboards will now use these fresh scores.*`,
            `JP ADMIN ${constants.BOT_VERSION} · Fresh Recalculation`
          )]
        });

      } catch (err) {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Recalculation Error", err.message)]
        });
      }
    }

    // --- Mode: !resetscores / !startweek --- Reset scoring start date + full recalculate
    // Automatically calculate next Sunday date if not provided
    let targetDate = args[0];
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      targetDate = DateTimeUtil.getNextSundayDate();
    }

    const loading = await message.reply(
      `🔄 **Resetting all scores and re-fetching fresh data from Google Sheets...**\n` +
      `*New scoring start date: \`${targetDate}\`. This may take a moment.*`
    );

    try {
      // 1. Reset scoring config and clear ALL manual adjustments
      cohortManager.resetCohortScoring(guildId, targetDate);
      const cohort = cohortManager.getCohort(guildId);
      const prevAdjCount = Object.keys(cohort.manualAdjustments || {}).length;
      cohort.manualAdjustments = {};
      cohortManager.saveToDisk();

      // 2. Fresh recalculate from Sheets with new start date
      const scores = await ScoringService.calculateRTBR(guildId, message.guild);
      const scoring = cohortManager.getCohortScoring(guildId);

      let scorePreview = '';
      if (scores && scores.length > 0) {
        const topStudents = scores.slice(0, 8);
        scorePreview =
          `\n\n🏆 **Student Scores (Fresh from Sheets):**\n` +
          topStudents.map((s, i) => {
            const sign = s.totalPoints >= 0 ? '+' : '';
            return `**${i + 1}.** <@${s.discordId}> *(${s.name})* → **${sign}${s.totalPoints} pts**`;
          }).join('\n');
      }

      return loading.edit({
        content: null,
        embeds: [Embeds.success(
          "🔄 Full Score Reset & Fresh Recalculation Complete!",
          `✅ **All student points cleared and recalculated fresh from Google Sheets.**\n\n` +
          `• 📅 **New Scoring Starts From:** **\`${targetDate}\` (Sunday)**\n` +
          `• 🗑️ **Manual Adjustments Cleared:** **${prevAdjCount}** previous adjustments removed\n` +
          `• 👥 **Students Recalculated:** **${scores?.length || 0}** active students\n` +
          `• 🗓️ **Working Days:** Sunday to Thursday (5 days)\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚙️ **Active Scoring Rules:**\n` +
          `• 📅 Attendance: \`+${scoring.attendancePresent} Present\` / \`${scoring.attendanceAbsent} Absent\`\n` +
          `• 🎙️ Interview: \`+${scoring.interviewPoints} pts\` per interview\n` +
          `• 💼 Job Target: \`${scoring.jobTarget} apps/day\` (weekly Sun–Thu)\n` +
          `• 🔥 Streak Bonus: \`+${scoring.streakBonusPerDay}/day\` (Max: ${scoring.streakCap} pts)` +
          scorePreview,
          `JP ADMIN ${constants.BOT_VERSION} · Scoring Baseline Manager`
        )]
      });

    } catch (err) {
      return loading.edit({
        content: null,
        embeds: [Embeds.error("Reset Error", err.message)]
      });
    }
  }
};
