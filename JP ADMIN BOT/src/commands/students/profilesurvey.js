/**
 * Commands: !profilesurvey, !editprofile, !studentstatus, !inactivestudents, !synchiredroles
 */

const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'profilesurvey',
  aliases: ['editprofile', 'studentstatus', 'inactivestudents', 'synchiredroles'],
  description: 'Manage student profile surveys, status activations/deactivations, and hired roles',
  usage: '!profilesurvey [#channel] | !editprofile @student | !studentstatus @student active/inactive',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    // --- !profilesurvey ---
    if (commandName === 'profilesurvey') {
      const targetChannel = message.mentions.channels.first() || message.channel;
      const roster = await GasClient.getRoster(guild.id);
      const incomplete = (roster.students || []).filter(s => !s.email || !s.phone || !s.region);

      if (incomplete.length === 0) {
        return message.reply("✅ All students currently have complete profiles!");
      }

      const pings = incomplete.map(s => `<@${s.discordId}>`).join(' ');
      const embed = Embeds.warning(
        "Action Required: Complete Your Student Profile",
        "Please provide your contact info and region so your attendance, job tracker, and referrals can be logged accurately.\n\n*Click the button below to submit your details privately.*"
      );

      await targetChannel.send({
        content: `🔔 Attention ${pings}`,
        embeds: [embed]
      });

      return message.reply(`Sent survey reminder to ${targetChannel} for **${incomplete.length}** students.`);
    }

    // --- !studentstatus ---
    if (commandName === 'studentstatus') {
      const target = message.mentions.members.first();
      const newStatus = args[1]?.toLowerCase();

      if (!target || !['active', 'inactive', 'left', 'hired'].includes(newStatus)) {
        return message.reply("Usage: `!studentstatus @student <active|inactive|left|hired>`");
      }

      const loading = await message.reply(`Updating status for <@${target.id}> to \`${newStatus}\`...`);
      try {
        await GasClient.setStudentStatus(guild.id, target.id, newStatus, `Manual supervisor status update by ${message.author.tag}`);
        await loading.edit({
          content: null,
          embeds: [Embeds.success("Status Updated", `Student <@${target.id}> status is now **${newStatus.toUpperCase()}** in Bot_Map & Attendance.`)]
        });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Update Failed", err.message)] });
      }
      return;
    }

    // --- !inactivestudents ---
    if (commandName === 'inactivestudents') {
      const loading = await message.reply("🔍 Scanning for inactive students...");
      try {
        const roster = await GasClient.getRoster(guild.id);
        const inactives = (roster.students || []).filter(s => s.status !== 'active');

        const embed = Embeds.info(
          `Inactive Students List (${inactives.length})`,
          inactives.length > 0
            ? inactives.map(i => `• <@${i.discordId}> (${i.name || i.username}) — Status: \`${i.status}\``).join('\n')
            : "No inactive students on roster."
        );
        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
      return;
    }

    // --- !synchiredroles ---
    if (commandName === 'synchiredroles') {
      const loading = await message.reply("🎉 Synchronizing Hired roles and database statuses...");
      try {
        const hiredRole = guild.roles.cache.find(r => r.name.toLowerCase() === constants.ROLES.HIRED.toLowerCase());
        const roster = await GasClient.getRoster(guild.id);
        const hiredStudents = (roster.students || []).filter(s => s.status === 'hired');

        let roleAssigned = 0;
        if (hiredRole) {
          for (const s of hiredStudents) {
            const member = guild.members.cache.get(s.discordId);
            if (member && !member.roles.cache.has(hiredRole.id)) {
              await member.roles.add(hiredRole).catch(() => {});
              roleAssigned++;
            }
          }
        }

        await loading.edit({
          content: null,
          embeds: [Embeds.success("Hired Roles Synced", `• **Total Hired Students:** ${hiredStudents.length}\n• **New Roles Assigned:** ${roleAssigned}`)]
        });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Sync Error", err.message)] });
      }
    }
  }
};
