/**
 * Command: !settarget, !target, !jobtarget, !dailytarget
 * Customizes the daily mandatory job application target for the cohort
 */

const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'settarget',
  aliases: ['target', 'jobtarget', 'dailytarget', 'setjobtarget'],
  description: 'Customizes the daily mandatory job application target for this server',
  usage: '!settarget <number_of_applications>',
  mentorOnly: true,

  async execute(message, args, client) {
    const guildId = message.guild.id;

    if (args.length === 0) {
      const scoring = cohortManager.getCohortScoring(guildId);
      return message.reply({
        embeds: [Embeds.info(
          "Daily Job Application Target",
          `• 💼 **Current Daily Target:** **${scoring.jobTarget} Applications/day**\n\n` +
          `**How to customize:**\n` +
          `• \`!settarget 12\` *(Sets daily target to 12 applications)*\n` +
          `• \`!settarget 15\` *(Sets daily target to 15 applications)*`
        )]
      });
    }

    const newTarget = parseInt(args[0], 10);
    if (isNaN(newTarget) || newTarget <= 0) {
      return message.reply({
        embeds: [Embeds.warning(
          "Invalid Target",
          "Please specify a valid positive number for the daily application target.\nExample: `!settarget 12`"
        )]
      });
    }

    const updated = cohortManager.updateCohortScoring(guildId, { jobTarget: newTarget });

    return message.reply({
      embeds: [Embeds.success(
        "Daily Job Target Updated! 💼",
        `✅ Successfully set the daily job application target to **\`${updated.jobTarget} applications/day\`**.\n\n` +
        `• 🎯 **100% Met (${updated.jobTarget}+):** \`+2.0 pts\`\n` +
        `• 🌟 **Super Target (> ${updated.jobTarget}):** \`+3.0 pts\`\n` +
        `• 📊 **80% to 99%:** \`+1.5 pts\`\n` +
        `• ⚠️ **Below 60%:** \`-0.5 pt penalty\`\n\n` +
        `*The automated 23:30 daily audit will evaluate all student job sheets against this new target.*`,
        `JP ADMIN ${constants.BOT_VERSION} · Target Configuration`
      )]
    });
  }
};
