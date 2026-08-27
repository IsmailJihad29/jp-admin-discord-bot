/**
 * Commands: !control, !automation, !time, !times, !schedule
 */

const cohortManager = require('../../config/cohortManager');
const constants = require('../../config/constants');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'control',
  aliases: ['automation', 'time', 'times', 'schedule'],
  description: 'Control automated schedules, clock overrides, and timeline tasks',
  usage: '!control | !automation start/stop <key> | !time <key> <HH:MM> | !schedule <key> <days>',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;
    const cohort = cohortManager.getCohort(guildId);

    if (commandName === 'time' || commandName === 'times') {
      if (args.length >= 2) {
        const key = args[0].toLowerCase();
        const timeVal = args[1];
        cohort.scheduleOverrides = cohort.scheduleOverrides || {};
        cohort.scheduleOverrides[key] = timeVal;
        cohortManager.setCohort(guildId, cohort);
        return message.reply({ embeds: [Embeds.success("Schedule Updated", `Set clock for \`${key}\` to **${timeVal}** Asia/Dhaka.`)] });
      }

      // Display all schedule times
      const sched = { ...constants.DEFAULT_SCHEDULE, ...(cohort.scheduleOverrides || {}) };
      const lines = Object.entries(sched).map(([k, v]) => `• **${k}:** \`${v}\``).join('\n');
      return message.reply({ embeds: [Embeds.info("Daily Automation Schedule (Asia/Dhaka)", lines)] });
    }

    if (commandName === 'schedule') {
      const key = args[0]?.toLowerCase();
      const days = args[1]?.toLowerCase();
      if (!key || !days) return message.reply("Usage: `!schedule <key> <sun-thu | fri-sat | thu | everyday>`");

      cohort.daySchedules = cohort.daySchedules || {};
      cohort.daySchedules[key] = days;
      cohortManager.setCohort(guildId, cohort);

      return message.reply({ embeds: [Embeds.success("Days Configured", `Automation \`${key}\` set to run on: **${days}**.`)] });
    }

    if (commandName === 'automation') {
      const action = args[0]?.toLowerCase();
      const key = args[1]?.toLowerCase() || 'all';

      cohort.automation = cohort.automation || { enabled: true };

      if (action === 'start') {
        cohort.automation[key] = true;
        cohortManager.setCohort(guildId, cohort);
        return message.reply({ embeds: [Embeds.success("Automation Started", `Automation **${key}** is now enabled.`)] });
      } else if (action === 'stop') {
        cohort.automation[key] = false;
        cohortManager.setCohort(guildId, cohort);
        return message.reply({ embeds: [Embeds.warning("Automation Stopped", `Automation **${key}** is now paused.`)] });
      }
    }

    // Default !control overview
    const embed = Embeds.info(
      "Automation Control Center",
      `• **Timezone:** \`${cohort.timezone || 'Asia/Dhaka'}\`\n• **Active Window:** \`${cohort.automation?.activeWindow || '04:50-23:30'}\`\n• **Global Automation:** ${cohort.automation?.enabled !== false ? '🟢 ON' : '🔴 OFF'}\n• **Forwarder Engine:** ${cohort.forwarder?.enabled ? '🟢 ON' : '🔴 OFF'}\n\nUse \`!times\` to view schedule clocks or \`!time <key> <HH:MM>\` to adjust.`
    );
    message.reply({ embeds: [embed] });
  }
};
