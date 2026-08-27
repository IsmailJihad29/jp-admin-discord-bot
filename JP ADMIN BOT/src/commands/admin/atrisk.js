/**
 * Command: !atrisk
 * Aliases: !dropouts, !riskreport
 * On-demand At-Risk Candidate Early Warning System & Drop-out Predictor Audit
 */

const DropoutPredictorService = require('../../services/dropoutPredictorService');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'atrisk',
  aliases: ['dropouts', 'riskreport', 'dropoutpredictor'],
  description: 'Runs multi-signal 7-day trend analysis to identify students at risk of dropping out',
  usage: '!atrisk [dispatch]',
  mentorOnly: true,

  async execute(message, args, client) {
    const isDispatch = args[0]?.toLowerCase() === 'dispatch';
    const loading = await message.reply("🔍 Running multi-signal 7-day trend analysis (Attendance, Job Velocity, Tasks & Score)...");

    try {
      if (isDispatch) {
        // Runs full audit and sends 1-on-1 DMs
        await DropoutPredictorService.runWeeklyRiskAuditAndSchedule(message.guild);
        return loading.edit({
          content: null,
          embeds: [Embeds.success("Risk Audit & 1-on-1 Dispatch Complete", "Audit completed, high-risk candidates were sent 1-on-1 scheduling DMs, and mentor summary was posted.")]
        });
      }

      // Analyze and display report directly in this channel
      const atRiskStudents = await DropoutPredictorService.analyzeRiskSignals(message.guild.id);
      const highRisk = atRiskStudents.filter(s => s.riskLevel === 'HIGH_RISK');
      const moderateRisk = atRiskStudents.filter(s => s.riskLevel === 'MODERATE_RISK');

      if (atRiskStudents.length === 0) {
        const embed = Embeds.success(
          "Drop-out Predictor: ALL COHORT HEALTHY 🎉",
          "Multi-signal 7-day trend analysis complete. Zero students are currently flagged for drop-out risk. Momentum is strong!"
        );
        return loading.edit({ content: null, embeds: [embed] });
      }

      const highRiskText = highRisk.length > 0
        ? highRisk.map(s => `🔴 <@${s.discordId}> (**${s.name}**) · Score: \`${s.totalPoints} pts\`\n   ${s.signals.join(' · ')}`).join('\n\n')
        : '✅ No high-risk candidates.';

      const modRiskText = moderateRisk.length > 0
        ? moderateRisk.map(s => `🟡 <@${s.discordId}> (**${s.name}**) · Score: \`${s.totalPoints} pts\`\n   ${s.signals.join(' · ')}`).join('\n\n')
        : '✅ None.';

      const embed = Embeds.warning(
        `Early Warning: Drop-out Predictor (${atRiskStudents.length} At-Risk)`,
        `**Analysis Window:** Last 7 Days (Attendance + Job Pace + Tasks)\n\n` +
        `**🔴 High-Risk Candidates (Immediate 1-on-1 Needed):**\n${highRiskText}\n\n` +
        `**🟡 Moderate-Risk Candidates (Monitor Closely):**\n${modRiskText}\n\n` +
        `💡 *Run \`!atrisk dispatch\` to automatically send 1-on-1 booking DMs to high-risk students.*`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Risk Analysis Error", err.message)] });
    }
  }
};
