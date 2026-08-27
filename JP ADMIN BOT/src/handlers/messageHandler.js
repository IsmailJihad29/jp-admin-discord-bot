/**
 * JP ADMIN — Message Event Pipeline Handler
 * Streamlined to focus on core requested features:
 * 1. Command router
 * 2. #interview-preparation: Gemini AI prep tips & +5 points
 * 3. #job-task-update: Job task logging & +1 point
 * 4. #job-tracking: Google Sheet link auto-registration
 */

const constants = require('../config/constants');
const GasClient = require('../services/gasClient');
const GeminiService = require('../services/geminiService');
const JobScraperService = require('../services/jobScraperService');
const Embeds = require('../utils/embedBuilder');
const Logger = require('../utils/logger');
const DateTimeUtil = require('../utils/dateTime');
const ChannelHelper = require('../utils/channelHelper');

class MessageHandler {
  static async handle(message, client, commandHandler) {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim();

    // 1. Check for command prefix '!'
    if (content.startsWith('!')) {
      return commandHandler.handle(message, client);
    }

    // 2. Handle #interview-preparation Posts (AI Interview Prep & +5 points)
    if (ChannelHelper.isChannel(message, 'INTERVIEW_UPDATE')) {
      await this.handleInterviewPost(message);
      return;
    }

    // 3. Handle #job-task-update Posts (Job Task Announcement & +1 point)
    if (ChannelHelper.isChannel(message, 'JOB_TASK')) {
      await this.handleJobTaskPost(message);
      return;
    }

    // 4. Handle #job-tracking Sheet Link Shares
    if (ChannelHelper.isChannel(message, 'JOB_TRACKING')) {
      await this.handleJobSheetPost(message);
      return;
    }
  }

  /**
   * Generates AI interview guidance & logs +5 points
   */
  static async handleInterviewPost(message) {
    try {
      const studentId = message.author.id;
      const studentName = message.author.displayName || message.author.username;

      // Generate Google Gemini AI interview prep feedback
      const aiFeedback = await GeminiService.generateInterviewFeedback(message.content);

      // Record interview to Sheets
      await GasClient.recordInterview(message.guild.id, {
        name: studentName,
        discordId: studentId,
        company: "Shared in Post",
        serial: 1,
        interviewDate: DateTimeUtil.getTodayDateStr(),
        roleDetails: message.content.substring(0, 100),
        discordLink: message.url
      }).catch((e) => Logger.error("Failed to record interview:", e.message));

      const embed = Embeds.success(
        `🎯 Interview Logged (+5 Points!)`,
        `**Mentor AI Prep Suggestions:**\n${aiFeedback}`
      );

      message.reply({ embeds: [embed] }).catch(() => {});
    } catch (e) {
      Logger.error("Error handling interview post:", e.message);
    }
  }

  /**
   * Logs new job task announcement & awards +1 point
   */
  static async handleJobTaskPost(message) {
    try {
      const studentId = message.author.id;
      const studentName = message.author.displayName || message.author.username;

      // Parse task details and deadline via Gemini AI
      const taskData = await GeminiService.parseJobTaskAnnouncement(message.content);
      const taskId = "TASK-" + message.id.slice(-6);

      // Record to Google Sheets with +1 point awarded for Announcement
      await GasClient.recordJobTask(message.guild.id, {
        taskId: taskId,
        discordId: studentId,
        studentName: studentName,
        company: taskData.company,
        role: taskData.role,
        techStack: taskData.techStack,
        deadline: taskData.deadlineDate
      });

      message.react('🛠️').catch(() => {});

      const embed = Embeds.success(
        `🛠️ Job Task Logged (+1 Point!)`,
        `• **Company:** ${taskData.company}\n` +
        `• **Role:** ${taskData.role}\n` +
        `• **Tech Stack:** ${taskData.techStack}\n` +
        `• **Deadline:** 📅 \`${taskData.deadlineDate}\` (${taskData.rawDeadline})\n` +
        `• **Task ID:** \`${taskId}\`\n\n` +
        `💡 **How to submit when done:**\n` +
        `Reply to your message with \`!submit\` to open the submission form (GitHub, Live Demo & Doc links). Approved submissions earn **+1 additional point**!`
      );

      message.reply({ embeds: [embed] }).catch(() => {});
    } catch (e) {
      Logger.error("Error handling job task announcement post:", e.message);
    }
  }

  /**
   * Registers a student's public job tracking Google Sheet link
   */
  static async handleJobSheetPost(message) {
    try {
      const parsed = JobScraperService.parseSheetUrl(message.content);
      if (parsed && parsed.sheetId) {
        const studentId = message.author.id;
        const studentName = message.author.displayName || message.author.username;

        await GasClient.request(message.guild.id, 'recordJobSheet', {
          discordId: studentId,
          name: studentName,
          sheetUrl: message.content.trim(),
          sheetId: parsed.sheetId,
          gid: parsed.gid
        }).catch(() => {});

        message.react('📊').catch(() => {});
      }
    } catch (e) {
      Logger.error("Error registering job sheet link:", e.message);
    }
  }
}

module.exports = MessageHandler;
