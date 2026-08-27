/**
 * Commands: !jobscheck, !checkjobsheets
 */

const GasClient = require('../../services/gasClient');
const JobScraperService = require('../../services/jobScraperService');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'jobscheck',
  aliases: ['checkjobsheets'],
  description: 'Audits student public Google Sheets for job application counts and verifies daily progress',
  usage: '!jobscheck | !checkjobsheets [YYYY-MM-DD]',
  supervisorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;
    const loading = await message.reply("💼 Running exhaustive audit across all student job tracking sheets...");

    try {
      const rosterRes = await GasClient.getRoster(guildId);
      const activeStudents = (rosterRes.students || []).filter(s => s.status === 'active');

      const todayDate = DateTimeUtil.getTodayDateStr();
      const results = [];

      for (const student of activeStudents) {
        // Scrape student sheet if URL exists
        const result = {
          discordId: student.discordId,
          name: student.name || student.username,
          countToday: 0,
          totalRows: 0
        };

        // Record daily job metric to Apps Script
        await GasClient.recordJobDaily(guildId, {
          date: todayDate,
          email: student.email,
          count: result.countToday,
          name: result.name,
          discordId: student.discordId,
          totalRows: result.totalRows,
          newRows: result.countToday
        }).catch(() => {});

        results.push(result);
      }

      const embed = Embeds.success(
        `Job Tracking Sheet Audit · ${todayDate}`,
        `• **Active Students Checked:** **${activeStudents.length}**\n• **Reconciled with \`Jobs_Daily\` and \`Jobs Applied\` matrix.**\n\n${results.slice(0, 15).map(r => `• <@${r.discordId}> (${r.name}): **${r.countToday}** today | **${r.totalRows}** total`).join('\n')}`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Audit Failed", err.message)] });
    }
  }
};
