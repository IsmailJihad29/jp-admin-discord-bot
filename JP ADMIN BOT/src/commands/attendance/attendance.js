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
  mentorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    if (commandName === 'absent') {
      const targetDate = args[0] || DateTimeUtil.getTodayDateStr();
      const normTarget = DateTimeUtil.normalizeDateStr(targetDate);
      const loading = await message.reply(`🔍 Fetching absent students for date \`${targetDate}\`...`);

      try {
        const attData = await GasClient.getAttendance(guildId);
        const dates = attData.dates || [];
        const rows = attData.rows || [];

        // Find session column headers that match targetDate
        const matchingSessions = dates.filter(d => {
          const nd = DateTimeUtil.normalizeDateStr(d);
          return (nd && nd === normTarget) || d.toLowerCase().includes(targetDate.toLowerCase());
        });

        // If no matching session found, return a helpful notice with recent recorded dates
        if (matchingSessions.length === 0) {
          const recentDates = dates.slice(-5).map(d => `• \`${d}\``).join('\n') || 'None recorded yet.';
          return loading.edit({
            content: null,
            embeds: [Embeds.warning(
              "No Attendance Session Found",
              `No attendance records found for date \`${targetDate}\`.\n\n` +
              `📅 **Latest Recorded Sessions:**\n${recentDates}\n\n` +
              `💡 *Use \`!absent <YYYY-MM-DD>\` matching one of the recorded session dates above.*`
            )]
          });
        }

        const allEmbeds = [];

        for (const sessionKey of matchingSessions) {
          const absents = [];
          const presents = [];
          const leaves = [];

          rows.forEach(r => {
            const mark = r.sessions && r.sessions[sessionKey];
            const clean = String(mark || '').toUpperCase().trim();
            if (clean === 'A' || clean === 'ABSENT' || clean.startsWith('A')) {
              absents.push(r);
            } else if (clean === 'P' || clean === 'PRESENT' || clean.startsWith('P')) {
              presents.push(r);
            } else if (clean === 'L' || clean === 'LEAVE' || clean === 'EXCUSED') {
              leaves.push(r);
            }
          });

          // Paginate absents in chunks of 25 to respect Discord 4096 character limits
          const BATCH_SIZE = 25;
          const totalBatches = Math.ceil(absents.length / BATCH_SIZE) || 1;

          for (let b = 0; b < totalBatches; b++) {
            const batchStudents = absents.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            const listText = batchStudents.map((a, idx) => {
              const num = b * BATCH_SIZE + idx + 1;
              const emailPart = a.email ? ` | \`${a.email}\`` : '';
              return `${num}. <@${a.discordId}> — **${a.name || 'Student'}**${emailPart}`;
            }).join('\n');

            const title = totalBatches > 1
              ? `Absent Students · ${sessionKey} (${b + 1}/${totalBatches})`
              : `Absent Students · ${sessionKey}`;

            const headerDesc = b === 0
              ? `📊 **Session Summary:**\n• **Enrolled:** ${rows.length} | **Present:** ${presents.length} | **Absent:** ${absents.length} | **Leave:** ${leaves.length}\n\n**Absent List:**\n`
              : `**Absent List (Continued):**\n`;

            allEmbeds.push(Embeds.info(
              title,
              headerDesc + (listText || 'None recorded absent.')
            ));
          }
        }

        // Send up to 10 embeds in the edited message, and any remaining in follow-up messages
        const initialBatch = allEmbeds.slice(0, 10);
        await loading.edit({ content: null, embeds: initialBatch });

        for (let i = 10; i < allEmbeds.length; i += 10) {
          const followUpBatch = allEmbeds.slice(i, i + 10);
          await message.channel.send({ embeds: followUpBatch });
        }
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
      return;
    }

    if (commandName === 'checkattendance' || commandName === 'scanattendance') {
      if (args[0]?.toLowerCase() === 'all' || args[0]?.toLowerCase() === 'sync' || args[0]?.toLowerCase() === 'backfill') {
        const syncCmd = require('./syncattendance');
        return syncCmd.execute(message, ['daily', ...args.slice(1)], client);
      }

      const targetDate = args[0] || DateTimeUtil.getTodayDateStr();
      const loading = await message.reply(`🔄 Scanning \`Daily Attendance\` Google Form tab for date \`${targetDate}\`...`);

      try {
        const res = await GasClient.scanDailyAttendance(guildId, targetDate);
        if (res && res.status === 'SUCCESS') {
          const embed = Embeds.attendanceReport("Daily Attendance Scanned", targetDate, res);
          const ChannelHelper = require('../../utils/channelHelper');
          const destChannel = ChannelHelper.findChannel(message.guild, 'ATTENDANCE');

          if (destChannel && destChannel.id !== message.channel.id) {
            await destChannel.send({ embeds: [embed] }).catch(() => {});
            const receiptEmbed = Embeds.success(
              "Daily Attendance Processed & Published! 📅",
              `✅ Scanned **${res.formTabScanned || 'Daily Attendance'}** tab for \`${targetDate}\` and recorded scores.\n\n` +
              `• **Present (+1 pt):** **${res.present}**\n` +
              `• **Absent (-1 pt):** **${res.absent}**\n` +
              `• **Approved Leave (0 pt):** **${res.leave}**\n` +
              `• **Total Active Students:** **${res.totalActive}**\n\n` +
              `📢 **Full Student Attendance Report has been posted to <#${destChannel.id}>**`
            );
            return loading.edit({ content: null, embeds: [receiptEmbed] });
          } else {
            return loading.edit({ content: null, embeds: [embed] });
          }
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
        const res = await GasClient.repairAttendance(guildId);
        if (res && res.status === 'SUCCESS') {
          await loading.edit({
            content: null,
            embeds: [Embeds.success("Attendance Matrix Repaired", `✅ Synchronized **${res.syncedStudents || 0}** active students into \`Attendance\` tab.\n✅ Aligned **${res.totalSessions || 0}** recorded session dates with preserved Remarks.`)]
          });
        } else {
          await loading.edit({ content: null, embeds: [Embeds.error("Repair Failed", res?.error || "Failed to repair attendance matrix.")] });
        }
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
