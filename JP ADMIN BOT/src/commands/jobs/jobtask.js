/**
 * Commands: !submit, !tasks, !jobtasks
 * Feature: Job Task Submission and Mentor Review lifecycle
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');

module.exports = {
  name: 'submit',
  aliases: ['tasks', 'jobtasks', 'submittask'],
  description: 'Submit a job task solution or view active job tasks',
  usage: '!submit [task-id] | !tasks [all|submitted|overdue]',
  supervisorOnly: false,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guildId = message.guild.id;

    // --- !tasks (Supervisor Overview) ---
    if (commandName === 'tasks' || commandName === 'jobtasks') {
      const cohortManager = require('../../config/cohortManager');
      if (!cohortManager.isSupervisor(guildId, message.member)) {
        return message.reply({ embeds: [Embeds.error("Access Denied", "Only mentors can view all job tasks.")] });
      }

      const statusFilter = args[0] || "";
      const loading = await message.reply("📋 Fetching job tasks from database...");
      try {
        const res = await GasClient.getJobTasks(guildId, statusFilter);
        const tasks = res.tasks || [];

        if (tasks.length === 0) {
          return loading.edit({ content: null, embeds: [Embeds.info("Job Tasks", "No job tasks found.")] });
        }

        const taskList = tasks.slice(0, 10).map(t => {
          const statusIcon = t.submissionStatus === 'Submitted' ? '🟡' : (t.mentorStatus === 'Approved' ? '✅' : (t.submissionStatus === 'Overdue' ? '🔴' : '⏳'));
          return `${statusIcon} **\`${t.taskId}\`** — <@${t.discordId}>\n` +
                 `   • **${t.company}** (${t.role}) | 📅 Deadline: \`${t.deadline}\`\n` +
                 `   • Status: \`${t.submissionStatus}\` | Mentor: \`${t.mentorStatus || 'Pending'}\` | Pts: \`${t.pointsAwarded}\``;
        }).join('\n\n');

        const embed = Embeds.info(
          `Job Tasks (${tasks.length} Total)`,
          taskList + (tasks.length > 10 ? `\n\n*...and ${tasks.length - 10} more tasks.*` : '')
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
    }

    // --- !submit (Student Task Submission) ---
    let targetTaskId = args[0];

    // If message is a reply to another message, resolve taskId
    if (!targetTaskId && message.reference && message.reference.messageId) {
      targetTaskId = "TASK-" + message.reference.messageId.slice(-6);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_task_modal_${targetTaskId || 'auto'}_${message.author.id}`)
        .setLabel('📝 Fill Job Task Submission Form')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚀')
    );

    const embed = Embeds.info(
      "Job Task Submission Form",
      `Click the button below to submit your GitHub Repository, Task Demo link, and Requirements doc link.\n\n` +
      `• **Student:** <@${message.author.id}>\n` +
      `• **Target Task:** \`${targetTaskId || 'Latest active task'}\`\n\n` +
      `*Mentor review will be requested upon submission (+1 point upon approval).*`
    );

    return message.reply({ embeds: [embed], components: [row] });
  }
};
