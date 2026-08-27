/**
 * Command: !morningattendance
 * Aliases: !scanmorning, !morning
 * Scans Google Form 'Morning Attendance' tab and awards +1 Present, -1 Absent, 0 Leave
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'morningattendance',
  aliases: ['scanmorning', 'morning'],
  description: 'Scans Google Form responses from the Morning Attendance tab and awards +1/-1/0 points',
  usage: '!morningattendance [YYYY-MM-DD]',
  mentorOnly: true,

  async execute(message, args, client) {
    const targetDate = args[0] || DateTimeUtil.getTodayDateStr();
    const loading = await message.reply(`🌅 **Scanning 'Morning Attendance' Google Form tab for \`${targetDate}\`...**`);

    try {
      const res = await GasClient.scanMorningAttendance(message.guild.id, targetDate);

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
