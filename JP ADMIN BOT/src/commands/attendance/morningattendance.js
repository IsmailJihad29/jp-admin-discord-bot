/**
 * Command: !morningattendance
 * Aliases: !scanmorning, !morning
 * Scans Google Form 'Morning Attendance' tab and awards +1 Present, -1 Absent, 0 Leave
 */

const GasClient = require('../../services/gasClient');
const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'morningattendance',
  aliases: ['scanmorning', 'morning'],
  description: 'Scans Google Form responses from the Morning Attendance tab, or sets Morning Basecamp ON/OFF',
  usage: '!morningattendance [YYYY-MM-DD] | !morning off [today | date] [reason] | !morning on | !morning status',
  mentorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;
    const todayDate = DateTimeUtil.getTodayDateStr();

    // 1. Delegate subcommands: off, on, status, list to morningoff command
    const firstArg = args[0]?.toLowerCase();
    if (firstArg === 'off' || firstArg === 'on' || firstArg === 'status' || firstArg === 'list' || firstArg === 'remove' || firstArg === 'resume') {
      const morningOffCmd = require('./morningoff');
      return morningOffCmd.execute(message, args, client);
    }

    // 2. Delegate sync / all / backfill to syncattendance command
    if (firstArg === 'all' || firstArg === 'sync' || firstArg === 'backfill') {
      const syncCmd = require('./syncattendance');
      return syncCmd.execute(message, ['morning', ...args.slice(1)], client);
    }

    let targetDate = todayDate;
    let isForce = false;

    if (args[0]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
        targetDate = args[0];
        if (args[1]?.toLowerCase() === 'force') isForce = true;
      } else if (args[0].toLowerCase() === 'today') {
        targetDate = todayDate;
        if (args[1]?.toLowerCase() === 'force') isForce = true;
      }
    }

    // Check if Morning Basecamp is marked OFF for target date
    if (!isForce && cohortManager.isMorningOff(guildId, targetDate)) {
      return message.reply({
        embeds: [Embeds.warning(
          "Morning Basecamp is OFF 🌅",
          `⚠️ **Morning Basecamp is currently marked OFF for \`${targetDate}\`.**\n\n` +
          `• Morning attendance points are set to **0** for all students and automatic scans are paused.\n\n` +
          `💡 **Options:**\n` +
          `• To re-enable morning basecamp and scan form: \`!morning on ${targetDate}\`\n` +
          `• To force scan without re-enabling: \`!morningattendance ${targetDate} force\``
        )]
      });
    }

    const loading = await message.reply(`🌅 **Scanning 'Morning Attendance' Google Form tab for \`${targetDate}\`...**`);

    try {
      const res = await GasClient.scanMorningAttendance(guildId, targetDate);

      if (!res || res.status !== 'SUCCESS') {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Morning Attendance Scan Failed", res?.error || "Could not read 'Morning Attendance' tab.")]
        });
      }

      const embed = Embeds.attendanceReport("Morning Attendance Synced", targetDate, res);
      const destChannel = ChannelHelper.findChannel(message.guild, 'ATTENDANCE');

      if (destChannel && destChannel.id !== message.channel.id) {
        // Send full student report to #daily-attendance
        await destChannel.send({ embeds: [embed] }).catch(() => {});

        // Send confirmation receipt in the admin command channel (#jp-admin)
        const receiptEmbed = Embeds.success(
          "Morning Attendance Processed & Published! 🌅",
          `✅ Scanned **${res.formTabScanned || 'Morning Attendance'}** tab for \`${targetDate}\` and updated scores.\n\n` +
          `• **Present (+1 pt):** **${res.present}**\n` +
          `• **Absent (-1 pt):** **${res.absent}**\n` +
          `• **Approved Leave (0 pt):** **${res.leave}**\n` +
          `• **Total Active Students:** **${res.totalActive}**\n\n` +
          `📢 **Full Student Attendance Report has been posted to <#${destChannel.id}>**`
        );
        await loading.edit({ content: null, embeds: [receiptEmbed] });
      } else {
        await loading.edit({ content: null, embeds: [embed] });
      }
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Scan Error", err.message)] });
    }
  }
};
