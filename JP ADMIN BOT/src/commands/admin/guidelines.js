/**
 * Commands: !posttemplates, !guidelines, !formatguidelines, !postguidelines
 * Broadcasts standardized posting templates individually or all at once with interactive buttons
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ChannelHelper = require('../../utils/channelHelper');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'posttemplates',
  aliases: ['guidelines', 'formatguidelines', 'postguidelines', 'channelguidelines', 'templates'],
  description: 'Broadcasts standardized posting guidelines and copy-paste templates to student channels individually or all at once',
  usage: '!posttemplates [all | interview | task | tracker | leave] | !posttemplates menu',
  mentorOnly: true,

  async execute(message, args, client) {
    const rawFilter = args[0]?.toLowerCase();
    const guild = message.guild;

    // --- Interactive Selector Panel if no argument provided ---
    if (!rawFilter || rawFilter === 'menu' || rawFilter === 'help') {
      const menuEmbed = Embeds.info(
        "📢 Standard Template Publisher Hub",
        "Choose which channel guidelines and copy-paste format templates you would like to broadcast to students:\n\n" +
        "• 🎙️ **Interview Prep Template:** Posts 30-question format guide to `#interview-preparations`\n" +
        "• 🛠️ **Job Task Template:** Posts task announcement & `!submit` guide to `#jobs-task-updates`\n" +
        "• 📊 **Job Tracker Sheet Template:** Posts one-time sheet linking guide to `#job-tracker`\n" +
        "• 📝 **Leave Request Template:** Posts leave rules & form guide to `#leave-request`\n" +
        "• 📢 **Broadcast All:** Posts all 4 templates at once across all student channels\n\n" +
        "👇 *Click a button below to publish immediately:*",
        `JP ADMIN ${constants.BOT_VERSION} · Guidelines Hub`
      );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_post_tpl_interview').setLabel('🎙️ Interview Template').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_post_tpl_task').setLabel('🛠️ Job Task Template').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_post_tpl_job').setLabel('📊 Tracker Sheet Template').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_post_tpl_leave').setLabel('📝 Leave Template').setStyle(ButtonStyle.Primary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_post_tpl_all').setLabel('📢 Post ALL 4 Templates').setStyle(ButtonStyle.Danger)
      );

      return message.reply({ embeds: [menuEmbed], components: [row1, row2] });
    }

    // --- Direct Execution by Command Filter ---
    const loading = await message.reply("📢 Publishing specified template(s) across student channels...");

    try {
      const result = await module.exports.publishTemplates(guild, rawFilter);
      const receiptEmbed = Embeds.success(
        "Standard Guidelines Published! 📢",
        `✅ Successfully published specified template(s) to:\n\n` +
        result.publishedChannels.map(ch => `• ${ch}`).join('\n') +
        `\n\n*Students have received mentions and clean copy-paste templates.*`
      );

      await loading.edit({ content: null, embeds: [receiptEmbed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Publication Error", err.message)] });
    }
  },

  /**
   * Helper function to publish templates by filter key
   */
  async publishTemplates(guild, filterKey) {
    const filter = String(filterKey || 'all').toLowerCase();
    const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
    const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;
    const publishedChannels = [];

    // 1. Post to #interview-preparations
    if (filter === 'all' || filter === 'interview' || filter === '1' || filter === 'prep') {
      const interviewCh = ChannelHelper.findChannel(guild, 'INTERVIEW_UPDATE');
      if (interviewCh) {
        const interviewEmbed = Embeds.info(
          "🎙️ Standard Posting Format: Interview Preparation Updates",
          "Whenever you have an upcoming interview, please post your update using the template below.\n\n" +
          "✨ **Why this is important:**\n" +
          "• 🤖 **Google Gemini AI** will instantly analyze your role & tech stack and generate a comprehensive **30-Question Master Preparation Guide** (Core Language, Frameworks, System Design & Behavioral)!\n" +
          "• ⭐ **+2 Points** will be automatically added to your Leaderboard & RTBR score!\n\n" +
          "📋 **COPY & PASTE THIS TEMPLATE:**\n" +
          "```text\n" +
          "🏢 Company: [Company Name]\n" +
          "💼 Role: [e.g. Frontend / Backend / Full Stack Engineer]\n" +
          "🛠️ Tech Stack: [e.g. React, Next.js, Node.js, TypeScript]\n" +
          "📅 Date & Time: [e.g. 30 August 2026, 4:00 PM]\n" +
          "🎯 Round: [e.g. Technical Round 1 / Live Coding / HR]\n" +
          "```\n\n" +
          "💡 **Example Post:**\n" +
          "```text\n" +
          "🏢 Company: Brain Station 23\n" +
          "💼 Role: Full Stack Developer\n" +
          "🛠️ Tech Stack: Next.js, NestJS, PostgreSQL, Docker\n" +
          "📅 Date & Time: 31 August 2026, 3:30 PM\n" +
          "🎯 Round: Technical Round 1 (System Design & Live Coding)\n" +
          "```",
          `JP ADMIN ${constants.BOT_VERSION} · Interview Prep Guidelines`
        );

        await interviewCh.send({
          content: `${mentionTag} 📢 **Please follow this standard format when sharing interview updates:**`,
          embeds: [interviewEmbed]
        });
        publishedChannels.push(`<#${interviewCh.id}> (Interview Prep)`);
      }
    }

    // 2. Post to #jobs-task-updates
    if (filter === 'all' || filter === 'task' || filter === '2' || filter === 'assignment') {
      const taskCh = ChannelHelper.findChannel(guild, 'JOB_TASK');
      if (taskCh) {
        const taskEmbed = Embeds.info(
          "📈 Standard Posting Format: Job Task Announcements & Submissions",
          "When you receive a hiring assignment or coding task from a company, announce it here to earn points and get mentor review.\n\n" +
          "✨ **Point Rules:**\n" +
          "• 🛠️ **Task Announced:** **+1 Point** immediately awarded upon posting!\n" +
          "• ✅ **Task Approved:** Reply with `!submit` when done and get **+1 additional point** upon mentor review!\n" +
          "• ⚠️ **Deadline Overdue:** Missed deadlines without submission result in a **-2 point penalty**.\n\n" +
          "📋 **STEP 1: ANNOUNCE TASK (COPY & PASTE TEMPLATE):**\n" +
          "```text\n" +
          "🏢 Company: [Company Name]\n" +
          "💼 Role: [e.g. React Developer]\n" +
          "🛠️ Tech Stack: [e.g. React, Redux, REST API]\n" +
          "📅 Deadline: [YYYY-MM-DD, e.g. 2026-08-30]\n" +
          "📄 Task Brief: [Short summary or Notion/Drive link]\n" +
          "```\n\n" +
          "📋 **STEP 2: SUBMIT SOLUTION WHEN FINISHED:**\n" +
          "1. Reply to your announcement message with: `!submit`\n" +
          "2. Fill out the popup modal with your **GitHub Repository URL** and **Live Demo URL**.\n" +
          "3. Mentors will review your code and approve your submission for points!",
          `JP ADMIN ${constants.BOT_VERSION} · Job Task Guidelines`
        );

        await taskCh.send({
          content: `${mentionTag} 📢 **Please follow this standard format for all Job Tasks & Assignments:**`,
          embeds: [taskEmbed]
        });
        publishedChannels.push(`<#${taskCh.id}> (Job Tasks)`);
      }
    }

    // 3. Post to #job-tracker
    if (filter === 'all' || filter === 'job' || filter === 'jobs' || filter === '3' || filter === 'tracker' || filter === 'sheet') {
      const jobCh = ChannelHelper.findChannel(guild, 'JOB_TRACKING');
      const cohortManager = require('../../config/cohortManager');
      const templateLink = cohortManager.getTrackerTemplate(guild.id);

      if (jobCh) {
        const jobEmbed = Embeds.info(
          "📊 One-Time Job Application Tracker Setup & Template",
          "To have your daily job applications automatically audited and scored every night, please set up your personal Google Sheet.\n\n" +
          "📥 **STEP 1: MAKE A COPY OF THE OFFICIAL DEMO TEMPLATE:**\n" +
          "If you haven't created your application tracker yet, open our official demo template below:\n" +
          `👉 **[🔗 Click Here to Open & Copy Demo Tracker Template](${templateLink})**\n` +
          "*(Inside Google Sheets, click: **File ➔ Make a copy** to save it to your own Google Drive)*\n\n" +
          "✨ **Required Column Headers in Your Sheet:**\n" +
          "`Company` | `Position` | `Job Type` | `Job Link` | `How Applied` | `Date`\n\n" +
          "⚠️ **Strict Anti-Duplicate & Quality Rules:**\n" +
          "• 🚫 **No Duplicate Links:** The bot will NOT count duplicate `Job Link` submissions.\n" +
          "• 🚫 **No Empty Links:** Rows missing a valid `Job Link`, `Company`, or `Position` will be ignored.\n\n" +
          "📋 **STEP 2: LINK YOUR SHEET (ONE-TIME):**\n" +
          "1. Open your copied Google Sheet > Click **Share** (top-right) > Change General access to: **\"Anyone with the link\" (Viewer or Editor)**.\n" +
          "2. Run this command here:\n" +
          "```text\n" +
          "!linksheet <Paste_Your_Google_Sheet_URL_Here>\n" +
          "```\n" +
          "*(Or simply paste your Google Sheet link directly in this channel)*\n\n" +
          "🤖 **24/7 Automated Daily Audits:**\n" +
          "Every night at **23:30 (11:30 PM)**, the bot will automatically inspect your sheet, count your unique applications, and award your daily points (+2.0 pts) & streak bonuses!",
          `JP ADMIN ${constants.BOT_VERSION} · Job Tracker Setup`
        );

        await jobCh.send({
          content: `${mentionTag} 📢 **Please create a copy of the demo tracker and link your Google Sheet:**`,
          embeds: [jobEmbed]
        });
        publishedChannels.push(`<#${jobCh.id}> (Job Tracker)`);
      }
    }

    // 4. Post to #leave-request
    if (filter === 'all' || filter === 'leave' || filter === 'leaves' || filter === '4' || filter === 'holiday') {
      const leaveCh = ChannelHelper.findChannel(guild, 'LEAVE_REQUEST');

      if (leaveCh) {
        const leaveEmbed = Embeds.info(
          "📝 Standard Guidelines: Student Leave & Excused Absence Requests",
          "If you are unable to attend sessions due to illness, academic exams, or family emergencies, please submit an excused absence application in advance.\n\n" +
          "✨ **Why Submit a Leave Request:**\n" +
          "• 🛡️ **Absence Immunity:** Approved leave dates are marked as Excused (`L`) in Attendance with **0 penalty**, protecting you from 3-day absence warnings!\n" +
          "• ⚡ **Automated Review:** Mentors receive an instant review card to approve your request.\n\n" +
          "📋 **METHOD 1: INTERACTIVE FORM (EASIEST):**\n" +
          "Click the **📝 Open Leave Request Form** button below or type `!leave` to fill out the popup form!\n\n" +
          "📋 **METHOD 2: DIRECT COMMAND FORMAT (COPY & PASTE):**\n" +
          "```text\n" +
          "!leave <StartDate> <EndDate> <Reason>\n" +
          "```\n\n" +
          "💡 **Examples:**\n" +
          "• Single Day: `!leave 2026-08-27 2026-08-27 Fever and doctor appointment`\n" +
          "• Multiple Days: `!leave 2026-08-27 2026-08-29 University Final Semester Exams`\n\n" +
          "🔔 **Status & Notifications:**\n" +
          "• You will immediately receive confirmation that your request is **under review**.\n" +
          "• Once approved by mentors, you will receive an automatic notification via **Direct Message (DM)**!",
          `JP ADMIN ${constants.BOT_VERSION} · Leave Guidelines`
        );

        const formRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('open_leave_modal_general')
            .setLabel('📝 Open Leave Request Form')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋')
        );

        await leaveCh.send({
          content: `${mentionTag} 📢 **Please follow these guidelines when submitting leave/absence requests:**`,
          embeds: [leaveEmbed],
          components: [formRow]
        });
        publishedChannels.push(`<#${leaveCh.id}> (Leave Requests)`);
      }
    }

    return { publishedChannels };
  }
};
