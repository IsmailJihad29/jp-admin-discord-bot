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
      const [rosterRes, sheetRes] = await Promise.all([
        GasClient.getRoster(guildId).catch(() => ({ students: [] })),
        GasClient.request(guildId, 'getJobSheets').catch(() => ({ sheets: [] }))
      ]);

      const activeStudents = (rosterRes.students || []).filter(s => s.status === 'active');
      const studentSheetsMap = new Map((sheetRes.sheets || []).map(s => [s.discordId, s.sheetUrl]));

      const todayDate = args[0] || DateTimeUtil.getTodayDateStr();
      const results = [];
      let totalTodayApps = 0;
      let linkedSheetsCount = 0;

      for (const student of activeStudents) {
        const sheetUrl = studentSheetsMap.get(student.discordId);
        let countToday = 0;
        let totalRows = 0;
        let isScraped = false;

        if (sheetUrl) {
          linkedSheetsCount++;
          const scrape = await JobScraperService.scrapeStudentJobSheet(sheetUrl, student.discordId);
          if (scrape.success) {
            countToday = scrape.datedTodayCount || 0;
            totalRows = scrape.totalRows || 0;
            isScraped = true;
            totalTodayApps += countToday;
          }
          await new Promise(r => setTimeout(r, 500));
        }

        const result = {
          discordId: student.discordId,
          name: student.name || student.username,
          hasSheet: !!sheetUrl,
          isScraped: isScraped,
          countToday: countToday,
          totalRows: totalRows
        };

        // Record daily job metric to Apps Script
        if (sheetUrl) {
          await GasClient.recordJobDaily(guildId, {
            date: todayDate,
            email: student.email,
            count: countToday,
            name: result.name,
            discordId: student.discordId,
            totalRows: totalRows,
            newRows: countToday
          }).catch(() => {});
        }

        results.push(result);
      }

      const summaryList = results.slice(0, 15).map(r => {
        if (!r.hasSheet) {
          return `• <@${r.discordId}> (${r.name}): ⚠️ *No Job Sheet Linked*`;
        }
        return `• <@${r.discordId}> (${r.name}): **${r.countToday}** today | **${r.totalRows}** total`;
      }).join('\n');

      const embed = Embeds.success(
        `Job Tracking Sheet Audit · ${todayDate}`,
        `• 👥 **Active Students Checked:** **${activeStudents.length}**\n` +
        `• 📊 **Linked Trackers:** **${linkedSheetsCount}/${activeStudents.length}**\n` +
        `• 💼 **Total Applications Found Today:** **${totalTodayApps}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${summaryList}\n\n` +
        (results.length > 15 ? `*...and ${results.length - 15} more active students.*` : '')
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Audit Failed", err.message)] });
    }
  }
};
