/**
 * JP ADMIN — Interaction Handler (Buttons, Modals, Select Menus)
 * Handles:
 * 1. Job Task Submission Modal & Mentor Review Buttons (!submit)
 * 2. Leave Request Modal & Mentor Review Buttons (!leave, !leaves)
 */

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const GasClient = require('../services/gasClient');
const Embeds = require('../utils/embedBuilder');
const Logger = require('../utils/logger');
const ChannelHelper = require('../utils/channelHelper');

class InteractionHandler {
  static async handle(interaction, client) {
    try {
      if (interaction.isButton()) {
        await this.handleButton(interaction, client);
      } else if (interaction.isModalSubmit()) {
        await this.handleModal(interaction, client);
      }
    } catch (err) {
      Logger.error("Error in interactionHandler:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ An error occurred processing this interaction.", ephemeral: true }).catch(() => {});
      }
    }
  }

  static async handleButton(interaction, client) {
    const customId = interaction.customId;

    // 0. Student Interactive Health & Scorecard Check Button
    if (customId === 'btn_my_health_check') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const myHealthCommand = require('../commands/students/myhealth');
        const embed = await myHealthCommand.buildStudentHealthEmbed(interaction.guild, interaction.member);
        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ embeds: [Embeds.error("Health Check Error", err.message)] });
      }
    }

    // 0.5 Mentor Template Publisher Buttons
    if (customId.startsWith('btn_post_tpl_')) {
      const cohortManager = require('../config/cohortManager');
      if (!cohortManager.isMentor(interaction.guild.id, interaction.member)) {
        return interaction.reply({ content: "❌ Only Mentors & Supervisors can broadcast templates.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const filterKey = customId.replace('btn_post_tpl_', '');
      try {
        const guidelinesCmd = require('../commands/admin/guidelines');
        const result = await guidelinesCmd.publishTemplates(interaction.guild, filterKey);
        return interaction.editReply({
          content: `✅ Successfully published template(s) to: ${result.publishedChannels.join(', ')}!`
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ Failed to publish template: ${err.message}` });
      }
    }

    // 1. Open Job Task Submission Modal
    if (customId.startsWith('open_task_modal_')) {
      const parts = customId.split('_');
      const taskId = parts[3] || 'auto';
      const studentId = parts[4] || interaction.user.id;

      if (interaction.user.id !== studentId) {
        return interaction.reply({ content: "⚠️ Only the task owner can submit this form.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`task_submission_modal_${taskId}_${studentId}`)
        .setTitle('Job Task Solution Submission');

      const githubInput = new TextInputBuilder()
        .setCustomId('task_github_url')
        .setLabel('GitHub Repository URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://github.com/your-username/repo')
        .setRequired(true);

      const taskLinkInput = new TextInputBuilder()
        .setCustomId('task_live_url')
        .setLabel('Live Demo / Project URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://your-task-demo.vercel.app')
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('task_desc_url')
        .setLabel('Task Requirement / Notion / Drive Link')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://notion.so/... or task doc link')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(githubInput),
        new ActionRowBuilder().addComponents(taskLinkInput),
        new ActionRowBuilder().addComponents(descInput)
      );

      return interaction.showModal(modal);
    }

    // 2. Open Student Leave Request Modal
    if (customId.startsWith('open_leave_modal_')) {
      const studentId = customId.replace('open_leave_modal_', '');
      if (interaction.user.id !== studentId) {
        return interaction.reply({ content: "⚠️ Only the requesting student can click this button.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('student_leave_modal')
        .setTitle('Leave / Excused Absence Request');

      const startInput = new TextInputBuilder()
        .setCustomId('leave_start')
        .setLabel('Start Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2026-08-27')
        .setRequired(true);

      const endInput = new TextInputBuilder()
        .setCustomId('leave_end')
        .setLabel('End Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2026-08-28')
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId('leave_reason')
        .setLabel('Reason for Leave')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explain reason for leave (e.g. Sickness, Exam, Family Emergency)')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(startInput),
        new ActionRowBuilder().addComponents(endInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      return interaction.showModal(modal);
    }

    // 2. Mentor Approve / Reject Job Task Buttons
    if (customId.startsWith('approve_task_') || customId.startsWith('reject_task_')) {
      const isApprove = customId.startsWith('approve_task_');
      const parts = customId.split('_');
      const taskId = parts[2];
      const studentId = parts[3];

      const cohortManager = require('../config/cohortManager');
      if (!cohortManager.isSupervisor(interaction.guild.id, interaction.member)) {
        return interaction.reply({ content: "❌ Access denied: Only authorized Mentors can review tasks.", ephemeral: true });
      }

      await interaction.deferUpdate();

      const mentorStatus = isApprove ? 'Approved' : 'Rejected';
      const note = `Reviewed by ${interaction.user.tag}`;

      const result = await GasClient.reviewJobTask(interaction.guild.id, taskId, mentorStatus, note);

      if (result && result.status === 'SUCCESS') {
        const embed = isApprove
          ? Embeds.success(
              `Job Task Approved! 🎉`,
              `• **Task ID:** \`${taskId}\`\n` +
              `• **Student:** <@${studentId}>\n` +
              `• **Reviewed By:** <@${interaction.user.id}>\n` +
              `• **Points Awarded:** +1 Point (Total: **${result.totalPointsAwarded} pts**)\n\n` +
              `✅ *Status updated in Google Sheets database.*`
            )
          : Embeds.warning(
              `Job Task Rejected`,
              `• **Task ID:** \`${taskId}\`\n` +
              `• **Student:** <@${studentId}>\n` +
              `• **Reviewed By:** <@${interaction.user.id}>\n` +
              `• **Status:** Rejected`
            );

        await interaction.message.edit({ embeds: [embed], components: [] });

        // Notify student in task channel
        const taskChannel = ChannelHelper.findChannel(interaction.guild, 'JOB_TASK');
        if (taskChannel) {
          const notifyText = isApprove
            ? `🎉 <@${studentId}> your Job Task solution for \`${taskId}\` has been **APPROVED** by <@${interaction.user.id}>! You earned **+1 Additional Point**!`
            : `⚠️ <@${studentId}> your Job Task solution for \`${taskId}\` was reviewed by <@${interaction.user.id}> and marked **Needs Improvement**.`;
          taskChannel.send(notifyText).catch(() => {});
        }
      } else {
        await interaction.followUp({ content: `Failed to review task ${taskId}: ${result?.error || 'Unknown error'}`, ephemeral: true });
      }
      return;
    }

    // 3. Leave Approval / Rejection buttons
    if (customId.startsWith('leave_approve_') || customId.startsWith('leave_reject_')) {
      const isApprove = customId.startsWith('leave_approve_');
      const rawData = customId.replace(isApprove ? 'leave_approve_' : 'leave_reject_', '');
      const parts = rawData.split('_');
      const reqId = parts[0];
      const studentId = parts[1];
      const startDate = parts[2];
      const endDate = parts[3];

      const cohortManager = require('../config/cohortManager');
      if (!cohortManager.isMentor(interaction.guild.id, interaction.member)) {
        return interaction.reply({ content: "❌ Access denied: Only Mentors & Supervisors can review leave requests.", ephemeral: true });
      }

      await interaction.deferUpdate();
      const status = isApprove ? 'APPROVED' : 'REJECTED';
      const result = await GasClient.updateLeave(interaction.guild.id, reqId, status, `Decided by ${interaction.user.tag}`);

      if (result && result.status === 'SUCCESS') {
        const embed = isApprove
          ? Embeds.success(
              `Leave Request Approved ✅`,
              `• **Request ID:** \`${reqId}\`\n` +
              `• **Student:** ${studentId ? `<@${studentId}>` : 'Student'}\n` +
              `• **Approved By:** <@${interaction.user.id}>\n` +
              `• **Status:** 🟢 **APPROVED**\n\n` +
              `*Excused working dates will count as 'L' (0 pts) in Attendance and will not trigger absence penalties.*`
            )
          : Embeds.warning(
              `Leave Request Rejected ❌`,
              `• **Request ID:** \`${reqId}\`\n` +
              `• **Student:** ${studentId ? `<@${studentId}>` : 'Student'}\n` +
              `• **Reviewed By:** <@${interaction.user.id}>\n` +
              `• **Status:** 🔴 **REJECTED**`
            );

        await interaction.message.edit({ embeds: [embed], components: [] });

        // NOTIFY THE STUDENT
        if (studentId) {
          const studentNotifyEmbed = isApprove
            ? Embeds.success(
                "Leave Request Approved! 🎉",
                `Hello <@${studentId}>, your leave request (**${reqId}**) has been **APPROVED** by <@${interaction.user.id}>!\n\n` +
                (startDate && endDate ? `• 📅 **Approved Dates:** \`${startDate}\` to \`${endDate}\`\n` : '') +
                `• ⭐ **Attendance Impact:** Marked as Excused Leave (\`L\`) with 0 absence penalty.\n\n` +
                `*Take care and get back to your journey refreshed!*`
              )
            : Embeds.warning(
                "Leave Request Update ⚠️",
                `Hello <@${studentId}>, your leave request (**${reqId}**) was **REJECTED** by <@${interaction.user.id}>.\n\n` +
                `*Please reach out to your mentor if you have any questions.*`
              );

          // 1. Try sending DM
          let dmSuccess = false;
          try {
            const studentUser = await client.users.fetch(studentId).catch(() => null);
            if (studentUser) {
              await studentUser.send({ embeds: [studentNotifyEmbed] });
              dmSuccess = true;
            }
          } catch (dmErr) {
            Logger.debug(`Could not DM student ${studentId}:`, dmErr.message);
          }

          // 2. Fallback to leave request channel if DM not possible
          if (!dmSuccess) {
            const leaveChannel = ChannelHelper.findChannel(interaction.guild, 'LEAVE_REQUEST');
            if (leaveChannel) {
              await leaveChannel.send({ content: `<@${studentId}>`, embeds: [studentNotifyEmbed] }).catch(() => {});
            }
          }
        }
      } else {
        await interaction.followUp({ content: `Failed to update leave request ${reqId}: ${result?.error || 'Unknown error'}`, ephemeral: true });
      }
      return;
    }
  }

  static async handleModal(interaction, client) {
    const customId = interaction.customId;

    // 1. Job Task Submission Modal
    if (customId.startsWith('task_submission_modal_')) {
      const parts = customId.split('_');
      const taskId = parts[3];
      const studentId = parts[4] || interaction.user.id;

      const githubUrl = interaction.fields.getTextInputValue('task_github_url');
      const liveUrl = interaction.fields.getTextInputValue('task_live_url');
      const descUrl = interaction.fields.getTextInputValue('task_desc_url') || "N/A";

      await interaction.deferReply({ ephemeral: true });

      const result = await GasClient.submitJobTask(interaction.guild.id, {
        taskId: taskId,
        discordId: studentId,
        githubUrl: githubUrl,
        taskUrl: liveUrl,
        descriptionUrl: descUrl
      });

      if (result && result.status === 'SUBMITTED') {
        const studentEmbed = Embeds.success(
          "Job Task Submitted Successfully! 🚀",
          `Your submission for \`${result.taskId}\` has been logged and sent to mentors for review.\n\n` +
          `• **GitHub:** ${githubUrl}\n` +
          `• **Live Demo:** ${liveUrl}\n` +
          `• **Task Doc:** ${descUrl}\n\n` +
          `*Mentors will review your code. You will earn +1 point upon approval!*`
        );
        await interaction.editReply({ embeds: [studentEmbed] });

        // Forward to Mentor channel for review
        const mentorChannel = ChannelHelper.findChannel(interaction.guild, 'BOT_ADMIN') || interaction.channel;
        if (mentorChannel) {
          const mentorReviewEmbed = Embeds.info(
            `📢 New Job Task Submission for Review`,
            `• **Student:** <@${studentId}>\n` +
            `• **Task ID:** \`${result.taskId}\`\n\n` +
            `**Links:**\n` +
            `• 🐙 **GitHub:** ${githubUrl}\n` +
            `• 🌐 **Live Demo:** ${liveUrl}\n` +
            `• 📄 **Task Spec:** ${descUrl}\n\n` +
            `*Review the student's solution and click below:*`
          );

          const mentorRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_task_${result.taskId}_${studentId}`)
              .setLabel('✅ Approve Task (+1 Pt)')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`reject_task_${result.taskId}_${studentId}`)
              .setLabel('❌ Reject Task')
              .setStyle(ButtonStyle.Danger)
          );

          await mentorChannel.send({ embeds: [mentorReviewEmbed], components: [mentorRow] }).catch(() => {});
        }
      } else {
        await interaction.editReply({
          embeds: [Embeds.error("Submission Failed", result?.error || "Could not find active task for your submission.")]
        });
      }
      return;
    }

    // 2. Student Leave Request Modal Submission
    if (customId === 'student_leave_modal') {
      const startDate = interaction.fields.getTextInputValue('leave_start');
      const endDate = interaction.fields.getTextInputValue('leave_end');
      const reason = interaction.fields.getTextInputValue('leave_reason');

      await interaction.deferReply({ ephemeral: true });

      const result = await GasClient.submitLeave(interaction.guild.id, {
        discordId: interaction.user.id,
        name: interaction.user.displayName || interaction.user.username,
        startDate: startDate,
        endDate: endDate,
        reason: reason
      });

      const studentEmbed = Embeds.info(
        "Leave Request Under Review ⏳",
        `Hello <@${interaction.user.id}>, **your leave request is under review.**\n\n` +
        `• 🆔 **Request ID:** \`${result.requestId}\`\n` +
        `• 📅 **Requested Dates:** \`${startDate}\` to \`${endDate}\`\n` +
        `• 📝 **Reason:** ${reason}\n\n` +
        `🔔 **You will be notified when your leave is approved by mentors.**`
      );

      await interaction.editReply({ embeds: [studentEmbed] });

      // Forward to mentor channel with interactive review buttons
      const mentorChannel = ChannelHelper.findChannel(interaction.guild, 'BOT_ADMIN') || ChannelHelper.findChannel(interaction.guild, 'LEAVE_REQUEST');
      if (mentorChannel) {
        const mentorEmbed = Embeds.warning(
          `📋 New Leave Request for Review (${result.requestId})`,
          `• **Student:** <@${interaction.user.id}> (${interaction.user.displayName || interaction.user.username})\n` +
          `• **Dates:** \`${startDate}\` to \`${endDate}\`\n` +
          `• **Reason:** ${reason}\n\n` +
          `*Review and click below to decide:*`
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`leave_approve_${result.requestId}_${interaction.user.id}_${startDate}_${endDate}`)
            .setLabel('✅ Approve Leave')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`leave_reject_${result.requestId}_${interaction.user.id}_${startDate}_${endDate}`)
            .setLabel('❌ Reject Leave')
            .setStyle(ButtonStyle.Danger)
        );

        await mentorChannel.send({ embeds: [mentorEmbed], components: [row] }).catch(() => {});
      }
      return;
    }
  }
}

module.exports = InteractionHandler;
