/**
 * Commands: !debugscore, !adjustpoints
 * !debugscore @student — detailed point breakdown per student (audit tool)
 * !adjustpoints @student +/-N reason — manual point correction
 */

const ScoringService = require('../../services/scoringService');
const GasClient = require('../../services/gasClient');
const cohortManager = require('../../config/cohortManager');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'debugscore',
  aliases: ['scoredebug', 'checkscore', 'adjustpoints', 'pointadjust', 'fixpoints', 'scorefix'],
  description: 'Debug a student\'s full point breakdown or manually adjust their points',
  usage: '!debugscore @student | !adjustpoints @student <+/-points> [reason]',
  mentorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const isAdjust = ['adjustpoints', 'pointadjust', 'fixpoints', 'scorefix'].includes(commandName);

    const target = message.mentions.members.first();
    if (!target) {
      if (isAdjust) {
        return message.reply("⚠️ **Usage:** `!adjustpoints @student <+/-points> [reason]`\n*Example:* `!adjustpoints @JohnDoe +3 missed attendance scan fix`");
      }
      return message.reply("⚠️ **Usage:** `!debugscore @student`\n*Example:* `!debugscore @JohnDoe`");
    }

    const guildId = message.guild.id;
    const discordId = target.id;

    // ─── ADJUST POINTS MODE ───────────────────────────────────────────────────
    if (isAdjust) {
      const nonMentionArgs = args.filter(a => !a.startsWith('<@'));
      const adjustStr = nonMentionArgs[0];
      if (!adjustStr || !/^[+-]\d+(\.\d+)?$/.test(adjustStr)) {
        return message.reply(
          "⚠️ **Usage:** `!adjustpoints @student <+/-points> [reason]`\n" +
          "The adjustment must start with `+` or `-`.\n" +
          "*Example:* `!adjustpoints @JohnDoe +3 attendance rescan fix`\n" +
          "*Example:* `!adjustpoints @JohnDoe -1 duplicate interview entry`"
        );
      }

      const adjustment = parseFloat(adjustStr);
      const reason = nonMentionArgs.slice(1).join(' ') || 'Manual adjustment by mentor';
      const today = DateTimeUtil.getTodayDateStr();

      // We store manual adjustments in cohort data (persisted to disk)
      const cohort = cohortManager.getCohort(guildId);
      if (!cohort.manualAdjustments) cohort.manualAdjustments = {};
      if (!cohort.manualAdjustments[discordId]) cohort.manualAdjustments[discordId] = [];

      cohort.manualAdjustments[discordId].push({
        amount: adjustment,
        reason: reason,
        by: message.author.tag || message.author.username,
        date: today,
        timestamp: new Date().toISOString()
      });

      cohortManager.saveToDisk();

      const sign = adjustment >= 0 ? '+' : '';
      return message.reply({
        embeds: [Embeds.success(
          `Manual Point Adjustment Recorded ✏️`,
          `✅ **${sign}${adjustment} points** recorded for <@${discordId}>.\n\n` +
          `• **Adjustment:** \`${sign}${adjustment} pts\`\n` +
          `• **Reason:** ${reason}\n` +
          `• **Date:** ${today}\n` +
          `• **By:** ${message.author.tag || message.author.username}\n\n` +
          `> ⚠️ This adjustment will be reflected in the next leaderboard calculation.\n` +
          `> Run \`!debugscore @${target.user.username}\` to verify the updated score.`
        )]
      });
    }

    // ─── DEBUG SCORE MODE ─────────────────────────────────────────────────────
    const loading = await message.reply(`🔍 Calculating full point breakdown for <@${discordId}>...`);

    try {
      const scoring = cohortManager.getCohortScoring(guildId);
      const scoringStart = scoring.scoringStartDate;

      // Fetch all data in parallel
      const [allScores, jobsRes, interviewsRes, tasksRes, attendanceRes] = await Promise.all([
        ScoringService.calculateRTBR(guildId).catch(() => []),
        GasClient.getJobsDaily(guildId, 90).catch(() => ({ jobs: [] })),
        GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
        GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
        GasClient.getAttendance(guildId).catch(() => ({ rows: [] }))
      ]);

      // Find this student in scoring results
      const student = allScores.find(s => s.discordId === discordId);
      if (!student) {
        return loading.edit({
          content: null,
          embeds: [Embeds.warning(
            "Student Not Found in Scoring",
            `<@${discordId}> is not in the active student leaderboard.\n` +
            `They may be excluded (hired/inactive/not in roster) or have no data yet.`
          )]
        });
      }

      // ── Attendance breakdown ──
      const attRows = attendanceRes.rows || attendanceRes.attendance || [];
      const myAtt = attRows.find(r => r.discordId === discordId || r.email === student.email);
      let presentCount = 0, absentCount = 0, leaveCount = 0, offCount = 0, sessionsChecked = [];

      if (myAtt && myAtt.sessions) {
        Object.entries(myAtt.sessions).forEach(([sessionDate, mark]) => {
          const datePart = sessionDate.substring(0, 10);
          if (datePart < scoringStart) return;
          const m = String(mark || '').toUpperCase().trim();
          if (m === 'P' || m.startsWith('P')) presentCount++;
          else if (m === 'A' || m.startsWith('A')) absentCount++;
          else if (m === 'L' || m === 'LEAVE') leaveCount++;
          else if (m === 'OFF' || m === '0') offCount++;
          sessionsChecked.push(`\`${sessionDate.substring(5)}\`→${m}`);
        });
      }

      // ── Current week window (Sun–Thu) for job scoring ──
      const { DateTime } = require('luxon');
      const nowDhaka = DateTime.now().setZone('Asia/Dhaka');
      const todayWeekday = nowDhaka.weekday;
      const daysSinceSunday = todayWeekday === 7 ? 0 : todayWeekday;
      const weekSunday = nowDhaka.minus({ days: daysSinceSunday }).toFormat('yyyy-MM-dd');
      const weekThursday = nowDhaka.minus({ days: daysSinceSunday }).plus({ days: 4 }).toFormat('yyyy-MM-dd');

      // ── Job breakdown (current week only) ──
      const myJobs = (jobsRes.jobs || []).filter(j => {
        const d = String(j.date || '').substring(0, 10);
        return j.discordId === discordId && d >= weekSunday && d <= weekThursday;
      });
      const totalApps = myJobs.reduce((s, j) => s + (Number(j.count) || 0), 0);
      const jobDaysAbove = myJobs.filter(j => Number(j.count) >= scoring.jobTarget).length;
      const jobDaysBelow70 = myJobs.filter(j => Number(j.count) / scoring.jobTarget < 0.7).length;

      // ── Interview breakdown ──
      const myInterviews = (interviewsRes.interviews || []).filter(i => {
        if (String(i.status || '').toUpperCase() === 'VOIDED') return false;
        const d = i.interviewDate || i.date || i.loggedDate;
        if (d && String(d).substring(0, 10) < scoringStart) return false;
        return i.discordId === discordId;
      });

      // ── Tasks breakdown ──
      const myTasks = (tasksRes.tasks || []).filter(t => t.discordId === discordId);

      // ── Manual adjustments ──
      const cohort = cohortManager.getCohort(guildId);
      const manualAdj = (cohort.manualAdjustments?.[discordId] || []);
      const manualTotal = manualAdj.reduce((s, a) => s + a.amount, 0);
      const manualLines = manualAdj.length > 0
        ? manualAdj.slice(-5).map(a => `• ${a.amount >= 0 ? '+' : ''}${a.amount} pts — ${a.reason} *(${a.date})*`).join('\n')
        : '• No manual adjustments';

      // ── Recent sessions (last 10) ──
      const recentSessions = sessionsChecked.slice(-10).join(' ') || 'No session data';

      const embed = Embeds.info(
        `🔍 Score Debug — ${student.name}`,
        `**Scoring Period:** \`${scoringStart}\` onwards\n\n` +
        `⭐ **TOTAL SCORE: ${student.totalPoints >= 0 ? '+' : ''}${student.totalPoints} pts**\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 **ATTENDANCE: ${student.attendancePoints >= 0 ? '+' : ''}${student.attendancePoints} pts**\n` +
        `• ✅ Present: **${presentCount}** × \`+${scoring.attendancePresent}pt\` = \`+${(presentCount * scoring.attendancePresent).toFixed(1)}pts\`\n` +
        `• ❌ Absent: **${absentCount}** × \`${scoring.attendanceAbsent}pt\` = \`${(absentCount * scoring.attendanceAbsent).toFixed(1)}pts\`\n` +
        `• 🟡 Leave: **${leaveCount}** × \`0pt\`\n` +
        `• ⚫ Off/Skip: **${offCount}** sessions\n` +
        `• 📌 Recent: ${recentSessions}\n\n` +

        `💼 **JOB APPLICATIONS (This Week): ${student.jobPoints >= 0 ? '+' : ''}${student.jobPoints} pts**\n` +
        `• 📆 **Week:** \`${weekSunday}\` → \`${weekThursday}\` (Sun–Thu)\n` +
        `• Total Apps: **${totalApps}** across **${myJobs.length}/5 days**\n` +
        `• Target: **${scoring.jobTarget}/day** | Days Above Target: **${jobDaysAbove}** | Days Below 70%: **${jobDaysBelow70}**\n\n` +

        `🔥 **STREAK BONUS: +${student.streakBonus} pts** *(Max: ${scoring.streakCap})*\n\n` +

        `🎯 **INTERVIEWS: +${student.interviewPoints} pts**\n` +
        `• ${myInterviews.length} verified interview${myInterviews.length !== 1 ? 's' : ''} × \`+${scoring.interviewPoints}pt\` each\n\n` +

        `🛠️ **TASKS: ${student.taskPoints >= 0 ? '+' : ''}${student.taskPoints} pts**\n` +
        `• Total tasks: **${myTasks.length}** (submitted/approved)\n\n` +

        `✏️ **MANUAL ADJUSTMENTS: ${manualTotal >= 0 ? '+' : ''}${manualTotal} pts**\n` +
        `${manualLines}\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 To fix a student's points: \`!adjustpoints @${target.user.username} +/-N reason\``,
        `JP ADMIN ${constants.BOT_VERSION} · Score Debug`
      );

      return loading.edit({ content: null, embeds: [embed] });

    } catch (err) {
      return loading.edit({ content: null, embeds: [Embeds.error("Debug Error", err.message)] });
    }
  }
};
