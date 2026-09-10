/**
 * Commands: !feature, !features, !toggle
 * Feature Management & Toggle Dashboard for JP ADMIN
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

function buildFeatureDashboard(guildId) {
  const allFeatures = cohortManager.getAllFeatures(guildId);
  const categories = {};

  allFeatures.forEach(f => {
    if (!categories[f.category]) categories[f.category] = [];
    categories[f.category].push(f);
  });

  let desc = `Configure and toggle individual bot features & automations for this server.\n\n` +
             `💡 **Commands:**\n` +
             `• \`!feature on <name>\` — Enable a feature\n` +
             `• \`!feature off <name>\` — Disable a feature\n` +
             `• \`!feature toggle <name>\` — Toggle ON / OFF\n` +
             `• \`!feature reset\` — Reset all features to default\n\n` +
             `──────────────────────────────\n`;

  for (const [catName, features] of Object.entries(categories)) {
    desc += `### ${catName}\n`;
    features.forEach(f => {
      const badge = f.enabled ? '🟢 **ON**' : '🔴 **OFF**';
      desc += `• ${badge} **${f.name}** (\`${f.key}\`)\n  ↳ *${f.description}*\n`;
    });
    desc += '\n';
  }

  const embed = Embeds.info(
    "🎛️ Bot Feature & Automation Control Panel",
    desc,
    `JP ADMIN ${constants.BOT_VERSION} · Feature Governance`
  );

  // Quick Action Buttons for high-impact features
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('feature_toggle:morning_attendance')
      .setLabel(`Morning Attendance: ${cohortManager.isFeatureEnabled(guildId, 'morning_attendance') ? 'ON 🟢' : 'OFF 🔴'}`)
      .setStyle(cohortManager.isFeatureEnabled(guildId, 'morning_attendance') ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('feature_toggle:daily_attendance')
      .setLabel(`Daily Attendance: ${cohortManager.isFeatureEnabled(guildId, 'daily_attendance') ? 'ON 🟢' : 'OFF 🔴'}`)
      .setStyle(cohortManager.isFeatureEnabled(guildId, 'daily_attendance') ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('feature_toggle:job_scraper')
      .setLabel(`Job Scraper: ${cohortManager.isFeatureEnabled(guildId, 'job_scraper') ? 'ON 🟢' : 'OFF 🔴'}`)
      .setStyle(cohortManager.isFeatureEnabled(guildId, 'job_scraper') ? ButtonStyle.Success : ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('feature_toggle:ai_feedback')
      .setLabel(`AI Feedback: ${cohortManager.isFeatureEnabled(guildId, 'ai_feedback') ? 'ON 🟢' : 'OFF 🔴'}`)
      .setStyle(cohortManager.isFeatureEnabled(guildId, 'ai_feedback') ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('feature_toggle:weekly_closing')
      .setLabel(`Weekly Closing: ${cohortManager.isFeatureEnabled(guildId, 'weekly_closing') ? 'ON 🟢' : 'OFF 🔴'}`)
      .setStyle(cohortManager.isFeatureEnabled(guildId, 'weekly_closing') ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('feature_refresh:dashboard')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = {
  name: 'feature',
  aliases: ['features', 'toggle', 'featurecontrol'],
  description: 'Control, enable, or disable individual bot features and automations',
  usage: '!features | !feature on/off/toggle <feature_name> | !feature reset',
  mentorOnly: true,
  buildFeatureDashboard,

  async execute(message, args, client) {
    const guildId = message.guild.id;
    const sub = args[0]?.toLowerCase();

    // 1. Reset all features: !feature reset
    if (sub === 'reset') {
      cohortManager.resetFeatures(guildId);
      return message.reply({
        embeds: [Embeds.success(
          "Features Reset to Default 🔄",
          "All features have been reset to their default operating states."
        )]
      });
    }

    // 2. Turn ON / Enable: !feature on <feature_name> | !feature enable <feature_name>
    if (sub === 'on' || sub === 'enable' || sub === 'start') {
      const target = args[1]?.toLowerCase();
      if (!target) {
        return message.reply("⚠️ Please specify which feature to enable. Example: `!feature on morning_attendance` or run `!features` to view list.");
      }

      const res = cohortManager.setFeature(guildId, target, true);
      if (!res) {
        return message.reply({
          embeds: [Embeds.error("Unknown Feature", `Could not find feature \`${target}\`. Run \`!features\` to see valid keys.`)]
        });
      }

      return message.reply({
        embeds: [Embeds.success(
          "Feature Enabled 🟢",
          `✅ **${res.name}** (\`${res.key}\`) is now **ENABLED**.\n• Category: *${res.category}*`
        )]
      });
    }

    // 3. Turn OFF / Disable: !feature off <feature_name> | !feature disable <feature_name>
    if (sub === 'off' || sub === 'disable' || sub === 'stop') {
      const target = args[1]?.toLowerCase();
      if (!target) {
        return message.reply("⚠️ Please specify which feature to disable. Example: `!feature off morning_attendance` or run `!features` to view list.");
      }

      const res = cohortManager.setFeature(guildId, target, false);
      if (!res) {
        return message.reply({
          embeds: [Embeds.error("Unknown Feature", `Could not find feature \`${target}\`. Run \`!features\` to see valid keys.`)]
        });
      }

      return message.reply({
        embeds: [Embeds.warning(
          "Feature Disabled 🔴",
          `⚠️ **${res.name}** (\`${res.key}\`) is now **DISABLED / PAUSED**.\n• Category: *${res.category}*`
        )]
      });
    }

    // 4. Toggle: !feature toggle <feature_name>
    if (sub === 'toggle') {
      const target = args[1]?.toLowerCase();
      if (!target) {
        return message.reply("⚠️ Please specify which feature to toggle. Example: `!feature toggle morning_attendance`.");
      }

      const res = cohortManager.toggleFeature(guildId, target);
      if (!res) {
        return message.reply({
          embeds: [Embeds.error("Unknown Feature", `Could not find feature \`${target}\`. Run \`!features\` to see valid keys.`)]
        });
      }

      return message.reply({
        embeds: [Embeds.info(
          `Feature Toggled ${res.enabled ? '🟢' : '🔴'}`,
          `**${res.name}** (\`${res.key}\`) is now **${res.enabled ? 'ENABLED 🟢' : 'DISABLED 🔴'}**.`
        )]
      });
    }

    // 5. Default: Show Dashboard
    const dashboard = buildFeatureDashboard(guildId);
    return message.reply(dashboard);
  }
};
