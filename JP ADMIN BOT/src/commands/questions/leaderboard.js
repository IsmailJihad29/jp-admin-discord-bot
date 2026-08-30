/**
 * Commands: !leaderboard, !rtbr, !weeklyreport, !topstudents, !publishleaderboard
 * Calculates consolidated performance scores for ALL active students and broadcasts on-demand or to target channels
 */

const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const cohortManager = require('../../config/cohortManager');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

async function sendEmbedsSafely(targetChannel, embeds, initialContent = null, loadingMsgToEdit = null) {
  const MAX_EMBEDS_PER_MSG = 1; // Discord per-message combined embed limit is 6000 chars total
  const batches = [];

  for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MSG) {
    batches.push(embeds.slice(i, i + MAX_EMBEDS_PER_MSG));
  }

  for (let b = 0; b < batches.length; b++) {
    const batchEmbeds = batches[b];
    const isFirst = b === 0;
    const content = isFirst ? initialContent : null;

    if (isFirst && loadingMsgToEdit) {
      await loadingMsgToEdit.edit({
        content: content,
        embeds: batchEmbeds
      });
    } else {
      await targetChannel.send({
        content: content,
        embeds: batchEmbeds
      }).catch(err => {
        console.error("Leaderboard send error:", err.message);
      });
    }
  }
}

module.exports = {
  name: 'leaderboard',
  aliases: ['rtbr', 'weeklyreport', 'topstudents', 'fullleaderboard', 'ranks', 'publishleaderboard', 'postleaderboard', 'leaderboardpublish'],
  description: 'View real-time Right-To-Be-Referred (RTBR) performance leaderboards or publish them on-demand to student channels',
  usage: '!leaderboard | !leaderboard post [#channel] | !publishleaderboard',
  supervisorOnly: false, // Students can view leaderboard

  async execute(message, args, client) {
    const guild = message.guild;
    const guildId = guild.id;
    const isMentor = cohortManager.isMentor(guildId, message.member);
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();

    const firstArg = (args[0] || '').toLowerCase();
    const isPublishAction = isMentor && (
      firstArg === 'post' ||
      firstArg === 'publish' ||
      firstArg === 'broadcast' ||
      commandName.includes('publish') ||
      commandName.includes('postleaderboard') ||
      ChannelHelper.isChannel(message.channel, 'BOT_ADMIN')
    );

    // Students cannot publish — block early with a friendly message
    if (!isMentor && (
      firstArg === 'post' || firstArg === 'publish' || firstArg === 'broadcast' ||
      commandName.includes('publish') || commandName.includes('postleaderboard')
    )) {
      return message.reply({
        embeds: [Embeds.warning(
          '⚠️ Mentor Only Action',
          `Hello <@${message.author.id}>, **publishing the leaderboard is restricted to Mentors & Supervisors only.**\n\n` +
          `💡 To *view* the leaderboard, simply use \`!leaderboard\` without any extra arguments.`
        )]
      });
    }

    const loading = await message.reply("🏆 **Calculating real-time RTBR performance scores across all active students...**");

    try {
      const standings = await ScoringService.calculateRTBR(guildId, guild);

      if (!standings || standings.length === 0) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning("No Data", "No active student performance records found for this period yet.")]
        });
      }

      const embeds = Embeds.fullWeeklyLeaderboardEmbeds(
        `Cohort Performance Leaderboard · ${DateTimeUtil.getTodayDateStr()}`,
        standings,
        "Includes Attendance (+1/-1), Job Applications, Streaks (+3/day), Interviews (+2), and Tasks"
      );

      const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
      const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

      // Determine target destination channel
      let destChannel = null;
      if (message.mentions.channels.first()) {
        destChannel = message.mentions.channels.first();
      } else if (args[1]) {
        destChannel = guild.channels.cache.find(c => c.name.toLowerCase() === args[1].toLowerCase().replace(/^#/, ''));
      } else if (args[0] && args[0].startsWith('#')) {
        destChannel = guild.channels.cache.find(c => c.name.toLowerCase() === args[0].toLowerCase().replace(/^#/, ''));
      }

      if (!destChannel) {
        destChannel = ChannelHelper.findChannel(guild, 'RTBR') || ChannelHelper.findChannel(guild, 'DISCUSSION');
      }

      if (isPublishAction && destChannel && destChannel.id !== message.channel.id) {
        // Broadcast embeds safely with @everyone mention to target channel
        const broadcastHeader = `${mentionTag} 📢 **COHORT PERFORMANCE & RIGHT-TO-BE-REFERRED (RTBR) LEADERBOARD IS LIVE!** 🏆\n*Real-time student points & ranking calculated across all active activities:*`;
        await sendEmbedsSafely(destChannel, embeds, broadcastHeader, null);

        const topStudent = standings[0];
        const receiptEmbed = Embeds.success(
          "Performance Leaderboard Published! 🏆",
          `✅ Leaderboard successfully calculated and broadcasted across all **${standings.length} active students**.\n\n` +
          `• 🥇 **Top Rank:** ${topStudent ? `<@${topStudent.discordId}> (**${topStudent.totalPoints} pts**)` : 'N/A'}\n` +
          `• 👥 **Total Active Students:** **${standings.length}**\n` +
          `• 📢 **Published to Channel:** <#${destChannel.id}> with \`@everyone\` mention.\n` +
          `• ⏰ **Timestamp:** \`${DateTimeUtil.getFullTimestamp()}\``
        );
        await loading.edit({ content: null, embeds: [receiptEmbed] });
      } else {
        await sendEmbedsSafely(message.channel, embeds, `${mentionTag} 📢 **Real-Time Student Performance Leaderboard:**`, loading);
      }
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Leaderboard Error", err.message)] });
    }
  }
};
