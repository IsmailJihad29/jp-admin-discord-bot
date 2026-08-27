/**
 * Commands: !role, !roles, !giverole, !removerole, !mentor, !setrole
 * Fast and easy role assignment for Mentors, Supervisors, and Students
 */

const cohortManager = require('../../config/cohortManager');
const constants = require('../../config/constants');
const Embeds = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

module.exports = {
  name: 'role',
  aliases: ['roles', 'giverole', 'removerole', 'mentor', 'setrole', 'addrole'],
  description: 'Assign or remove roles (Mentor, Supervisor, Active Student, etc.) from server members',
  usage: '!mentor add/remove @user | !giverole @user <RoleName> | !removerole @user <RoleName> | !roles',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    // --- 1. Quick Shortcut: !mentor [@user | add @user | remove @user] ---
    if (commandName === 'mentor') {
      let subAction = args[0]?.toLowerCase();
      let targetUser = message.mentions.members.first();

      if (subAction === 'remove') {
        if (!targetUser) {
          return message.reply({ embeds: [Embeds.warning("Missing User", "Please mention the user to remove Mentor role from:\n\n`!mentor remove @user`")] });
        }

        const mentorRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.MENTOR || 'mentor').toLowerCase());
        if (mentorRole && targetUser.roles.cache.has(mentorRole.id)) {
          await targetUser.roles.remove(mentorRole).catch(err => Logger.error("Failed removing mentor role:", err.message));
        }

        cohortManager.removeSupervisor(guild.id, targetUser.id);

        return message.reply({
          embeds: [Embeds.success("Mentor Role Removed", `Removed **Mentor** role & supervisor permissions from <@${targetUser.id}>.`)]
        });
      }

      // Default is Add / Give Mentor Role
      if (!targetUser) {
        return message.reply({
          embeds: [Embeds.info(
            "Mentor Role Management",
            "**How to assign or remove Mentor role:**\n\n" +
            "• **Give Mentor Role:** `!mentor @user` or `!mentor add @user`\n" +
            "• **Remove Mentor Role:** `!mentor remove @user`\n" +
            "• **View All Mentors:** `!roles`"
          )]
        });
      }

      // Find or auto-create Mentor role
      let mentorRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.MENTOR || 'mentor').toLowerCase());
      if (!mentorRole) {
        mentorRole = await guild.roles.create({
          name: constants.ROLES.MENTOR || 'Mentor',
          color: '#8B5CF6',
          mentionable: true,
          reason: 'Auto-created by JP ADMIN for Mentor assignment'
        }).catch(err => Logger.error("Could not auto-create mentor role:", err.message));
      }

      if (mentorRole) {
        try {
          await targetUser.roles.add(mentorRole);
        } catch (err) {
          return message.reply({
            embeds: [Embeds.error(
              "Permission Error",
              `Could not assign role. Make sure the bot's own role (**JP ADMIN**) is placed **ABOVE** the \`${mentorRole.name}\` role in **Server Settings > Roles**.\n\nError: \`${err.message}\``
            )]
          });
        }
      }

      // Also register in supervisor roster
      cohortManager.addSupervisor(guild.id, targetUser.id);

      return message.reply({
        embeds: [Embeds.success(
          "Mentor Role Assigned! 🎓",
          `✅ Successfully gave **Mentor** role to <@${targetUser.id}> (${targetUser.user.tag}).\n` +
          `✅ Granted full mentor command center and supervisory access.`
        )]
      });
    }

    // --- 2. Shortcut: !giverole / !addrole @user <RoleName> ---
    if (commandName === 'giverole' || commandName === 'addrole' || (commandName === 'role' && args[0]?.toLowerCase() === 'add')) {
      const targetUser = message.mentions.members.first();
      const roleNameArgs = commandName === 'giverole' || commandName === 'addrole'
        ? args.filter(a => !a.startsWith('<@')).join(' ').trim()
        : args.slice(2).join(' ').trim();

      if (!targetUser || !roleNameArgs) {
        return message.reply({
          embeds: [Embeds.warning("Usage Guide", "Usage: `!giverole @user <RoleName>`\n\nExample: `!giverole @Tanvir Mentor` or `!giverole @Rahim Active Student`")]
        });
      }

      const matchedRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleNameArgs.toLowerCase() || r.name.toLowerCase().includes(roleNameArgs.toLowerCase()));
      if (!matchedRole) {
        return message.reply({ embeds: [Embeds.error("Role Not Found", `Could not find any role matching \`${roleNameArgs}\` in this server.`)] });
      }

      try {
        await targetUser.roles.add(matchedRole);
        return message.reply({
          embeds: [Embeds.success("Role Assigned", `Added role **${matchedRole.name}** to <@${targetUser.id}>.`)]
        });
      } catch (err) {
        return message.reply({
          embeds: [Embeds.error("Role Assignment Error", `Failed to assign role: ${err.message}\n\n*Ensure the bot's role is positioned higher than ${matchedRole.name} in Server Settings.*`)]
        });
      }
    }

    // --- 3. Shortcut: !removerole @user <RoleName> ---
    if (commandName === 'removerole' || (commandName === 'role' && args[0]?.toLowerCase() === 'remove')) {
      const targetUser = message.mentions.members.first();
      const roleNameArgs = commandName === 'removerole'
        ? args.filter(a => !a.startsWith('<@')).join(' ').trim()
        : args.slice(2).join(' ').trim();

      if (!targetUser || !roleNameArgs) {
        return message.reply({
          embeds: [Embeds.warning("Usage Guide", "Usage: `!removerole @user <RoleName>`\n\nExample: `!removerole @Tanvir Mentor`")]
        });
      }

      const matchedRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleNameArgs.toLowerCase() || r.name.toLowerCase().includes(roleNameArgs.toLowerCase()));
      if (!matchedRole) {
        return message.reply({ embeds: [Embeds.error("Role Not Found", `Could not find any role matching \`${roleNameArgs}\`.`)] });
      }

      try {
        await targetUser.roles.remove(matchedRole);
        return message.reply({
          embeds: [Embeds.success("Role Removed", `Removed role **${matchedRole.name}** from <@${targetUser.id}>.`)]
        });
      } catch (err) {
        return message.reply({
          embeds: [Embeds.error("Error", err.message)]
        });
      }
    }

    // --- 4. Overview of All Roles: !roles ---
    const allRoles = guild.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position);

    const rolesList = allRoles.map(r => `• **${r.name}** — ${r.members.size} members`).join('\n');

    return message.reply({
      embeds: [Embeds.info(
        "Server Roles Directory",
        `**Total Roles:** ${allRoles.size}\n\n${rolesList || 'No roles found.'}\n\n` +
        `💡 **Commands:**\n` +
        `• Give Mentor: \`!mentor @user\`\n` +
        `• Give Any Role: \`!giverole @user <RoleName>\`\n` +
        `• Remove Role: \`!removerole @user <RoleName>\``
      )]
    });
  }
};
