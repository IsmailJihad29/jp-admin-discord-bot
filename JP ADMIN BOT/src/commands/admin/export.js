/**
 * Command: !export, !downloadcsv, !csvexport
 * Directly exports cohort data as CSV file attachments in Discord
 */

const { AttachmentBuilder } = require('discord.js');
const CohortDataService = require('../../services/cohortDataService');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'export',
  aliases: ['downloadcsv', 'csvexport', 'exportdata', 'exportcsv'],
  description: 'Exports cohort attendance, missing trackers, or full performance metrics as a CSV file',
  usage: '!export [summary | nosheet | absent]',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const type = args[0] ? args[0].toLowerCase() : 'summary';
    const todayStr = DateTimeUtil.getTodayDateStr();

    const loading = await message.reply("📄 **Generating your CSV export...**");

    try {
      if (type === 'nosheet' || type === 'notracker') {
        const unlinked = await CohortDataService.getStudentsWithoutTracker(guild.id);
        const csvContent = CohortDataService.generateCSV('nosheet', unlinked);
        const buffer = Buffer.from(csvContent, 'utf-8');
        const file = new AttachmentBuilder(buffer, { name: `missing_trackers_${todayStr}.csv` });

        return loading.edit({
          content: `✅ **Missing Tracker Google Sheets Report** (${unlinked.length} students):`,
          files: [file]
        });
      }

      if (type === 'absent' || type === 'absentees') {
        const { targetDates, affectedStudents } = await CohortDataService.getAbsentsInLastNDays(guild.id, 5);
        const csvContent = CohortDataService.generateCSV('absent', affectedStudents);
        const buffer = Buffer.from(csvContent, 'utf-8');
        const file = new AttachmentBuilder(buffer, { name: `absentees_report_${todayStr}.csv` });

        return loading.edit({
          content: `✅ **Absentees Matrix Report** (${affectedStudents.length} students):`,
          files: [file]
        });
      }

      // Default: Full Cohort Summary Export
      const fullData = await CohortDataService.getFullCohortData(guild.id);
      const csvContent = CohortDataService.generateCSV('summary', fullData.students);
      const buffer = Buffer.from(csvContent, 'utf-8');
      const file = new AttachmentBuilder(buffer, { name: `cohort_full_summary_${todayStr}.csv` });

      return loading.edit({
        content: `✅ **Master Cohort Performance Summary Export** (${fullData.totalActiveStudents} students):`,
        files: [file]
      });
    } catch (err) {
      return loading.edit({
        content: null,
        embeds: [Embeds.error("Export Error", err.message)]
      });
    }
  }
};
