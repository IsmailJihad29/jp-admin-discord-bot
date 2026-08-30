/**
 * JP ADMIN — Command Router & Dispatcher
 */

const fs = require('fs');
const path = require('path');
const cohortManager = require('../config/cohortManager');
const Embeds = require('../utils/embedBuilder');
const Logger = require('../utils/logger');

class CommandHandler {
  constructor() {
    this.commands = new Map();
    this.catalog = [];
    this.loadCommands();
  }

  loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    if (!fs.existsSync(commandsPath)) return;

    const categories = fs.readdirSync(commandsPath);
    for (const category of categories) {
      const catPath = path.join(commandsPath, category);
      if (fs.statSync(catPath).isDirectory()) {
        const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
          try {
            const command = require(path.join(catPath, file));
            if (command.name) {
              this.commands.set(command.name.toLowerCase(), command);
              if (command.aliases && Array.isArray(command.aliases)) {
                command.aliases.forEach(a => this.commands.set(a.toLowerCase(), command));
              }
              this.catalog.push({
                name: command.name,
                category: category,
                description: command.description || "No description provided",
                usage: command.usage || `!${command.name}`,
                supervisorOnly: command.supervisorOnly !== false
              });
            }
          } catch (err) {
            Logger.error(`Failed to load command ${file}:`, err.message);
          }
        }
      }
    }
    Logger.info(`Loaded ${this.commands.size} command handlers across ${categories.length} categories.`);
  }

  async handle(message, client) {
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = this.commands.get(commandName);
    if (!command) return;

    // Check Role-Based Permissions
    const isStaff = cohortManager.isStaff(message.guild.id, message.member);

    // Commands that are explicitly public (any student can use)
    const PUBLIC_COMMANDS = new Set([
      'leave', 'myleave', 'submit', 'myhealth', 'myprofile', 'mystatus', 'me',
      'healthcheck', 'linksheet', 'mysheet', 'trackersheet', 'jobsheet', 'mytracker', 'help'
    ]);

    if (command.supervisorOnly === true || command.ownerOnly === true) {
      const isSupervisor = cohortManager.isSupervisor(message.guild.id, message.member);
      if (!isSupervisor) {
        return message.reply({
          embeds: [Embeds.warning(
            "⚠️ Access Denied",
            `Hello <@${message.author.id}>, **you are not allowed to use this command.**\n\n` +
            `This command (\`!${commandName}\`) is strictly restricted to **Supervisors & Administrators** only.\n\n` +
            `💡 *Students can use commands like \`!leave\`, \`!submit\`, \`!myhealth\`, \`!linksheet\`, and \`!help\`.*`
          )]
        });
      }
    } else if (!PUBLIC_COMMANDS.has(commandName) && (command.mentorOnly === true || command.supervisorOnly !== false)) {
      const isMentor = cohortManager.isMentor(message.guild.id, message.member);
      if (!isMentor) {
        return message.reply({
          embeds: [Embeds.warning(
            "⚠️ Access Denied",
            `Hello <@${message.author.id}>, **you are not allowed to use this command.**\n\n` +
            `This command (\`!${commandName}\`) is strictly restricted to **Mentors & Supervisors** only.\n\n` +
            `💡 *Students can use commands like \`!leave\`, \`!submit\`, \`!myhealth\`, \`!linksheet\`, and \`!help\`.*`
          )]
        });
      }
    }

    // Check Student Channel Enforcement for Non-Staff Members
    if (!isStaff) {
      const ChannelHelper = require('../utils/channelHelper');
      const STUDENT_CHANNEL_MAPPINGS = {
        // Health Check & Scorecard
        'myhealth': { key: 'HEALTH_CHECK', fallbackName: 'dev-health-check', purpose: 'viewing your personal health scorecard' },
        'myprofile': { key: 'HEALTH_CHECK', fallbackName: 'dev-health-check', purpose: 'viewing your student profile' },
        'mystatus': { key: 'HEALTH_CHECK', fallbackName: 'dev-health-check', purpose: 'viewing your status' },
        'healthcheck': { key: 'HEALTH_CHECK', fallbackName: 'dev-health-check', purpose: 'diagnosing your performance' },
        'me': { key: 'HEALTH_CHECK', fallbackName: 'dev-health-check', purpose: 'checking your health stats' },

        // Job Tracker Sheet Linking
        'linksheet': { key: 'JOB_TRACKING', fallbackName: 'job-tracker', purpose: 'linking your personal job tracker sheet' },
        'mysheet': { key: 'JOB_TRACKING', fallbackName: 'job-tracker', purpose: 'inspecting your linked job tracker' },
        'trackersheet': { key: 'JOB_TRACKING', fallbackName: 'job-tracker', purpose: 'linking your job tracker' },
        'jobsheet': { key: 'JOB_TRACKING', fallbackName: 'job-tracker', purpose: 'managing your job sheet' },
        'mytracker': { key: 'JOB_TRACKING', fallbackName: 'job-tracker', purpose: 'managing your application tracker' },

        // Leave Requests
        'leave': { key: 'LEAVE_REQUEST', fallbackName: 'leave-request', purpose: 'submitting a leave application' },
        'myleave': { key: 'LEAVE_REQUEST', fallbackName: 'leave-request', purpose: 'checking your leave status' },

        // Job Task Submissions
        'submit': { key: 'JOB_TASK', fallbackName: 'jobs-task-updates', purpose: 'submitting hiring task assignments' }

        // NOTE: Leaderboard commands have NO channel restriction — students can view from anywhere.
      };

      const mapping = STUDENT_CHANNEL_MAPPINGS[commandName];
      if (mapping) {
        const isCorrectChannel = ChannelHelper.isChannel(message.channel, mapping.key);
        if (!isCorrectChannel) {
          const targetChannel = ChannelHelper.findChannel(message.guild, mapping.key);
          const channelMention = targetChannel ? `<#${targetChannel.id}>` : `\`#${mapping.fallbackName}\``;

          return message.reply({
            embeds: [Embeds.warning(
              "⚠️ Wrong Channel!",
              `Hello <@${message.author.id}>, the \`!${commandName}\` command cannot be used here.\n\n` +
              `👉 **Please use this command in ${channelMention} for ${mapping.purpose}.**`
            )]
          });
        }
      }
    }

    try {
      await command.execute(message, args, client, this);
    } catch (err) {
      Logger.error(`Error executing command !${commandName}:`, err);
      message.reply({
        embeds: [Embeds.error("Execution Error", `An error occurred while executing \`!${commandName}\`: ${err.message}`)]
      }).catch(() => {});
    }
  }

  getCatalog() {
    return this.catalog;
  }
}

module.exports = CommandHandler;
