/**
 * Command: !morningattendance
 * Aliases: !scanmorning, !morning
 * Scans Google Form 'Morning Attendance' tab and awards +1 Present, -1 Absent, 0 Leave
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'morningattendance',
  aliases: ['scanmorning', 'morning'],
  description: 'Scans Google Form responses from the Morning Attendance tab and awards +1/-1/0 points',
  usage: '!morningattendance [YYYY-MM-DD]',
  supervisorOnly: true,

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
      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Scan Error", err.message)] });
    }
  }
};
