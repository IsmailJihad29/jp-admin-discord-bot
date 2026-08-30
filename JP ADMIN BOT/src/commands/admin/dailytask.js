/**
 * Command: !dailytask
 * Aliases: !postdailytask, !setdailytask, !todaytask, !tasktoday, !jobtargettoday
 * Enables Mentors & Supervisors to set and announce daily job application targets & instructions
 * with automatic marking criteria calculation for the midnight scraper.
 */

const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');
const ChannelHelper = require('../../utils/channelHelper');
const constants = require('../../config/constants');

module.exports = {
  name: 'dailytask',
  aliases: ['postdailytask', 'setdailytask', 'todaytask', 'tasktoday', 'jobtargettoday'],
  description: 'Announce daily job application target and task instructions in #daily-tasks',
  usage: '!dailytask [YYYY-MM-DD] <Target_Count> [Instructions]',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const todayStr = DateTimeUtil.getTodayDateStr();

    // 1. Status / List check
    if (args[0]?.toLowerCase() === 'status' || args[0]?.toLowerCase() === 'check') {
      const checkDate = args[1] || todayStr;
      const target = cohortManager.getDailyJobTarget(guild.id, checkDate);
      const details = cohortManager.getDailyJobTaskDetails(guild.id, checkDate);

      const embed = Embeds.info(
        `Daily Job Target Status · ${checkDate}`,
        `• 📅 **Date:** \`${checkDate}\`\n` +
        `• 🎯 **Application Target:** **${target} Applications**\n` +
        `• 📝 **Instructions:** ${details?.instructions || '*Standard daily application target.*'}\n` +
        `• ⏰ **Set At:** \`${details?.setAt ? new Date(details.setAt).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }) : 'Default'}\``
      );
      return message.reply({ embeds: [embed] });
    }

    if (args.length === 0) {
      const currentTarget = cohortManager.getDailyJobTarget(guild.id, todayStr);
      const embed = Embeds.info(
        "🎯 Daily Job Task & Target Manager",
        `Use this command to set today's or an upcoming day's job application target and broadcast the task to students.\n\n` +
        `📋 **Usage Syntax:**\n` +
        `• \`!dailytask <Target_Count> [Instructions]\` *(Sets today's target)*\n` +
        `• \`!dailytask <YYYY-MM-DD> <Target_Count> [Instructions]\` *(Sets specific date)*\n\n` +
        `**Examples:**\n` +
        `• \`!dailytask 12 Apply to 12 remote Frontend / React jobs on LinkedIn\`\n` +
        `• \`!dailytask 2026-09-01 15 Focus on Full Stack MERN openings with custom notes\`\n\n` +
        `• 📅 **Today's Active Target:** **${currentTarget} Applications**`
      );
      return message.reply({ embeds: [embed] });
    }

    // 2. Parse arguments: check if arg[0] is a date (YYYY-MM-DD) or target count
    let targetDate = todayStr;
    let targetCount = null;
    let instructions = "";

    const isDatePattern = /^\d{4}-\d{2}-\d{2}$/.test(args[0]);

    if (isDatePattern) {
      targetDate = args[0];
      targetCount = parseInt(args[1], 10);
      instructions = args.slice(2).join(' ').trim();
    } else {
      targetCount = parseInt(args[0], 10);
      instructions = args.slice(1).join(' ').trim();
    }

    if (isNaN(targetCount) || targetCount <= 0) {
      return message.reply({
        embeds: [Embeds.error("Invalid Target Count", "Please provide a valid positive number of applications.\n*Example:* `!dailytask 12 Apply to 12 jobs today`")]
      });
    }

    // 3. Save target in cohort manager
    cohortManager.setDailyJobTarget(guild.id, targetDate, targetCount, instructions);

    // Calculate dynamic marking criteria
    const tier70Min = Math.ceil(targetCount * 0.7);
    const tier70Max = targetCount - 1;

    // 4. Build announcement embed
    const taskEmbed = Embeds.info(
      `🎯 DAILY JOB TARGET & TASK · ${targetDate}`,
      `📢 **Attention Students! Here is your official job application target & task for \`${targetDate}\`:**\n\n` +
      `🎯 **Today's Mandatory Target:** **${targetCount} Applications**\n` +
      `📝 **Task & Focus Instructions:**\n${instructions || 'Apply to relevant software engineering roles matching your tech stack.'}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚖️ **Marking & Scoring Criteria for \`${targetDate}\`:**\n` +
      `• 🟢 **১০০% টার্গেট (${targetCount}+ টি আবেদন):** \`+1.0 Point\`\n` +
      `• 🟡 **৭০%–৯৯% (${tier70Min}–${tier70Max}টি আবেদন):** \`+0.5 Point\`\n` +
      `• 🔴 **< ৭০% (< ${tier70Min}টি আবেদন):** \`-0.5 Point\` *(পেনাল্টি)*\n` +
      `• ⏰ **নাইটলি স্ক্র্যাপার ডেডলাইন:** **রাত ১২:০০ টা (মধ্যরাত)**\n\n` +
      `👉 **সবাই আজ মধ্যরাতের আগেই আপনার লিংক করা গুগল শিটে আবেদনগুলো আপডেট করে রাখুন!**`
    );

    // 5. Broadcast to #daily-tasks / DAILY_TASK channel
    const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
    const mentionTag = studentRole ? `<@&${studentRole.id}>` : '';

    let destChannel = ChannelHelper.findChannel(guild, 'DAILY_TASK') ||
                      ChannelHelper.findChannel(guild, 'JOB_TASK') ||
                      ChannelHelper.findChannel(guild, 'JOB_TRACKING') ||
                      ChannelHelper.findChannel(guild, 'ANNOUNCEMENTS');

    if (destChannel) {
      await destChannel.send({
        content: `${mentionTag ? `${mentionTag} ` : ''}📢 **DAILY JOB TARGET ANNOUNCEMENT** 🎯`,
        embeds: [taskEmbed]
      }).catch(() => {});
    }

    const receiptEmbed = Embeds.success(
      "Daily Job Target Configured & Published! 🎯",
      `✅ Successfully set the daily job application target and broadcasted the criteria.\n\n` +
      `• 📅 **Date:** \`${targetDate}\`\n` +
      `• 🎯 **Target:** **${targetCount} Applications**\n` +
      `• 📝 **Instructions:** ${instructions || '*Standard*'}\n` +
      `• 📢 **Published To:** ${destChannel ? `<#${destChannel.id}>` : 'None found'}\n` +
      `• 🤖 **Scraper Engine:** Tonight's 12:05 AM scraper will evaluate students against **${targetCount} applications**.`
    );

    return message.reply({ embeds: [receiptEmbed] });
  }
};
