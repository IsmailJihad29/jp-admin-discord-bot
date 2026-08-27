/**
 * Command: !referralaccess
 * Aliases: !reflock, !lockoutreport, !referrallock
 * Manages 70% weekly performance threshold & Resume Referral channel access locking
 */

const ReferralLockoutService = require('../../services/referralLockoutService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'referralaccess',
  aliases: ['reflock', 'lockoutreport', 'referrallock'],
  description: 'Audits weekly performance and locks/unlocks Resume Referral channel for students below 70%',
  usage: '!referralaccess [enforce | @student]',
  supervisorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const target = message.mentions.members.first();
    const subAction = args[0]?.toLowerCase();

    // 1. Check specific student
    if (target) {
      const loading = await message.reply(`🔍 Calculating weekly performance for <@${target.id}>...`);
      try {
        const evaluated = await ReferralLockoutService.evaluateCohortPerformance(guild.id);
        const student = evaluated.find(s => s.discordId === target.id);

        if (!student) {
          return loading.edit({ content: `❌ Student <@${target.id}> not found in active roster.` });
        }

        const statusIcon = student.isLocked ? '🔴 **LOCKED** (< 70%)' : '🟢 **ELIGIBLE** (>= 70%)';
        const embed = student.isLocked
          ? Embeds.warning(
              `Referral Access Status: Locked`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Weekly Overall Performance:** **${student.overallPerformance}%**\n` +
              `• **Referral Channel Access:** ${statusIcon}\n\n` +
              `📊 **Performance Details:**\n` +
              `• 📅 **Attendance Rate:** ${student.attendanceRate}% (${student.attendedDays}/5 days present)\n` +
              `• 💼 **Job Applications:** ${student.jobRate}% (${student.weeklyApps}/50 apps)\n` +
              `• 🛠️ **Overdue Tasks:** ${student.overdueCount}\n` +
              `• ⭐ **Total Score:** ${student.totalPoints} pts\n\n` +
              `*Student has role \`${constants.ROLES.REFERRAL_RESTRICTED}\` denying referral channel view.*`
            )
          : Embeds.success(
              `Referral Access Status: Eligible`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Weekly Overall Performance:** **${student.overallPerformance}%**\n` +
              `• **Referral Channel Access:** ${statusIcon}\n\n` +
              `📊 **Performance Details:**\n` +
              `• 📅 **Attendance Rate:** ${student.attendanceRate}% (${student.attendedDays}/5 days present)\n` +
              `• 💼 **Job Applications:** ${student.jobRate}% (${student.weeklyApps}/50 apps)\n` +
              `• ⭐ **Total Score:** ${student.totalPoints} pts`
            );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 2. Enforce Role Locks
    if (subAction === 'enforce' || subAction === 'sync') {
      const loading = await message.reply("🔒 Enforcing 70% performance threshold & syncing Discord role locks...");
      try {
        const result = await ReferralLockoutService.enforceCohortAccessLocks(guild);
        const embed = Embeds.success(
          "Referral Access Enforcement Complete",
          `• **Total Active Students Evaluated:** ${result.totalEvaluated}\n` +
          `• 🔒 **Locked (< 70% Performance):** **${result.lockedCount} students** (Assigned \`${constants.ROLES.REFERRAL_RESTRICTED}\`)\n` +
          `• 🟢 **Eligible (>= 70% Performance):** **${result.unlockedCount} students** (Access Granted)\n\n` +
          `${result.lockedCount > 0 ? `**Locked Students (< 70%):**\n${result.lockedStudents.map(s => `• <@${s.discordId}> (${s.name}) — **${s.overallPerformance}%**`).join('\n')}` : '✅ All students are performing above 70%!'}`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 3. Default: Display Cohort Overview
    const loading = await message.reply("📊 Auditing cohort weekly performance percentages...");
    try {
      const evaluated = await ReferralLockoutService.evaluateCohortPerformance(guild.id);
      const locked = evaluated.filter(s => s.isLocked);
      const eligible = evaluated.filter(s => !s.isLocked);

      const lockedList = locked.length > 0
        ? locked.map(s => `• 🔴 <@${s.discordId}> (${s.name}) — **${s.overallPerformance}%** (Att: ${s.attendanceRate}%, Jobs: ${s.weeklyApps}/50)`).join('\n')
        : '✅ None! All active students are above 70% threshold.';

      const eligibleList = eligible.slice(0, 10).map(s => `• 🟢 <@${s.discordId}> (${s.name}) — **${s.overallPerformance}%**`).join('\n');

      const embed = Embeds.info(
        `Resume Referral Access Audit (70% Threshold)`,
        `**Threshold Rule:** Students with weekly performance **< 70%** lose access to the **#resume-needed** channel.\n` +
        `*(Note: #referral-leaderboard remains open to everyone)*\n\n` +
        `🔒 **Below 70% — Resume Needed Locked (${locked.length} students):**\n${lockedList}\n\n` +
        `🟢 **Eligible Top Performers (${eligible.length} students):**\n${eligibleList}\n\n` +
        `💡 *Run \`!referralaccess enforce\` to apply/sync Discord role permissions.*`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Audit Error", err.message)] });
    }
  }
};
