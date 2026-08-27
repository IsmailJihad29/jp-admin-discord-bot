/**
 * JP ADMIN — Job Post Forwarder Service
 */

const Logger = require('../utils/logger');
const cohortManager = require('../config/cohortManager');

class ForwarderService {
  constructor() {
    this.forwardedMap = new Map(); // sourceMessageId -> forwardedMessageId
  }

  async handleNewMessage(message, client) {
    if (!message.guild || message.author.bot) return;

    const cohort = cohortManager.getCohort(message.guild.id);
    if (!cohort || !cohort.forwarder || !cohort.forwarder.enabled) return;

    if (message.channel.id !== cohort.forwarder.sourceChannelId) return;

    const destChannelId = cohort.forwarder.destChannelId;
    if (!destChannelId) return;

    try {
      const destChannel = await client.channels.fetch(destChannelId);
      if (!destChannel) return;

      const content = message.content;
      const files = message.attachments.map(a => a.url);

      const forwardedMsg = await destChannel.send({
        content: content ? `📢 **Forwarded Job Post:**\n\n${content}` : '📢 **Forwarded Job Post**',
        files: files,
        allowedMentions: { parse: [] } // Suppress all mentions
      });

      this.forwardedMap.set(message.id, forwardedMsg.id);
      Logger.info(`[Forwarder] Forwarded message ${message.id} -> ${forwardedMsg.id}`);
    } catch (err) {
      Logger.error(`[Forwarder] Failed to forward message ${message.id}:`, err.message);
    }
  }

  async handleMessageEdit(oldMessage, newMessage, client) {
    if (newMessage.author && newMessage.author.bot) return;
    const forwardedMsgId = this.forwardedMap.get(oldMessage.id);
    if (!forwardedMsgId) return;

    const cohort = cohortManager.getCohort(newMessage.guild?.id);
    if (!cohort || !cohort.forwarder || !cohort.forwarder.enabled) return;

    try {
      const destChannel = await client.channels.fetch(cohort.forwarder.destChannelId);
      if (!destChannel) return;

      const targetMsg = await destChannel.messages.fetch(forwardedMsgId);
      if (targetMsg) {
        await targetMsg.edit({
          content: `📢 **Forwarded Job Post (Edited):**\n\n${newMessage.content}`,
          allowedMentions: { parse: [] }
        });
        Logger.info(`[Forwarder] Synced edit for message ${oldMessage.id}`);
      }
    } catch (err) {
      Logger.error(`[Forwarder] Failed to sync edit for message ${oldMessage.id}:`, err.message);
    }
  }
}

module.exports = new ForwarderService();
