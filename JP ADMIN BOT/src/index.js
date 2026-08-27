/**
 * =========================================================================
 * JP ADMIN — EJP Mentorship Bot & Automation System
 * Version: v3.29 (bot) / v49 (expected Apps Script backend)
 * High-Availability & 24/7 Uptime Core
 * =========================================================================
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');

const constants = require('./config/constants');
const Logger = require('./utils/logger');
const CommandHandler = require('./handlers/commandHandler');
const MessageHandler = require('./handlers/messageHandler');
const InteractionHandler = require('./handlers/interactionHandler');
const ForwarderService = require('./services/forwarderService');
const CatchupService = require('./services/catchupService');
const Scheduler = require('./services/scheduler');
const DateTimeUtil = require('./utils/dateTime');

// 1. Express Health Check & Keepalive Server (Prevents Render / Cloud Sleeper)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    bot: 'JP ADMIN Mentorship Bot',
    version: constants.BOT_VERSION,
    gasVersion: constants.EXPECTED_GAS_VERSION,
    discordConnected: client.isReady(),
    time: DateTimeUtil.getFullTimestamp(),
    timezone: 'Asia/Dhaka',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', ready: client.isReady() });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => {
  Logger.info(`Uptime & Health server active on port ${PORT}`);
});

// Self-Keepalive Pinger (For free tier hosts like Render to prevent sleep)
const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || process.env.HOST_URL;
if (externalUrl) {
  Logger.info(`Self-keepalive configured for: ${externalUrl}`);
  setInterval(async () => {
    try {
      await axios.get(`${externalUrl}/health`, { timeout: 8000 });
      Logger.debug('Keepalive ping successful.');
    } catch (err) {
      Logger.debug('Keepalive ping note:', err.message);
    }
  }, 4 * 60 * 1000); // Ping every 4 minutes (Render sleeps at 15 mins)
}

// 2. Initialize Discord Client with Resilient Gateway Settings
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ],
  ws: {
    properties: {
      browser: 'Discord iOS' // Mobile gateway property often has lower idle drop rate
    }
  }
});

const commandHandler = new CommandHandler();

// Presence Refresh Helper
function refreshPresence() {
  if (client.isReady() && client.user) {
    try {
      client.user.setPresence({
        activities: [{ name: '!help · Command Center', type: ActivityType.Listening }],
        status: 'online'
      });
      Logger.debug('Discord presence refreshed: ONLINE.');
    } catch (err) {
      Logger.error('Failed to set presence:', err.message);
    }
  }
}

// 3. Client Gateway & Lifecycle Events
client.once('ready', () => {
  Logger.info(`🚀 Logged in as ${client.user.tag} (ID: ${client.user.id})`);
  Logger.info(`Running JP ADMIN ${constants.BOT_VERSION} · Target GAS Backend: ${constants.EXPECTED_GAS_VERSION}`);

  refreshPresence();

  // Keep presence strictly active every 5 minutes
  setInterval(refreshPresence, 5 * 60 * 1000);

  // Initialize Automation Timeline Scheduler
  Scheduler.init(client);

  // Auto-Catchup: Process pending commands & posts sent while bot was offline
  setTimeout(async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        await CatchupService.processGuildBacklog(guild, client, commandHandler, { maxAgeHours: 24, messageLimit: 50 });
      }
    } catch (e) {
      Logger.error('Startup backlog catchup error:', e.message);
    }
  }, 5000);
});

client.on('messageCreate', async (message) => {
  await MessageHandler.handle(message, client, commandHandler);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  await ForwarderService.handleMessageEdit(oldMessage, newMessage, client);
});

client.on('interactionCreate', async (interaction) => {
  await InteractionHandler.handle(interaction, client);
});

// Gateway Disconnect & Auto-Recovery Handlers
client.on('shardDisconnect', (event, id) => {
  Logger.warn(`⚠️ Shard ${id} disconnected from Discord Gateway (Code: ${event.code}). Auto-reconnecting...`);
});

client.on('shardReconnecting', (id) => {
  Logger.info(`🔄 Shard ${id} reconnecting to Discord Gateway...`);
});

client.on('shardResume', (id, replayedEvents) => {
  Logger.info(`✅ Shard ${id} connection resumed (${replayedEvents} events replayed).`);
  refreshPresence();
});

client.on('shardError', (error, id) => {
  Logger.error(`Shard ${id} encountered error:`, error.message);
});

client.on('error', (error) => {
  Logger.error('Discord client error:', error.message);
});

client.on('warn', (warning) => {
  Logger.warn('Discord client warning:', warning);
});

// Global Error Catchers (Prevent Process Crashes)
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception thrown:', err);
});

process.on('SIGINT', () => {
  Logger.info('Bot process terminating (SIGINT)...');
  if (client.isReady()) client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.info('Bot process terminating (SIGTERM)...');
  if (client.isReady()) client.destroy();
  process.exit(0);
});

// 4. Connection & Login Watchdog
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'your_discord_bot_token_here') {
  Logger.warn('DISCORD_TOKEN is not set in .env. Bot will not connect to Discord until configured.');
} else {
  let reconnectAttempts = 0;

  async function connectDiscord() {
    try {
      Logger.info('Connecting to Discord Gateway...');
      await client.login(token);
      reconnectAttempts = 0;
    } catch (err) {
      reconnectAttempts++;
      const waitTime = Math.min(reconnectAttempts * 5, 60);
      Logger.error(`Login failed: ${err.message}. Retrying in ${waitTime}s (Attempt ${reconnectAttempts})...`);
      setTimeout(connectDiscord, waitTime * 1000);
    }
  }

  connectDiscord();
}
