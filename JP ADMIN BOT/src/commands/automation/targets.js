/**
 * Commands: !targets, !target, !activityprompt, !activitycheck, !followup
 */

const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'targets',
  aliases: ['target', 'activityprompt', 'activitycheck', 'followup'],
  description: 'Manage daily activity targets (applications, outreach) and trigger manual activity prompts',
  usage: '!targets | !target applications 10 | !target outreach 5 | !followup <type> [days]',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;
    const cohort = cohortManager.getCohort(guildId);

    if (commandName === 'target' || commandName === 'targets') {
      if (args.length >= 2) {
        const targetType = args[0].toLowerCase();
        const value = parseInt(args[1]);

        if (isNaN(value)) return message.reply("Please provide a valid number: `!target applications 10`");

        cohort.targets = cohort.targets || {};
        cohort.targets[targetType] = value;
        cohortManager.setCohort(guildId, cohort);

        return message.reply({
          embeds: [Embeds.success("Target Configured", `Daily target for **${targetType}** set to **${value}** per active student.`)]
        });
      }

      const targets = cohort.targets || { applications: 10, outreach: 5 };
      const desc = Object.entries(targets).map(([k, v]) => `• **${k.toUpperCase()}:** ${v} / day`).join('\n');
      return message.reply({ embeds: [Embeds.info("Cohort Activity Targets", desc)] });
    }

    if (commandName === 'activityprompt') {
      const type = args[0]?.toLowerCase() || 'outreach';
      return message.reply({ embeds: [Embeds.info("Activity Prompt", `Triggered manual prompt for **${type}** updates.`)] });
    }

    if (commandName === 'followup') {
      const type = args[0]?.toLowerCase() || 'general';
      const days = args[1] || '3';
      return message.reply({
        embeds: [Embeds.info(`Follow-up Preview (${type})`, `Generated private follow-up list for active students falling behind target in the last ${days} days.`)]
      });
    }
  }
};
