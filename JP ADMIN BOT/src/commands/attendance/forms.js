/**
 * Commands: !openform, !closeform, !forms, !formstatus
 */

const constants = require('../../config/constants');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const DateTimeUtil = require('../../utils/dateTime');

let activeFormState = {
  isOpen: false,
  openedAt: null,
  formUrl: null
};

module.exports = {
  name: 'openform',
  aliases: ['closeform', 'forms', 'formstatus'],
  description: 'Controls attendance form status, closes and reconciles attendance',
  usage: '!openform [URL] | !closeform [silent] | !formstatus',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    if (commandName === 'openform') {
      const url = args[0] || "https://forms.google.com";
      activeFormState.isOpen = true;
      activeFormState.openedAt = DateTimeUtil.getFullTimestamp();
      activeFormState.formUrl = url;

      // Broadcast to #discussion
      const discussionCh = guild.channels.cache.find(c => c.name.toLowerCase() === constants.CHANNELS.DISCUSSION);
      if (discussionCh) {
        discussionCh.send({
          content: `📢 @everyone **Attendance Form is now OPEN!**\nPlease fill out your daily attendance before the session concludes:\n🔗 ${url}`
        });
      }

      return message.reply({ embeds: [Embeds.success("Attendance Form Opened", `Form broadcasted to ${discussionCh ? `<#${discussionCh.id}>` : '#discussion'}.`)] });
    }

    if (commandName === 'closeform') {
      const isSilent = args[0]?.toLowerCase() === 'silent';
      activeFormState.isOpen = false;

      const loadingMsg = await message.reply("⏳ Closing attendance form and synchronizing Sheet records...");

      try {
        const todayDate = DateTimeUtil.getTodayDateStr();
        // Read attendance records from Sheet
        const attData = await GasClient.getAttendance(guild.id);
        const rows = attData.rows || [];

        const presentList = [];
        const absentList = [];

        rows.forEach(r => {
          const mark = (r.sessions && r.sessions[todayDate]) || 'A';
          if (mark === 'P' || mark.startsWith('P ·')) {
            presentList.push(r);
          } else {
            absentList.push(r);
          }
        });

        const reportDesc = `**Session Date:** \`${todayDate}\`\n**Present:** **${presentList.length}** | **Absent:** **${absentList.length}**\n\n${
          absentList.length > 0
            ? `**Absent Students:**\n${absentList.map(a => `• <@${a.discordId}> (${a.name})`).slice(0, 20).join('\n')}`
            : '🎉 Full Attendance Today!'
        }`;

        if (!isSilent) {
          const discussionCh = guild.channels.cache.find(c => c.name.toLowerCase() === constants.CHANNELS.DISCUSSION);
          if (discussionCh) {
            discussionCh.send({
              content: "📋 @everyone **Daily Attendance Closed — Summary Report:**",
              embeds: [Embeds.info(`Attendance Report · ${todayDate}`, reportDesc)]
            });
          }
        }

        await loadingMsg.edit({
          content: null,
          embeds: [Embeds.success(`Attendance Form Closed ${isSilent ? '(Silent)' : ''}`, reportDesc)]
        });
      } catch (err) {
        await loadingMsg.edit({ content: null, embeds: [Embeds.error("Close Form Error", err.message)] });
      }
      return;
    }

    if (commandName === 'formstatus' || commandName === 'forms') {
      return message.reply({
        embeds: [Embeds.info("Attendance Form Status", `• **Status:** ${activeFormState.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}\n• **Opened At:** ${activeFormState.openedAt || 'N/A'}\n• **Form URL:** ${activeFormState.formUrl || 'Not set'}`)]
      });
    }
  }
};
