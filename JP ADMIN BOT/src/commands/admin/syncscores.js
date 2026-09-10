/**
 * Command: !syncscores, !storescores, !calculatescores, !syncpoints
 * Calculates and persists both Weekly and Lifetime scores & ranks for all students
 * into the 'Scores' tab in Google Sheets so health checks load instantly without recalculation.
 */

const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'syncscores',
  aliases: ['storescores', 'calculatescores', 'syncpoints'],
  description: 'Pre-calculates Weekly & Lifetime scores for all students and saves them into the Google Sheet Scores tab',
  usage: '!syncscores',
  mentorOnly: true,

  async execute(message, args, client) {
    const loading = await message.reply("📊 **Calculating Weekly & Lifetime performance scores and syncing to Google Sheets...**");

    try {
      const result = await ScoringService.syncScoresToSheet(message.guild.id, message.guild);

      if (!result.success) {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Scores Sync Failed", result.error || "Could not sync scores to Google Sheets.")]
        });
      }

      const embed = Embeds.success(
        "Student Scores Pre-Calculated & Synced! ⚡",
        `✅ Successfully calculated and stored performance data in your Google Spreadsheet **\`Scores\`** tab!\n\n` +
        `• 👥 **Students Synced:** **${result.scoresCount} students**\n` +
        `• 📅 **Weekly Metrics:** Weekly Total Points, Attendance, Jobs, Streak, Interviews, Tasks, Weekly Rank & Active/Inactive Status\n` +
        `• 📈 **Lifetime Metrics:** Lifetime Points, Attendance, Jobs, Streak, Interviews, Tasks & Lifetime Rank\n` +
        `• ⚡ **Performance Benefit:** Commands like \`!myhealth\` will now load instantly from the sheet cache instead of reprocessing 6 raw tabs.\n\n` +
        `💡 *Students can check their health anytime via \`!myhealth\` or the interactive health check button.*`,
        `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({
        content: null,
        embeds: [Embeds.error("Scores Sync Error", err.message + "\n\n*(Ensure the latest Code.gs is deployed to your Google Sheet)*")]
      });
    }
  }
};
