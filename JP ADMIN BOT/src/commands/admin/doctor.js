/**
 * Command: !doctor
 * Diagnostic health check for Bot, Apps Script backend (v47), tabs, and permissions
 */

const GasClient = require('../../services/gasClient');
const constants = require('../../config/constants');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'doctor',
  description: 'Diagnoses bot health, Apps Script v47 backend, tabs, and permissions',
  usage: '!doctor',
  supervisorOnly: true,

  async execute(message, args, client) {
    const loadingMsg = await message.reply("🩺 Running system diagnosis across Discord and Google Apps Script...");

    try {
      const doctorRes = await GasClient.getDoctor(message.guild.id);
      const isVersionMatch = doctorRes.version === constants.EXPECTED_GAS_VERSION;

      const hasAdmin = message.guild.members.me.permissions.has('Administrator');
      const missingTabs = doctorRes.missingTabs || [];

      const statusDesc = [
        `**Bot Version:** \`${constants.BOT_VERSION}\``,
        `**Apps Script Backend:** \`${doctorRes.version || 'Offline'}\` (Expected: \`${constants.EXPECTED_GAS_VERSION}\`) ${isVersionMatch ? '✅' : '⚠️ *Version Mismatch!*'}`,
        `**Discord Permissions:** ${hasAdmin ? '✅ `Administrator` (Full access)' : '⚠️ *Missing Administrator permission*'}`,
        `**Database Tabs Status:** ${missingTabs.length === 0 ? '✅ All 10 core required tabs verified' : `❌ Missing ${missingTabs.length} tabs: \`${missingTabs.join(', ')}\``}`,
        `**Spreadsheet ID:** \`${doctorRes.spreadsheetId || 'N/A'}\``
      ].join('\n');

      const embed = (isVersionMatch && missingTabs.length === 0 && hasAdmin)
        ? Embeds.success("System Doctor: ALL SYSTEMS HEALTHY", statusDesc)
        : Embeds.warning("System Doctor: ISSUES DETECTED", statusDesc);

      await loadingMsg.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loadingMsg.edit({
        content: null,
        embeds: [Embeds.error("Doctor Check Failed", `Could not connect to Apps Script backend:\n\`${err.message}\`\n\nVerify that the Apps Script Web App is deployed as **Anyone** and URL is set.`)]
      });
    }
  }
};
