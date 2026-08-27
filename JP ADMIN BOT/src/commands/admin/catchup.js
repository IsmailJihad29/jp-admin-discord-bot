/**
 * Command: !catchup, !scanpending, !backlog
 * Scans channels for unhandled commands, interview prep posts, job tasks, and sheet links
 * that were sent while the bot was offline, and executes them automatically.
 */

const CatchupService = require('../../services/catchupService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'catchup',
  aliases: ['scanpending', 'processpending', 'backlog', 'catchuppending'],
  description: 'Scans and processes any pending commands or posts sent while the bot was offline',
  usage: '!catchup [hours (default: 24)]',
  supervisorOnly: true,

  async execute(message, args, client, commandHandler) {
    const hours = parseInt(args[0], 10) || 24;

    const progressMsg = await message.reply(
      `🔄 **Scanning channels for pending commands and posts from the last ${hours} hour(s)...**\n*Processing missed commands, interview updates, job tasks, and sheet links...*`
    );

    try {
      const stats = await CatchupService.processGuildBacklog(message.guild, client, commandHandler, {
        maxAgeHours: hours,
        messageLimit: 100
      });

      const totalItems = stats.commandsProcessed + stats.interviewsProcessed + stats.jobTasksProcessed + stats.jobSheetsProcessed;

      const embed = Embeds.success(
        `Offline Backlog Catchup Completed! 🚀`,
        `✅ **Scanned \`${stats.channelsScanned}\` channels across the server (Past ${hours} hours)**\n\n` +
        `• ⚡ **Pending \`!\` Commands Executed:** **${stats.commandsProcessed}**\n` +
        `• 🎯 **Interview Posts Processed & Scored:** **${stats.interviewsProcessed}**\n` +
        `• 🛠️ **Job Task Announcements Logged:** **${stats.jobTasksProcessed}**\n` +
        `• 📊 **Job Tracker Sheets Registered:** **${stats.jobSheetsProcessed}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        (totalItems > 0 
          ? `🎉 **Total \`${totalItems}\` pending items were resolved successfully!**` 
          : `✨ *No unhandled or missed commands were found in the specified timeframe.*`),
        `JP ADMIN ${constants.BOT_VERSION} · Auto-Catchup Engine`
      );

      await progressMsg.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await progressMsg.edit({
        content: null,
        embeds: [Embeds.error("Catchup Error", `An error occurred while running backlog catchup:\n\`${err.message}\``)]
      });
    }
  }
};
