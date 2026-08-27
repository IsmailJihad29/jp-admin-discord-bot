/**
 * JP ADMIN — Channel Helper & Emoji Sanitizer Utility
 */

const constants = require('../config/constants');
const cohortManager = require('../config/cohortManager');

class ChannelHelper {
  /**
   * Cleans emojis, pipes, and extra symbols from Discord channel names
   * Example: "⭐ | referral-leaderboard" -> "referral-leaderboard"
   * Example: "🤖┃jp-admin" -> "jp-admin"
   */
  static normalize(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1FA70}-\u{1FAFF}]/gu, '') // Remove emojis
      .replace(/[|┃│｜]/g, ' ') // Replace unicode pipes with spaces
      .replace(/[^\w\s-]/gi, '') // Remove other special characters
      .replace(/^[-\s]+|[-\s]+$/g, '') // Trim leading/trailing hyphens/spaces
      .replace(/--+/g, '-') // Replace double hyphens with single
      .trim();
  }

  /**
   * Finds the best matching channel in a guild for a given logical key
   * Iterates by target priority first to ensure primary channels match over fallbacks!
   */
  static findChannel(guild, channelKey) {
    if (!guild) return null;

    const cohort = cohortManager.getCohort(guild.id);

    // 1. Check if user configured an explicit custom channel ID
    if (cohort && cohort.customChannels && cohort.customChannels[channelKey]) {
      const customCh = guild.channels.cache.get(cohort.customChannels[channelKey]);
      if (customCh) return customCh;
    }

    const aliases = constants.CHANNELS[channelKey];
    if (!aliases) return null;

    const targetList = Array.isArray(aliases) ? aliases : [aliases];

    // 2. Iterate in PRIORITY ORDER of targetList (Exact / Normalized match)
    for (const target of targetList) {
      const targetClean = this.normalize(target).toLowerCase();

      for (const channel of guild.channels.cache.values()) {
        if (channel.type !== 0) continue; // Only text channels (type 0 = GuildText)

        const rawName = channel.name.toLowerCase();
        const cleanName = this.normalize(rawName);

        if (cleanName === targetClean || rawName === targetClean) {
          return channel;
        }
      }
    }

    // 3. Substring / contains match in priority order
    for (const target of targetList) {
      const targetClean = this.normalize(target).toLowerCase();
      if (!targetClean || targetClean.length < 3) continue;

      for (const channel of guild.channels.cache.values()) {
        if (channel.type !== 0) continue;

        const cleanName = this.normalize(channel.name);
        if (cleanName.includes(targetClean) || targetClean.includes(cleanName)) {
          return channel;
        }
      }
    }

    return null;
  }

  /**
   * Matches an incoming message's channel to a logical key
   */
  static matchChannel(channelName, channelKey) {
    const aliases = constants.CHANNELS[channelKey];
    if (!aliases) return false;

    const targetList = Array.isArray(aliases) ? aliases : [aliases];
    const cleanName = this.normalize(channelName).toLowerCase();

    return targetList.some(target => {
      const targetClean = this.normalize(target).toLowerCase();
      return cleanName === targetClean || cleanName.includes(targetClean);
    });
  }

  /**
   * Helper to check if a Message object or Channel object belongs to a channelKey
   */
  static isChannel(messageOrChannel, channelKey) {
    if (!messageOrChannel) return false;
    const channel = messageOrChannel.channel || messageOrChannel;
    if (!channel || !channel.name) return false;
    return this.matchChannel(channel.name, channelKey);
  }
}

module.exports = ChannelHelper;
