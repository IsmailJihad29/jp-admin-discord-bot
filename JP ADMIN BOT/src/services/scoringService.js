/**
 * JP ADMIN — Right-To-Be-Referred (RTBR) & Cumulative Leaderboard Scoring Service
 */

const constants = require('../config/constants');
const GasClient = require('./gasClient');
const DateTimeUtil = require('../utils/dateTime');

class ScoringService {
  /**
   * Calculates points for a single day's job applications based on the custom tiered rules:
   * - 100% target: +2.0 pts
   * - 80% to 99%: +1.5 pts
   * - 70% to 79%: +1.0 pt
   * - 60% to 69%: +0.5 pt
   * - < 60%: -0.5 pt
   * - > 100%: Extra +1.0 pt (Total = 3.0 pts)
   */
  static calculateDailyJobScore(count, target = 10) {
    if (target <= 0) target = 10;
    const tiers = constants.SCORING.JOB_TIERS;
    const ratio = count / target;

    if (count > target) {
      return tiers.FULL + tiers.EXTRA_BONUS; // 3.0 pts
    } else if (ratio >= 1.0) {
      return tiers.FULL; // 2.0 pts
    } else if (ratio >= 0.8) {
      return tiers.TIER_80; // 1.5 pts
    } else if (ratio >= 0.7) {
      return tiers.TIER_70; // 1.0 pt
    } else if (ratio >= 0.6) {
      return tiers.TIER_60; // 0.5 pt
    } else {
      return tiers.BELOW_60; // -0.5 pt
    }
  }

  /**
   * Calculates rolling 7-day / cumulative performance scores for all active students
   */
  static async calculateRTBR(guildId, guild = null) {
    const cohortManager = require('../config/cohortManager');
    const scoring = cohortManager.getCohortScoring(guildId);
    const cohortTarget = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET;

    // Fetch data from Apps Script backend for the core components
    const [rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getJobsDaily(guildId, 7).catch(() => ({ jobs: [] })),
      GasClient.getInterviews(guildId, 7).catch(() => ({ interviews: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ attendance: [] }))
    ]);

    const isExcludedStatus = (st) => {
      const clean = String(st || "").toLowerCase().trim();
      return clean === 'supervisor' || clean === 'mentor' || clean === 'staff' || clean === 'inactive' || clean === 'dropped' || clean === 'bot';
    };

    const studentsList = [];
    const byDiscordId = new Map();
    const byEmail = new Map();
    const byUsername = new Map();
    const byName = new Map();

    const getOrCreateStudent = (data) => {
      if (!data) return null;
      const discordId = String(data.discordId || data.id || "").trim();
      const email = String(data.email || "").toLowerCase().trim();
      const rawUser = String(data.username || data.user || "").trim();
      const username = rawUser.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      const name = String(data.name || data.studentName || data.displayName || "").trim();

      // Check if student already exists in index
      let student = null;
      if (discordId && byDiscordId.has(discordId)) student = byDiscordId.get(discordId);
      else if (email && byEmail.has(email)) student = byEmail.get(email);
      else if (username && byUsername.has(username)) student = byUsername.get(username);
      else if (name && byName.has(name.toLowerCase())) student = byName.get(name.toLowerCase());

      if (!student) {
        student = {
          discordId: discordId,
          name: name || username || email || (discordId ? `Student (${discordId.slice(-4)})` : 'Student'),
          username: username || rawUser,
          email: email,
          phone: data.phone || '',
          status: data.status || 'active',
          attendancePoints: 0,
          jobPoints: 0,
          jobTotalApps: 0,
          streakBonus: 0,
          interviewPoints: 0,
          interviewCount: 0,
          taskPoints: 0,
          taskCount: 0,
          totalPoints: 0
        };
        studentsList.push(student);
      } else {
        // Enrich missing fields
        if (!student.discordId && discordId) student.discordId = discordId;
        if (!student.email && email) student.email = email;
        if (!student.username && username) student.username = username;
        if ((!student.name || student.name === 'Student') && name) student.name = name;
        if (!student.phone && data.phone) student.phone = data.phone;
      }

      // Update index mappings
      if (student.discordId) byDiscordId.set(student.discordId, student);
      if (student.email) byEmail.set(student.email, student);
      if (student.username) byUsername.set(student.username, student);
      if (student.name) byName.set(student.name.toLowerCase(), student);

      return student;
    };

    // 1. Seed all students from Roster (Bot_Map / All Data)
    (rosterRes.students || []).forEach(s => {
      if (!isExcludedStatus(s.status)) {
        getOrCreateStudent(s);
      }
    });

