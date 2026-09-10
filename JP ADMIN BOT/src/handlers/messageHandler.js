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
const cohortManager = require('../config/cohortManager');
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
      if (cohortManager.isFeatureEnabled(message.guild.id, 'interview_hub')) {
        await this.handleInterviewPost(message);
      }
      return;
    }

    // 3. Handle #job-task-update Posts (Job Task Announcement & +1 point)
    if (ChannelHelper.isChannel(message, 'JOB_TASK')) {
      if (cohortManager.isFeatureEnabled(message.guild.id, 'job_task_hub')) {
        await this.handleJobTaskPost(message);
      }
      return;
    }

    // 3.5 Handle #daily-tasks Posts (Mentor Daily Target & Task Announcement)
    if (ChannelHelper.isChannel(message, 'DAILY_TASK')) {
      if (cohortManager.isFeatureEnabled(message.guild.id, 'daily_task_hub') && cohortManager.isMentor(message.guild.id, message.member)) {
        await this.handleMentorDailyTaskAnnouncement(message);
        return;
      }
    }

    // 4. Handle #job-tracking Sheet Link Shares
    if (ChannelHelper.isChannel(message, 'JOB_TRACKING')) {
      if (cohortManager.isFeatureEnabled(message.guild.id, 'job_sheet_hub')) {
        await this.handleJobSheetPost(message);
      }
      return;
    }

    // 5. Handle #leave-request Posts
    if (ChannelHelper.isChannel(message, 'LEAVE_REQUEST')) {
      if (cohortManager.isFeatureEnabled(message.guild.id, 'leave_request_hub')) {
        await this.handleLeavePost(message);
      }
      return;
    }
  }

  /**
   * Verified Interview Hub: Validates format, marks Pending Verification, and allows mentor verification (+1.0 pt)
   */
  static async handleInterviewPost(message) {
    try {
      const studentId = message.author.id;
      const studentName = message.author.displayName || message.author.username;

      // ── Step 1: Validate format (Company, Role, Date) ──
      const validation = await GeminiService.validateInterviewPost(message.content);

      if (!validation.valid) {
        message.react('⚠️').catch(() => {});
        const missingList = (validation.missingFields || []).map(f => `• ❌ **${f}**`).join('\n');

        const warningEmbed = Embeds.warning(
          '⚠️ Invalid Interview Post Format — Verification Pending Blocked',
          `Hello <@${studentId}>, your message in <#${message.channel.id}> is **missing required information**.\n\n` +
          `**Missing Information:**\n${missingList || '• ❌ Insufficient interview details'}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📋 **Required Format — Copy & Fill In:**\n` +
          `\`\`\`\n` +
          `🏢 Company: [Company Name]\n` +
          `💼 Role: [Job Title / Position]\n` +
          `📅 Interview Date: [DD Month YYYY or YYYY-MM-DD]\n` +
          `🛠️ Tech Stack: [Languages / Frameworks] (optional)\n` +
          `📷 Proof: [Attach screenshot / invitation email]\n` +
          `\`\`\`\n` +
          `✏️ **Please edit your message or repost with the correct format to submit for mentor verification!**`
        );
        return message.reply({ embeds: [warningEmbed] }).catch(() => {});
      }
      // ── Step 2: Valid post — Mark as Pending Verification ──
      message.react('⏳').catch(() => {});

      const safeCompany = (validation.company || 'Company').substring(0, 30);
      const safeRole = (validation.role || 'Role').substring(0, 30);
      const safeDate = validation.interviewDate || DateTimeUtil.getTodayDateStr();

      const pendingEmbed = Embeds.info(
        "⏳ Interview Call Logged — Pending Mentor Verification",
        `Hello <@${studentId}>, your upcoming interview has been registered and is **awaiting mentor verification**!\n\n` +
        `• 🏢 **Company:** **${safeCompany}**\n` +
        `• 💼 **Role:** **${safeRole}**\n` +
        `• 📅 **Interview Date:** \`${safeDate}\`\n` +
        (validation.techStack ? `• 🛠️ **Tech Stack:** ${validation.techStack}\n` : '') +
        `• 📷 **Attachment:** ${message.attachments.size > 0 ? `✅ ${message.attachments.size} file(s) attached` : '⚠️ No screenshot attached'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ **Points (+1.0 Point) will be credited automatically once a Mentor or CR verifies this post with a ✅ reaction or by clicking Verify below.**`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`interview_verify_${studentId}_${encodeURIComponent(safeCompany)}_${encodeURIComponent(safeRole)}_${safeDate}_${message.id}`)
          .setLabel('✅ Verify Interview (+1.0 Pt)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎯')
      );

      await message.reply({ embeds: [pendingEmbed], components: [row] }).catch(() => {});

    } catch (e) {
      Logger.error("Error handling interview post in channel:", e.message);
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
   * Handles Mentor daily job task / target announcement posts in #daily-tasks
   */
  static async handleMentorDailyTaskAnnouncement(message) {
    try {
      const cohortManager = require('../config/cohortManager');
      const text = message.content.trim();
      const todayStr = DateTimeUtil.getTodayDateStr();

      // Extract target count from text (e.g. "10", "12", "15" or "Target: 12")
      let targetCount = null;
      const targetMatch = text.match(/(?:target|apply|applications?|apps?)[:\s]+(\d{1,3})/i) ||
                          text.match(/(\d{1,3})\s*(?:ta|ti|টি|টা)?\s*(?:apply|applications?|apps?|jobs?)/i) ||
                          text.match(/\b(\d{1,2})\b/);

      if (targetMatch) {
        targetCount = parseInt(targetMatch[1], 10);
      }

      // Extract date if mentioned (e.g. YYYY-MM-DD)
      const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
      const targetDate = dateMatch ? dateMatch[1] : todayStr;

      if (targetCount && targetCount > 0) {
        // Save in cohort manager
        cohortManager.setDailyJobTarget(message.guild.id, targetDate, targetCount, text);

        message.react('🎯').catch(() => {});

        const tier70Min = Math.ceil(targetCount * 0.7);
        const tier70Max = targetCount - 1;

        const confirmEmbed = Embeds.info(
          `🎯 DAILY JOB TARGET & CRITERIA REGISTERED · ${targetDate}`,
          `✅ **Official daily application target set to \`${targetCount} Applications\` for \`${targetDate}\`.**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚖️ **Scoring & Marking Criteria for Tonight:**\n` +
          `• 🟢 **১০০% টার্গেট (${targetCount}+ টি আবেদন):** \`+1.0 Point\`\n` +
          `• 🟡 **৭০%–৯৯% (${tier70Min}–${tier70Max}টি আবেদন):** \`+0.5 Point\`\n` +
          `• 🔴 **< ৭০% (< ${tier70Min}টি আবেদন):** \`-0.5 Point\` *(পেনাল্টি)*\n` +
          `• ⏰ **নাইটলি স্ক্র্যাপার ডেডলাইন:** **রাত ১২:০০ টা (মধ্যরাত)**\n\n` +
          `👉 *আজ রাত ১২:০৫ এ স্বয়ংক্রিয় স্ক্র্যাপার স্টুডেন্টদের শিট এই টার্গেটের (${targetCount}টি আবেদন) ভিত্তিতে যাচাই করবে।*`
        );

        await message.reply({ embeds: [confirmEmbed] }).catch(() => {});
      }
    } catch (e) {
      Logger.error("Error handling mentor daily task post:", e.message);
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
   * Handles non-command message posts in #leave-request
   * Unformatted or plain text messages are NOT counted as leaves.
   * Prompts the student with the required format and provides a one-click form button.
   */
  static async handleLeavePost(message) {
    try {
      const studentId = message.author.id;
      const cohortManager = require('../config/cohortManager');

      // Mentors and Supervisors can chat/post in leave channel without triggering format warnings
      if (cohortManager.isMentor(message.guild.id, message.member)) {
        return;
      }

      message.react('⚠️').catch(() => {});

      const warningEmbed = Embeds.warning(
        "⚠️ Leave Request Format Required",
        `Hello <@${studentId}>, messages in this channel are **not automatically counted** as leave requests.\n\n` +
        `If you need to request an excused absence, you must use the **\`!leave\`** command or click the button below to open the form:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 **Required Format Options:**\n\n` +
        `• **1. Leave for Today:**\n` +
        `  \`!leave <Reason>\`\n` +
        `  *Example:* \`!leave Severe fever and doctor appointment\`\n\n` +
        `• **2. Specific Single Date:**\n` +
        `  \`!leave YYYY-MM-DD <Reason>\`\n` +
        `  *Example:* \`!leave 2026-09-10 University semester final exam\`\n\n` +
        `• **3. Date Range (Multiple Days):**\n` +
        `  \`!leave YYYY-MM-DD YYYY-MM-DD <Reason>\`\n` +
        `  *Example:* \`!leave 2026-09-10 2026-09-12 Family emergency\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 *Or click below to open the interactive form directly:*`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_leave_modal_${studentId}`)
          .setLabel('📝 Open Leave Request Form')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📋')
      );

      return message.reply({ embeds: [warningEmbed], components: [row] }).catch(() => {});
    } catch (e) {
      Logger.error("Error handling leave post warning in channel:", e.message);
    }
  }
}

module.exports = MessageHandler;
