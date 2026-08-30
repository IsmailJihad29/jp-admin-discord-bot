/**
 * JP ADMIN — Offline Backlog & Catchup Service
 * Scans channels for unhandled commands, interview posts, job tasks, and sheet links
 * that were sent while the bot was offline.
 */

const Logger = require('../utils/logger');
const ChannelHelper = require('../utils/channelHelper');
const MessageHandler = require('../handlers/messageHandler');

class CatchupService {
  /**
   * Scans a guild for unhandled posts and commands
   * @param {Guild} guild 
   * @param {Client} client 
   * @param {CommandHandler} commandHandler 
   * @param {Object} options { maxAgeHours: 24, messageLimit: 50 }
   * @returns {Object} summary of processed items
   */
  static async processGuildBacklog(guild, client, commandHandler, options = {}) {
    const maxAgeHours = options.maxAgeHours || 24;
    const messageLimit = options.messageLimit || 50;
    const cutoffTimestamp = Date.now() - (maxAgeHours * 60 * 60 * 1000);

    const stats = {
      commandsProcessed: 0,
      interviewsProcessed: 0,
      jobTasksProcessed: 0,
      jobSheetsProcessed: 0,
      channelsScanned: 0,
      errors: []
    };

    if (!guild || !guild.channels) return stats;

    Logger.info(`[CatchupService] Starting backlog scan for guild: ${guild.name} (Max Age: ${maxAgeHours}h)`);

    // Find all text channels where bot has permissions to read and send messages
    const textChannels = Array.from(guild.channels.cache.values()).filter(ch => {
      if (ch.type !== 0) return false; // 0 = GuildText
      const perms = ch.permissionsFor(guild.members.me);
      return perms && perms.has('ViewChannel') && perms.has('ReadMessageHistory') && perms.has('SendMessages');
    });

    for (const channel of textChannels) {
      try {
        stats.channelsScanned++;
        const fetchedMessages = await channel.messages.fetch({ limit: messageLimit }).catch(() => null);
        if (!fetchedMessages || fetchedMessages.size === 0) continue;

        // Sort messages chronologically (oldest to newest)
        const messagesArray = Array.from(fetchedMessages.values())
          .filter(m => !m.author.bot && m.createdTimestamp >= cutoffTimestamp)
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const message of messagesArray) {
          try {
            // Check if bot already reacted or replied to this message
            const botEmojis = ['📝', '✅', '⏳', '⚠️', '🎯', '🛠️', '📊', '👀'];
            const hasBotEmojiReaction = message.reactions.cache.some(r => botEmojis.includes(r.emoji.name) || r.me || r.users.cache.has(client.user.id));
            const hasBotReply = fetchedMessages.some(m => (m.reference?.messageId === message.id || m.interaction?.user?.id === message.author.id) && m.author.id === client.user.id);

            if (hasBotEmojiReaction || hasBotReply) {
              continue; // Already handled
            }

            const content = message.content.trim();

            // 1. Process #interview-preparation posts
            if (ChannelHelper.isChannel(channel, 'INTERVIEW_UPDATE')) {
              Logger.info(`[CatchupService] Catching up interview post from ${message.author.tag} in #${channel.name}`);
              await MessageHandler.handleInterviewPost(message);
              stats.interviewsProcessed++;
              await this.sleep(800);
              continue;
            }

            // 2. Process #job-task-update posts
            if (ChannelHelper.isChannel(channel, 'JOB_TASK')) {
              if (content.startsWith('!')) {
                // If it's a command like !submit, handle as command
                Logger.info(`[CatchupService] Catching up command '${content}' from ${message.author.tag} in #${channel.name}`);
                await commandHandler.handle(message, client);
                stats.commandsProcessed++;
                await this.sleep(800);
              } else {
                Logger.info(`[CatchupService] Catching up job task post from ${message.author.tag} in #${channel.name}`);
                await MessageHandler.handleJobTaskPost(message);
                stats.jobTasksProcessed++;
                await this.sleep(800);
              }
              continue;
            }

            // 3. Process #job-tracking sheet links
            if (ChannelHelper.isChannel(channel, 'JOB_TRACKING')) {
              if (content.startsWith('!')) {
                Logger.info(`[CatchupService] Catching up command '${content}' from ${message.author.tag} in #${channel.name}`);
                await commandHandler.handle(message, client);
                stats.commandsProcessed++;
                await this.sleep(800);
              } else {
                Logger.info(`[CatchupService] Catching up job sheet link from ${message.author.tag} in #${channel.name}`);
                await MessageHandler.handleJobSheetPost(message);
                stats.jobSheetsProcessed++;
                await this.sleep(800);
              }
              continue;
            }

            // 4. Process #leave-request posts
            if (ChannelHelper.isChannel(channel, 'LEAVE_REQUEST')) {
              if (content.startsWith('!')) {
                Logger.info(`[CatchupService] Catching up command '${content}' from ${message.author.tag} in #${channel.name}`);
                await commandHandler.handle(message, client);
                stats.commandsProcessed++;
                await this.sleep(800);
              } else {
                // Check if this student already has a recorded leave in database
                const leavesRes = await GasClient.getLeaves(guild.id).catch(() => ({ leaves: [] }));
                const leavesList = leavesRes.leaves || [];
                const existing = leavesList.find(l => l.discordId === message.author.id);
                if (existing) {
                  const st = String(existing.status || "").toUpperCase();
                  if (st === 'APPROVED') {
                    message.react('✅').catch(() => {});
                    continue; // Already approved in database, skip re-posting under review
                  } else if (st === 'PENDING') {
                    message.react('⏳').catch(() => {});
                    continue; // Already in review, skip re-posting
                  }
                }

                Logger.info(`[CatchupService] Catching up leave request post from ${message.author.tag} in #${channel.name}`);
                await MessageHandler.handleLeavePost(message);
                stats.commandsProcessed++;
                await this.sleep(800);
              }
              continue;
            }

            // Note: Prefix commands starting with '!' are on-demand user actions
            // and should NOT be re-executed during backlog scan to prevent duplicate responses.
          } catch (err) {
            Logger.error(`[CatchupService] Error processing message ${message.id}:`, err.message);
            stats.errors.push(`Msg ${message.id}: ${err.message}`);
          }
        }
      } catch (err) {
        Logger.error(`[CatchupService] Error scanning channel #${channel.name}:`, err.message);
      }
    }

    Logger.info(`[CatchupService] Backlog scan complete. Interviews: ${stats.interviewsProcessed}, Tasks: ${stats.jobTasksProcessed}, Sheets: ${stats.jobSheetsProcessed}`);
    return stats;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CatchupService;
