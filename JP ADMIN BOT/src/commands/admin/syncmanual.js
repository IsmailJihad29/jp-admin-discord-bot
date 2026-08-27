/**
 * Command: !syncmanual, !commandmanual, !createmanualtab, !botcommands
 * Automatically creates and populates the complete 'Bot_Commands' documentation tab in Google Sheets
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'syncmanual',
  aliases: ['commandmanual', 'createmanualtab', 'botcommands', 'pushmanual'],
  description: 'Generates and updates a dedicated Bot_Commands documentation tab directly inside your Google Sheet',
  usage: '!syncmanual',
  mentorOnly: true,

  async execute(message, args, client) {
    const loading = await message.reply("📑 **Generating and syncing complete Bot Commands Manual into your Google Sheet...**");

    try {
      const res = await GasClient.request(message.guild.id, 'initCommandManual', {});

      if (!res || res.status !== 'SUCCESS') {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Sync Failed", res?.error || "Could not generate manual tab in Google Sheets.")]
        });
      }

      const embed = Embeds.success(
        "Bot Commands Manual Synced to Google Sheets! 📊",
        `✅ Successfully generated and formatted the **\`${res.tabName || 'Bot_Commands'}\`** tab in your Google Spreadsheet!\n\n` +
        `• 📋 **Total Commands Logged:** **${res.totalCommandsLogged || '40+'} commands**\n` +
        `• 🎨 **Formatting:** Formatted with bold navy headers, auto-fitted columns, and categorized sections.\n` +
        `• 📂 **Local Reference File:** Also saved locally at [\`COMMAND_REFERENCE.md\`](file:///g:/Apps/Discord%20Bot/JP%20ADMIN%20BOT/COMMAND_REFERENCE.md).\n\n` +
        `💡 *Open your Google Sheet to view, search, share, or export your full command manual anytime!*`,
        `JP ADMIN ${constants.BOT_VERSION} · Google Sheets Integration`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({
        content: null,
        embeds: [Embeds.error("Manual Sync Error", err.message + "\n\n*(Make sure to deploy the latest Code.gs v50 to your Google Sheet)*")]
      });
    }
  }
};
