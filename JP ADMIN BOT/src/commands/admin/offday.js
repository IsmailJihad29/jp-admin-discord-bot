/**
 * Commands: !offday, !offdays, !holiday, !holidays, !break, !removeoffday, !clearoffday
 * Manages official cohort Offdays, Holidays, and Vacation pauses
 */

const GasClient = require('../../services/gasClient');
const cohortManager = require('../../config/cohortManager');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');
const constants = require('../../config/constants');

module.exports = {
  name: 'offday',
  aliases: ['offdays', 'holiday', 'holidays', 'break', 'removeoffday', 'clearoffday', 'deleteholiday'],
  description: 'Sets official offdays, holidays, or vacation date ranges to pause attendance and daily job audits',
  usage: '!offday [today | YYYY-MM-DD | YYYY-MM-DD to YYYY-MM-DD] [Holiday Title] | !offdays | !removeoffday <YYYY-MM-DD>',
  mentorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    // --- 1. List Offdays: !offdays / !holidays ---
    if (commandName === 'offdays' || commandName === 'holidays' || (commandName === 'offday' && args[0] === 'list')) {
      const loading = await message.reply("📅 Fetching scheduled offdays and holiday calendar...");
      try {
        const gasRes = await GasClient.getHolidays(guild.id).catch(() => ({ holidays: [] }));
        const localHolidays = cohortManager.getHolidays(guild.id);
        const combined = (gasRes.holidays && gasRes.holidays.length > 0) ? gasRes.holidays : localHolidays;

        if (combined.length === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.info("Offday Calendar", "No upcoming offdays or holidays are currently scheduled.\n\n*To add an offday, run: `!offday today` or `!offday YYYY-MM-DD to YYYY-MM-DD <Title>`*")]
          });
        }

        const listStr = combined.map((h, i) => {
          const range = h.startDate === h.endDate ? `\`${h.startDate}\`` : `\`${h.startDate}\` to \`${h.endDate}\``;
          return `• **${i + 1}. ${h.title || 'Offday'}** ➔ ${range} *(Logged by ${h.loggedBy || 'Mentor'})*`;
        }).join('\n');

        const embed = Embeds.info(
          "🌴 Cohort Offday & Holiday Calendar",
          `Here are the currently registered offday periods where attendance & job audits are paused:\n\n${listStr}\n\n` +
          `💡 *To remove an offday: \`!removeoffday <YYYY-MM-DD>\`*`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
    }

    // --- 2. Remove Offday: !removeoffday <YYYY-MM-DD> ---
    if (commandName === 'removeoffday' || commandName === 'clearoffday' || commandName === 'deleteholiday' || (commandName === 'offday' && args[0] === 'remove')) {
      const targetDate = args[0] === 'remove' ? args[1] : args[0];
      if (!targetDate) {
        return message.reply("⚠️ **Usage:** `!removeoffday <YYYY-MM-DD>`\n*Example:* `!removeoffday 2026-08-28`");
      }

      cohortManager.removeHoliday(guild.id, targetDate);
      await GasClient.removeHoliday(guild.id, targetDate).catch(() => {});

      return message.reply({
        embeds: [Embeds.success("Offday Removed", `✅ Removed offday/holiday matching \`${targetDate}\`. Regular attendance and automated audits have resumed.`)]
      });
    }

    // --- 3. Set Offday: !offday [today | YYYY-MM-DD | YYYY-MM-DD to YYYY-MM-DD] [Title] ---
    if (args.length === 0 || args[0].toLowerCase() === 'today') {
      // Set TODAY as offday
      const todayDate = DateTimeUtil.getTodayDateStr();
      const title = args.slice(1).join(' ') || "Official Cohort Offday";

      cohortManager.addHoliday(guild.id, { startDate: todayDate, endDate: todayDate, title: title });
      await GasClient.setHoliday(guild.id, { startDate: todayDate, endDate: todayDate, title: title, loggedBy: message.author.tag }).catch(() => {});

      // Announce in Announcement / Discussion channel
      const annChannel = ChannelHelper.findChannel(guild, 'ANNOUNCEMENTS') || ChannelHelper.findChannel(guild, 'DISCUSSION');
      const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
      const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

      const offdayEmbed = Embeds.info(
        `🌴 Official Offday Announcement: ${title}`,
        `Hello everyone! **Today (\`${todayDate}\`) has been declared an official Offday.**\n\n` +
        `• 📅 **Attendance:** Daily attendance submission is paused for today.\n` +
        `• 💼 **Job Tracker:** Daily job audits and absence penalties will NOT run today.\n` +
        `• 🌟 **Streaks:** Your consecutive application streaks are preserved!\n\n` +
        `Enjoy your break and take time to recharge! 🚀`,
        `JP ADMIN ${constants.BOT_VERSION} · Offday Notice`
      );

      if (annChannel) {
        await annChannel.send({ content: `${mentionTag} 📢 **OFFICIAL OFFDAY NOTICE**`, embeds: [offdayEmbed] }).catch(() => {});
      }

      return message.reply({
        embeds: [Embeds.success(
          "Offday Registered & Broadcasted! 🌴",
          `✅ **Date:** \`${todayDate}\` (Today)\n` +
          `• **Title:** **${title}**\n` +
          `• **Status:** Automated audits and attendance paused for today.\n` +
          `• **Broadcast:** Notice posted to ${annChannel ? `<#${annChannel.id}>` : 'server'}.`
        )]
      });
    }

    // Parse Date Range: e.g. "2026-08-28 to 2026-08-30 Eid Vacation" or "2026-08-28 2026-08-30 Title"
    let startDate = "";
    let endDate = "";
    let title = "";

    const argStr = args.join(' ');
    const rangeMatch = argStr.match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})\s*(.*)$/i);
    const singleMatch = argStr.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);

    if (rangeMatch) {
      startDate = rangeMatch[1];
      endDate = rangeMatch[2];
      title = rangeMatch[3].trim() || "Cohort Break / Vacation";
    } else if (singleMatch) {
      startDate = singleMatch[1];
      endDate = singleMatch[1];
      title = singleMatch[2].trim() || "Official Offday";
    } else {
      return message.reply({
        embeds: [Embeds.warning(
          "Invalid Offday Date Format",
          "Please specify a valid date or date range in `YYYY-MM-DD` format.\n\n" +
          "📋 **Examples:**\n" +
          "• `!offday today`\n" +
          "• `!offday 2026-08-28 Government Holiday`\n" +
          "• `!offday 2026-08-28 to 2026-08-30 Eid Vacation`\n" +
          "• `!offdays` *(to view all offdays)*\n" +
          "• `!removeoffday 2026-08-28`"
        )]
      });
    }

    cohortManager.addHoliday(guild.id, { startDate, endDate, title });
    await GasClient.setHoliday(guild.id, { startDate, endDate, title, loggedBy: message.author.tag }).catch(() => {});

    const dateRangeStr = startDate === endDate ? `\`${startDate}\`` : `\`${startDate}\` to \`${endDate}\``;

    // Announce to students
    const annChannel = ChannelHelper.findChannel(guild, 'ANNOUNCEMENTS') || ChannelHelper.findChannel(guild, 'DISCUSSION');
    const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
    const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

    const offdayEmbed = Embeds.info(
      `🌴 Official Holiday / Break Notice: ${title}`,
      `Hello everyone! The mentorship period from **${dateRangeStr}** has been declared an official **${title}**.\n\n` +
      `• 📅 **Attendance:** Daily attendance submissions are paused during this period.\n` +
      `• 💼 **Job Tracking:** Automated job audit penalties will NOT run during these dates.\n` +
      `• 🌟 **Streaks:** All current streaks and scores will be frozen safely.\n\n` +
      `Enjoy your time off! Regular mentorship and tracking will resume right after! ✨`,
      `JP ADMIN ${constants.BOT_VERSION} · Holiday Notice`
    );

    if (annChannel) {
      await annChannel.send({ content: `${mentionTag} 📢 **OFFICIAL OFFDAY NOTICE**`, embeds: [offdayEmbed] }).catch(() => {});
    }

    return message.reply({
      embeds: [Embeds.success(
        "Offday / Holiday Scheduled! 🌴",
        `✅ **Period:** ${dateRangeStr}\n` +
        `• **Title:** **${title}**\n` +
        `• **Automations:** Paused during this date range.\n` +
        `• **Broadcast:** Notice published to ${annChannel ? `<#${annChannel.id}>` : 'server'}.`
      )]
    });
  }
};
