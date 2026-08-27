/**
 * Commands: !cohorts, !supervisor, !forwarder, !audit
 */

const cohortManager = require('../../config/cohortManager');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'cohorts',
  aliases: ['cohort', 'supervisor', 'forwarder', 'audit', 'setgas', 'bindsheet', 'setgasurl'],
  description: 'Manage multi-cohort settings, bind server-specific Google Sheets, supervisors, and forwarder routes',
  usage: '!setgas <WebAppUrl> [secretKey] | !cohorts | !supervisor add/remove @user | !forwarder set <srcId> <dstId> | !audit',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    // --- !setgas / !bindsheet ---
    if (commandName === 'setgas' || commandName === 'bindsheet' || commandName === 'setgasurl') {
      const url = args[0];
      const secret = args[1] || 'JP_ADMIN_26';

      if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
        return message.reply({
          embeds: [Embeds.error("Invalid URL", "Please provide a valid Google Apps Script Web App URL ending in `/exec`:\n\n`!setgas https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec [SECRET_KEY]`")]
        });
      }

      const loading = await message.reply("🔄 Testing connection to Google Apps Script backend...");
      try {
        const cohort = cohortManager.getCohort(guildId);
        cohort.name = message.guild.name;
        cohort.gasUrl = url.trim();
        cohort.gasSecret = secret.trim();
        cohortManager.setCohort(guildId, cohort);

        // Test with doctor call
        const doc = await GasClient.getDoctor(guildId);

        const embed = Embeds.success(
          "Google Sheet Backend Connected Successfully! 🚀",
          `• **Server:** ${message.guild.name} (\`${guildId}\`)\n` +
          `• **Spreadsheet Name:** ${doc.spreadsheetName || 'Connected'}\n` +
          `• **Spreadsheet ID:** \`${doc.spreadsheetId || 'Linked'}\`\n` +
          `• **Backend Version:** \`${doc.version || 'v47'}\`\n` +
          `• **Web App URL:** \`${url.substring(0, 50)}...\`\n\n` +
          `✅ *This Discord server is now bound to its own independent Google Sheet database.*`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({
          content: null,
          embeds: [Embeds.error("Connection Failed", `Could not connect to Google Apps Script:\n\`${err.message}\`\n\nMake sure the Apps Script is deployed as a Web App with access set to **Anyone**.`)]
        });
      }
    }

    // --- !supervisor ---
    if (commandName === 'supervisor') {
      const subAction = args[0]?.toLowerCase();
      if (subAction === 'add') {
        const target = message.mentions.users.first();
        if (!target) return message.reply("Please mention a user to add as supervisor: `!supervisor add @user`");
        cohortManager.addSupervisor(guildId, target.id);
        return message.reply({ embeds: [Embeds.success("Supervisor Added", `Added <@${target.id}> to supervisor roster for this server.`)] });
      } else if (subAction === 'remove') {
        const target = message.mentions.users.first();
        if (!target) return message.reply("Please mention a user to remove: `!supervisor remove @user`");
        cohortManager.removeSupervisor(guildId, target.id);
        return message.reply({ embeds: [Embeds.success("Supervisor Removed", `Removed <@${target.id}> from supervisor roster.`)] });
      } else {
        const cohort = cohortManager.getCohort(guildId);
        const list = (cohort.supervisors || []).map(id => `• <@${id}>`).join('\n') || "No explicit supervisor IDs saved (Administrators/Mentors have access).";
        return message.reply({ embeds: [Embeds.info("Current Supervisors", list)] });
      }
    }

    // --- !forwarder ---
    if (commandName === 'forwarder') {
      const subAction = args[0]?.toLowerCase();
      const cohort = cohortManager.getCohort(guildId);

      if (subAction === 'start') {
        cohort.forwarder = cohort.forwarder || {};
        cohort.forwarder.enabled = true;
        cohortManager.setCohort(guildId, cohort);
        return message.reply({ embeds: [Embeds.success("Forwarder Started", "Job post forwarding is now **ON**.")] });
      } else if (subAction === 'stop') {
        cohort.forwarder = cohort.forwarder || {};
        cohort.forwarder.enabled = false;
        cohortManager.setCohort(guildId, cohort);
        return message.reply({ embeds: [Embeds.warning("Forwarder Stopped", "Job post forwarding is now **OFF**.")] });
      } else if (subAction === 'set') {
        const srcId = args[1];
        const dstId = args[2];
        if (!srcId || !dstId) return message.reply("Usage: `!forwarder set <sourceChannelId> <destChannelId>`");

        cohort.forwarder = {
          enabled: false, // Default to OFF until explicitly started
          sourceChannelId: srcId,
          destChannelId: dstId
        };
        cohortManager.setCohort(guildId, cohort);
        return message.reply({
          embeds: [Embeds.success("Forwarder Route Configured", `Source: <#${srcId}>\nDestination: <#${dstId}>\nStatus: **OFF** (Run \`!forwarder start\` to enable).`)]
        });
      } else {
        const f = cohort.forwarder || {};
        return message.reply({
          embeds: [Embeds.info("Forwarder Status", `• **Enabled:** ${f.enabled ? '✅ ON' : '❌ OFF'}\n• **Source Channel:** ${f.sourceChannelId ? `<#${f.sourceChannelId}>` : 'Not set'}\n• **Dest Channel:** ${f.destChannelId ? `<#${f.destChannelId}>` : 'Not set'}`)]
        });
      }
    }

    // --- !audit ---
    if (commandName === 'audit') {
      const loading = await message.reply("🔍 Running two-way identity audit (Discord Members ↔ Sheet)...");
      try {
        const roster = await GasClient.getRoster(guildId);
        const students = roster.students || [];

        const members = await message.guild.members.fetch();
        const nonBotMembers = members.filter(m => !m.user.bot);

        const mappedDiscordIds = new Set(students.map(s => s.discordId));
        const unmappedMembers = nonBotMembers.filter(m => !mappedDiscordIds.has(m.id));

        const embed = Embeds.info(
          "Two-Way Identity Audit Report",
          `• **Total Server Members:** ${nonBotMembers.size}\n• **Mapped Students in Sheet:** ${students.length}\n• **Unmapped Discord Members:** ${unmappedMembers.size}\n\n${unmappedMembers.size > 0 ? `**Unmapped Members:**\n${unmappedMembers.map(m => `• <@${m.id}> (${m.user.tag})`).slice(0, 15).join('\n')}` : '✅ All Discord members mapped in Bot_Map!'}`
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Audit Error", err.message)] });
      }
      return;
    }

    // --- !cohorts ---
    const allCohorts = cohortManager.getAllCohorts();
    const listStr = allCohorts.map(c => `• **${c.name}** (\`${c.serverId}\`): ${c.gasUrl ? 'Connected' : 'No Gas URL'}`).join('\n') || "No cohorts registered.";
    message.reply({ embeds: [Embeds.info("Cohort Registry", listStr)] });
  }
};
