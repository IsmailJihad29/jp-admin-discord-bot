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
        "Welcome to your personal performance diagnosis center! Here you can check your dual real-time mentorship health: this week's velocity and your overall lifetime career standings.\n\n" +
        "📊 **What you'll see in your health report:**\n" +
        "• 🏆 **This Week's Performance:** Weekly Leaderboard rank, total weekly points, jobs applied & attendance breakdown\n" +
        "• 📈 **Lifetime Career Performance:** Lifetime Leaderboard rank, cumulative all-time points & session history\n" +
        "• 🔒 **Referral Drive Access:** Right-To-Be-Referred (RTBR) access unlock state\n\n" +
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
    let force = false;
    if (args.some(a => a.toLowerCase() === 'refresh' || a.toLowerCase() === 'force')) {
      force = true;
      args = args.filter(a => a.toLowerCase() !== 'refresh' && a.toLowerCase() !== 'force');
    }

    const cohortManager = require('../../config/cohortManager');
    const isMentor = cohortManager.isMentor(guild.id, message.member);

    let targetMember = message.mentions.members.first();
    if (!targetMember && args[0]) {
      const cleanArg = args[0].replace(/[<@!>]/g, '').trim();
      targetMember = guild.members.cache.get(cleanArg) ||
        guild.members.cache.find(m => m.user.username.toLowerCase() === cleanArg.toLowerCase());
    }

    // Students cannot inspect other students — Mentor/Supervisor only
    if (targetMember && targetMember.id !== message.author.id && !isMentor) {
      return message.reply({
        embeds: [Embeds.warning(
          "Access Restricted",
          "Students can only check their own scorecard. To view another student's scorecard, you must be a **Mentor or Supervisor**."
        )]
      });
    }

    if (!targetMember) {
      targetMember = message.member;
    }

    const targetDiscordId = targetMember.id;
    const loadingMsg = force
      ? `🔄 Recalculating live performance & syncing to Google Sheets for <@${targetDiscordId}>...`
      : `🔍 Retrieving scorecard for <@${targetDiscordId}>...`;
    const loading = await message.reply(loadingMsg);

    try {
      const scorecard = await module.exports.buildStudentHealthEmbed(guild, targetMember, { force });
      await loading.edit({ content: null, embeds: [scorecard] });
    } catch (err) {
      await loading.edit({ content: null, embeds: [Embeds.error("Health Check Error", err.message)] });
    }
  },

  /**
   * Generates a comprehensive health scorecard Embed for a student
   */
  async buildStudentHealthEmbed(guild, member, options = {}) {
    const discordId = member.id;
    const guildId = guild.id;
    const force = options.force === true;

    // ── 1. Check Pre-calculated Google Sheets Tab (Scores) First ──
    if (!force) {
      try {
        const [scoresRes, ledgerRes] = await Promise.all([
          GasClient.getScores(guildId, discordId).catch(() => ({ found: false })),
          GasClient.getPointLedger(guildId, discordId, 5).catch(() => ({ found: false, entries: [] }))
        ]);

        if (scoresRes && scoresRes.found && scoresRes.score) {
          const s = scoresRes.score;
          const studentName = s.name || member.displayName || member.user.username;
          const email = s.email || "Not linked in Bot_Map";
          const { weekSunday, weekThursday } = DateTimeUtil.getCurrentWeekRange('Asia/Dhaka');

          // Referral Lockout Status
          const hasRestrictionRole = member?.roles?.cache?.some
            ? member.roles.cache.some(r =>
                r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase()
              )
            : false;
          const referralStatusStr = hasRestrictionRole
            ? "Restricted (Score < 0 or >= 3 absences)"
            : "Unlocked (Eligible for Referrals)";

          // Dynamic Weekly Status indicator
          const weeklyStatus = s.weeklyStatus || s.status || "Active";
          let statusBadge = "🟢 Active";
          if (weeklyStatus.toLowerCase().includes("3+")) statusBadge = `🔴 ${weeklyStatus}`;
          else if (weeklyStatus.toLowerCase().includes("risk")) statusBadge = `🔴 ${weeklyStatus}`;
          else if (weeklyStatus.toLowerCase().includes("attention")) statusBadge = `🟡 ${weeklyStatus}`;
          else if (weeklyStatus.toLowerCase().includes("inactive")) statusBadge = `⚪ ${weeklyStatus}`;
          else statusBadge = `🟢 ${weeklyStatus}`;

          // Format recent Point Ledger entries
          let ledgerSection = "";
          if (ledgerRes.entries && ledgerRes.entries.length > 0) {
            ledgerSection = "\n\n**📜 Recent Point Transactions (Audit Ledger)**\n" +
              ledgerRes.entries.map(e => {
                const pts = Number(e.pointsAwarded) || 0;
                const sign = pts >= 0 ? `+${pts}` : `${pts}`;
                const dt = e.date || (e.timestamp ? String(e.timestamp).split(' ')[0] : '');
                return `• \`${dt}\` **${sign} pts** [${e.category || 'General'}] *${e.eventSource || ''}* ${e.remarks ? `— ${e.remarks}` : ''}`;
              }).join('\n');
          }

          const weeklyRankStr = s.weeklyRank ? `#${s.weeklyRank}` : "Unranked";
          const lifetimeRankStr = s.lifetimeRank ? `#${s.lifetimeRank}` : "Unranked";

          return Embeds.info(
            `Student Health Scorecard · ${studentName}`,
            `**Student Profile**\n` +
            `• **Name:** **${studentName}** (<@${discordId}>)\n` +
            `• **Email:** \`${email}\`\n` +
            `• **Status:** ${statusBadge} | **Referral Drive:** ${referralStatusStr}\n\n` +
            `**Weekly Performance** (${weekSunday} to ${weekThursday})\n` +
            `• **Weekly Total Score:** **${s.weeklyPoints >= 0 ? '+' : ''}${s.weeklyPoints} pts** (Rank: **${weeklyRankStr}**)\n` +
            `• **Job Applications:** \`${s.weeklyJobs >= 0 ? '+' : ''}${s.weeklyJobs} pts\` | **Streak:** \`+${s.weeklyStreak} pts\`\n` +
            `• **Attendance:** \`${s.weeklyAttendance >= 0 ? '+' : ''}${s.weeklyAttendance} pts\`\n` +
            `• **Interviews:** \`+${s.weeklyInterviews} pts\`\n` +
            `• **Job Tasks:** \`${s.weeklyTasks >= 0 ? '+' : ''}${s.weeklyTasks} pts\`\n\n` +
            `**Lifetime Career Summary**\n` +
            `• **Lifetime Total Score:** **${s.lifetimePoints >= 0 ? '+' : ''}${s.lifetimePoints} pts** (Rank: **${lifetimeRankStr}**)\n` +
            `• **Total Job Points:** \`${s.lifetimeJobs >= 0 ? '+' : ''}${s.lifetimeJobs} pts\` | **Streak:** \`+${s.lifetimeStreak} pts\`\n` +
            `• **Total Attendance Points:** \`${s.lifetimeAttendance >= 0 ? '+' : ''}${s.lifetimeAttendance} pts\`\n` +
            `• **Total Interviews:** \`+${s.lifetimeInterviews} pts\`\n` +
            `• **Total Job Tasks:** \`${s.lifetimeTasks >= 0 ? '+' : ''}${s.lifetimeTasks} pts\`` +
            `${ledgerSection}\n\n` +
            `*(⚡ Instant Sheet Cache · Last synced: ${s.lastUpdated || 'Recently'} · Run \`!myhealth refresh\` for live recalculation)*`,
            `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}`
          );
        }
      } catch (e) {
        // Fall back to live calculation
      }
    }

    // ── 2. Fallback: Full Real-time Multi-Sheet Calculation ──
    const [rosterRes, attendanceRes, jobsRes, tasksRes, interviewsRes, sheetRes, fallbackLedgerRes] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ rows: [], dates: [] })),
      GasClient.getJobsDaily(guildId, 90).catch(() => ({ jobs: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
      GasClient.request(guildId, 'getJobSheets', {}).catch(() => ({ sheets: [] })),
      GasClient.getPointLedger(guildId, discordId, 5).catch(() => ({ found: false, entries: [] }))
    ]);

    const cachedData = { rosterRes, attendanceRes, jobsRes, tasksRes, interviewsRes };

    // Calculate both Weekly and Lifetime standings
    const [weeklyStandings, lifetimeStandings] = await Promise.all([
      ScoringService.calculateRTBR(guildId, guild, { weeklyOnly: true, cachedData }).catch(() => []),
      ScoringService.calculateRTBR(guildId, guild, { weeklyOnly: false, cachedData }).catch(() => [])
    ]);

    const cohortManager = require('../../config/cohortManager');
    const scoring = cohortManager.getCohortScoring(guildId);
    const cohortTarget = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET;

    const studentProfile = (rosterRes.students || []).find(s => s.discordId === discordId);
    const studentName = studentProfile?.name || member.displayName || member.user.username;
    const email = studentProfile?.email || "Not linked in Bot_Map";
    const region = studentProfile?.region || "Unspecified";

    // ── Current Week Calculation (Sunday to Thursday in Asia/Dhaka) ──
    const { weekSunday, weekThursday } = DateTimeUtil.getCurrentWeekRange('Asia/Dhaka');

    // ── 1. Weekly Performance (from weeklyStandings) ──
    const weeklyStanding = weeklyStandings.find(s => s.discordId === discordId);
    const weekPoints = weeklyStanding ? weeklyStanding.totalPoints : 0;
    const weekAttPoints = weeklyStanding ? weeklyStanding.attendancePoints : 0;
    const weekJobPoints = weeklyStanding ? weeklyStanding.jobPoints : 0;
    const weekJobApps = weeklyStanding ? weeklyStanding.jobTotalApps : 0;
    const weekStreakBonus = weeklyStanding ? weeklyStanding.streakBonus : 0;
    const weekIntPoints = weeklyStanding ? weeklyStanding.interviewPoints : 0;
    const weekIntCount = weeklyStanding ? weeklyStanding.interviewCount : 0;
    const weekTaskPoints = weeklyStanding ? weeklyStanding.taskPoints : 0;
    const weekTaskCount = weeklyStanding ? weeklyStanding.taskCount : 0;
    const weekAdj = weeklyStanding ? (weeklyStanding.manualAdjustment || 0) : 0;

    const weeklyRankIndex = weeklyStandings.findIndex(s => s.discordId === discordId);
    const weeklyRankStr = weeklyRankIndex >= 0 ? `#${weeklyRankIndex + 1} of ${weeklyStandings.length}` : "Unranked";

    // ── 2. Lifetime Performance (from lifetimeStandings) ──
    const lifetimeStanding = lifetimeStandings.find(s => s.discordId === discordId);
    const lifetimePoints = lifetimeStanding ? lifetimeStanding.totalPoints : 0;
    const lifetimeAttPoints = lifetimeStanding ? lifetimeStanding.attendancePoints : 0;
    const lifetimeJobPoints = lifetimeStanding ? lifetimeStanding.jobPoints : 0;
    const lifetimeJobApps = lifetimeStanding ? lifetimeStanding.jobTotalApps : 0;
    const lifetimeStreakBonus = lifetimeStanding ? lifetimeStanding.streakBonus : 0;
    const lifetimeIntPoints = lifetimeStanding ? lifetimeStanding.interviewPoints : 0;
    const lifetimeIntCount = lifetimeStanding ? lifetimeStanding.interviewCount : 0;
    const lifetimeTaskPoints = lifetimeStanding ? lifetimeStanding.taskPoints : 0;
    const lifetimeAdj = lifetimeStanding ? (lifetimeStanding.manualAdjustment || 0) : 0;

    const lifetimeRankIndex = lifetimeStandings.findIndex(s => s.discordId === discordId);
    const lifetimeRankStr = lifetimeRankIndex >= 0 ? `#${lifetimeRankIndex + 1} of ${lifetimeStandings.length}` : "Unranked";

    // ── 3. Live Job Tracker Sheet Scrape (Weekly + Total Apps) ──
    // ── Student Attendance Start Date (strictly >= cohortStartDate) ──
    const cohortStartDate = cohortManager.getScoringStartDate(guildId) || '2026-09-06';
    let studentStartDate = weeklyStanding?.attendanceStartDate || lifetimeStanding?.attendanceStartDate || cohortStartDate;
    if (studentStartDate < cohortStartDate) {
      studentStartDate = cohortStartDate;
    }

    // ── 3. Live Job Tracker Sheet Scrape (Weekly + Total Apps since attendance start date) ──
    const JobScraperService = require('../../services/jobScraperService');
    const studentSheet = (sheetRes.sheets || []).find(s => s.discordId === discordId);
    let trackerWeekApps = null;
    let trackerTotalApps = null;
    let sheetNote = "";

    if (studentSheet && studentSheet.sheetUrl) {
      const scrape = await JobScraperService.scrapeStudentJobSheet(studentSheet.sheetUrl, discordId, { startDate: studentStartDate });
      if (scrape.success) {
        trackerWeekApps = scrape.datedThisWeekCount ?? 0;
        trackerTotalApps = scrape.datedSinceStartCount ?? (scrape.totalRows ?? 0);
      } else {
        sheetNote = `*(⚠️ Sheet sync issue: ${scrape.error})*`;
      }
    } else {
      sheetNote = "*(⚠️ Sheet not linked. Run `!linksheet <URL>` to link your Job Tracker)*";
    }

    const displayWeekJobs = trackerWeekApps !== null ? trackerWeekApps : weekJobApps;
    const weekJobsLabel = trackerWeekApps !== null ? "from Job Tracker Sheet" : "from Daily Log";
    const displayLifetimeJobs = trackerTotalApps !== null ? trackerTotalApps : lifetimeJobApps;
    const lifetimeJobsLabel = trackerTotalApps !== null ? "Job Tracker Sheet" : "Bot Log";

    // ── 4. Attendance Counts (Current Week vs Lifetime) ──
    const attRow = (attendanceRes.rows || []).find(r => r.discordId === discordId);
    let weekPresent = 0, weekAbsent = 0, weekLeave = 0, weekSessions = 0;
    let lifetimePresent = 0, lifetimeAbsent = 0, lifetimeLeave = 0, lifetimeSessions = 0;
    const weekDaysSet = new Set();
    const lifetimeDaysSet = new Set();

    if (attRow && attRow.sessions) {
      Object.entries(attRow.sessions).forEach(([sessionDate, mark]) => {
        const datePart = DateTimeUtil.normalizeDateStr(sessionDate);
        if (!datePart) return;
        const m = String(mark || "").toUpperCase().trim();

        // Current week counters (Sunday to Thursday)
        if (DateTimeUtil.isInCurrentWeek(datePart)) {
          weekSessions++;
          weekDaysSet.add(datePart);
          if (m === 'P' || m.startsWith('P')) weekPresent++;
          else if (m === 'A' || m.startsWith('A')) weekAbsent++;
          else if (m === 'L' || m.startsWith('L') || m === 'LEAVE' || m === 'EXCUSED') weekLeave++;
        }

        // Lifetime counters (strictly from student's attendance start date onwards)
        if (datePart >= studentStartDate) {
          lifetimeSessions++;
          lifetimeDaysSet.add(datePart);
          if (m === 'P' || m.startsWith('P')) lifetimePresent++;
          else if (m === 'A' || m.startsWith('A')) lifetimeAbsent++;
          else if (m === 'L' || m.startsWith('L') || m === 'LEAVE' || m === 'EXCUSED') lifetimeLeave++;
        }
      });
    }

    const weekDaysCount = weekDaysSet.size;
    const weekDayStr = weekDaysCount === 1 ? '1 day' : `${weekDaysCount} days`;
    const weekSessionStr = weekSessions === 1 ? '1 session' : `${weekSessions} sessions`;
    const weekAttendanceLabel = weekDaysCount === weekSessions
      ? `${weekSessions} sessions`
      : `${weekDayStr}, ${weekSessionStr}`;

    const lifetimeDaysCount = lifetimeDaysSet.size;
    const lifetimeDayStr = lifetimeDaysCount === 1 ? '1 day' : `${lifetimeDaysCount} days`;
    const lifetimeSessionStr = lifetimeSessions === 1 ? '1 session' : `${lifetimeSessions} sessions`;
    const lifetimeAttendanceLabel = lifetimeDaysCount === lifetimeSessions
      ? `${lifetimeSessions} sessions`
      : `${lifetimeSessionStr} (${lifetimeDayStr})`;

    // ── 5. Lifetime Interviews & Tasks Counts (since attendance start date) ──
    const studentInterviews = (interviewsRes.interviews || []).filter(i => {
      const st = String(i.status || '').toUpperCase();
      const co = String(i.company || '').toUpperCase();
      const iDate = DateTimeUtil.normalizeDateStr(i.interviewDate || i.date || i.loggedDate);
      if (iDate && iDate < studentStartDate) return false;
      return i.discordId === discordId && st !== 'VOIDED' && !co.startsWith('[VOIDED]');
    });
    const lifetimeInterviewCount = studentInterviews.length;

    const studentTasks = (tasksRes.tasks || []).filter(t => {
      const tDate = DateTimeUtil.normalizeDateStr(t.submittedAt || t.timestamp || t.createdAt);
      if (tDate && tDate < studentStartDate) return false;
      return t.discordId === discordId;
    });
    const lifetimeTaskCount = studentTasks.length;

    // ── 6. Referral Lockout Status ──
    const hasRestrictionRole = member?.roles?.cache?.some
      ? member.roles.cache.some(r =>
          r.name.toLowerCase() === (constants.ROLES.REFERRAL_RESTRICTED || 'referral restricted').toLowerCase()
        )
      : false;
    const referralStatusStr = hasRestrictionRole
      ? "Restricted (Score < 0 or >= 3 absences)"
      : "Unlocked (Eligible for Referrals)";

    // ── 7. Health Evaluation ──
    let healthGrade = "🟢 On Track";
    let healthAdvice = "You are performing well. Maintain daily attendance and submit applications to keep your rank strong.";

    if (weekAbsent >= 3) {
      healthGrade = "🔴 At Risk (Absences)";
      healthAdvice = "You have 3 or more absences this week. Prioritize attending all remaining sessions to avoid referral lockout.";
    } else if (weekPoints < 0 && weekDaysCount >= 3) {
      healthGrade = "🟡 Needs Attention (Low Points)";
      healthAdvice = "Your weekly score is negative. Catch up on your daily job applications to recover points.";
    } else if (weekAbsent >= 2) {
      healthGrade = "🟡 Needs Attention (Attendance)";
      healthAdvice = "You have 2 absences. Make sure to attend all upcoming sessions.";
    } else if (weekDaysCount <= 1) {
      healthGrade = "🟢 Week Started";
      healthAdvice = "New weekly cycle started. Keep up your daily attendance and aim for 10 applications daily.";
    }

    const weekAdjLine = weekAdj ? `• **Manual Adjustment:** \`${weekAdj >= 0 ? '+' : ''}${weekAdj} pts\`\n` : '';
    const lifetimeAdjLine = lifetimeAdj ? `• **Manual Adjustment:** \`${lifetimeAdj >= 0 ? '+' : ''}${lifetimeAdj} pts\`\n` : '';
    const sheetNoteLine = sheetNote ? `  ↳ ${sheetNote}\n` : '';

    // Append recent point transactions if available
    let ledgerSection = "";
    if (fallbackLedgerRes && fallbackLedgerRes.entries && fallbackLedgerRes.entries.length > 0) {
      ledgerSection = "\n\n**📜 Recent Point Transactions (Audit Ledger)**\n" +
        fallbackLedgerRes.entries.map(e => {
          const pts = Number(e.pointsAwarded) || 0;
          const sign = pts >= 0 ? `+${pts}` : `${pts}`;
          const dt = e.date || (e.timestamp ? String(e.timestamp).split(' ')[0] : '');
          return `• \`${dt}\` **${sign} pts** [${e.category || 'General'}] *${e.eventSource || ''}* ${e.remarks ? `— ${e.remarks}` : ''}`;
        }).join('\n');
    }

    // Trigger background sync to Google Sheets Scores tab so subsequent checks are instant
    ScoringService.syncScoresToSheet(guildId, guild, { cachedData }).catch(() => {});

    return Embeds.info(
      `Student Health Scorecard · ${studentName}`,
      `**Student Profile**\n` +
      `• **Name:** **${studentName}** (<@${discordId}>)\n` +
      `• **Email:** \`${email}\` | **Region:** \`${region}\`\n` +
      `• **Status:** ${healthGrade} | **Referral Drive:** ${referralStatusStr}\n\n` +
      `**Weekly Performance** (${weekSunday} to ${weekThursday})\n` +
      `• **Weekly Total Score:** **${weekPoints >= 0 ? '+' : ''}${weekPoints} pts** (Rank: **${weeklyRankStr}**)\n` +
      `• **Job Applications:** ${displayWeekJobs} applied *(${weekJobsLabel})* \`(${weekJobPoints >= 0 ? '+' : ''}${weekJobPoints} pts | Streak: +${weekStreakBonus} pts)\`\n` +
      `${sheetNoteLine}` +
      `• **Attendance:** ${weekAttendanceLabel} \`(${weekAttPoints >= 0 ? '+' : ''}${weekAttPoints} pts)\` *(P: ${weekPresent} | A: ${weekAbsent} | L: ${weekLeave})*\n` +
      `• **Interviews:** ${weekIntCount} verified \`(+${weekIntPoints} pts)\`\n` +
      `• **Job Tasks:** ${weekTaskCount} completed \`(${weekTaskPoints >= 0 ? '+' : ''}${weekTaskPoints} pts)\`\n` +
      `${weekAdjLine}\n` +
      `**Mentor Guidance**\n*${healthAdvice}*\n\n` +
      `**Lifetime Career Summary**\n` +
      `• **Lifetime Total Score:** **${lifetimePoints >= 0 ? '+' : ''}${lifetimePoints} pts** (Rank: **${lifetimeRankStr}**)\n` +
      `• **Total Applications:** ${displayLifetimeJobs} applied *(${lifetimeJobsLabel})* \`(${lifetimeJobPoints >= 0 ? '+' : ''}${lifetimeJobPoints} pts | Best Streak: +${lifetimeStreakBonus} pts)\`\n` +
      `• **Total Attendance:** ${lifetimeAttendanceLabel} \`(${lifetimeAttPoints >= 0 ? '+' : ''}${lifetimeAttPoints} pts)\` *(P: ${lifetimePresent} | A: ${lifetimeAbsent} | L: ${lifetimeLeave})*\n` +
      `• **Total Interviews:** ${lifetimeInterviewCount} calls \`(+${lifetimeIntPoints} pts)\`\n` +
      `• **Total Job Tasks:** ${lifetimeTaskCount} completed \`(${lifetimeTaskPoints >= 0 ? '+' : ''}${lifetimeTaskPoints} pts)\`\n` +
      `${lifetimeAdjLine}` +
      `${ledgerSection}\n\n` +
      `*(🔄 Live Recalculation · Synced to Scores sheet)*`,
      `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}`
    );
  }
};
