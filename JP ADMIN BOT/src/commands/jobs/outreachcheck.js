/**
 * Commands: !outreachcheck, !backfilloutreach, !backfillinterviews, !backfilljobsheets
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'outreachcheck',
  aliases: ['backfilloutreach', 'backfillinterviews', 'backfilljobsheets'],
  description: 'Check outreach updates and backfill immutable message history into Google Sheets',
  usage: '!outreachcheck | !backfilloutreach | !backfillinterviews | !backfilljobsheets',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    if (commandName === 'backfilloutreach') {
      const loading = await message.reply("🔄 Backfilling immutable message history from `#outreach-update`...");
      try {
        const channel = guild.channels.cache.find(c => constants.CHANNELS.OUTREACH_UPDATE.includes(c.name.toLowerCase()));
        if (!channel) return loading.edit("❌ Outreach channel not found.");

        const messages = await channel.messages.fetch({ limit: 100 });
        let imported = 0;

        for (const msg of messages.values()) {
          if (!msg.author.bot) {
            await GasClient.recordOutreachDaily(guild.id, {
              date: DateTimeUtil.getTodayDateStr(),
              discordId: msg.author.id,
              name: msg.author.displayName || msg.author.username,
              messageId: msg.id,
              count: 1
            }).catch(() => {});
            imported++;
          }
        }

        await loading.edit({
          content: null,
          embeds: [Embeds.success("Outreach History Backfilled", `Imported **${imported}** messages into \`Outreach_Daily\` and matrix view.`)]
        });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Backfill Error", err.message)] });
      }
      return;
    }

    if (commandName === 'backfillinterviews') {
      const loading = await message.reply("🔄 Backfilling interview messages from `#interview-update`...");
      try {
        const channel = guild.channels.cache.find(c => c.name.toLowerCase() === constants.CHANNELS.INTERVIEW_UPDATE);
        if (!channel) return loading.edit("❌ Interview update channel not found.");

        const messages = await channel.messages.fetch({ limit: 100 });
        let imported = 0;

        for (const msg of messages.values()) {
          if (!msg.author.bot) {
            await GasClient.recordInterview(guild.id, {
              name: msg.author.displayName || msg.author.username,
              discordId: msg.author.id,
              company: "Imported from Discord",
              serial: 1,
              interviewDate: DateTimeUtil.getTodayDateStr(),
              roleDetails: msg.content.substring(0, 100),
              discordLink: msg.url
            }).catch(() => {});
            imported++;
          }
        }

        await loading.edit({
          content: null,
          embeds: [Embeds.success("Interviews Backfilled", `Imported **${imported}** interviews into \`Interview_Log\` and updates matrix.`)]
        });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Backfill Error", err.message)] });
      }
      return;
    }

    // Default !outreachcheck
    const loading = await message.reply("📊 Checking today's outreach posts...");
    try {
      const res = await GasClient.getOutreachDaily(guild.id, 1);
      const posts = res.outreach || [];

      const embed = Embeds.info(
        `Daily Outreach Check · ${DateTimeUtil.getTodayDateStr()}`,
        `• **Total Outreach Posts Today:** **${posts.length}**\n• **Active Students Logged:** ${new Set(posts.map(p => p.discordId)).size}`
      );

      await loading.edit({ content: null, embeds: [embed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
    }
  }
};
