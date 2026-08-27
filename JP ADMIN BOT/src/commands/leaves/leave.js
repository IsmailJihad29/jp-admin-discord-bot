/**
 * Commands: !leave, !leaves
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'leave',
  aliases: ['leaves'],
  description: 'Submit a student leave request or review pending leaves as a mentor',
  usage: '!leave (students) | !leaves (mentors review list)',
  supervisorOnly: false, // Students can run !leave

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    // Student running !leave
    if (commandName === 'leave') {
      const embed = Embeds.info(
        "📝 Student Leave Request Form",
        "To request an excused absence, click the button below to open the form, or submit directly using:\n\n**Format:** `!leave <StartDate> <EndDate> <Reason>`\n*Example:* `!leave 2026-08-27 2026-08-28 Family emergency`\n\nApproved working dates will be marked as `L` in Attendance and will not trigger absence warnings."
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_leave_modal_${message.author.id}`)
          .setLabel('📝 Open Leave Request Form')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📋')
      );

      if (args.length >= 3) {
        const start = args[0];
        const end = args[1];
        const reason = args.slice(2).join(' ');

        const res = await GasClient.submitLeave(guildId, {
          discordId: message.author.id,
          name: message.author.displayName || message.author.username,
          startDate: start,
          endDate: end,
          reason: reason
        });

        return message.reply({
          embeds: [Embeds.success("Leave Request Submitted", `Your leave request (**${res.requestId}**) for **${start} to ${end}** has been sent to mentors for review.`)]
        });
      }

      return message.reply({ embeds: [embed], components: [row] });
    }

    // Supervisor running !leaves
    if (commandName === 'leaves') {
      const loading = await message.reply("📋 Fetching pending leave requests...");
      try {
        const leaveData = await GasClient.getLeaves(guildId, 'PENDING');
        const list = leaveData.leaves || [];

        if (list.length === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.success("No Pending Leaves", "All student leave requests have been reviewed!")]
          });
        }

        // Display up to 5 pending requests with interactive buttons
        for (const req of list.slice(0, 5)) {
          const reqEmbed = Embeds.warning(
            `Pending Leave Request: ${req.requestId}`,
            `• **Student:** <@${req.discordId}> (${req.name})\n• **Dates:** \`${req.startDate}\` to \`${req.endDate}\`\n• **Reason:** ${req.reason}\n• **Submitted:** ${req.timestamp}`
          );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`leave_approve_${req.requestId}`)
              .setLabel('✅ Approve')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`leave_reject_${req.requestId}`)
              .setLabel('❌ Reject')
              .setStyle(ButtonStyle.Danger)
          );

          await message.channel.send({ embeds: [reqEmbed], components: [row] });
        }

        await loading.edit({ content: `Showing **${Math.min(list.length, 5)}** of **${list.length}** pending requests.` });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
    }
  }
};
