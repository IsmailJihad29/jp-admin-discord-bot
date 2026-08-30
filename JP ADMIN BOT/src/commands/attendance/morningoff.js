/**
 * Commands: !morningoff, !morningbasecamp, !offmorning, !basecampoff
 * Sets Morning Basecamp to OFF/Paused for today (or a specific date).
 * When OFF: morning attendance points become 0 for everyone (no +1, no -1 penalty),
 * 12:00 PM auto-scan is paused, and an official announcement is broadcasted.
 */

const GasClient = require('../../services/gasClient');
const cohortManager = require('../../config/cohortManager');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');
const constants = require('../../config/constants');

module.exports = {
  name: 'morningoff',
  aliases: ['morningbasecamp', 'offmorning', 'basecampoff'],
  description: 'Sets Morning Basecamp to OFF for today or a specific date (0 attendance points for all students)',
  usage: '!morningoff [today | YYYY-MM-DD] [reason] | !morningoff on [date] | !morningoff list',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const todayDate = DateTimeUtil.getTodayDateStr();

    // 1. List / Status: !morningoff list | !morningoff status
    if (args[0]?.toLowerCase() === 'list' || args[0]?.toLowerCase() === 'status') {
      const isTodayOff = cohortManager.isMorningOff(guild.id, todayDate);
      const offDays = cohortManager.getMorningOffDays(guild.id);

      let listStr = "";
      if (offDays.length === 0) {
        listStr = "• *No Morning Basecamp off days currently registered.*";
      } else {
        listStr = offDays.map((item, idx) => {
          const dStr = typeof item === 'string' ? item : item.date;
          const rStr = typeof item === 'object' && item.reason ? item.reason : "Off";
          const byStr = typeof item === 'object' && item.setBy ? `(by ${item.setBy})` : "";
          return `• **${idx + 1}. \`${dStr}\`** — ${rStr} ${byStr}`;
        }).join('\n');
      }

      const embed = Embeds.info(
        "🌅 Morning Basecamp Status & Calendar",
        `**Today's Status (\`${todayDate}\`):** ${isTodayOff ? '🔴 **OFF (0 Attendance Points for Everyone)**' : '🟢 **ON / ACTIVE (Normal +1 / -1 Points)**'}\n\n` +
        `📋 **Registered Morning Off Dates:**\n${listStr}\n\n` +
        `💡 **Commands:**\n` +
        `• Set today OFF: \`!morningoff today [reason]\`\n` +
        `• Set specific date OFF: \`!morningoff YYYY-MM-DD [reason]\`\n` +
        `• Re-enable morning: \`!morningoff on [YYYY-MM-DD]\` or \`!morning on\``
      );

      return message.reply({ embeds: [embed] });
    }

    // 2. Turn ON / Remove: !morningoff on [date] | !morningoff remove [date] | !morningoff enable
    if (args[0]?.toLowerCase() === 'on' || args[0]?.toLowerCase() === 'remove' || args[0]?.toLowerCase() === 'enable' || args[0]?.toLowerCase() === 'resume') {
      const targetDate = args[1] ? (args[1].toLowerCase() === 'today' ? todayDate : args[1]) : todayDate;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (!dateRegex.test(targetDate)) {
        return message.reply({
          embeds: [Embeds.warning("Invalid Date Format", "Please provide a valid date in `YYYY-MM-DD` format.\n*Example:* `!morningoff on 2026-08-30` or `!morning on`")]
        });
      }

      cohortManager.removeMorningOff(guild.id, targetDate);
      await GasClient.setMorningOff(guild.id, { date: targetDate, isOff: false }).catch(() => {});

      const resumeEmbed = Embeds.success(
        "Morning Basecamp Re-enabled 🌅",
        `✅ **Morning Basecamp for \`${targetDate}\` is now back ON / ACTIVE.**\n\n` +
        `• Regular attendance tracking and 12:00 PM auto-scans have resumed.\n` +
        `• *To scan Google Form now, run:* \`!morningattendance ${targetDate}\``
      );

      return message.reply({ embeds: [resumeEmbed] });
    }

    // 3. Set Morning Basecamp OFF: !morningoff [today | YYYY-MM-DD] [reason]
    let targetDate = todayDate;
    let reason = "Morning Basecamp Off for Today";

    if (args.length > 0) {
      if (args[0].toLowerCase() === 'today') {
        targetDate = todayDate;
        if (args.length > 1) {
          reason = args.slice(1).join(' ');
        }
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
        targetDate = args[0];
        if (args.length > 1) {
          reason = args.slice(1).join(' ');
        }
      } else {
        // First argument is reason for today
        targetDate = todayDate;
        reason = args.join(' ');
      }
    }

    const loading = await message.reply(`🌅 **Setting Morning Basecamp to OFF for \`${targetDate}\`...**`);

    try {
      // 1. Save to Cohort Manager
      cohortManager.setMorningOff(guild.id, {
        date: targetDate,
        reason: reason,
        setBy: message.author.tag
      });

      // 2. Sync to Google Sheet Apps Script backend (updates sheet column to OFF / 0 pts)
      const gasRes = await GasClient.setMorningOff(guild.id, {
        date: targetDate,
        isOff: true,
        reason: reason
      }).catch(err => ({ status: 'LOCAL_ONLY', error: err.message }));

      // 3. Broadcast Announcement to Students Channel
      const annChannel = ChannelHelper.findChannel(guild, 'ANNOUNCEMENTS') ||
                         ChannelHelper.findChannel(guild, 'ATTENDANCE') ||
                         ChannelHelper.findChannel(guild, 'DISCUSSION');
      const studentRole = guild.roles.cache.find(r =>
        r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase()
      );
      const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

      const noticeEmbed = Embeds.info(
        `🌅 Morning Basecamp OFF Notice · ${targetDate}`,
        `Hello everyone! **Morning Basecamp is OFF for ${targetDate === todayDate ? 'today' : `\`${targetDate}\``} (${reason}).**\n\n` +
        `• 📋 **Attendance Count:** Morning attendance will **NOT** be counted.\n` +
        `• 🎯 **Attendance Points:** Morning attendance points are set to **0** for all students.\n` +
        `• 🛡️ **No Penalties:** No absent penalty (-1 pt) will be deducted for this morning session.\n` +
        `• 💼 **Daily Tasks & Jobs:** Please continue your daily job applications and evening routines as scheduled!\n\n` +
        `Enjoy your morning and stay productive! 🚀`,
        `JP ADMIN ${constants.BOT_VERSION} · Morning Notice`
      );

      if (annChannel) {
        await annChannel.send({
          content: `${mentionTag} 📢 **MORNING BASECAMP OFF NOTICE**`,
          embeds: [noticeEmbed]
        }).catch(() => {});
      }

      // 4. Send Confirmation Receipt in Admin Channel
      const totalStudents = gasRes?.totalActive || "All enrolled";
      const receiptEmbed = Embeds.success(
        "Morning Basecamp Set to OFF! 🌅",
        `✅ **Date:** \`${targetDate}\` ${targetDate === todayDate ? '*(Today)*' : ''}\n` +
        `• **Reason:** **${reason}**\n` +
        `• **Attendance Points:** **0 Points** recorded for all students (no +1 / no -1).\n` +
        `• **Automated 12:00 PM Scan:** **PAUSED** for \`${targetDate}\`.\n` +
        `• **Active Students Affected:** **${totalStudents}**\n` +
        `• **Google Sheet:** Column \`${targetDate} (Morning)\` updated with \`OFF\` status.\n` +
        `• **Public Announcement:** Broadcasted to ${annChannel ? `<#${annChannel.id}>` : 'channel'}.\n\n` +
        `💡 *To re-enable morning basecamp for this date, run:* \`!morningoff on ${targetDate}\` *or* \`!morning on\``
      );

      return loading.edit({ content: null, embeds: [receiptEmbed] });
    } catch (err) {
      return loading.edit({ content: null, embeds: [Embeds.error("Morning Off Error", err.message)] });
    }
  }
};
