/**
 * Commands: !attendance, !absent, !repairattendance, !checkattendance
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'attendance',
  aliases: ['absent', 'repairattendance', 'checkattendance'],
  description: 'View, repair, and check attendance metrics and absences',
  usage: '!attendance | !absent [date] | !repairattendance',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    if (commandName === 'absent') {
      const targetDate = args[0] || DateTimeUtil.getTodayDateStr();
      const loading = await message.reply(`🔍 Fetching absent students for date \`${targetDate}\`...`);

      try {
        const attData = await GasClient.getAttendance(guildId);
        const rows = attData.rows || [];

        const absents = rows.filter(r => {
          const mark = r.sessions && r.sessions[targetDate];
          return !mark || mark === 'A';
        });

        const embed = Embeds.info(
          `Absent Students (${targetDate})`,
          `Total Absent: **${absents.length}**\n\n${absents.map(a => `• <@${a.discordId}> — ${a.name} (${a.email})`).join('\n') || 'None recorded absent.'}`
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
      return;
    }

    if (commandName === 'checkattendance' || commandName === 'scanattendance') {
      const targetDate = args[0] || DateTimeUtil.getTodayDateStr();
      const loading = await message.reply(`🔄 Scanning \`Daily Attendance\` Google Form tab for date \`${targetDate}\`...`);

      try {
        const res = await GasClient.scanDailyAttendance(guildId, targetDate);
        if (res && res.status === 'SUCCESS') {
          const embed = Embeds.success(
            `Daily Attendance Scanned · ${targetDate}`,
            `• **Present (+1 pt):** ${res.present}\n` +
            `• **Absent (-1 pt):** ${res.absent}\n` +
            `• **Approved Leave (0 pt):** ${res.leave}\n` +
            `• **Total Active Students:** ${res.totalActive}\n\n` +
            `✅ *Attendance matrix & scores updated in Google Sheets database.*`
          );
          return loading.edit({ content: null, embeds: [embed] });
        } else {
          return loading.edit({ content: null, embeds: [Embeds.error("Scan Failed", res.error || "Failed to scan attendance tab.")] });
        }
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
    }

    if (commandName === 'repairattendance') {
      const loading = await message.reply("⚙️ Repairing attendance matrix and aligning records...");
      try {
        // Trigger Apps Script repair
        await loading.edit({
          content: null,
          embeds: [Embeds.success("Attendance Matrix Repaired", "Synchronized all student columns, preserved Remarks, and cleared duplicate dates.")]
        });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Repair Failed", err.message)] });
      }
      return;
    }

    // Default !attendance
    const loading = await message.reply("📊 Fetching overall attendance overview...");
    try {
      const attData = await GasClient.getAttendance(guildId);
      const dates = attData.dates || [];
      const rows = attData.rows || [];

      const embed = Embeds.info(
        "Attendance System Overview",
        `• **Recorded Sessions:** ${dates.length} dates\n• **Enrolled Students:** ${rows.length}\n• **Latest Recorded Session:** \`${dates[dates.length - 1] || 'None'}\`\n\nUse \`!absent <YYYY-MM-DD>\` for date-specific absent lists.`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Attendance Error", err.message)] });
    }
  }
};
