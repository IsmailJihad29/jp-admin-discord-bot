/**
 * Commands: !leaderboard, !rtbr, !weeklyreport, !topstudents
 * Calculates consolidated performance scores for ALL active students and broadcasts with @everyone mentions
 */

const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const constants = require('../../config/constants');

module.exports = {
  name: 'leaderboard',
  aliases: ['rtbr', 'weeklyreport', 'topstudents', 'fullleaderboard', 'ranks'],
  description: 'View 7-day rolling performance and Right-To-Be-Referred (RTBR) leaderboards for all students',
  usage: '!leaderboard | !rtbr | !weeklyreport',
  supervisorOnly: false, // Students can view leaderboard

  async execute(message, args, client) {
    const guild = message.guild;
    const guildId = guild.id;

    const loading = await message.reply("🏆 Calculating consolidated weekly performance scores across all active students...");

    try {
      const standings = await ScoringService.calculateRTBR(guildId);

      if (!standings || standings.length === 0) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning("No Data", "No active student performance records found for this period yet.")]
        });
      }

      const embeds = Embeds.fullWeeklyLeaderboardEmbeds(
        "Weekly Student Performance Leaderboard",
        standings,
        "Includes Attendance (+1/-1), Job Applications, Streaks (+3/day), Interviews (+5), and Tasks"
      );

      const destChannel = ChannelHelper.findChannel(guild, 'RTBR');
      const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
      const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

      if (destChannel && destChannel.id !== message.channel.id && ChannelHelper.isChannel(message.channel, 'BOT_ADMIN')) {
        // Send all embeds with @everyone mention to #referral-leaderboard
        await destChannel.send({
          content: `${mentionTag} 📢 **WEEKLY COHORT PERFORMANCE & REFERRAL LEADERBOARD IS OUT!** 🏆`,
          embeds: embeds
        }).catch(() => {});

        const topStudent = standings[0];
        const receiptEmbed = Embeds.success(
          "Weekly Performance Leaderboard Published! 🏆",
          `✅ Leaderboard calculated across all **${standings.length} active students**.\n\n` +
          `• 🥇 **Top Rank:** ${topStudent ? `<@${topStudent.discordId}> (**${topStudent.totalPoints} pts**)` : 'N/A'}\n` +
          `• 👥 **Full Roster Breakdown:** Ranks #1 to #${standings.length} included in identical detail.\n` +
          `• 📢 **Published to Channel:** <#${destChannel.id}> with \`@everyone\` mention.`
        );
        await loading.edit({ content: null, embeds: [receiptEmbed] });
      } else {
        await loading.edit({
          content: `${mentionTag} 📢 **Weekly Student Performance Leaderboard:**`,
          embeds: embeds
        });
      }
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Leaderboard Error", err.message)] });
    }
  }
};
