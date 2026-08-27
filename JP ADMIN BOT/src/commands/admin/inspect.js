/**
 * Command: !inspect, !student, !profile, !deepcheck
 * 360-degree individual student diagnostic profile and management console for mentors
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CohortDataService = require('../../services/cohortDataService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'inspect',
  aliases: ['student', 'studentprofile', 'deepcheck', 'studentinspect'],
  description: 'Deep 360° student diagnostic profile, attendance history, tracker analytics, and referral control',
  usage: '!inspect @student',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    let targetMember = message.mentions.members.first();

    if (!targetMember && args[0]) {
      targetMember = guild.members.cache.get(args[0]) ||
        guild.members.cache.find(m => m.user.username.toLowerCase() === args[0].toLowerCase());
    }

    if (!targetMember) {
      return message.reply({
        embeds: [Embeds.warning(
          "Student Mention Required",
          "Please specify or mention the student you want to inspect.\nExample: `!inspect @John`"
        )]
      });
    }

    const discordId = targetMember.id;
    const loading = await message.reply(`🔍 Compiling 360° diagnostic profile for <@${discordId}>...`);

    try {
      const fullData = await CohortDataService.getFullCohortData(guild.id);
      const student = fullData.students.find(s => s.discordId === discordId);

      if (!student) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning(
            "Student Not Found in Database",
            `Could not find an enrolled active student record with Discord ID \`${discordId}\` in Google Sheets.`
          )]
        });
      }

      // Check referral restriction status
      const hasRestriction = targetMember.roles.cache.some(r =>
        r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase()
      );

      const recentSessionsStr = Object.entries(student.rawSessions || {})
        .slice(-8)
        .map(([d, m]) => `\`${d.substring(5)}\`: ${m === 'P' ? '🟢 Present' : m === 'A' ? '🔴 Absent' : '🟡 Leave'}`)
        .join(' | ') || 'No session data recorded';

      const embed = Embeds.info(
        `👤 Student 360° Diagnostic Profile · ${student.name}`,
        `📋 **Personal Identification:**\n` +
        `• **Name:** **${student.name}** (<@${discordId}>)\n` +
        `• **Email:** \`${student.email}\`\n` +
        `• **Region:** \`${student.region}\` | **Status:** \`${student.status}\`\n\n` +
        `📊 **Scoring & Performance Breakdown:**\n` +
        `• ⭐ **Total Score:** **${student.totalPoints} PTS**\n` +
        `• 📅 **Attendance:** \`${student.presentCount} Present\` · \`${student.absentCount} Absent\` · \`${student.leaveCount} Leave\` (${student.totalSessions} sessions)\n` +
        `• 💼 **Job Tracker:** ${student.hasTrackerLinked ? `🟢 [Linked Sheet](${student.trackerUrl})` : '🔴 **Unlinked**'}\n` +
        `• 🎯 **Job Applications:** Today: **${student.todayJobCount}/${fullData.cohortTarget}** · Past Week: **${student.totalJobsWeek} apps**\n` +
        `• 🎙️ **Interviews Logged:** **${student.interviewCount} interviews**\n` +
        `• 🛠️ **Hiring Tasks:** **${student.tasksCount} total** · \`${student.overdueTasksCount} overdue\`\n\n` +
        `📅 **Recent 8-Session History:**\n${recentSessionsStr}\n\n` +
        `🔒 **Referral Drive Access:** ${hasRestriction ? '🔴 **Restricted / Locked**' : '🟢 **Unlocked & Active**'}`,
        `JP ADMIN ${constants.BOT_VERSION} · Student Diagnostics`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`inspect_toggle_referral_${discordId}`)
          .setLabel(hasRestriction ? '🔓 Unlock Referral Access' : '🔒 Lock Referral Access')
          .setStyle(hasRestriction ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setLabel('📋 Open Job Tracker Sheet')
          .setStyle(ButtonStyle.Link)
          .setURL(student.trackerUrl || 'https://docs.google.com')
          .setDisabled(!student.trackerUrl)
      );

      return loading.edit({ content: null, embeds: [embed], components: [row] });
    } catch (err) {
      return loading.edit({
        content: null,
        embeds: [Embeds.error("Inspection Error", err.message)]
      });
    }
  }
};
