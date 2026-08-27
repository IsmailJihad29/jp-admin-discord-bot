/**
 * Commands: !scanserver, !setupserver, !ensurechannels, !checkchannels, !checkperms
 * Smartly scans existing server channels and roles:
 * - Checks if all required channels exist. If yes -> reports OK.
 * - If any channel or role is missing -> automatically creates it with proper categories and permissions!
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const constants = require('../../config/constants');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

// Complete definition of required channels mapped to categories
const REQUIRED_CHANNEL_DEFINITIONS = [
  // --- MENTORS ZONE ---
  {
    key: 'BOT_ADMIN',
    name: '🤖 | jp-admin',
    displayName: '🤖 | jp-admin',
    categoryName: 'MENTORS ZONE',
    topic: 'Mentor & Supervisor private command center (!leaves, !atrisk, !doctor)',
    isPrivate: true
  },
  {
    key: 'LEAVE',
    name: '🌴 | leave-request',
    displayName: '🌴 | leave-request',
    categoryName: 'MENTORS ZONE',
    topic: 'Student leave requests (!leave command)',
    isPrivate: false
  },
  {
    key: 'ONE_ON_ONE',
    name: '🤝 | 1on1-support',
    displayName: '🤝 | 1on1-support',
    categoryName: 'MENTORS ZONE',
    topic: '1-on-1 Mentor Support & Counseling booking links',
    isPrivate: false
  },

  // --- STUDENTS ZONE ---
  {
    key: 'ATTENDANCE',
    name: '📅 | daily-attendance',
    displayName: '📅 | daily-attendance',
    categoryName: 'STUDENTS ZONE',
    topic: 'Daily attendance form link & 3-day absence inactivity warnings',
    isPrivate: false
  },
  {
    key: 'JOB_TRACKING',
    name: '📊 | job-tracker',
    displayName: '📊 | job-tracker',
    categoryName: 'STUDENTS ZONE',
    topic: 'Daily job application sheet updates and 11:30 PM audit reports',
    isPrivate: false
  },
  {
    key: 'JOB_TASK',
    name: '📈 | jobs-task-updates',
    displayName: '📈 | jobs-task-updates',
    categoryName: 'STUDENTS ZONE',
    topic: 'Job task announcements (+1 pt) and submissions with !submit',
    isPrivate: false
  },
  {
    key: 'INTERVIEW_UPDATE',
    name: '🎙️ | interview-preparations',
    displayName: '🎙️ | interview-preparations',
    categoryName: 'STUDENTS ZONE',
    topic: 'Interview updates and instant Gemini AI prep feedback (+5 pts)',
    isPrivate: false
  },
  {
    key: 'RESUME_REFERRAL',
    name: '📄 | resume-needed',
    displayName: '📄 | resume-needed',
    categoryName: 'STUDENTS ZONE',
    topic: 'Resume Referral Drive (Locked for performance < 70%)',
    isPrivate: false
  },
  {
    key: 'RTBR',
    name: '⭐ | referral-leaderboard',
    displayName: '⭐ | referral-leaderboard',
    categoryName: 'STUDENTS ZONE',
    topic: 'Weekly Consolidated Performance Leaderboard & RTBR Score',
    isPrivate: false
  },
  {
    key: 'DISCUSSION',
    name: '💭 | discussion',
    displayName: '💭 | discussion',
    categoryName: 'STUDENTS ZONE',
    topic: 'General cohort discussion and student queries',
    isPrivate: false
  },

  // --- FUN & CHILL ---
  {
    key: 'SUCCESSFULLY_HIRED',
    name: '🏆 | successfully-hired',
    displayName: '🏆 | successfully-hired',
    categoryName: 'FUN & CHILL',
    topic: 'Live Offer Cracked Celebration Broadcasts with student journey stats',
    isPrivate: false
  }
];

module.exports = {
  name: 'setupserver',
  aliases: ['scanserver', 'ensurechannels', 'checkchannels', 'smartsetup', 'checkperms'],
  description: 'Scans the server for all required feature channels and roles; creates any that are missing automatically.',
  usage: '!scanserver | !setupserver | !checkperms',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    if (commandName === 'checkperms') {
      const perms = guild.members.me.permissions;
      const hasAdmin = perms.has(PermissionFlagsBits.Administrator);
      const manageChannels = perms.has(PermissionFlagsBits.ManageChannels);
      const manageRoles = perms.has(PermissionFlagsBits.ManageRoles);
      const embed = Embeds.info(
        "Bot Permissions Diagnosis",
        `• **Administrator:** ${hasAdmin ? '✅ Yes' : '❌ No'}\n` +
        `• **Manage Channels:** ${manageChannels ? '✅ Yes' : '❌ No'}\n` +
        `• **Manage Roles:** ${manageRoles ? '✅ Yes' : '❌ No'}\n\n` +
        `💡 *Administrator permission is recommended for smooth automatic channel and role management.*`
      );
      return message.reply({ embeds: [embed] });
    }

    const progressMsg = await message.reply("🔍 **Scanning server channels, categories, and roles...**");

    try {
      // 1. Ensure the 5 Essential Roles Exist
      const rolesConfig = [
        { name: constants.ROLES.SUPERVISOR || "Supervisor", color: '#3B82F6', mentionable: true },
        { name: constants.ROLES.MENTOR || "Mentor", color: '#8B5CF6', mentionable: true },
        { name: constants.ROLES.ACTIVE_STUDENT || "Active Student", color: '#64748B', mentionable: true },
        { name: constants.ROLES.REFERRAL_RESTRICTED || "Referral Restricted", color: '#EF4444', mentionable: false },
        { name: constants.ROLES.HIRED || "Hired", color: '#10B981', mentionable: true }
      ];

      const verifiedRoles = [];
      const createdRoles = [];

      for (const rCfg of rolesConfig) {
        if (!rCfg.name) continue;
        let role = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === rCfg.name.toLowerCase());
        if (!role) {
          role = await guild.roles.create({
            name: rCfg.name,
            color: rCfg.color,
            mentionable: rCfg.mentionable,
            reason: 'Auto-created by JP ADMIN Server Scanner'
          }).catch(err => {
            Logger.error(`Could not create role ${rCfg.name}:`, err.message);
            return null;
          });
          if (role) createdRoles.push(`\`${rCfg.name}\``);
        } else {
          verifiedRoles.push(`\`${role.name}\``);
        }
      }

      const mentorRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.MENTOR || 'mentor').toLowerCase());
      const supervisorRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.SUPERVISOR || 'supervisor').toLowerCase());
      const restrictionRole = guild.roles.cache.find(r => r && r.name && r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());

      // 2. Discover Categories
      const categoriesMap = new Map();
      guild.channels.cache.forEach(c => {
        if (c.type === ChannelType.GuildCategory) {
          const cleanCatName = ChannelHelper.normalize(c.name).toUpperCase();
          categoriesMap.set(cleanCatName, c);
        }
      });

      async function getOrCreateCategory(targetName) {
        const cleanTarget = ChannelHelper.normalize(targetName).toUpperCase();
        for (const [catClean, catObj] of categoriesMap.entries()) {
          if (catClean.includes(cleanTarget) || cleanTarget.includes(catClean)) {
            return catObj;
          }
        }
        const newCat = await guild.channels.create({
          name: targetName,
          type: ChannelType.GuildCategory
        }).catch(() => null);
        if (newCat) categoriesMap.set(cleanTarget, newCat);
        return newCat;
      }

      // 3. Scan & Create Missing Channels
      const existingChannels = [];
      const createdChannels = [];

      for (const chDef of REQUIRED_CHANNEL_DEFINITIONS) {
        let found = ChannelHelper.findChannel(guild, chDef.key);

        if (found) {
          existingChannels.push(`• 🟢 <#${found.id}> ➔ \`${chDef.key}\``);
        } else {
          // Channel is missing -> Automatically create it in the proper category!
          const targetCategory = await getOrCreateCategory(chDef.categoryName);

          const permissionOverwrites = [];
          if (chDef.isPrivate) {
            permissionOverwrites.push({
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            });
            if (mentorRole) {
              permissionOverwrites.push({
                id: mentorRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              });
            }
            if (supervisorRole) {
              permissionOverwrites.push({
                id: supervisorRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              });
            }
          }

          const newCh = await guild.channels.create({
            name: chDef.name,
            type: ChannelType.GuildText,
            parent: targetCategory ? targetCategory.id : null,
            topic: chDef.topic,
            permissionOverwrites: permissionOverwrites
          }).catch(err => {
            Logger.error(`Failed to create channel ${chDef.name}:`, err.message);
            return null;
          });

          if (newCh) {
            createdChannels.push(`• ✨ <#${newCh.id}> in \`${targetCategory ? targetCategory.name : 'Server'}\``);
            found = newCh;
          }
        }

        // Apply special restriction override on RESUME_REFERRAL (#resume-needed)
        if (chDef.key === 'RESUME_REFERRAL' && found && restrictionRole) {
          await found.permissionOverwrites.edit(restrictionRole, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false
          }).catch(() => {});
        }
      }

      const allPresent = createdChannels.length === 0 && createdRoles.length === 0;

      const embed = allPresent
        ? Embeds.success(
            "✅ Server Scan Complete: ALL CHANNELS & ROLES READY!",
            `All **${REQUIRED_CHANNEL_DEFINITIONS.length} required feature channels** and **${rolesConfig.length} roles** are active and properly linked.\n\n` +
            `**🟢 Active Linked Channels:**\n${existingChannels.join('\n')}\n\n` +
            `**🛡️ Active Roles:** ${verifiedRoles.join(', ')}\n\n` +
            `🎉 *No missing channels or roles detected. Your server is 100% ready!*`
          )
        : Embeds.success(
            "🛠️ Server Scan & Auto-Repair Complete!",
            `The bot scanned your server, verified existing channels, and automatically created missing elements:\n\n` +
            (createdChannels.length > 0 ? `**✨ Newly Created Missing Channels (${createdChannels.length}):**\n${createdChannels.join('\n')}\n\n` : '') +
            (createdRoles.length > 0 ? `**🛡️ Newly Created Roles:** ${createdRoles.join(', ')}\n\n` : '') +
            `**🟢 Verified Existing Channels (${existingChannels.length}):**\n${existingChannels.join('\n')}\n\n` +
            `✅ *All feature channels, permissions, and categories have been successfully provisioned!*`
          );

      await progressMsg.edit({ content: null, embeds: [embed] });
    } catch (err) {
      Logger.error("Server setup scan failed:", err);
      await progressMsg.edit({
        content: null,
        embeds: [Embeds.error("Server Scan Error", err.message)]
      });
    }
  }
};
