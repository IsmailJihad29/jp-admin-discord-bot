/**
 * Commands: !myhealth, !myprofile, !mystatus, !healthcheck, !me, !panelhealth
 * Comprehensive Student Health, Score, Attendance, Velocity, and Status Checker
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GasClient = require('../../services/gasClient');
const ScoringService = require('../../services/scoringService');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'myhealth',
  aliases: ['myprofile', 'mystatus', 'healthcheck', 'me', 'panelhealth', 'studenthealth'],
  description: 'View full student performance scorecard, attendance points, job applications, streak, and referral eligibility',
  usage: '!myhealth [@student] | !panelhealth',
  supervisorOnly: false, // Students can run !myhealth

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    // --- 1. Mentor Panel Poster: !panelhealth ---
    if (commandName === 'panelhealth') {
      const cohortManager = require('../../config/cohortManager');
      if (!cohortManager.isMentor(guild.id, message.member)) {
        return message.reply({
          embeds: [Embeds.warning("Access Denied", "Only Mentors and Supervisors can post the Health Check panel.")]
        });
      }

      const healthCh = ChannelHelper.findChannel(guild, 'HEALTH_CHECK') || message.channel;

      const panelEmbed = Embeds.info(
        "🩺 Student Health & Performance Check Center",
        "Welcome to your personal performance diagnosis center! Here you can check your real-time mentorship health, total points, job application count, and referral eligibility.\n\n" +
        "📊 **What you'll see in your health report:**\n" +
        "• 📅 **Attendance Score:** Present (+1 pt) & Absent (-1 pt) sessions\n" +
        "• 💼 **Job Tracking Velocity:** 7-day job applications & daily streaks\n" +
        "• 🎯 **Interviews Logged:** Scheduled interview points (+5 pts each)\n" +
        "• 🛠️ **Job Tasks:** Completed solutions & mentor review score\n" +
        "• 🔒 **Referral Status:** Right-To-Be-Referred (RTBR) access unlock state\n\n" +
        "👇 *Click the button below to get your private instant health scorecard:*",
        `JP ADMIN ${constants.BOT_VERSION} · Personal Health Check`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_my_health_check')
          .setLabel('🔍 Check My Health & Status')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🩺')
      );

      await healthCh.send({ embeds: [panelEmbed], components: [row] });
      return message.reply(`✅ Health Check interactive panel posted in <#${healthCh.id}>.`);
    }

    // --- 2. Build Student Health Report ---
    const targetMember = message.mentions.members.first() || message.member;
    const targetDiscordId = targetMember.id;

    const loading = await message.reply(`🔍 Compiling real-time performance & health scorecard for <@${targetDiscordId}>...`);

    try {
      const scorecard = await module.exports.buildStudentHealthEmbed(guild, targetMember);
      await loading.edit({ content: null, embeds: [scorecard] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Health Check Error", err.message)] });
    }
  },

  /**
   * Generates a comprehensive health scorecard Embed for a student
   */
  async buildStudentHealthEmbed(guild, member) {
    const discordId = member.id;
    const guildId = guild.id;

    // Fetch live data from Apps Script backend
    const [rosterRes, attendanceRes, jobsRes, tasksRes, interviewsRes, standings] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ rows: [], dates: [] })),
      GasClient.getJobsDaily(guildId, 7).catch(() => ({ jobs: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      GasClient.getInterviews(guildId, 7).catch(() => ({ interviews: [] })),
      ScoringService.calculateRTBR(guildId).catch(() => [])
    ]);

    const studentProfile = (rosterRes.students || []).find(s => s.discordId === discordId);
    const studentName = studentProfile?.name || member.displayName || member.user.username;
    const email = studentProfile?.email || "Not linked in Bot_Map";
    const region = studentProfile?.region || "Unspecified";

    // 1. Attendance Metrics
    const attRow = (attendanceRes.rows || []).find(r => r.discordId === discordId);
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let totalSessions = 0;
    let attPoints = 0;

    if (attRow && attRow.sessions) {
      Object.values(attRow.sessions).forEach(mark => {
        const m = String(mark || "").toUpperCase().trim();
        totalSessions++;
        if (m === 'P' || m.startsWith('P')) {
          presentCount++;
          attPoints += constants.SCORING.ATTENDANCE_PRESENT;
        } else if (m === 'A' || m.startsWith('A')) {
          absentCount++;
          attPoints += constants.SCORING.ATTENDANCE_ABSENT;
        } else if (m === 'L' || m.startsWith('L')) {
          leaveCount++;
        }
      });
    }

    // 2. Job Application Metrics (Last 7 Days)
    const studentJobs = (jobsRes.jobs || []).filter(j => j.discordId === discordId);
    let totalJobs7Days = 0;
    let jobPoints = 0;
    let consecutiveDays = 0;
    const cohortTarget = constants.SCORING.DEFAULT_JOB_TARGET;

    studentJobs.forEach(jobDay => {
      const count = Number(jobDay.count) || 0;
      totalJobs7Days += count;
      jobPoints += ScoringService.calculateDailyJobScore(count, cohortTarget);
      if (count >= cohortTarget) consecutiveDays++;
    });

    const streakBonus = Math.min(consecutiveDays * constants.SCORING.STREAK_BONUS_PER_DAY, constants.SCORING.STREAK_CAP);

    // 3. Interview Points (+5 per interview)
    const studentInterviews = (interviewsRes.interviews || []).filter(i => i.discordId === discordId);
    const interviewCount = studentInterviews.length;
    const interviewPoints = interviewCount * constants.SCORING.INTERVIEW_POINTS;

    // 4. Job Task Points
    const studentTasks = (tasksRes.tasks || []).filter(t => t.discordId === discordId);
    let taskPoints = 0;
    studentTasks.forEach(t => {
      taskPoints += Number(t.pointsAwarded) || 0;
    });

    // 5. Total Score & Rank Standing
    const studentStanding = standings.find(s => s.discordId === discordId);
    const totalPoints = studentStanding ? studentStanding.totalPoints : Math.round((attPoints + jobPoints + streakBonus + interviewPoints + taskPoints) * 10) / 10;
    const rankIndex = standings.findIndex(s => s.discordId === discordId);
    const rankStr = rankIndex >= 0 ? `#${rankIndex + 1} of ${standings.length}` : "Unranked";

    // 6. Referral Lockout State
    const hasRestrictionRole = member.roles.cache.some(r => r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase());
    const referralStatusStr = hasRestrictionRole
      ? "🔴 **Restricted** (Locked from #resume-needed due to low score)"
      : "🟢 **Unlocked** (Full Access to Resume Referral Drive)";

    // 7. Live Job Tracker Scrape & Analytics
    const JobScraperService = require('../../services/jobScraperService');
    const sheetRes = await GasClient.request(guildId, 'getJobSheets', {}).catch(() => ({ sheets: [] }));
    const studentSheet = (sheetRes.sheets || []).find(s => s.discordId === discordId);
    let trackerInsightStr = "• 💼 **Sheet Status:** *Not linked yet. Run `!linksheet <URL>` to enable automated daily audits.*";

    if (studentSheet && studentSheet.sheetUrl) {
      const scrape = await JobScraperService.scrapeStudentJobSheet(studentSheet.sheetUrl, discordId);
      if (scrape.success) {
        trackerInsightStr =
          `• 🏢 **Unique Companies Applied:** **${scrape.uniqueCompaniesCount} Companies**\n` +
          `• 🎯 **Top Target Roles:** ${scrape.topPositions.length > 0 ? scrape.topPositions.map(p => `\`${p}\``).join(' ') : '`Software Engineer`'}\n` +
          `• 🌐 **Application Channels:** ${scrape.topPlatforms.length > 0 ? scrape.topPlatforms.map(p => `\`${p}\``).join(' ') : '`Online/LinkedIn`'}\n` +
          `• 🛡️ **Data Quality:** \`${scrape.totalRows} valid rows\` | \`${scrape.duplicateLinksCount} duplicate links filtered\` | \`${scrape.invalidRowsCount} incomplete skipped\``;
      } else {
        trackerInsightStr = `• ⚠️ **Sheet Sync Issue:** *${scrape.error}*`;
      }
    }

    // 8. Health Status Evaluation
    let healthGrade = "🟢 **EXCELLENT**";
    let healthAdvice = "Keep up the consistent job submissions and active attendance to maintain top referral priority!";

    if (absentCount >= 3 || totalPoints < 0) {
      healthGrade = "🔴 **CRITICAL (AT-RISK)**";
      healthAdvice = "⚠️ You have 3 or more absences or negative points. Please submit attendance daily, catch up on job applications, and contact a Mentor for 1-on-1 support!";
    } else if (absentCount >= 2 || totalJobs7Days < 15) {
      healthGrade = "🟡 **NEEDS ATTENTION**";
      healthAdvice = "⚠️ Watch your daily attendance and aim for 10 applications daily to boost your streak points and leaderboard rank.";
    }

    return Embeds.info(
      `🩺 Student Health Scorecard · ${studentName}`,
      `👤 **Student Profile:**\n` +
      `• **Name:** **${studentName}** (<@${discordId}>)\n` +
      `• **Email:** \`${email}\` | **Region:** \`${region}\`\n` +
      `• **Overall Rank:** 🏆 **${rankStr}**\n` +
      `• **Health Status:** ${healthGrade}\n` +
      `• **Referral Drive Access:** ${referralStatusStr}\n\n` +
      `──────────────────────────────\n` +
      `📊 **Comprehensive Points Breakdown:**\n\n` +
      `• 📅 **Attendance (${totalSessions} sessions):** \`${attPoints >= 0 ? '+' : ''}${attPoints} pts\`\n` +
      `  *Present: ${presentCount} | Absent: ${absentCount} | Leave: ${leaveCount}*\n\n` +
      `• 💼 **Job Tracker (Last 7 Days):** \`${jobPoints >= 0 ? '+' : ''}${jobPoints} pts\`\n` +
      `  *7-Day Total Apps: ${totalJobs7Days} | Streak: ${consecutiveDays} days (+${streakBonus} pts)*\n\n` +
      `• 🎙️ **Interviews Logged (${interviewCount}):** \`+${interviewPoints} pts\` *(+5 pts each)*\n\n` +
      `• 🛠️ **Job Tasks (${studentTasks.length} tasks):** \`${taskPoints >= 0 ? '+' : ''}${taskPoints} pts\`\n\n` +
      `──────────────────────────────\n` +
      `📈 **Live Job Application Tracker Analytics:**\n` +
      `${trackerInsightStr}\n\n` +
      `──────────────────────────────\n` +
      `⭐ **TOTAL CONSOLIDATED SCORE:** **${totalPoints} PTS**\n\n` +
      `💡 **Mentor Recommendation:**\n${healthAdvice}`,
      `JP ADMIN ${constants.BOT_VERSION} · Generated at ${DateTimeUtil.getFullTimestamp()}`
    );
  }
};
