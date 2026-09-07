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
  aliases: ['reflock', 'lockoutreport', 'referrallock', 'syncroles', 'rolesync', 'resetroles', 'rolesreset', 'activeinactive'],
  description: 'Audits student scores/absences and manages Active vs Inactive roles for #resume-needed access',
  usage: '!syncroles | !resetroles | !referralaccess [sync | reset | @student]',
  mentorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;
    const target = message.mentions.members.first();
    let subAction = args[0]?.toLowerCase();

    // Direct command shortcuts
    if (['syncroles', 'rolesync', 'activeinactive'].includes(commandName)) {
      if (target) {
        // Checking specific student via shortcut
      } else {
        subAction = 'sync';
      }
    } else if (['resetroles', 'rolesreset'].includes(commandName)) {
      subAction = 'reset';
    }

    // 1. Check specific student
    if (target) {
      const loading = await message.reply(`🔍 Calculating referral access & role eligibility for <@${target.id}>...`);
      try {
        const evaluated = await ReferralLockoutService.evaluateCohortPerformance(guild.id);
        const student = evaluated.find(s => s.discordId === target.id);

        if (!student) {
          return loading.edit({ content: `❌ Student <@${target.id}> not found in active roster.` });
        }

        const activeRole = await ReferralLockoutService.getActiveRole(guild, false);
        const inactiveRole = await ReferralLockoutService.getInactiveRole(guild, false);

        const statusIcon = student.isLocked ? '🔴 **INACTIVE (Access Paused)**' : '🟢 **ACTIVE (Access Granted)**';
        const assignedRole = student.isLocked ? (inactiveRole?.name || 'Inactive Student') : (activeRole?.name || 'Active Student');

        const embed = student.isLocked
          ? Embeds.warning(
              `Student Status: Inactive`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Assigned Role:** \`${assignedRole}\`\n` +
              `• **#resume-needed Channel Access:** 🔴 **No Access**\n` +
              `• **Inactivity Reason:** ${student.lockReason}\n\n` +
              `📊 **Performance Details (Since Start Date):**\n` +
              `• ⭐ **Total Score:** **${student.totalPoints} pts** ${student.hasNegativeScore ? '❌ *(Negative)*' : '✅'}\n` +
              `• 📅 **Consecutive Absences:** **${student.consecutiveAbsences} days** ${student.has3ConsecutiveAbsences ? '❌ *(>= 3 days)*' : '✅'}\n` +
              `• 🗓️ **Weekly Absences:** **${student.totalAbsencesInWeek} days**\n` +
              `• 📅 **Attendance Start:** \`${student.attendanceStartDate || 'Recent'}\`\n\n` +
              `*Role \`${assignedRole}\` blocks access to #resume-needed until score is >= 0 and regular.*`
            )
          : Embeds.success(
              `Student Status: Active`,
              `• **Student:** <@${target.id}> (${student.name})\n` +
              `• **Assigned Role:** \`${assignedRole}\`\n` +
              `• **#resume-needed Channel Access:** 🟢 **Full Access**\n\n` +
              `📊 **Performance Details (Since Start Date):**\n` +
              `• ⭐ **Total Score:** **${student.totalPoints} pts** (>= 0)\n` +
              `• 📅 **Consecutive Absences:** **${student.consecutiveAbsences} days** (< 3)\n` +
              `• 🗓️ **Weekly Absences:** **${student.totalAbsencesInWeek} days**\n` +
              `• 📅 **Attendance Start:** \`${student.attendanceStartDate || 'Recent'}\`\n\n` +
              `*Role \`${assignedRole}\` grants full access to #resume-needed.*`
            );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 2. Reset Roles & Clear Overwrites (Fresh slate)
    if (subAction === 'unlockall' || subAction === 'reset') {
      const loading = await message.reply("🔄 **Resetting roles and channel permissions across the server...**\n• Purging individual member overwrites from `#resume-needed`\n• Assigning `Active Student` role to all active roster students\n• Removing `Inactive Student` role");
      try {
        const res = await ReferralLockoutService.unlockAll(guild);
        const embed = Embeds.success(
          "Server Roles & Permissions Reset! 🔓",
          `✅ **Channel Permissions Repaired:**\n` +
          `• Cleared **${res.unlocked || 0} individual member lock(s)** from **#resume-needed**\n` +
          `• Configured clean role access: \`@everyone\` (Deny), \`@Active Student\` (Allow), \`@Inactive Student\` (Deny)\n\n` +
          `✅ **Role Updates:**\n` +
          `• Removed \`${res.inactiveRoleName}\` from **${res.rolesRemoved || 0} member(s)**\n` +
          `• Assigned \`${res.activeRoleName}\` to **${res.activeAssigned || 0} student(s)**\n\n` +
          `📄 **Result:** All active students can now properly view and access **#resume-needed**!\n` +
          `💡 *To enforce inactivity locks again based on current scores (<0) and 3 absences, run \`!syncroles\`.*`
        );
        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error: ${err.message}` });
      }
    }

    // 3. Sync & Enforce Active / Inactive Roles
    if (subAction === 'enforce' || subAction === 'sync') {
      const loading = await message.reply("⚙️ **Auditing student scores & absences and syncing Discord roles...**\n• Students with `< 0 pts` or `3 absences` ➔ `Inactive Student` (no #resume-needed)\n• Students with `>= 0 pts` & `< 3 absences` ➔ `Active Student` (full #resume-needed access)");
      try {
        const result = await ReferralLockoutService.enforceCohortAccessLocks(guild);

        const lockedList = result.lockedCount > 0
          ? result.lockedStudents.map(s => `• 🔴 <@${s.discordId}> (${s.name}) — **${s.totalPoints} pts** | Streak: **${s.consecutiveAbsences}d** (${s.lockReason})`).join('\n')
          : '✅ None! All active students have positive scores and regular attendance.';

        const embed = Embeds.success(
          "Active / Inactive Roles Synced Successfully! 🛡️",
          `• **Total Active Students Evaluated:** **${result.totalEvaluated}**\n` +
          `• 🟢 **\`${result.activeRoleName}\` (Eligible):** **${result.unlockedCount} students** (Can view #resume-needed)\n` +
          `• 🔴 **\`${result.inactiveRoleName}\` (Restricted):** **${result.lockedCount} students** (Cannot view #resume-needed)\n\n` +
          `📄 **Channel Permissions:**\n` +
          `• All individual member overrides on **#resume-needed** were removed.\n` +
          `• Channel access is now 100% governed by \`@${result.activeRoleName}\` vs \`@${result.inactiveRoleName}\`!\n\n` +
          `**Restricted Inactive Students:**\n${lockedList}`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: `❌ Error syncing roles: ${err.message}` });
      }
    }

    // 4. Default: Display Cohort Overview
    const loading = await message.reply("📊 Auditing cohort referral access eligibility...");
    try {
      const evaluated = await ReferralLockoutService.evaluateCohortPerformance(guild.id);
      const locked = evaluated.filter(s => s.isLocked);
      const eligible = evaluated.filter(s => !s.isLocked);

      const lockedList = locked.length > 0
        ? locked.map(s => `• 🔴 <@${s.discordId}> (${s.name}) — **${s.totalPoints} pts** | Streak: **${s.consecutiveAbsences}d** (${s.lockReason})`).join('\n')
        : '✅ None! All active students are eligible.';

      const eligibleList = eligible.slice(0, 10).map(s => `• 🟢 <@${s.discordId}> (${s.name}) — **${s.totalPoints} pts** | Streak: **${s.consecutiveAbsences}d**`).join('\n');

      const embed = Embeds.info(
        "Active vs Inactive Role & Referral Audit",
        `**System Rules:**\n` +
        `• **Active Student:** Score \`>= 0 pts\` AND \`< 3\` consecutive absences ➔ Access to **#resume-needed**\n` +
        `• **Inactive Student:** Score \`< 0 pts\` OR \`>= 3\` consecutive/weekly absences ➔ Restricted from **#resume-needed**\n\n` +
        `🔴 **Inactive Students (${locked.length} students):**\n${lockedList}\n\n` +
        `🟢 **Active Students (${eligible.length} students):**\n${eligibleList}\n\n` +
        `💡 **Commands:**\n` +
        `• \`!syncroles\` (or \`!referralaccess sync\`): Enforce & assign Active/Inactive roles and sync permissions\n` +
        `• \`!resetroles\` (or \`!referralaccess reset\`): Remove inactive roles and grant access to all students\n` +
        `• \`!referralaccess @student\`: View a specific student's eligibility status`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Audit Error", err.message)] });
    }
  }
};
