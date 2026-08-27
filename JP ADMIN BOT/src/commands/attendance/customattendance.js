/**
 * Command: !customattendance
 * Aliases: !scanfromtab, !customatt, !tabattendance
 * Scans attendance from any specified custom Google Sheet tab for a specific date or session
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'customattendance',
  aliases: ['scanfromtab', 'customatt', 'tabattendance', 'customscan'],
  description: 'Scans attendance responses from a custom Google Sheet tab name for a specific date or session',
  usage: '!customattendance "<Custom Tab Name>" [YYYY-MM-DD] [Session Label]',
  mentorOnly: true,

  async execute(message, args, client) {
    if (args.length === 0) {
      return message.reply({
        embeds: [Embeds.warning(
          "Custom Attendance Usage",
          "Please provide the custom Google Sheet tab name you want to scan.\n\n" +
          "📋 **Usage Examples:**\n" +
          "• `!customattendance \"Special Workshop\"`\n" +
          "• `!customattendance \"Townhall Attendance\" 2026-08-27`\n" +
          "• `!customattendance \"Form Responses 3\" 2026-08-27 \"Assessment\"`\n\n" +
          "💡 *Tip: Put quotes around tab names containing spaces.*"
        )]
      });
    }

    // Parse quoted arguments or first token
    const fullText = args.join(' ');
    let tabName = "";
    let remaining = "";

    const matchQuote = fullText.match(/^"([^"]+)"\s*(.*)$/) || fullText.match(/^'([^']+)'\s*(.*)$/);
    if (matchQuote) {
      tabName = matchQuote[1].trim();
      remaining = matchQuote[2].trim();
    } else {
      tabName = args[0];
      remaining = args.slice(1).join(' ').trim();
    }

    const remArgs = remaining ? remaining.split(/ +/) : [];
    let targetDate = remArgs[0] && /^\d{4}-\d{2}-\d{2}$/.test(remArgs[0]) ? remArgs[0] : DateTimeUtil.getTodayDateStr();
    let customLabel = remArgs[0] && !/^\d{4}-\d{2}-\d{2}$/.test(remArgs[0]) ? remArgs.join(' ') : remArgs.slice(1).join(' ') || tabName;

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
        `Custom Attendance Synced (${res.session || tabName})`,
        targetDate,
        res
      );

      const destChannel = ChannelHelper.findChannel(message.guild, 'ATTENDANCE');

      if (destChannel && destChannel.id !== message.channel.id) {
        // Send full report to #daily-attendance
        await destChannel.send({ embeds: [reportEmbed] }).catch(() => {});

        // Send confirmation receipt in the admin command channel (#jp-admin)
        const receiptEmbed = Embeds.success(
          "Custom Attendance Processed & Published! 📑",
          `✅ Scanned custom tab **${res.formTabScanned || tabName}** for \`${targetDate}\` and recorded scores.\n\n` +
          `• **Session Label:** \`${res.colHeader || targetDate}\`\n` +
          `• **Present (+1 pt):** **${res.present}**\n` +
          `• **Absent (-1 pt):** **${res.absent}**\n` +
          `• **Approved Leave (0 pt):** **${res.leave}**\n` +
          `• **Total Active Students:** **${res.totalActive}**\n\n` +
          `📢 **Full Student Attendance Report has been posted to <#${destChannel.id}>**`
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
