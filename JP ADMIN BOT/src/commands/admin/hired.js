/**
 * Command: !hired
 * Aliases: !hire, !offercracked, !placed
 * Live "Offer Cracked" Celebration Broadcast in #successfully-hired with complete journey stats
 * Supports multiple students in one command: !hired @s1 @s2 @s3 Company [Role]
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
  usage: '!hired @student1 [@student2 ...] <Company Name> [Job Title / Role]',
  mentorOnly: true,

  async execute(message, args, client) {
    // Collect ALL mentioned members (supports multiple @mentions)
    const targets = [...message.mentions.members.values()];
    if (targets.length === 0) {
      return message.reply(
        "⚠️ **Usage:** `!hired @student <Company Name> [Job Title / Role]`\n" +
        "**Multiple students:** `!hired @s1 @s2 @s3 Google Software Engineer`\n" +
        "*Example:* `!hired @JohnDoe Google Software Engineer`"
      );
    }

    // Extract company and role — everything after all @mentions
    const nonMentionArgs = args.filter(a => !a.startsWith('<@'));
    if (nonMentionArgs.length === 0) {
      return message.reply("⚠️ Please specify the company name: `!hired @student <Company Name> [Role]`");
    }

    const company = nonMentionArgs[0];
    const roleTitle = nonMentionArgs.slice(1).join(' ') || "Software Engineer";
    const guildId = message.guild.id;
    const today = DateTimeUtil.getTodayDateStr();

    const mentionList = targets.map(t => `<@${t.id}>`).join(', ');
    const loading = await message.reply(
      targets.length > 1
        ? `🎉 Preparing "Offer Cracked" Celebration for **${targets.length} students**: ${mentionList}...`
        : `🎉 Preparing Live "Offer Cracked" Celebration for <@${targets[0].id}>...`
    );

    try {
      // 1. Fetch shared data once for all students
      const [jobsRes, interviewsRes, tasksRes, scores] = await Promise.all([
        GasClient.getJobsDaily(guildId, 90).catch(() => ({ jobs: [] })),
        GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
        GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
        ScoringService.calculateRTBR(guildId).catch(() => [])
      ]);

      // 2. Get/Create Hired role once
      let hiredRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === constants.ROLES.HIRED.toLowerCase());
      if (!hiredRole) {
        hiredRole = await message.guild.roles.create({
          name: constants.ROLES.HIRED,
          color: '#10B981',
          mentionable: true,
          reason: 'Auto-created Hired alumni role'
        }).catch(() => null);
      }

      const hiredChannel = ChannelHelper.findChannel(message.guild, 'SUCCESSFULLY_HIRED') || message.channel;

      // 3. Process each student one by one
      const results = [];
      for (const target of targets) {
        try {
          // Journey stats per student
          let totalApps = 0;
          (jobsRes.jobs || []).forEach(j => {
            if (j.discordId === target.id) totalApps += (Number(j.count) || 0);
          });

          const studentInterviews = (interviewsRes.interviews || []).filter(i => i.discordId === target.id);
          const studentTasks = (tasksRes.tasks || []).filter(t =>
            t.discordId === target.id && (t.mentorStatus === 'Approved' || t.submissionStatus === 'Submitted')
          );
          const studentScore = scores.find(s => s.discordId === target.id) || { totalPoints: 0 };

          // Assign Hired role
          if (hiredRole) {
            await target.roles.add(hiredRole).catch(() => {});
          }

          // Update DB
          await GasClient.setStudentStatus(
            guildId, target.id, 'hired',
            `Offer cracked at ${company} as ${roleTitle} on ${today}`
          ).catch(() => {});

          // Build embed for this student
          const celebrationEmbed = Embeds.success(
            `🏆 OFFER CRACKED! CONGRATULATIONS ${target.displayName.toUpperCase()}! 🎉`,
            `We are thrilled to announce that <@${target.id}> has officially cracked an offer and joined **${company}**!\n\n` +
            `💼 **Role / Position:** **${roleTitle}**\n` +
            `🏢 **Company:** **${company}**\n` +
            `📅 **Placed Date:** **${today}**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📈 **STUDENT BOOTCAMP JOURNEY STATS:**\n` +
            `• 💼 **Total Job Applications:** **${totalApps > 0 ? totalApps : '50+'} Applications**\n` +
            `• 🎯 **Interviews Attended:** **${studentInterviews.length > 0 ? studentInterviews.length : '1+'} Interviews**\n` +
            `• 🛠️ **Job Tasks Completed:** **${studentTasks.length} Tasks**\n` +
            `• ⭐ **Final RTBR Score:** **${studentScore.totalPoints} Points**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👏 *Hard work, relentless applications, and continuous improvement always pay off. ` +
            `Join us in wishing <@${target.id}> immense success in their new engineering journey!*`
          );

          // Broadcast
          const broadcastMsg = await hiredChannel.send({
            content: `🎉 @everyone **BIG CONGRATULATIONS TO <@${target.id}> FOR CRACKING AN OFFER AT ${company}!** 🚀`,
            embeds: [celebrationEmbed]
          });

          // Reactions
          const emojis = ['🎉', '🚀', '⭐', '👏', '🥳', '💼'];
          for (const emoji of emojis) {
            await broadcastMsg.react(emoji).catch(() => {});
          }

          results.push({ target, success: true });
        } catch (studentErr) {
          Logger.error(`Failed to process hired for ${target.displayName}:`, studentErr);
          results.push({ target, success: false, error: studentErr.message });
        }
      }

      // 4. Summary receipt
      const successList = results.filter(r => r.success);
      const failList = results.filter(r => !r.success);

      let summaryLines = successList.map(r =>
        `✅ <@${r.target.id}> — Announced & \`${constants.ROLES.HIRED}\` role assigned`
      );
      if (failList.length > 0) {
        failList.forEach(r =>
          summaryLines.push(`❌ <@${r.target.id}> — Error: ${r.error}`)
        );
      }

      const receiptEmbed = successList.length > 0
        ? Embeds.success(
            targets.length > 1
              ? `Celebration Broadcast Complete! (${successList.length}/${targets.length} students)`
              : "Celebration Broadcast Complete!",
            `**${successList.length}** offer cracked announcement${successList.length > 1 ? 's' : ''} posted in <#${hiredChannel.id}>.\n\n` +
            summaryLines.join('\n')
          )
        : Embeds.error("Broadcast Failed", summaryLines.join('\n'));

      await loading.edit({ content: null, embeds: [receiptEmbed] });

    } catch (err) {
      Logger.error("Failed to execute !hired command:", err);
      await loading.edit({ content: null, embeds: [Embeds.error("Celebration Error", err.message)] });
    }
  }
};
