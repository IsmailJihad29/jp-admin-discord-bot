/**
 * JP ADMIN — Message Event Pipeline Handler
 * Streamlined to focus on core requested features:
 * 1. Command router
 * 2. #interview-preparation: Gemini AI prep tips & +5 points
 * 3. #job-task-update: Job task logging & +1 point
 * 4. #job-tracking: Google Sheet link auto-registration
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    // 5. Handle #leave-request Posts
    if (ChannelHelper.isChannel(message, 'LEAVE_REQUEST')) {
      await this.handleLeavePost(message);
      return;
    }
  }

  /**
   * Generates AI 30-question interview guidance & logs +5 points
   */
  static async handleInterviewPost(message) {
    try {
      const studentId = message.author.id;
      const studentName = message.author.displayName || message.author.username;

      message.react('🎯').catch(() => {});

      // Record interview to Sheets immediately
      await GasClient.recordInterview(message.guild.id, {
        name: studentName,
        discordId: studentId,
        company: "Shared in Post",
        serial: 1,
        interviewDate: DateTimeUtil.getTodayDateStr(),
        roleDetails: message.content.substring(0, 100),
        discordLink: message.url
      }).catch((e) => Logger.error("Failed to record interview:", e.message));

      // Generate Google Gemini AI 30-question master interview prep guide
      const aiFeedback = await GeminiService.generateInterviewFeedback(message.content);

      // Split into clean chunks of max 3800 chars for Discord embeds
      const maxLen = 3800;
      const embeds = [];

      const cohortManager = require('../config/cohortManager');
      const interviewPts = cohortManager.getCohortScoring(message.guild.id).interviewPoints;

      if (aiFeedback.length <= maxLen) {
        embeds.push(Embeds.success(
          `🎯 Interview Logged (+${interviewPts} Points!) · 30-Question Master Prep Guide`,
          aiFeedback
        ));
      } else {
        // Split by lines / sections
        const lines = aiFeedback.split('\n');
        let currentChunk = "";
        let partIndex = 1;

        for (const line of lines) {
          if ((currentChunk + '\n' + line).length > maxLen) {
            embeds.push(Embeds.success(
              partIndex === 1
                ? `🎯 Interview Logged (+${interviewPts} Points!) · 30-Question Prep (Part 1)`
                : `🎯 30-Question Prep Guide (Part ${partIndex})`,
              currentChunk
            ));
            currentChunk = line;
            partIndex++;
          } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
          }
        }
        if (currentChunk) {
          embeds.push(Embeds.success(
            `🎯 30-Question Prep Guide (Part ${partIndex})`,
            currentChunk
          ));
        }
      }

      // Try creating a dedicated study thread for this interview
      const thread = await message.startThread({
        name: `🎯 Interview Prep: ${studentName}`,
        autoArchiveDuration: 1440
      }).catch(() => null);

      if (thread) {
        // Post full guide in thread for organized discussion
        for (const emb of embeds) {
          await thread.send({ embeds: [emb] }).catch(() => {});
        }
        const summaryEmbed = Embeds.success(
          `🎯 Interview Logged (+${interviewPts} Points!)`,
          `Awesome job <@${studentId}>! We have compiled a **30-Question Master Preparation Guide** tailored for this role.\n\n` +
          `• ⭐ **Score Boost:** \`+${interviewPts} points\` added to your Leaderboard & RTBR score!\n` +
          `👉 **Study the full 30 questions & tips in the dedicated thread:** <#${thread.id}>`
        );
        message.reply({ embeds: [summaryEmbed] }).catch(() => {});
      } else {
        // Fallback: Reply directly with embeds
        message.reply({ embeds: embeds.slice(0, 10) }).catch(() => {});
      }
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
        const sheetUrl = message.content.trim();

        // 1. Live test scrape
        const scrape = await JobScraperService.scrapeStudentJobSheet(sheetUrl, studentId);

        if (!scrape.success) {
          message.react('⚠️').catch(() => {});
          return message.reply({
            embeds: [Embeds.warning(
              "⚠️ Google Sheet Permission Restricted",
              `Hello <@${studentId}>, the bot cannot read your Job Tracker Sheet.\n\n` +
              `**Reason:** ${scrape.error}\n\n` +
              `🛠️ **How to fix in 10 seconds:**\n` +
              `1. Open your Google Sheet > Click **Share** (top-right).\n` +
              `2. Change General access from *Restricted* to **"Anyone with the link" (Viewer or Editor)**.\n` +
              `3. Paste your link here again or run \`!linksheet <URL>\`!`
            )]
          });
        }

        // 2. Fetch student info from Roster
        const rosterRes = await GasClient.getRoster(message.guild.id).catch(() => ({ students: [] }));
        const studentProfile = (rosterRes.students || []).find(s => s.discordId === studentId);
        const studentEmail = studentProfile?.email || "";

        // 3. Save to Google Sheets database
        await GasClient.request(message.guild.id, 'recordJobSheet', {
          discordId: studentId,
          name: studentName,
          email: studentEmail,
          sheetUrl: sheetUrl,
          sheetId: parsed.sheetId,
          gid: parsed.gid
        }).catch(() => {});

        message.react('📊').catch(() => {});
        message.react('✅').catch(() => {});

        const embed = Embeds.success(
          "Job Application Tracker Linked! 🎉",
          `Hello <@${studentId}>, your personal Google Sheet Job Application Tracker has been registered successfully!\n\n` +
          `• 💼 **Existing Applications Detected:** **${scrape.totalRows} applications**\n` +
          `• 📅 **Dated Today:** **${scrape.datedTodayCount} applications**\n` +
          `• 🤖 **24/7 Automated Scraping:** 🟢 **Active**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 **HOW IT WORKS:**\n` +
          `You only need to link your sheet **ONCE**. Every night at **23:30 (11:30 PM)**, the bot will automatically read your sheet, count your applications for the day, and award your points & streak bonus!`
        );

        message.reply({ embeds: [embed] }).catch(() => {});
      }
    } catch (e) {
      Logger.error("Error registering job sheet link:", e.message);
    }
  }

  /**
   * Handles direct message posts in #leave-request
   * Automatically defaults to the post's date (today) if no date is specified by student!
   */
  static async handleLeavePost(message) {
    try {
      const studentId = message.author.id;
      const studentName = message.author.displayName || message.author.username;
      const todayStr = DateTimeUtil.getTodayDateStr();

      // Check if message contains YYYY-MM-DD dates
      const dateMatches = message.content.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
      let start = todayStr;
      let end = todayStr;

      if (dateMatches.length >= 2) {
        start = dateMatches[0];
        end = dateMatches[1];
      } else if (dateMatches.length === 1) {
        start = dateMatches[0];
        end = dateMatches[0];
      }

      // Check if student already has an approved or pending leave for these dates
      const existingRes = await GasClient.getLeaves(message.guild.id).catch(() => ({ leaves: [] }));
      const existingList = existingRes.leaves || [];
      const match = existingList.find(l => 
        l.discordId === studentId && 
        ((start >= l.startDate && start <= l.endDate) || (l.startDate >= start && l.startDate <= end))
      );

      if (match) {
        const status = String(match.status || "").toUpperCase();
        if (status === 'APPROVED') {
          message.react('✅').catch(() => {});
          return message.reply({
            embeds: [Embeds.success(
              "Leave Already Approved! ✅",
              `Hello <@${studentId}>, your leave request (**\`${match.requestId}\`**) for **\`${match.startDate}\` to \`${match.endDate}\`** is **ALREADY APPROVED**.\n\n` +
              `• 📝 **Reason on Record:** ${match.reason}\n` +
              `• ⭐ **Attendance Status:** Excused (\`L\`) with 0 absence penalty.`
            )]
          }).catch(() => {});
        } else if (status === 'PENDING') {
          message.react('⏳').catch(() => {});
          return message.reply({
            embeds: [Embeds.info(
              "Leave Request Already In Review ⏳",
              `Hello <@${studentId}>, your leave request (**\`${match.requestId}\`**) for **\`${match.startDate}\` to \`${match.endDate}\`** is already in review by mentors.\n\n` +
              `🔔 *You will receive a notification as soon as it is decided!*`
            )]
          }).catch(() => {});
        }
      }

      const res = await GasClient.submitLeave(message.guild.id, {
        discordId: studentId,
        name: studentName,
        startDate: start,
        endDate: end,
        reason: message.content.substring(0, 300)
      });

      message.react('📝').catch(() => {});

      const studentEmbed = Embeds.info(
        "Leave Request Under Review ⏳",
        `Hello <@${studentId}>, **your leave request is under review.**\n\n` +
        `• 🆔 **Request ID:** \`${res.requestId}\`\n` +
        `• 📅 **Requested Dates:** \`${start}\` ${start !== end ? `to \`${end}\`` : '(Today)'}\n` +
        `• 📝 **Reason:** ${message.content.substring(0, 200)}\n\n` +
        `🔔 **You will be notified when your leave is approved by mentors.**`
      );

      await message.reply({ embeds: [studentEmbed] }).catch(() => {});

      // Forward to Mentor/Admin channel for immediate review
      const mentorChannel = ChannelHelper.findChannel(message.guild, 'BOT_ADMIN');
      if (mentorChannel && mentorChannel.id !== message.channel.id) {
        const mentorEmbed = Embeds.warning(
          `📋 New Leave Request for Review (${res.requestId})`,
          `• **Student:** <@${studentId}> (${studentName})\n` +
          `• **Dates:** \`${start}\` to \`${end}\`\n` +
          `• **Reason:** ${message.content.substring(0, 300)}\n` +
          `• **Submitted:** ${DateTimeUtil.getFullTimestamp()}\n\n` +
          `*Review and click below to decide:*`
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`leave_approve_${res.requestId}_${studentId}_${start}_${end}`)
            .setLabel('✅ Approve Leave')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`leave_reject_${res.requestId}_${studentId}_${start}_${end}`)
            .setLabel('❌ Reject Leave')
            .setStyle(ButtonStyle.Danger)
        );

        await mentorChannel.send({ embeds: [mentorEmbed], components: [row] }).catch(() => {});
      }
    } catch (e) {
      Logger.error("Error handling leave post in channel:", e.message);
    }
  }
}

module.exports = MessageHandler;
