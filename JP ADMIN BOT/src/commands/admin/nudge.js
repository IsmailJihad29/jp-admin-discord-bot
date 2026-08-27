/**
 * Command: !nudge, !remind, !pingtarget
 * Smart Bulk Ping & Action Hub for mentors to quickly alert targeted student groups
 */

const CohortDataService = require('../../services/cohortDataService');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'nudge',
  aliases: ['remind', 'pingtarget', 'bulknudge', 'alertgroup'],
  description: 'Broadcasts a targeted ping and reminder to specific student groups (missing tracker, below target, absent)',
  usage: '!nudge <nosheet | nojobs | absent>',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const type = args[0] ? args[0].toLowerCase() : '';

    if (!type || (type !== 'nosheet' && type !== 'notracker' && type !== 'nojobs' && type !== 'absent')) {
      return message.reply({
        embeds: [Embeds.info(
          "🔔 Smart Nudge & Reminder Hub",
          "Choose a targeted student group to automatically ping with friendly reminders and instructions:\n\n" +
          "• `!nudge nosheet` → Pings all students who haven't linked their tracker in `#job-tracker`\n" +
          "• `!nudge nojobs` → Pings students who haven't met today's application target in `#job-tracker`\n" +
          "• `!nudge absent` → Pings students absent in recent sessions with 1-on-1 support invitation\n\n" +
          "*All nudges are sent with clear copy-paste templates and helpful instructions.*"
        )]
      });
    }

    // 1. Nudge Missing Tracker Students
    if (type === 'nosheet' || type === 'notracker') {
      const unlinked = await CohortDataService.getStudentsWithoutTracker(guild.id);
      if (unlinked.length === 0) {
        return message.reply("✅ **Awesome! All students have already linked their tracker sheet.**");
      }

      const trackerCh = ChannelHelper.findChannel(guild, 'JOB_TRACKING') || message.channel;
      const mentions = unlinked.map(s => `<@${s.discordId}>`).join(' ');

      const reminderEmbed = Embeds.warning(
        "📢 Reminder: Please Link Your Job Tracker Google Sheet",
        "Hello students! Our automated daily audit (23:30) could not find your linked Google Sheet.\n\n" +
        "⭐ **Why this is required:**\n" +
        "• Your daily job applications are automatically tracked every night for your Leaderboard & RTBR score.\n" +
        "• Without linking your sheet, you will miss out on daily streak points!\n\n" +
        "📋 **HOW TO LINK (Takes 10 Seconds):**\n" +
        "1. Open your personal copy of the Job Application Google Sheet.\n" +
        "2. Make sure Share setting is **'Anyone with the link can view'**.\n" +
        "3. Type in this channel: `!linksheet <Your_Google_Sheet_URL>`\n\n" +
        "👉 *Need a blank sheet template? Ask in this channel or check guidelines!*",
        `JP ADMIN ${constants.BOT_VERSION} · Action Required`
      );

      await trackerCh.send({
        content: `${mentions}\n🔔 **Friendly Reminder from Mentors:**`,
        embeds: [reminderEmbed]
      });

      return message.reply(`✅ Successfully pinged **${unlinked.length} students** with tracker instructions in <#${trackerCh.id}>.`);
    }

    // 2. Nudge Below Target Students
    if (type === 'nojobs') {
      const { cohortTarget, totalBelow, belowTargetStudents } = await CohortDataService.getStudentsBelowTarget(guild.id);
      if (totalBelow === 0) {
        return message.reply(`✅ **Awesome! All students have met today's target of ${cohortTarget} applications!**`);
      }

      const trackerCh = ChannelHelper.findChannel(guild, 'JOB_TRACKING') || message.channel;
      const mentions = belowTargetStudents.map(s => `<@${s.discordId}>`).join(' ');

      const jobReminderEmbed = Embeds.info(
        `💼 Evening Push: Daily Application Target (${cohortTarget} Apps)`,
        `Hello team! Just a reminder that tonight's automated audit runs at **11:30 PM (23:30)**.\n\n` +
        `• 🎯 **Today's Goal:** **${cohortTarget} Job Applications**\n` +
        `• ⭐ **Rewards:** \`+2.0 pts\` for 100% target | \`+3.0 pts\` for exceeding target | \`+3 pts/day\` streak bonus!\n\n` +
        `*Update your personal Google Sheet before 11:30 PM to capture all your applications.*`,
        `JP ADMIN ${constants.BOT_VERSION} · Daily Push`
      );

      await trackerCh.send({
        content: `${mentions}\n⏰ **Daily Job Application Push:**`,
        embeds: [jobReminderEmbed]
      });

      return message.reply(`✅ Successfully pinged **${totalBelow} students** in <#${trackerCh.id}>.`);
    }

    // 3. Nudge Chronic Absentees
    if (type === 'absent') {
      const { targetDates, affectedStudents } = await CohortDataService.getAbsentsInLastNDays(guild.id, 3);
      if (affectedStudents.length === 0) {
        return message.reply("✅ **No chronic absentees found in recent active sessions.**");
      }

      const adminCh = ChannelHelper.findChannel(guild, 'BOT_ADMIN') || message.channel;
      const mentions = affectedStudents.map(s => `<@${s.discordId}>`).join(' ');

      const absentEmbed = Embeds.warning(
        "⚠️ Attendance Support & Check-In Notice",
        "We noticed you have missed recent sessions. Your growth and career progression are our top priority!\n\n" +
        "• 📅 If you have personal emergencies or exams, please submit a leave: `!leave <Reason>`.\n" +
        "• 💬 If you are stuck or facing challenges, please reach out to your Mentors for a 1-on-1 support session.",
        `JP ADMIN ${constants.BOT_VERSION} · Student Care`
      );

      const discussionCh = ChannelHelper.findChannel(guild, 'DISCUSSION') || adminCh;
      await discussionCh.send({
        content: `${mentions}\n👋 **A Quick Check-in from Your Mentors:**`,
        embeds: [absentEmbed]
      });

      return message.reply(`✅ Successfully sent support notice to **${affectedStudents.length} students** in <#${discussionCh.id}>.`);
    }
  }
};
