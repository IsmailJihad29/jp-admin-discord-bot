/**
 * Command: !jp
 * Conversational Command Assistant powered by Google Gemini AI
 */

const GeminiService = require('../../services/geminiService');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'jp',
  description: 'Conversational assistant to find and construct commands using natural language',
  usage: '!jp <what you want to do>',
  supervisorOnly: true,

  async execute(message, args, client, commandHandler) {
    if (args.length === 0) {
      return message.reply({
        embeds: [Embeds.info(
          "JP Conversational Assistant",
          "Ask me what you want to do in plain English, and I will find the exact command for you!\n\n**Examples:**\n• `!jp set the daily application target to 12`\n• `!jp how do I check who didn't submit jobs today?`\n• `!jp close the attendance form`\n• `!jp sync all discord members to the sheet`"
        )]
      });
    }

    const query = args.join(' ');
    const loading = await message.reply('🧠 Analyzing request with Gemini AI...');

    try {
      const catalog = commandHandler.getCatalog();
      const result = await GeminiService.parseNaturalQuery(query, catalog);

      if (result.clarifyingQuestion) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning(
            "Clarification Needed",
            `**Question:** ${result.clarifyingQuestion}\n\n*Reply to this message with your answer to get the exact command.*`
          )]
        });
      }

      if (result.suggestedCommand) {
        const embed = Embeds.success(
          "Suggested Command",
          `**Command to run:**\n\`\`\`\n${result.suggestedCommand}\n\`\`\`\n**What this does:** ${result.explanation || 'Executes the requested workflow.'}\n\n*(Review and copy-paste this command to run it)*`
        );
        return loading.edit({ content: null, embeds: [embed] });
      }

      await loading.edit({
        content: null,
        embeds: [Embeds.info("Command Assistant", result.explanation || "Try browsing commands with `!help all`.")]
      });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("JP Assistant Error", err.message)] });
    }
  }
};
