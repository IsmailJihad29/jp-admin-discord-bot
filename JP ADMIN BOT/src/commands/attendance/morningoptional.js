/**
 * Commands: !morningoptional, !morningopt, !morningexempt
 * Manages students for whom Morning Attendance is optional (no absent penalties, 0 pts)
 */

const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'morningoptional',
  aliases: ['morningopt', 'morningexempt', 'optmorning', 'exemptmorning'],
  description: 'Manage students or roles for whom Morning Basecamp is optional (0 attendance points, no absent penalty)',
  usage: '!morning optional add @user1 @user2 [reason] | !morning optional remove @user | !morning optional list | !morning optional role @Role',
  mentorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;
    let sub = args[0]?.toLowerCase();

    // If first argument is 'optional' or 'exempt' (e.g. routed from !morning optional ...)
    if (sub === 'optional' || sub === 'exempt') {
      args = args.slice(1);
      sub = args[0]?.toLowerCase();
    }

    // 1. List: !morning optional list | !morning optional status
    if (!sub || sub === 'list' || sub === 'status') {
      const optList = cohortManager.getMorningOptionalList(guildId);
      const optData = cohortManager.getMorningOptional(guildId);

      let listStr = "";
      if (optList.length === 0) {
        listStr = "• *No individual students are currently on the Morning Optional list.*";
      } else {
        listStr = optList.map((u, idx) => {
          const tag = `<@${u.discordId}>`;
          const nameStr = u.name && u.name !== u.discordId ? `(${u.name})` : '';
          const reasonStr = u.reason ? `— *${u.reason}*` : '';
          const byStr = u.addedBy ? `*(by ${u.addedBy})*` : '';
          return `**${idx + 1}.** ${tag} ${nameStr} ${reasonStr} ${byStr}`;
        }).join('\n');
      }

      const roleStr = optData.roleId ? `<@&${optData.roleId}>` : "*None (assign via `!morning optional role @Role`)*";

      const embed = Embeds.info(
        "☕ Morning Attendance Optional / Exemption List",
        `Students on this list have **Morning Basecamp set as OPTIONAL**.\n` +
        `• 🛡️ **No Penalties:** They will **NEVER** receive an Absent penalty (\`-1 pt\`) for missing morning sessions.\n` +
        `• 📊 **Points:** Marked as \`OPT\` (**0 points**) in Google Sheets and leaderboard calculations.\n\n` +
        `🎭 **Exempt Role:** ${roleStr}\n\n` +
        `📋 **Exempt Students (${optList.length}):**\n${listStr}\n\n` +
        `──────────────────────────────\n` +
        `💡 **Commands:**\n` +
        `• Add students: \`!morning optional add @student1 @student2 [reason]\`\n` +
        `• Remove student: \`!morning optional remove @student1\`\n` +
        `• Assign optional role: \`!morning optional role @Role\`\n` +
        `• Clear entire list: \`!morning optional clear\``,
        `JP ADMIN ${constants.BOT_VERSION} · Morning Exemption`
      );

      return message.reply({ embeds: [embed] });
    }

    // 2. Role Configuration: !morning optional role @Role | clear
    if (sub === 'role') {
      const targetRole = message.mentions.roles.first();
      const roleArg = args[1]?.toLowerCase();

      if (roleArg === 'clear' || roleArg === 'none' || roleArg === 'remove') {
        cohortManager.setMorningOptionalRole(guildId, null);
        return message.reply({
          embeds: [Embeds.success("Optional Role Cleared", "Removed Morning Optional role. Only individually listed students will now be excused.")]
        });
      }

      if (!targetRole) {
        return message.reply("⚠️ Please mention a valid role. Example: `!morning optional role @Morning Optional` or `!morning optional role clear`.");
      }

      cohortManager.setMorningOptionalRole(guildId, targetRole.id);
      return message.reply({
        embeds: [Embeds.success(
          "Morning Optional Role Assigned ☕",
          `✅ Any member with the role <@&${targetRole.id}> is now automatically **excused from morning attendance** (no absent penalties).`
        )]
      });
    }

    // 3. Clear List: !morning optional clear
    if (sub === 'clear') {
      const clearedCount = cohortManager.clearMorningOptional(guildId);
      return message.reply({
        embeds: [Embeds.success(
          "Morning Optional List Cleared",
          `✅ Removed **${clearedCount} student(s)** from the morning optional list. All students are now subject to normal morning attendance.`
        )]
      });
    }

    // 4. Remove Student: !morning optional remove @user / <discordId>
    if (sub === 'remove' || sub === 'delete' || sub === 'del') {
      const mentionedUsers = Array.from(message.mentions.users.values());
      const rawIds = args.slice(1).filter(a => /^\d{17,20}$/.test(a));
      const targetIds = mentionedUsers.map(u => u.id).concat(rawIds);

      if (targetIds.length === 0) {
        return message.reply("⚠️ Please mention or provide the Discord ID of the student to remove. Example: `!morning optional remove @student`.");
      }

      let removedCount = 0;
      targetIds.forEach(id => {
        if (cohortManager.removeMorningOptional(guildId, id)) {
          removedCount++;
        }
      });

      return message.reply({
        embeds: [Embeds.success(
          "Removed from Morning Optional",
          `✅ Removed **${removedCount} student(s)** from the morning optional list. Their morning attendance will now be counted normally.`
        )]
      });
    }

    // 5. Add Students: !morning optional add @user1 @user2 ... [reason]
    // Or if sub is not 'add', check if user mentioned students directly: !morning optional @user1
    let usersToAdd = Array.from(message.mentions.users.values());
    let rawIdsToAdd = args.filter(a => /^\d{17,20}$/.test(a));
    let reasonText = "Optional Morning Basecamp";

    if (sub === 'add') {
      const remainingArgs = args.slice(1).filter(a => !/^<@!?\d{17,20}>$/.test(a) && !/^\d{17,20}$/.test(a));
      if (remainingArgs.length > 0) {
        reasonText = remainingArgs.join(' ');
      }
    } else {
      // User typed !morning optional @user [reason] without explicitly typing 'add'
      const remainingArgs = args.filter(a => !/^<@!?\d{17,20}>$/.test(a) && !/^\d{17,20}$/.test(a));
      if (remainingArgs.length > 0) {
        reasonText = remainingArgs.join(' ');
      }
    }

    const allCandidateUsers = [];
    usersToAdd.forEach(u => {
      allCandidateUsers.push({
        discordId: u.id,
        name: u.displayName || u.username,
        reason: reasonText
      });
    });

    rawIdsToAdd.forEach(id => {
      if (!allCandidateUsers.some(c => c.discordId === id)) {
        const member = message.guild.members.cache.get(id);
        allCandidateUsers.push({
          discordId: id,
          name: member ? (member.displayName || member.user.username) : id,
          reason: reasonText
        });
      }
    });

    if (allCandidateUsers.length === 0) {
      return message.reply({
        embeds: [Embeds.warning(
          "No Students Specified",
          "Please mention one or more students or provide their Discord IDs.\n\n" +
          "**Usage Examples:**\n" +
          "• `!morning optional add @student1 @student2 (Job conflict)`\n" +
          "• `!morning optional list`\n" +
          "• `!morning optional role @Morning Optional`"
        )]
      });
    }

    const addRes = cohortManager.addMorningOptional(guildId, allCandidateUsers, message.author.tag);
    const addedTags = allCandidateUsers.map(u => `• <@${u.discordId}> (${u.name})`).join('\n');

    return message.reply({
      embeds: [Embeds.success(
        "Students Added to Morning Optional List ☕",
        `✅ Successfully marked **${addRes.addedCount} student(s)** as **Morning Optional**!\n\n` +
        `**Added Students:**\n${addedTags}\n\n` +
        `• **Reason:** *${reasonText}*\n` +
        `• **Effect:** They will **NOT** be penalized with -1 pt if they miss morning attendance. Their record will show as \`OPT\` (0 pts).\n` +
        `• **Total Optional Students:** **${addRes.total}**\n\n` +
        `💡 *Run \`!morning optional list\` to view all excused students.*`
      )]
    });
  }
};
