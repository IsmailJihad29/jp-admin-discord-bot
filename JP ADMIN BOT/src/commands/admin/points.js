/**
 * Commands: !points, !scoring, !setpoint, !setpoints, !custompoints, !editpoints
 * Customizes and views all cohort scoring and point weights dynamically
 */

const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'setpoint',
  aliases: ['points', 'scoring', 'setpoints', 'custompoints', 'editpoints', 'pointsettings'],
  description: 'View or customize point weights (Interview, Attendance, Job Targets, Streaks, Tasks) for this server',
  usage: '!points | !setpoint interview <number> | !setpoint attendance <present> [absent] | !setpoint reset',
  mentorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();

    // 1. View Current Points: !points / !scoring or !setpoint without args
    if (args.length === 0 || commandName === 'points' || commandName === 'scoring') {
      const scoring = cohortManager.getCohortScoring(guildId);

      const embed = Embeds.info(
        "⭐ Server Scoring & Points Configuration",
        `Here are the active point weights and targets configured for **${message.guild.name}**:\n\n` +
        `🎙️ **Interview Preparation:** \`+${scoring.interviewPoints} pts\` *(per logged interview update)*\n\n` +
        `📅 **Attendance Scoring:**\n` +
        `• Present: \`+${scoring.attendancePresent} pt\`\n` +
        `• Absent: \`${scoring.attendanceAbsent} pt\`\n` +
        `• Approved Leave: \`0 pt\`\n\n` +
        `💼 **Job Application Target & Streaks:**\n` +
        `• Daily Application Target: **${scoring.jobTarget} Applications/day**\n` +
        `• Consecutive Streak Bonus: \`+${scoring.streakBonusPerDay} pts/day\` *(Max Cap: ${scoring.streakCap} pts)*\n\n` +
        `🛠️ **Hiring Tasks & Assignments:**\n` +
        `• Task Announced: \`+${scoring.taskAnnounced} pt\`\n` +
        `• Task Approved by Mentor: \`+${scoring.taskApproved} pt\`\n` +
        `• Deadline Overdue Penalty: \`${scoring.taskOverduePenalty} pts\`\n\n` +
        `──────────────────────────────\n` +
        `🛠️ **HOW TO CUSTOMIZE POINTS:**\n` +
        `• \`!setpoint interview <points>\` *(e.g. \`!setpoint interview 10\`)*\n` +
        `• \`!setpoint attendance <present> <absent>\` *(e.g. \`!setpoint attendance 2 -2\`)*\n` +
        `• \`!setpoint target <count>\` *(e.g. \`!setpoint target 12\`)*\n` +
        `• \`!setpoint streak <bonus_per_day> <cap>\` *(e.g. \`!setpoint streak 3 15\`)*\n` +
        `• \`!setpoint task <announced> <approved> <overdue>\` *(e.g. \`!setpoint task 1 2 -2\`)*\n` +
        `• \`!setpoint reset\` *(resets all points to default)*`,
        `JP ADMIN ${constants.BOT_VERSION} · Custom Scoring Manager`
      );

      return message.reply({ embeds: [embed] });
    }

    const sub = args[0].toLowerCase();

    // 2. Reset Points to Default: !setpoint reset
    if (sub === 'reset' || sub === 'default') {
      const resetScoring = cohortManager.resetCohortScoring(guildId);
      return message.reply({
        embeds: [Embeds.success(
          "Points Reset to Default ⭐",
          `✅ All scoring rules and point weights for **${message.guild.name}** have been restored to defaults:\n\n` +
          `• 🎙️ **Interview Points:** \`+${resetScoring.interviewPoints} pts\`\n` +
          `• 📅 **Attendance:** \`+${resetScoring.attendancePresent} Present\` / \`${resetScoring.attendanceAbsent} Absent\`\n` +
          `• 💼 **Daily Target:** **${resetScoring.jobTarget} Apps**\n` +
          `• 🔥 **Streak Bonus:** \`+${resetScoring.streakBonusPerDay} pts/day\` (Cap: ${resetScoring.streakCap})\n` +
          `• 🛠️ **Tasks:** \`+${resetScoring.taskAnnounced} Announced\` / \`+${resetScoring.taskApproved} Approved\` / \`${resetScoring.taskOverduePenalty} Overdue\``
        )]
      });
    }

    // 3. Customize Interview Points: !setpoint interview <number>
    if (sub === 'interview' || sub === 'interviews' || sub === 'int') {
      const pts = Number(args[1]);
      if (isNaN(pts) || pts < 0) {
        return message.reply("⚠️ **Usage:** `!setpoint interview <number>` (e.g. `!setpoint interview 10` or `!setpoint interview 5`)");
      }

      const updated = cohortManager.updateCohortScoring(guildId, { interviewPoints: pts });
      return message.reply({
        embeds: [Embeds.success(
          "Interview Points Updated! 🎙️",
          `✅ Interview preparation reward has been set to **\`+${updated.interviewPoints} points\`** per interview update.`
        )]
      });
    }

    // 4. Customize Attendance Points: !setpoint attendance <present> [absent]
    if (sub === 'attendance' || sub === 'att' || sub === 'present' || sub === 'absent') {
      let presentPts = Number(args[1]);
      let absentPts = Number(args[2]);

      if (sub === 'present') {
        presentPts = Number(args[1]);
        absentPts = cohortManager.getCohortScoring(guildId).attendanceAbsent;
      } else if (sub === 'absent') {
        absentPts = Number(args[1]);
        presentPts = cohortManager.getCohortScoring(guildId).attendancePresent;
      }

      if (isNaN(presentPts)) presentPts = cohortManager.getCohortScoring(guildId).attendancePresent;
      if (isNaN(absentPts)) absentPts = -1;

      const updated = cohortManager.updateCohortScoring(guildId, {
        attendancePresent: presentPts,
        attendanceAbsent: absentPts
      });

      return message.reply({
        embeds: [Embeds.success(
          "Attendance Scoring Updated! 📅",
          `✅ Attendance points updated for **${message.guild.name}**:\n\n` +
          `• **Present (+):** \`+${updated.attendancePresent} pt\`\n` +
          `• **Absent (-):** \`${updated.attendanceAbsent} pt\`\n` +
          `• **Leave:** \`0 pt\``
        )]
      });
    }

    // 5. Customize Job Target: !setpoint target <number> or !setpoint jobtarget <number>
    if (sub === 'target' || sub === 'jobtarget' || sub === 'jobs') {
      const target = Number(args[1]);
      if (isNaN(target) || target <= 0) {
        return message.reply("⚠️ **Usage:** `!setpoint target <number>` (e.g. `!setpoint target 12`)");
      }

      const updated = cohortManager.updateCohortScoring(guildId, { jobTarget: target });
      return message.reply({
        embeds: [Embeds.success(
          "Daily Job Target Updated! 💼",
          `✅ Daily job application target has been set to **\`${updated.jobTarget} applications/day\`**.`
        )]
      });
    }

    // 6. Customize Streak Points: !setpoint streak <bonus_per_day> [cap]
    if (sub === 'streak' || sub === 'streaks') {
      const bonus = Number(args[1]);
      const cap = Number(args[2]) || cohortManager.getCohortScoring(guildId).streakCap;

      if (isNaN(bonus) || bonus < 0) {
        return message.reply("⚠️ **Usage:** `!setpoint streak <bonus_per_day> [max_cap]` (e.g. `!setpoint streak 3 15`)");
      }

      const updated = cohortManager.updateCohortScoring(guildId, {
        streakBonusPerDay: bonus,
        streakCap: cap
      });

      return message.reply({
        embeds: [Embeds.success(
          "Streak Scoring Updated! 🔥",
          `✅ Daily streak bonus has been set to **\`+${updated.streakBonusPerDay} pts/day\`** (Maximum Cap: **\`${updated.streakCap} pts\`**).`
        )]
      });
    }

    // 7. Customize Task Points: !setpoint task <announced> <approved> [overdue]
    if (sub === 'task' || sub === 'tasks') {
      const announced = Number(args[1]);
      const approved = Number(args[2]);
      const overdue = Number(args[3]) || -2;

      if (isNaN(announced) || isNaN(approved)) {
        return message.reply("⚠️ **Usage:** `!setpoint task <announced_pts> <approved_pts> [overdue_penalty]` (e.g. `!setpoint task 1 2 -2`)");
      }

      const updated = cohortManager.updateCohortScoring(guildId, {
        taskAnnounced: announced,
        taskApproved: approved,
        taskOverduePenalty: overdue
      });

      return message.reply({
        embeds: [Embeds.success(
          "Job Task Scoring Updated! 🛠️",
          `✅ Job task point weights updated:\n\n` +
          `• **Announced:** \`+${updated.taskAnnounced} pt\`\n` +
          `• **Approved by Mentor:** \`+${updated.taskApproved} pt\`\n` +
          `• **Overdue Penalty:** \`${updated.taskOverduePenalty} pts\``
        )]
      });
    }

    return message.reply({
      embeds: [Embeds.warning(
        "Invalid Setting",
        "Please specify a valid point category.\n\n" +
        "📋 **Available Categories:**\n" +
        "• `!setpoint interview <pts>` *(e.g. `!setpoint interview 10`)*\n" +
        "• `!setpoint attendance <present> <absent>`\n" +
        "• `!setpoint target <count>`\n" +
        "• `!setpoint streak <bonus> <cap>`\n" +
        "• `!setpoint task <announced> <approved> <overdue>`\n" +
        "• `!setpoint reset`\n" +
        "• `!points` *(view current settings)*"
      )]
    });
  }
};