    // 1b. Seed from Discord guild members with Active Student role (catch any not in roster)
    if (guild) {
      try {
        const activeStudentRoleName = (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase();
        const activeRole = guild.roles.cache.find(r => r.name.toLowerCase() === activeStudentRoleName);
        if (activeRole) {
          // Fetch all members with this role
          const members = activeRole.members;
          members.forEach(member => {
            if (!byDiscordId.has(member.id)) {
              // Student is in Discord but missing from roster — add them with 0 pts
              getOrCreateStudent({
                discordId: member.id,
                name: member.displayName || member.user.username,
                username: member.user.username,
                status: 'active'
              });
            }
          });
        }
      } catch (e) {
        // Non-fatal: continue without Discord member seeding
      }
    }

    // 2. Ingest any students from Attendance matrix tab
    const attRows = attendanceRes.rows || attendanceRes.attendance || [];
    attRows.forEach(att => {
      if (!isExcludedStatus(att.status)) {
        getOrCreateStudent(att);
      }
    });

    const scoringStartDate = scoring.scoringStartDate || "2026-08-30";

    // 3. Process Attendance Points
    attRows.forEach(att => {
      const student = getOrCreateStudent(att);
      if (student && !isExcludedStatus(student.status)) {
        if (att.sessions && typeof att.sessions === 'object') {
          Object.entries(att.sessions).forEach(([sessionDate, mark]) => {
            // Only count attendance from scoringStartDate onwards
            const datePart = sessionDate.substring(0, 10);
            if (datePart < scoringStartDate) return;

            const isMorningSession = sessionDate.toLowerCase().includes('morning');
            if (isMorningSession && cohortManager.isMorningOff(guildId, datePart)) {
              // Morning Basecamp is OFF for this day — 0 points for all students
              return;
            }

            const m = String(mark || "").toUpperCase().trim();
            if (m === 'OFF' || m === '0' || m === 'EXCUSED' || m === 'L' || m === 'LEAVE') {
              // 0 points
              return;
            }

            if (m === 'P' || m === 'PRESENT' || m.startsWith('P')) {
              student.attendancePoints += scoring.attendancePresent;
            } else if (m === 'A' || m === 'ABSENT' || m.startsWith('A')) {
              student.attendancePoints += scoring.attendanceAbsent;
            } // Leave / Off is 0 points
          });
        } else if (att.status === 'P' || att.status === 'PRESENT') {
          student.attendancePoints += scoring.attendancePresent;
        } else if (att.status === 'A' || att.status === 'ABSENT') {
          student.attendancePoints += scoring.attendanceAbsent;
        }
      }
    });

    // 4. Process Job Application Tiered Scoring & Streaks
    const jobsByStudent = new Map();
    (jobsRes.jobs || []).forEach(j => {
      if (j.date && j.date < scoringStartDate) return;
      const targetStudent = getOrCreateStudent(j);
      if (!targetStudent || isExcludedStatus(targetStudent.status)) return;

      const key = targetStudent.discordId || targetStudent.email || targetStudent.name;
      if (!jobsByStudent.has(key)) {
        jobsByStudent.set(key, []);
      }
      jobsByStudent.get(key).push(j);
    });

    studentsList.forEach(student => {
      if (isExcludedStatus(student.status)) return;
      const key = student.discordId || student.email || student.name;
      const studentJobs = jobsByStudent.get(key) || [];
      let consecutiveDays = 0;

      studentJobs.forEach(jobDay => {
        const count = Number(jobDay.count) || 0;
        student.jobTotalApps += count;

        const dayPts = ScoringService.calculateDailyJobScore(count, cohortTarget);
        student.jobPoints += dayPts;

        if (count >= cohortTarget) {
          consecutiveDays++;
        }
      });

      // Streak points
      student.streakBonus = Math.min(consecutiveDays * scoring.streakBonusPerDay, scoring.streakCap);
    });

    // 5. Process Interview Points (+2 pts)
    (interviewsRes.interviews || []).forEach(item => {
      const itemStatus = String(item.status || '').toUpperCase();
      const companyName = String(item.company || '').toUpperCase();
      // Skip voided / invalid interview entries
      if (itemStatus === 'VOIDED' || companyName.startsWith('[VOIDED]')) return;

      const itemDate = item.interviewDate || item.date || item.loggedDate;
      if (itemDate && String(itemDate).substring(0, 10) < scoringStartDate) return;

      const student = getOrCreateStudent(item);
      if (student && !isExcludedStatus(student.status)) {
        student.interviewCount += 1;
        student.interviewPoints += scoring.interviewPoints;
      }
    });

    // 6. Process Job Task Points
    (tasksRes.tasks || []).forEach(task => {
      if (task.createdAt && task.createdAt < scoringStartDate) return;
      const student = getOrCreateStudent(task);
      if (student && !isExcludedStatus(student.status)) {
        student.taskCount += 1;
        student.taskPoints += Number(task.pointsAwarded) || 0;
      }
    });

    // 7. Calculate total points and breakdown string for all students
    const activeResults = studentsList
      .filter(s => !isExcludedStatus(s.status))
      .map(s => {
        s.totalPoints = Math.round((
          s.attendancePoints +
          s.jobPoints +
          s.streakBonus +
          s.interviewPoints +
          s.taskPoints
        ) * 10) / 10;

        s.details = `📅 Att: ${s.attendancePoints >= 0 ? '+' : ''}${s.attendancePoints}pts | 💼 Jobs: ${s.jobPoints >= 0 ? '+' : ''}${s.jobPoints}pts | 🎯 Int: +${s.interviewPoints}pts | 🛠️ Tasks: ${s.taskPoints >= 0 ? '+' : ''}${s.taskPoints}pts | 🔥 Streak: +${s.streakBonus}pts`;
        return s;
      });

    // Sort descending by totalPoints
    activeResults.sort((a, b) => b.totalPoints - a.totalPoints);
    return activeResults;
  }
}

module.exports = ScoringService;
