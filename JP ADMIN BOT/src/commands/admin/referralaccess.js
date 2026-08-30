/**
 * Command: !referralaccess
 * Aliases: !reflock, !lockoutreport, !referrallock
 * Manages negative points (<0) & >3 absence threshold for Resume Referral channel access
 */

const ReferralLockoutService = require('../../services/referralLockoutService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'referralaccess',
  aliases: ['reflock', 'lockoutreport', 'referrallock'],
  description: 'Audits student scores/absences and locks/unlocks #resume-needed channel',
  usage: '!referralaccess [enforce | unlockall | @student]',
  supervisorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const target = message.mentions.members.first();
    const subAction = args[0]?.toLowerCase();

    // 1. Check specific student
    if (target) {
      const loading = await message.reply(`🔍 Calculating referral access eligibility for <@${target.id}>...`);
      try {
        const evaluated = await ReferralLockoutService.evaluateCohortPerformance(guild.id);
        const student = evaluated.find(s => s.discordId === target.id);

        if (!student) {
          return loading.edit({ content: `❌ Student <@${target.id}> not found in active roster.` });
        }

        const statusIcon = student.isLocked ? '🔴 **LOCKED** (Negative score or >3 absences)' : '🟢 **ELIGIBLE & UNLOCKED**';
        const embed = student.isLocked
          ? Embeds.warning(
              `Referral Access Status: Locked`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Referral Channel Access:** ${statusIcon}\n` +
              `• **Reason for Lock:** ${student.lockReason}\n\n` +
              `📊 **Performance Details:**\n` +
              `• ⭐ **Total Score:** **${student.totalPoints} pts** ${student.hasNegativeScore ? '❌ *(Negative)*' : '✅'}\n` +
              `• 📅 **Weekly Absences:** **${student.absentDays}/5 days** ${student.hasExcessiveAbsences ? '❌ *(>3 days)*' : '✅'}\n\n` +
              `*Student has role \`${constants.ROLES.REFERRAL_RESTRICTED}\` hiding #resume-needed.*`
            )
          : Embeds.success(
              `Referral Access Status: Eligible`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Referral Channel Access:** ${statusIcon}\n\n` +
              `📊 **Performance Details:**\n` +
              `• ⭐ **Total Score:** **${student.totalPoints} pts** (>= 0)\n` +
              `• 📅 **Weekly Absences:** **${student.absentDays}/5 days** (<= 3)\n\n` +
              `*Student has full access to #resume-needed.*`
            );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 2. Unlock All (Instant Reset)
    if (subAction === 'unlockall' || subAction === 'reset') {
      const loading = await message.reply("🔓 Removing all referral restrictions and restoring #resume-needed for everyone...");
      try {
        const res = await ReferralLockoutService.unlockAll(guild);
        const embed = Embeds.success(
          "Referral Restrictions Cleared! 🔓",
          `✅ Removed \`${constants.ROLES.REFERRAL_RESTRICTED}\` role from **${res.unlocked} member(s)**.\n\n` +
          `• 📄 **#resume-needed Channel:** Full viewing access restored for all students with **\`Active Student\`** role.\n` +
          `• 🔒 **Rule Reminder:** Students with negative score (< 0) or > 3 absences will be locked automatically during nightly audits.`
        );
        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 3. Enforce Role Locks / Sync
    if (subAction === 'enforce' || subAction === 'sync') {
      const loading = await message.reply("🔒 Enforcing referral access rules (<0 points or >3 absences) & syncing Discord role locks...");
      try {
        const result = await ReferralLockoutService.enforceCohortAccessLocks(guild);
        const embed = Embeds.success(
          "Referral Access Enforcement Complete",
          `• **Total Active Students Evaluated:** ${result.totalEvaluated}\n` +
          `• 🔒 **Locked (<0 pts or >3 absences):** **${result.lockedCount} students** (Assigned \`${constants.ROLES.REFERRAL_RESTRICTED}\`)\n` +
          `• 🟢 **Eligible (Score >= 0 & Absences <= 3):** **${result.unlockedCount} students** (Access Granted)\n\n` +
          `${result.lockedCount > 0 ? `**Locked Students:**\n${result.lockedStudents.map(s => `• 🔴 <@${s.discordId}> (${s.name}) — ${s.lockReason}`).join('\n')}` : '✅ All students have score >= 0 and <= 3 absences!'}`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 4. Default: Display Cohort Overview
    const loading = await message.reply("📊 Auditing cohort referral access eligibility...");
    try {
      const evaluated = await ReferralLockoutService.evaluateCohortPerformance(guild.id);
      const locked = evaluated.filter(s => s.isLocked);
      const eligible = evaluated.filter(s => !s.isLocked);

      const lockedList = locked.length > 0
        ? locked.map(s => `• 🔴 <@${s.discordId}> (${s.name}) — **${s.totalPoints} pts** | Absences: **${s.absentDays}/5** (${s.lockReason})`).join('\n')
        : '✅ None! All active students are eligible.';

      const eligibleList = eligible.slice(0, 10).map(s => `• 🟢 <@${s.discordId}> (${s.name}) — **${s.totalPoints} pts** | Absences: **${s.absentDays}/5**`).join('\n');

      const embed = Embeds.info(
        "Resume Referral Access Audit",
        `**Official Rule:** Students with **negative score (< 0 pts)** or **more than 3 absences (> 3 days)** lose access to **#resume-needed**.\n` +
        `*(All students with 0 points or positive points and <= 3 absences have full access)*\n\n` +
        `🔒 **Restricted Students (${locked.length} students):**\n${lockedList}\n\n` +
        `🟢 **Eligible Students (${eligible.length} students):**\n${eligibleList}\n\n` +
        `💡 *Run \`!referralaccess sync\` to apply locks, or \`!referralaccess unlockall\` to reset all locks.*`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Audit Error", err.message)] });
    }
  }
};
