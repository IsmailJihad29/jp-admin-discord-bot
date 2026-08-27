/**
 * Commands: !help, !commands, !commandcenter
 */

const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'help',
  aliases: ['commands', 'commandcenter'],
  description: 'Opens the Command Center or displays searchable reference of all commands',
  usage: '!help [all | category | search query]',
  supervisorOnly: false,

  async execute(message, args, client, commandHandler) {
    const isAll = args[0]?.toLowerCase() === 'all';
    const catalog = commandHandler.getCatalog();

    if (isAll) {
      // Group by category
      const categories = {};
      catalog.forEach(c => {
        if (!categories[c.category]) categories[c.category] = [];
        categories[c.category].push(`\`${c.usage}\` — ${c.description}`);
      });

      const fields = Object.keys(categories).map(cat => ({
        name: `📁 ${cat.toUpperCase()}`,
        value: categories[cat].join('\n')
      }));

      const embed = Embeds.info(`JP ADMIN — Complete Command Reference (${catalog.length} Commands)`, "Reference for mentors and supervisors:")
        .addFields(fields);

      return message.reply({ embeds: [embed] });
    }

    // Search query
    if (args.length > 0) {
      const query = args.join(' ').toLowerCase();
      const results = catalog.filter(c => c.name.includes(query) || c.description.toLowerCase().includes(query));

      if (results.length === 0) {
        return message.reply(`🔍 No commands matched query: \`${query}\`. Try \`!help all\` or ask \`!jp <your task>\`.`);
      }

      const desc = results.map(r => `• **\`${r.usage}\`**\n  ${r.description}`).join('\n\n');
      const embed = Embeds.info(`Command Search Results: "${query}"`, desc);
      return message.reply({ embeds: [embed] });
    }

    // Default Command Center with category select menu
    const uniqueCategories = Array.from(new Set(catalog.map(c => c.category)));
    const options = uniqueCategories.map(cat => ({
      label: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Commands`,
      description: `View ${cat} commands and workflows`,
      value: cat
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('command_category_select')
        .setPlaceholder('📂 Select a command category to explore...')
        .addOptions(options)
    );

    const embed = Embeds.info(
      `JP ADMIN Command Center (${constants.BOT_VERSION})`,
      "Welcome to the Mentor & Supervisor Command Center.\n\n• **Search:** Type `!help <keyword>` or `!jp <natural request>`\n• **Full Reference:** Run `!help all`\n• **Diagnostic Doctor:** Run `!doctor`\n\n*Select a category below to view specific controls:*",
    );

    message.reply({ embeds: [embed], components: [row] });
  }
};
