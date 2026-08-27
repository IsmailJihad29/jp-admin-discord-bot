/**
 * Commands: !linksheet, !trackersheet, !jobsheet, !mytracker, !mysheet, !registersheet
 * One-time Student Job Application Tracker Google Sheet Registration & Verification
 */

const GasClient = require('../../services/gasClient');
const JobScraperService = require('../../services/jobScraperService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'linksheet',
  aliases: ['trackersheet', 'jobsheet', 'mytracker', 'mysheet', 'registersheet', 'sheet'],
  description: 'Links your personal Google Sheet Job Application Tracker once for 24/7 automated daily audits',
  usage: '!linksheet <Google_Sheet_URL> | !mysheet',
  supervisorOnly: false, // Students can run !linksheet

  async execute(message, args, client) {
    const student = message.author;
    const guildId = message.guild.id;

    // --- 1. View Current Linked Sheet: !mysheet or !linksheet without args ---
    if (args.length === 0) {
      const loading = await message.reply("🔍 Checking your registered Job Tracker Sheet...");
      try {
        const sheetRes = await GasClient.request(guildId, 'getJobSheets', {}).catch(() => ({ sheets: [] }));
        const studentSheet = (sheetRes.sheets || []).find(s => s.discordId === student.id);

        if (!studentSheet || !studentSheet.sheetUrl) {
          return loading.edit({
            content: null,
            embeds: [Embeds.warning(
              "No Job Tracker Sheet Linked",
              `Hello <@${student.id}>, you have not linked your personal Job Application Tracker Google Sheet yet.\n\n` +
              `📋 **How to link your sheet in 2 easy steps:**\n` +
              `1. Open your Google Sheet > Click **Share** (top right) > Set General Access to **"Anyone with the link" (Viewer or Editor)**.\n` +
              `2. Run this command:\n` +
              `\`!linksheet <Paste_Your_Google_Sheet_URL_Here>\`\n\n` +
              `*(Once linked, the bot will automatically audit your daily job applications every night at 23:30 (11:30 PM)!)*`
            )]
          });
        }

        // Test scrape to show current stats
        const scrape = await JobScraperService.scrapeStudentJobSheet(studentSheet.sheetUrl, student.id);

        const embed = Embeds.info(
          `📊 Your Linked Job Tracker Sheet`,
          `👤 **Student:** <@${student.id}>\n` +
          `🔗 **Sheet URL:** [Click to Open Google Sheet](${studentSheet.sheetUrl})\n` +
          `🤖 **Auto-Scraper Status:** 🟢 **Active** *(Audits automatically every night at 23:30)*\n` +
          `📅 **Last Verified:** \`${studentSheet.lastScraped || DateTimeUtil.getFullTimestamp()}\`\n\n` +
          `📈 **Live Scrape Statistics:**\n` +
          `• 💼 **Total Logged Applications:** **${scrape.success ? scrape.totalRows : 'N/A'} applications**\n` +
          `• 📅 **Dated Today (${DateTimeUtil.getTodayDateStr()}):** **${scrape.success ? scrape.datedTodayCount : '0'} applications**\n\n` +
          `💡 *Need to update your sheet link? Simply run \`!linksheet <New_Google_Sheet_URL>\`.*`,
          `JP ADMIN ${constants.BOT_VERSION} · Job Tracker`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
    }

    // --- 2. Register / Update Sheet: !linksheet <URL> ---
    const sheetUrl = args[0].trim();
    const parsed = JobScraperService.parseSheetUrl(sheetUrl);

    if (!parsed || !parsed.sheetId) {
      return message.reply({
        embeds: [Embeds.warning(
          "Invalid Google Sheet URL",
          "The provided link is not a valid Google Sheet URL.\n\n" +
          "📋 **Example format:**\n" +
          "`https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`"
        )]
      });
    }

    const loading = await message.reply("⏳ Connecting to your Google Sheet and verifying link permissions...");

    try {
      // 1. Live Test Scrape
      const scrape = await JobScraperService.scrapeStudentJobSheet(sheetUrl, student.id);

      if (!scrape.success) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning(
            "⚠️ Google Sheet Permission Error",
            `The bot could not read your Google Sheet.\n\n` +
            `**Reason:** ${scrape.error}\n\n` +
            `🛠️ **How to fix:**\n` +
            `1. Open your Google Sheet in your browser.\n` +
            `2. Click the blue **Share** button at the top-right corner.\n` +
            `3. Under **General access**, change from *Restricted* to **"Anyone with the link"** (Viewer or Editor).\n` +
            `4. Copy the link and run \`!linksheet <URL>\` again!`
          )]
        });
      }

      // 2. Fetch student info from Roster
      const rosterRes = await GasClient.getRoster(guildId).catch(() => ({ students: [] }));
      const studentProfile = (rosterRes.students || []).find(s => s.discordId === student.id);
      const studentName = studentProfile?.name || message.member?.displayName || student.username;
      const studentEmail = studentProfile?.email || "";

      // 3. Save to Google Sheets database
      await GasClient.request(guildId, 'recordJobSheet', {
        discordId: student.id,
        name: studentName,
        email: studentEmail,
        sheetUrl: sheetUrl,
        sheetId: parsed.sheetId,
        gid: parsed.gid
      });

      const successEmbed = Embeds.success(
        "Job Application Tracker Linked Successfully! 🎉",
        `Hello <@${student.id}>, your personal job tracker sheet has been registered and verified.\n\n` +
        `• 👤 **Student:** **${studentName}**\n` +
        `• 🔗 **Sheet URL:** [Click to Open Google Sheet](${sheetUrl})\n` +
        `• 💼 **Existing Applications Detected:** **${scrape.totalRows} applications**\n` +
        `• 📅 **Today's Applications:** **${scrape.datedTodayCount} applications**\n` +
        `• 🤖 **Automated Daily Audit:** 🟢 **Active**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 **IMPORTANT NOTE:**\n` +
        `You do **NOT** need to post your sheet link every day! The bot will automatically inspect your sheet **every night at 23:30 (11:30 PM)**, calculate your points (+2.0 pts for target, streak bonuses), and sync them to your profile!`
      );

      await loading.edit({ content: null, embeds: [successEmbed] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Linking Error", err.message)] });
    }
  }
};
