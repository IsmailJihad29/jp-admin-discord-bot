/**
 * Commands: !leaderboard, !rtbr, !weeklyreport
 */

const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'leaderboard',
  aliases: ['rtbr', 'weeklyreport'],
  description: 'View 7-day rolling Right-To-Be-Referred (RTBR) and performance leaderboards',
  usage: '!leaderboard | !rtbr | !weeklyreport',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    const loading = await message.reply("🏆 Calculating 7-day rolling performance & RTBR scores across Sheet records...");

    try {
      const standings = await ScoringService.calculateRTBR(guildId);

      if (commandName === 'rtbr') {
        const top5 = standings.slice(0, 5);
        const embed = Embeds.leaderboard(
          "Priority for Referral (RTBR Rolling 7-Day Board)",
          top5,
          "Score Formula: Questions + (15/Interview) + Jobs/Target*10 + Streak + Workshop (4/session)"
        );
        return loading.edit({ content: null, embeds: [embed] });
      }

      // Default !leaderboard / !weeklyreport
      const top10 = standings.slice(0, 10);
      const embed = Embeds.leaderboard(
        "Weekly Student Performance Leaderboard",
        top10,
        "Includes Job Applications, Streaks, Daily Questions, Interviews, and Workshop Attendance"
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Leaderboard Error", err.message)] });
    }
  }
};
