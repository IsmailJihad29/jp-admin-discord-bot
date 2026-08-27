/**
 * Commands: !warnings, !inactivestudents, !warningreport
 * Manages 3-day weekly absence warnings & inactive student reports for Mentors
 */

const GasClient = require('../../services/gasClient');
const ScoringService = require('../../services/scoringService');
const Scheduler = require('../../services/scheduler');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'warnings',
  aliases: ['inactivestudents', 'inactive', 'warningreport'],
  description: 'View students with 3+ absences this week or trigger weekly inactive student report for mentors',
  usage: '!warnings | !inactivestudents | !warnings @student',
  supervisorOnly: true,

  async execute(message, args, client) {
    const target = message.mentions.members.first();
    const guildId = message.guild.id;

    // Check specific student status
    if (target) {
      const loading = await message.reply(`🔍 Fetching attendance records for <@${target.id}>...`);
      try {
        const attRes = await GasClient.getAttendance(guildId);
        const rows = attRes.rows || [];
        const dates = (attRes.dates || []).slice(-5); // last 5 sessions (this week)

        const student = rows.find(r => r.discordId === target.id);
        if (!student) {
          return loading.edit({ content: `❌ Student <@${target.id}> not found in Attendance sheet.` });
        }

        let absences = 0;
        let present = 0;
        let leaves = 0;

        dates.forEach(d => {
          const mark = student.sessions ? student.sessions[d] : 'A';
          if (mark === 'P') present++;
          else if (mark === 'L') leaves++;
          else absences++;
        });

        const scores = await ScoringService.calculateRTBR(guildId);
        const studentScore = scores.find(s => s.discordId === target.id) || { totalPoints: 0, details: '' };

        const isAtRisk = absences >= 3;
        const embed = isAtRisk
          ? Embeds.warning(
              `Student Status: At-Risk (3+ Absences)`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Absences this week:** **${absences}/5 days**\n` +
              `• **Present:** ${present} | **Approved Leaves:** ${leaves}\n` +
              `• **Total Score:** **${studentScore.totalPoints} pts**\n` +
              `• **Activities:**\n  ${studentScore.details || 'No recent activity'}\n\n` +
              `⚠️ *Student is eligible for inactivity warning.*`
            )
          : Embeds.success(
              `Student Status: Active & Healthy`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Absences this week:** ${absences}/5 days\n` +
              `• **Present:** ${present} | **Approved Leaves:** ${leaves}\n` +
              `• **Total Score:** **${studentScore.totalPoints} pts**\n` +
              `• **Activities:**\n  ${studentScore.details || 'No recent activity'}`
            );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error checking student: ${err.message}` });
      }
    }

    // Default / !inactivestudents: Run the full inactive students report in this channel
    await Scheduler.runWeeklyInactiveStudentsReport(message.channel);
  }
};
