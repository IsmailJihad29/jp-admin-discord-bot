/**
 * =========================================================================
 * JP ADMIN — EJP Mentorship Bot & Automation System
 * Version: v3.29 (bot) / v47 (expected Apps Script backend)
 * =========================================================================
 */

require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');

const constants = require('./config/constants');
const Logger = require('./utils/logger');
const CommandHandler = require('./handlers/commandHandler');
const MessageHandler = require('./handlers/messageHandler');
const InteractionHandler = require('./handlers/interactionHandler');
const ForwarderService = require('./services/forwarderService');
const Scheduler = require('./services/scheduler');
const DateTimeUtil = require('./utils/dateTime');

// 1. Express Health Check Server (For Render Keepalive & Uptime Monitor)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    bot: 'JP ADMIN Mentorship Bot',
    version: constants.BOT_VERSION,
    time: DateTimeUtil.getFullTimestamp(),
    timezone: 'Asia/Dhaka'
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  Logger.info(`Render health server running on port ${PORT}`);
});

// 2. Initialize Discord Client
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
  ]
});

const commandHandler = new CommandHandler();

// 3. Client Events
client.once('ready', () => {
  Logger.info(`🚀 Logged in as ${client.user.tag} (ID: ${client.user.id})`);
  Logger.info(`Running JP ADMIN ${constants.BOT_VERSION} · Target GAS Backend: ${constants.EXPECTED_GAS_VERSION}`);

  client.user.setPresence({
    activities: [{ name: '!help · Command Center', type: ActivityType.Listening }],
    status: 'online'
  });

  // Initialize Automation Timeline Scheduler
  Scheduler.init(client);
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

// Global Error Catcher
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception thrown:', err);
});

// Login
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'your_discord_bot_token_here') {
  Logger.warn('DISCORD_TOKEN is not set in .env. Bot will not connect to Discord until configured.');
} else {
  client.login(token).catch((err) => {
    Logger.error('Failed to login to Discord:', err.message);
  });
}
