/**
 * Command: !setchannel
 * Map custom channels to bot operations
 */

const cohortManager = require('../../config/cohortManager');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'setchannel',
  aliases: ['channels', 'channelmap'],
  description: 'View or map existing server channels to bot features',
  usage: '!setchannel <feature> <#channel> | !setchannel list',
  supervisorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const cohort = cohortManager.getCohort(guild.id);
    cohort.customChannels = cohort.customChannels || {};

    const subAction = args[0]?.toLowerCase();

    // Map a feature to a mentioned channel
    if (subAction && args.length >= 2) {
      const featureKey = subAction.toUpperCase();
      const targetChannel = message.mentions.channels.first() || guild.channels.cache.get(args[1]);

      if (!targetChannel) {
        return message.reply("Please mention a valid channel: `!setchannel interview #interview-task-updates`");
      }

      cohort.customChannels[featureKey] = targetChannel.id;
      cohortManager.setCohort(guild.id, cohort);

      return message.reply({
        embeds: [Embeds.success("Channel Mapped", `Feature **${featureKey}** is now linked to <#${targetChannel.id}>.`)]
      });
    }

    // List all detected / mapped channels in this server
    const keys = Object.keys(constants.CHANNELS);
    const mappingLines = keys.map(k => {
      const found = ChannelHelper.findChannel(guild, k);
      return `• **${k}:** ${found ? `<#${found.id}> (\`${found.name}\`)` : '⚠️ *Not found*'}`;
    });

    const embed = Embeds.info(
      `Detected Channels in Server: ${guild.name}`,
      `The bot automatically detects your channels (even with emojis and custom prefixes):\n\n${mappingLines.join('\n')}\n\n*To manually link a channel, use:*\n\`!setchannel <KEY> <#channel>\``
    );

    message.reply({ embeds: [embed] });
  }
};
