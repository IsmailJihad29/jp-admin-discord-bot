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
  aliases: ['resetpoints', 'resetmarking', 'resetmarkings', 'startweek', 'cleanscores', 'setstartdate', 'scoringstart'],
  description: 'Resets all student scores to 0 and configures scoring to start fresh from Next Sunday (no arguments needed)',
  usage: '!resetscores [optional: YYYY-MM-DD]',
  mentorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;

    // Automatically calculate next Sunday date if not provided
    let targetDate = args[0];
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      targetDate = DateTimeUtil.getNextSundayDate();
    }

    cohortManager.resetCohortScoring(guildId, targetDate);

    const embed = Embeds.success(
      "Points Reset & Fresh Baseline Activated! 🔄",
      `✅ **All student points, leaderboard rankings, and scorecard metrics have been reset to 0.**\n\n` +
      `• 📅 **Fresh Scoring Starts:** **\`${targetDate}\` (Sunday)**\n` +
      `• 🗓️ **Mentorship Week Schedule:** **Sunday to Thursday (5 Days)**\n` +
      `• 🔇 **Today's Automated Broadcasts:** **Muted** *(No leaderboard or daily audit posts will be published today)*\n` +
      `• 🎙️ **Interview Reward:** \`+2 Points\`\n` +
      `• 💼 **Daily Job Target:** \`10 Applications/day\` *(Use \`!settarget <num>\` to adjust)*\n` +
      `• 📅 **Attendance:** \`+1 Present\` / \`-1 Absent\` / \`0 Approved Leave\`\n` +
      `• 🛠️ **Hiring Tasks:** \`+1 Announced\` / \`+1 Approved\` / \`-2 Overdue\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✨ **Starting this upcoming Sunday (\`${targetDate}\`), all attendance, job applications, interview logs, and task submissions will automatically begin counting as Week 1!**`,
      `JP ADMIN ${constants.BOT_VERSION} · Scoring Baseline Manager`
    );

    return message.reply({ embeds: [embed] });
  }
};
