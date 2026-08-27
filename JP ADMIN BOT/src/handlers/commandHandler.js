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

    // Check Supervisor permissions
    if (command.supervisorOnly !== false) {
      const isSupervisor = cohortManager.isSupervisor(message.guild.id, message.member);
      if (!isSupervisor) {
        return message.reply({
          embeds: [Embeds.error("Access Denied", "This command is restricted to authorized Mentors & Supervisors.")]
        });
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
