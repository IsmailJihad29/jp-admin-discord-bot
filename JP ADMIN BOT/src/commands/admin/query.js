/**
 * Command: !query, !askdata, !sheetquery, !askcohort
 * Natural Language AI Cohort Data Query Engine powered by Google Gemini AI
 */

const CohortDataService = require('../../services/cohortDataService');
const GeminiService = require('../../services/geminiService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'query',
  aliases: ['askdata', 'sheetquery', 'askcohort', 'cohortquery'],
  description: 'Ask any natural language question about students, attendance, job trackers, or performance across all Google Sheets tabs',
  usage: '!query <Your Question>',
  mentorOnly: true,

  async execute(message, args, client) {
    if (args.length === 0) {
      return message.reply({
        embeds: [Embeds.info(
          "🤖 Cohort AI Data Query Engine",
          "You can ask any question about your students across all Google Sheet database tabs in English, Bengali, or Banglish!\n\n" +
          "📋 **Example Queries:**\n" +
          "• `!query total absent student last 3 days`\n" +
          "• `!query who hasn't linked or submitted their tracker sheet?`\n" +
          "• `!query who has 0 job applications this week?`\n" +
          "• `!query show me top 5 performing students in interviews`\n" +
          "• `!query which students have overdue tasks and absent records?`\n" +
          "• `!query give me a complete summary of all active students`\n\n" +
          "⚡ *Tip: You can also use instant sub-second filter commands like `!data nosheet`, `!data absent 3`, or `!data summary`.*",
          `JP ADMIN ${constants.BOT_VERSION} · AI Data Intelligence`
        )]
      });
    }

    const userQuery = args.join(' ');
    const loadingMsg = await message.reply(`🔍 **Scanning all database tabs and analyzing your query:** *"${userQuery.substring(0, 100)}"*...`);

    try {
      const snapshot = await CohortDataService.getCompactCohortSnapshot(message.guild.id);
      const answer = await GeminiService.answerCohortDataQuery(userQuery, snapshot);

      // Split into clean chunks of 3900 chars if necessary
      const maxLen = 3900;
      if (answer.length <= maxLen) {
        const embed = Embeds.info(
          `📊 Data Query Result`,
          `❓ **Query:** *${userQuery}*\n\n${answer}`,
          `JP ADMIN ${constants.BOT_VERSION} · Live Data Snapshot`
        );
        await loadingMsg.edit({ content: null, embeds: [embed] });
      } else {
        const parts = [];
        let current = "";
        for (const line of answer.split('\n')) {
          if ((current + '\n' + line).length > maxLen) {
            parts.push(current);
            current = line;
          } else {
            current += (current ? '\n' : '') + line;
          }
        }
        if (current) parts.push(current);

        const embeds = parts.map((p, idx) =>
          Embeds.info(
            idx === 0 ? `📊 Data Query Result (Part 1)` : `📊 Data Query Result (Part ${idx + 1})`,
            p,
            `JP ADMIN ${constants.BOT_VERSION} · Live Data Snapshot`
          )
        );

        await loadingMsg.edit({ content: null, embeds: embeds.slice(0, 10) });
      }
    } catch (err) {
      await loadingMsg.edit({
        content: null,
        embeds: [Embeds.error("Data Query Error", `Failed to complete query: ${err.message}`)]
      });
    }
  }
};
