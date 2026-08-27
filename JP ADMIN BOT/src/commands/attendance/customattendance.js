/**
 * Command: !customattendance
 * Aliases: !schedulecustom, !scanfromtab, !customatt, !tabattendance, !queueattendance
 * Scans or schedules custom attendance from any Google Sheet tab
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const DateTimeUtil = require('../../utils/dateTime');
const cohortManager = require('../../config/cohortManager');

module.exports = {
  name: 'customattendance',
  aliases: ['schedulecustom', 'scanfromtab', 'customatt', 'tabattendance', 'customscan', 'queueattendance'],
  description: 'Scans now or schedules an 11:30 PM custom attendance scan from any Google Sheet tab',
  usage: '!customattendance [schedule|scan|list|cancel] "<Tab Name>" [YYYY-MM-DD] [Session Label]',
  mentorOnly: true,

  async execute(message, args, client) {
    const todayStr = DateTimeUtil.getTodayDateStr();

    if (args.length === 0) {
      return message.reply({
        embeds: [Embeds.info(
          "📋 Custom Attendance Command Center",
          "You can scan a custom tab right now OR schedule it to automatically scan and publish at **11:30 PM tonight** once form submissions arrive!\n\n" +
          "**1. Schedule for Tonight (11:30 PM):**\n" +
          "• `!customattendance schedule \"Special Workshop\"`\n" +
          "• `!customattendance schedule \"Townhall\" 2026-08-27 \"Townhall Attendance\"`\n" +
          "• `!schedulecustom \"Form Responses 2\"`\n\n" +
          "**2. Scan Immediately (Now):**\n" +
          "• `!customattendance scan \"Special Workshop\"`\n" +
          "• `!customattendance \"Special Workshop\" --now`\n\n" +
          "**3. Manage Scheduled Queue:**\n" +
          "• `!customattendance list` *(View today's queued scans)*\n" +
          "• `!customattendance cancel \"Special Workshop\"` *(Cancel a scheduled scan)*\n" +
          "• `!customattendance runqueue` *(Force execute all queued scans now)*"
        )]
      });
    }

    const firstToken = args[0].toLowerCase();

    // 1. List Queued Scans
    if (firstToken === 'list' || firstToken === 'queue') {
      const queued = cohortManager.getQueuedCustomAttendances(message.guild.id);
      if (!queued || queued.length === 0) {
        return message.reply({
          embeds: [Embeds.info(
            "Scheduled Custom Attendance Queue",
            "✨ No custom attendance scans are currently queued.\n\n" +
            "💡 Use `!customattendance schedule \"<Tab Name>\"` to queue a scan for 11:30 PM tonight!"
          )]
        });
      }

      const listText = queued.map((item, idx) => {
        return `**${idx + 1}. \`${item.tabName}\`** (ID: \`${item.id}\`)\n` +
               `• 📅 **Target Date:** \`${item.date}\` | ⏰ **Scheduled Time:** \`${item.scheduledTime || '23:30'}\`\n` +
               `• 🏷️ **Session Label:** \`${item.sessionLabel}\`\n` +
               `• 👤 **Requested By:** ${item.requestedBy}`;
      }).join('\n\n');

      return message.reply({
        embeds: [Embeds.info(
          `📅 Queued Custom Attendance Scans (${queued.length})`,
          `The following tabs will be automatically scanned and published at **11:30 PM**:\n\n${listText}\n\n` +
          `💡 *To cancel any scheduled item: \`!customattendance cancel "<Tab Name>"\`*`
        )]
      });
    }

    // 2. Cancel Queued Scan
    if (firstToken === 'cancel' || firstToken === 'remove' || firstToken === 'delete') {
      const target = args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
      if (!target) {
        return message.reply({
          embeds: [Embeds.warning("Missing Argument", "Please provide the Tab Name or ID to cancel.\nExample: `!customattendance cancel \"Special Workshop\"`")]
        });
      }

      const removed = cohortManager.removeQueuedCustomAttendance(message.guild.id, target);
      if (removed) {
        return message.reply({
          embeds: [Embeds.success(
            "Queued Scan Cancelled",
            `✅ Successfully removed **\`${target}\`** from the scheduled attendance queue.`
          )]
        });
      } else {
        return message.reply({
          embeds: [Embeds.warning(
            "Not Found",
            `Could not find a queued scan matching **\`${target}\`** in the schedule.`
          )]
        });
      }
    }

    // 3. Force Run Queued Scans Now
    if (firstToken === 'runqueue' || firstToken === 'flush') {
      const scheduler = require('../../services/scheduler');
      const loadMsg = await message.reply("🔄 **Executing all queued custom attendance scans right now...**");
      await scheduler.runQueuedCustomAttendanceScans();
      return loadMsg.edit({
        content: null,
        embeds: [Embeds.success("Custom Attendance Queue Processed", "All queued scans for today have been executed and published!")]
      });
    }

    // Parse Mode: Schedule vs Instant Scan
    let isScheduleMode = false;
    let rawArgs = [...args];

    if (firstToken === 'schedule' || firstToken === 'queue' || message.content.toLowerCase().startsWith('!schedulecustom') || message.content.toLowerCase().startsWith('!queueattendance')) {
      isScheduleMode = true;
      if (firstToken === 'schedule' || firstToken === 'queue') {
        rawArgs.shift();
      }
    } else if (firstToken === 'scan' || firstToken === 'now') {
      isScheduleMode = false;
      rawArgs.shift();
    }

    // Check if --schedule or --now was passed as flag
    const fullText = rawArgs.join(' ');
    if (fullText.includes('--schedule')) {
      isScheduleMode = true;
    }

    const cleanedText = fullText.replace(/--(schedule|now)/gi, '').trim();

    // Extract Tab Name (with quotes or single token)
    let tabName = "";
    let remaining = "";

    const matchQuote = cleanedText.match(/^"([^"]+)"\s*(.*)$/) || cleanedText.match(/^'([^']+)'\s*(.*)$/);
    if (matchQuote) {
      tabName = matchQuote[1].trim();
      remaining = matchQuote[2].trim();
    } else {
      const parts = cleanedText.split(/ +/);
      tabName = parts[0];
      remaining = parts.slice(1).join(' ').trim();
    }

    if (!tabName) {
      return message.reply({
        embeds: [Embeds.warning("Missing Tab Name", "Please specify the Google Sheet tab name.\nExample: `!customattendance schedule \"Special Workshop\"`")]
      });
    }

    const remArgs = remaining ? remaining.split(/ +/) : [];
    let targetDate = remArgs[0] && /^\d{4}-\d{2}-\d{2}$/.test(remArgs[0]) ? remArgs[0] : todayStr;
    let customLabel = remArgs[0] && !/^\d{4}-\d{2}-\d{2}$/.test(remArgs[0]) ? remArgs.join(' ') : remArgs.slice(1).join(' ') || tabName;

    // Handle Schedule Mode
    if (isScheduleMode) {
      const entry = cohortManager.queueCustomAttendance(message.guild.id, {
        tabName: tabName,
        date: targetDate,
        sessionLabel: customLabel,
        requestedBy: message.author.tag || message.author.username,
        scheduledTime: "23:30"
      });

      const destChannel = ChannelHelper.findChannel(message.guild, 'ATTENDANCE');
      const channelMention = destChannel ? `<#${destChannel.id}>` : `\`#daily-attendance\``;

      return message.reply({
        embeds: [Embeds.success(
          "Custom Attendance Scheduled for 11:30 PM! ⏰",
          `✅ **Tab \`${tabName}\` has been queued for automatic scanning tonight!**\n\n` +
          `• 📑 **Sheet Tab:** \`${tabName}\`\n` +
          `• 📅 **Target Date:** \`${targetDate}\`\n` +
          `• 🏷️ **Session Label:** \`${customLabel}\`\n` +
          `• ⏰ **Scheduled Scan Time:** **11:30 PM (23:30 Asia/Dhaka)**\n` +
          `• 📢 **Publish Channel:** ${channelMention}\n` +
          `• 🆔 **Queue ID:** \`${entry.id}\`\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 **HOW IT WORKS:**\n` +
          `You don't need to do anything else. Even if students are still submitting responses now, at **11:30 PM** the bot will automatically read the tab, record scores (+1 / -1 / 0), and post the full attendance report!`
        )]
      });
    }

    // Immediate Scan Mode
    const loading = await message.reply(`📑 **Scanning custom attendance tab \`${tabName}\` for date \`${targetDate}\`...**`);

    try {
      const res = await GasClient.scanCustomAttendance(message.guild.id, tabName, targetDate, customLabel);

      if (!res || res.status !== 'SUCCESS') {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Custom Attendance Scan Failed", res?.error || `Could not find or scan tab '${tabName}'.`)]
        });
      }

      const reportEmbed = Embeds.attendanceReport(
        `Custom Attendance Synced (${res.session || customLabel || tabName})`,
        targetDate,
        res
      );

      const destChannel = ChannelHelper.findChannel(message.guild, 'ATTENDANCE');

      if (destChannel && destChannel.id !== message.channel.id) {
        await destChannel.send({ embeds: [reportEmbed] }).catch(() => {});

        const receiptEmbed = Embeds.success(
          "Custom Attendance Processed & Published! 📑",
          `✅ Scanned custom tab **${res.formTabScanned || tabName}** for \`${targetDate}\` and recorded scores.\n\n` +
          `• **Session Label:** \`${res.colHeader || targetDate}\`\n` +
          `• **Present (+1 pt):** **${res.present}**\n` +
          `• **Absent (-1 pt):** **${res.absent}**\n` +
          `• **Approved Leave (0 pt):** **${res.leave}**\n` +
          `• **Total Active Students:** **${res.totalActive}**\n\n` +
          `📢 **Full Student Attendance Report has been posted to <#${destChannel.id}>**\n\n` +
          `💡 *Tip: To schedule in advance for 11:30 PM next time: \`!customattendance schedule "${tabName}"\`*`
        );
        await loading.edit({ content: null, embeds: [receiptEmbed] });
      } else {
        await loading.edit({ content: null, embeds: [reportEmbed] });
      }
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Scan Error", err.message)] });
    }
  }
};
