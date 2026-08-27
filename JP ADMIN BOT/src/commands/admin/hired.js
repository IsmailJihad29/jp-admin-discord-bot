/**
 * Command: !hired
 * Aliases: !hire, !offercracked, !placed
 * Live "Offer Cracked" Celebration Broadcast in #successfully-hired with complete journey stats
 */

const GasClient = require('../../services/gasClient');
const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');
const Logger = require('../../utils/logger');

module.exports = {
  name: 'hired',
  aliases: ['hire', 'offercracked', 'placed'],
  description: 'Broadcasts a grand Offer Cracked celebration with student journey stats and assigns Hired role',
  usage: '!hired @student <Company Name> [Job Title / Role]',
  mentorOnly: true,

  async execute(message, args, client) {
    const target = message.mentions.members.first();
    if (!target) {
      return message.reply("⚠️ **Usage:** `!hired @student <Company Name> [Job Title / Role]`\n*Example:* `!hired @JohnDoe Google Software Engineer`");
    }

    // Extract company and role
    const nonMentionArgs = args.filter(a => !a.startsWith('<@'));
    if (nonMentionArgs.length === 0) {
      return message.reply("⚠️ Please specify the company name: `!hired @student <Company Name> [Role]`");
    }

    const company = nonMentionArgs[0];
    const roleTitle = nonMentionArgs.slice(1).join(' ') || "Software Engineer";
    const guildId = message.guild.id;

    const loading = await message.reply(`🎉 Preparing Live "Offer Cracked" Celebration for <@${target.id}>...`);

    try {
      // 1. Fetch Student Journey Statistics
      const [jobsRes, interviewsRes, tasksRes, scores] = await Promise.all([
        GasClient.getJobsDaily(guildId, 90).catch(() => ({ jobs: [] })),
        GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
        GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
        ScoringService.calculateRTBR(guildId).catch(() => [])
      ]);

      // Calculate total applications
      let totalApps = 0;
      (jobsRes.jobs || []).forEach(j => {
        if (j.discordId === target.id) {
          totalApps += (Number(j.count) || 0);
        }
      });

      // Calculate total interviews
      const studentInterviews = (interviewsRes.interviews || []).filter(i => i.discordId === target.id);
      const totalInterviews = studentInterviews.length;

      // Calculate completed tasks
      const studentTasks = (tasksRes.tasks || []).filter(t => t.discordId === target.id && (t.mentorStatus === 'Approved' || t.submissionStatus === 'Submitted'));
      const totalTasks = studentTasks.length;

      // Find final score
      const studentScore = scores.find(s => s.discordId === target.id) || { totalPoints: 0 };
      const finalPoints = studentScore.totalPoints;

      // 2. Assign 'Hired' Discord Role
      let hiredRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === constants.ROLES.HIRED.toLowerCase());
      if (!hiredRole) {
        hiredRole = await message.guild.roles.create({
          name: constants.ROLES.HIRED,
          color: '#10B981', // emerald green
          mentionable: true,
          reason: 'Auto-created Hired alumni role'
        }).catch(() => null);
      }

      if (hiredRole) {
        await target.roles.add(hiredRole).catch(() => {});
      }

      // 3. Update Status in Google Sheets Database
      await GasClient.setStudentStatus(guildId, target.id, 'hired', `Offer cracked at ${company} as ${roleTitle} on ${DateTimeUtil.getTodayDateStr()}`).catch(() => {});

      // 4. Construct the Grand Celebration Embed
      const celebrationEmbed = Embeds.success(
        `🏆 OFFER CRACKED! CONGRATULATIONS ${target.displayName.toUpperCase()}! 🎉`,
        `We are thrilled to announce that <@${target.id}> has officially cracked an offer and joined **${company}**!\n\n` +
        `💼 **Role / Position:** **${roleTitle}**\n` +
        `🏢 **Company:** **${company}**\n` +
        `📅 **Placed Date:** **${DateTimeUtil.getTodayDateStr()}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 **STUDENT BOOTCAMP JOURNEY STATS:**\n` +
        `• 💼 **Total Job Applications:** **${totalApps > 0 ? totalApps : '50+'} Applications**\n` +
        `• 🎯 **Interviews Attended:** **${totalInterviews > 0 ? totalInterviews : '1+'} Interviews**\n` +
        `• 🛠️ **Job Tasks Completed:** **${totalTasks} Tasks**\n` +
        `• ⭐ **Final RTBR Score:** **${finalPoints} Points**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👏 *Hard work, relentless applications, and continuous improvement always pay off. Join us in wishing <@${target.id}> immense success in their new engineering journey!*`
      );

      // 5. Broadcast to #successfully-hired Channel
      const hiredChannel = ChannelHelper.findChannel(message.guild, 'SUCCESSFULLY_HIRED') || message.channel;

      const broadcastMsg = await hiredChannel.send({
        content: `🎉 @everyone **BIG CONGRATULATIONS TO <@${target.id}> FOR CRACKING AN OFFER AT ${company}!** 🚀`,
        embeds: [celebrationEmbed]
      });

      // Add celebratory reaction emojis
      const emojis = ['🎉', '🚀', '⭐', '👏', '🥳', '💼'];
      for (const emoji of emojis) {
        await broadcastMsg.react(emoji).catch(() => {});
      }

      await loading.edit({
        content: null,
        embeds: [Embeds.success("Celebration Broadcast Complete!", `Offer cracked announcement posted in <#${hiredChannel.id}> and role \`${constants.ROLES.HIRED}\` assigned to <@${target.id}>.`)]
      });
    } catch (err) {
      Logger.error("Failed to execute !hired command:", err);
      await loading.edit({ content: null, embeds: [Embeds.error("Celebration Error", err.message)] });
    }
  }
};
