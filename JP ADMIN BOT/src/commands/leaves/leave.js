/**
 * Commands: !leave, !leaves
 * Handles student leave requests & mentor review workflow
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const cohortManager = require('../../config/cohortManager');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'leave',
  aliases: ['leaves', 'myleave', 'leaverequest', 'leavelist'],
  description: 'Submit a student leave request or review pending leaves as a mentor',
  usage: '!leave (students) | !leaves [pending|approved|rejected|all] (mentors)',
  supervisorOnly: false, // Students can run !leave

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    // -------------------------------------------------------------
    // 1. STUDENT LEAVE SUBMISSION: !leave
    // -------------------------------------------------------------
    if (commandName === 'leave' || commandName === 'leaverequest') {
      const todayStr = DateTimeUtil.getTodayDateStr();

      // Direct command format: !leave [StartDate] [EndDate] <Reason>
      if (args.length > 0) {
        let start = todayStr;
        let end = todayStr;
        let reason = "";

        const isFirstDate = /^\d{4}-\d{2}-\d{2}$/.test(args[0]);
        const isSecondDate = args[1] && /^\d{4}-\d{2}-\d{2}$/.test(args[1]);

        if (isFirstDate && isSecondDate) {
          start = args[0];
          end = args[1];
          reason = args.slice(2).join(' ') || "Excused absence";
        } else if (isFirstDate) {
          start = args[0];
          end = args[0];
          reason = args.slice(1).join(' ') || "Excused absence";
        } else {
          // No date mentioned -> Automatically defaults to the date of the post (Today)!
          start = todayStr;
          end = todayStr;
          reason = args.join(' ');
        }

        const loadingMsg = await message.reply("⏳ **Submitting your leave request...**");

        try {
          const res = await GasClient.submitLeave(guildId, {
            discordId: message.author.id,
            name: message.author.displayName || message.author.username,
            startDate: start,
            endDate: end,
            reason: reason
          });

          const studentEmbed = Embeds.info(
            "Leave Request Under Review ⏳",
            `Hello <@${message.author.id}>, **your leave request is under review.**\n\n` +
            `• 🆔 **Request ID:** \`${res.requestId}\`\n` +
            `• 📅 **Requested Dates:** \`${start}\` ${start !== end ? `to \`${end}\`` : '(Today)'}\n` +
            `• 📝 **Reason:** ${reason}\n\n` +
            `🔔 **You will be notified when your leave is approved by mentors.**`
          );

          await loadingMsg.edit({ content: null, embeds: [studentEmbed] });

          // Forward to Mentor/Admin channel for immediate review
          const mentorChannel = ChannelHelper.findChannel(message.guild, 'BOT_ADMIN') || message.channel;
          if (mentorChannel && mentorChannel.id !== message.channel.id) {
            const mentorEmbed = Embeds.warning(
              `📋 New Leave Request for Review (${res.requestId})`,
              `• **Student:** <@${message.author.id}> (${message.author.displayName || message.author.username})\n` +
              `• **Dates:** \`${start}\` to \`${end}\`\n` +
              `• **Reason:** ${reason}\n` +
              `• **Submitted:** ${DateTimeUtil.getFullTimestamp()}\n\n` +
              `*Review and click below to decide:*`
            );

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`leave_approve_${res.requestId}_${message.author.id}_${start}_${end}`)
                .setLabel('✅ Approve Leave')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`leave_reject_${res.requestId}_${message.author.id}_${start}_${end}`)
                .setLabel('❌ Reject Leave')
                .setStyle(ButtonStyle.Danger)
            );

            await mentorChannel.send({ embeds: [mentorEmbed], components: [row] }).catch(() => {});
          }
        } catch (err) {
          await loadingMsg.edit({
            content: null,
            embeds: [Embeds.error("Submission Failed", `Could not submit leave request: ${err.message}`)]
          });
        }
        return;
      }

      // If no arguments provided, show Interactive Form Button
      const embed = Embeds.info(
        "📝 Student Leave / Excused Absence Request",
        "To request an excused absence, click the button below to open the form, or submit directly using:\n\n" +
        "**Command Format:** `!leave <StartDate> <EndDate> <Reason>`\n" +
        "*Example:* `!leave 2026-08-27 2026-08-28 Family emergency`\n\n" +
        "💡 *Approved leave dates will be marked as excused (`L`) in Attendance and will not trigger absence penalties.*"
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_leave_modal_${message.author.id}`)
          .setLabel('📝 Open Leave Request Form')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📋')
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // -------------------------------------------------------------
    // 2. MENTOR LEAVE REVIEW: !leaves [pending|approved|rejected|all]
    // -------------------------------------------------------------
    const isMentor = cohortManager.isMentor(guildId, message.member);
    if (!isMentor) {
      return message.reply({
        embeds: [Embeds.warning(
          "⚠️ Access Denied",
          `Hello <@${message.author.id}>, only **Mentors & Supervisors** can review leave lists with \`!leaves\`.\n\n` +
          `💡 *Students can submit a leave request using \`!leave\`.*`
        )]
      });
    }

    const filterArg = (args[0] || 'pending').toLowerCase();
    const statusFilter = filterArg === 'all' ? null : (filterArg === 'approved' ? 'APPROVED' : (filterArg === 'rejected' ? 'REJECTED' : 'PENDING'));

    const loading = await message.reply(`📋 **Fetching ${statusFilter || 'ALL'} leave requests from Google Sheets database...**`);

    try {
      const leaveData = await GasClient.getLeaves(guildId, statusFilter);
      const list = leaveData.leaves || [];

      if (list.length === 0) {
        return loading.edit({
          content: null,
          embeds: [Embeds.success(
            `No ${statusFilter || ''} Leave Requests`,
            `✨ There are currently **no ${statusFilter ? statusFilter.toLowerCase() : ''} leave requests** in the database!`
          )]
        });
      }

      // Build complete master summary overview
      const overviewLines = list.map((req, idx) => {
        const statusIcon = req.status.toLowerCase() === 'approved' ? '✅' : (req.status.toLowerCase() === 'rejected' ? '❌' : '⏳');
        return `**${idx + 1}. \`${req.requestId}\`** ${statusIcon} · <@${req.discordId}> (**${req.name}**)\n` +
               `   • 📅 **Dates:** \`${req.startDate}\` to \`${req.endDate}\`\n` +
               `   • 📝 **Reason:** ${req.reason}\n` +
               `   • ⏰ **Submitted:** ${req.timestamp || 'N/A'}`;
      });

      const overviewEmbed = Embeds.info(
        `📋 ${statusFilter ? statusFilter.toUpperCase() : 'ALL'} Leave Requests (${list.length} Total)`,
        overviewLines.slice(0, 15).join('\n\n') + (overviewLines.length > 15 ? `\n\n*...and ${overviewLines.length - 15} more requests.*` : '')
      );

      await loading.edit({ content: null, embeds: [overviewEmbed] });

      // If viewing pending leaves, display interactive decision cards (up to 10)
      if (statusFilter === 'PENDING') {
        const pendingItems = list.slice(0, 10);
        for (const req of pendingItems) {
          const reqEmbed = Embeds.warning(
            `Pending Review: ${req.requestId}`,
            `• **Student:** <@${req.discordId}> (${req.name})\n` +
            `• **Dates:** \`${req.startDate}\` to \`${req.endDate}\`\n` +
            `• **Reason:** ${req.reason}\n` +
            `• **Submitted:** ${req.timestamp}`
          );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`leave_approve_${req.requestId}_${req.discordId}_${req.startDate}_${req.endDate}`)
              .setLabel('✅ Approve')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`leave_reject_${req.requestId}_${req.discordId}_${req.startDate}_${req.endDate}`)
              .setLabel('❌ Reject')
              .setStyle(ButtonStyle.Danger)
          );

          await message.channel.send({ embeds: [reqEmbed], components: [row] }).catch(() => {});
        }
      }
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Leave Fetch Error", err.message)] });
    }
  }
};
