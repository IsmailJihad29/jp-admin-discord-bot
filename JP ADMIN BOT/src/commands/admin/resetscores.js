/**
 * Command: !resetscores, !resetpoints, !startweek, !setstartdate
 * Resets all student points and schedules scoring to start fresh from Next Sunday
 */

const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'resetscores',
  aliases: ['resetpoints', 'startweek', 'cleanscores', 'setstartdate', 'scoringstart'],
  description: 'Resets all student scores and configures the scoring start date (defaults to Next Sunday)',
  usage: '!resetscores [YYYY-MM-DD]',
  supervisorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;

    // Calculate next Sunday (or use user supplied date)
    let targetDate = args[0];
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      // Default to 2026-08-30 (Next Sunday)
      targetDate = "2026-08-30";
    }

    cohortManager.resetCohortScoring(guildId, targetDate);

    const embed = Embeds.success(
      "Points Reset & Fresh Week Baseline Configured! 🔄",
      `✅ **All leaderboard & scorecard points have been reset to 0.**\n\n` +
      `• 📅 **Scoring Start Date:** **\`${targetDate}\` (Sunday)**\n` +
      `• 🗓️ **Mentorship Week Schedule:** **Sunday to Thursday (5 Days)**\n` +
      `• 🎙️ **Interview Points:** \`+2 Points\`\n` +
      `• 💼 **Daily Job Target:** \`10 Applications/day\` *(Use \`!settarget <num>\` to customize)*\n` +
      `• 📅 **Attendance:** \`+1 Present\` / \`-1 Absent\` / \`0 Approved Leave\`\n` +
      `• 🛠️ **Hiring Tasks:** \`+1 Announced\` / \`+1 Approved\` / \`-2 Overdue\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✨ **Starting from Sunday (\`${targetDate}\`), all new attendance, job applications, interview logs, and task submissions will be counted fresh for the week!**`,
      `JP ADMIN ${constants.BOT_VERSION} · Scoring Baseline Manager`
    );

    return message.reply({ embeds: [embed] });
  }
};
