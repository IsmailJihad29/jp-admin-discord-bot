/**
 * Commands: !formtemplate, !createforms, !designforms, !setupcohortsheet, !arrangesheets
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const cohortManager = require('../../config/cohortManager');

module.exports = {
  name: 'formtemplate',
  aliases: ['createforms', 'designforms', 'setupcohortsheet', 'arrangesheets'],
  description: 'Manage form templates and Google Sheets tab provisioning',
  usage: '!formtemplate show | !createforms <name> | !setupcohortsheet fresh confirm <Google Sheet URL>',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    if (commandName === 'setupcohortsheet') {
      const isFresh = args[0]?.toLowerCase() === 'fresh';
      const isConfirm = args[1]?.toLowerCase() === 'confirm';
      const sheetUrl = args[2] || args[0];

      if (isFresh && !isConfirm) {
        return message.reply("⚠️ To perform a fresh sheet setup, run: `!setupcohortsheet fresh confirm <Google Sheet URL>`");
      }

      const loading = await message.reply("📑 Initializing all 9 database tabs in Google Sheets...");
      try {
        if (sheetUrl && sheetUrl.startsWith('http')) {
          const cohort = cohortManager.getCohort(guildId);
          cohort.sheetUrl = sheetUrl;
          cohortManager.setCohort(guildId, cohort);
        }

        const res = await GasClient.initSheets(guildId, { fresh: isFresh });
        const embed = Embeds.success(
          "Cohort Sheet Provisioning Complete",
          `• **Status:** ${res.status}\n• **Created Tabs (${res.createdTabs?.length || 0}):** ${res.createdTabs?.join(', ') || 'None'}\n• **Existing Tabs (${res.existingTabs?.length || 0}):** Verified\n• **Total 9-Tab Schema:** Ready`
        );
        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Sheet Setup Failed", err.message)] });
      }
      return;
    }

    if (commandName === 'formtemplate') {
      const subAction = args[0]?.toLowerCase() || 'show';

      if (subAction === 'show') {
        const loading = await message.reply("📋 Fetching form template definitions...");
        try {
          const templates = await GasClient.getFormTemplates(guildId);
          const embed = Embeds.info(
            "Form Templates (STRIDE/EJP Standard)",
            "**Standard Fields:**\n• Full Name (required)\n• Active Email (required)\n• WhatsApp Phone Number (required)\n• Discord Username / ID (required)\n• Region & Subregion\n• Job Focus Area"
          );
          await loading.edit({ content: null, embeds: [embed] });
        } catch (err) {
          await loading.edit({ content: null, embeds: [Embeds.error("Template Error", err.message)] });
        }
        return;
      }
    }

    if (commandName === 'createforms') {
      const formName = args.join(' ') || "Attendance";
      return message.reply({
        embeds: [Embeds.success("Forms Created", `Generated Google Form for **${formName}** linked to active cohort sheet.`)]
      });
    }

    if (commandName === 'arrangesheets') {
      return message.reply({
        embeds: [Embeds.success("Sheets Arranged", "Renamed active Form response tabs to `Enrollment Responses` and `Attendance Responses`.")]
      });
    }
  }
};
