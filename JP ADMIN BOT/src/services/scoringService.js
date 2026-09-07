/**
 * JP ADMIN — Right-To-Be-Referred (RTBR) & Cumulative Leaderboard Scoring Service
 */

const constants = require('../config/constants');
const GasClient = require('./gasClient');
const DateTimeUtil = require('../utils/dateTime');

class ScoringService {
  /**
   * Calculates points for a single day's job applications based on the re-balanced rules:
   * - 100% target: +1.0 pt
   * - 70% to 99%: +0.5 pt
   * - < 70%: -0.5 pt
   * - Bonus above 100%: None (+0.0)
   */
  static calculateDailyJobScore(count, target = 10) {
    if (target <= 0) target = 10;
    const tiers = constants.SCORING.JOB_TIERS;
    const ratio = count / target;

    if (ratio >= 1.0) {
      return tiers.FULL; // +1.0 pt
    } else if (ratio >= 0.7) {
      return tiers.TIER_70; // +0.5 pt
    } else {
      return tiers.BELOW_60; // -0.5 pt
    }
  }

  /**
   * Calculates performance scores for all active students.
   * By default, calculates 100% strictly for the current week (Sunday to Thursday).
   * Pass options = { weeklyOnly: false } for cumulative all-time score.
   */
  static async calculateRTBR(guildId, guild = null, options = {}) {
    const weeklyOnly = options.weeklyOnly !== false;
    const cohortManager = require('../config/cohortManager');
    const cohort = cohortManager.getCohort(guildId); // raw cohort for manualAdjustments access
    const scoring = cohortManager.getCohortScoring(guildId);
    const cohortTarget = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET;

    // Fetch data from Apps Script backend for the core components (or use cachedData if provided)
    let rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes;
    if (options.cachedData) {
      rosterRes = options.cachedData.rosterRes;
      jobsRes = options.cachedData.jobsRes;
      interviewsRes = options.cachedData.interviewsRes;
      tasksRes = options.cachedData.tasksRes;
      attendanceRes = options.cachedData.attendanceRes;
    } else {
      [rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes] = await Promise.all([
        GasClient.getRoster(guildId).catch(() => ({ students: [] })),
        GasClient.getJobsDaily(guildId, weeklyOnly ? 7 : 90).catch(() => ({ jobs: [] })),
        GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
        GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
        GasClient.getAttendance(guildId).catch(() => ({ rows: [] }))
      ]);
    }

    const isInCurrentWeek = (dateStr) => DateTimeUtil.isInCurrentWeek(dateStr);

    const isExcludedStatus = (st) => {
      const clean = String(st || "").toLowerCase().trim();
      return clean === 'supervisor' || clean === 'mentor' || clean === 'staff'
          || clean === 'inactive' || clean === 'dropped' || clean === 'bot'
          || clean === 'hired'; // hired students are alumni — excluded from active leaderboard
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
            const datePart = DateTimeUtil.normalizeDateStr(sessionDate);
            if (!datePart) return;

            // Strict Sunday-Thursday weekly filter
            if (weeklyOnly) {
              if (!isInCurrentWeek(datePart)) return;
            } else if (datePart < scoringStartDate) {
              return;
            }

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
        } else if (!weeklyOnly) {
          if (att.status === 'P' || att.status === 'PRESENT') {
            student.attendancePoints += scoring.attendancePresent;
          } else if (att.status === 'A' || att.status === 'ABSENT') {
            student.attendancePoints += scoring.attendanceAbsent;
          }
        }
      }
    });

    // 4. Process Job Application Tiered Scoring & Streaks
    const jobsByStudent = new Map();
    (jobsRes.jobs || []).forEach(j => {
      const normDate = DateTimeUtil.normalizeDateStr(j.date);
      // If weeklyOnly, only count jobs within current week (Sunday to Thursday)
      if (weeklyOnly) {
        if (!isInCurrentWeek(normDate)) return;
      } else if (normDate && normDate < scoringStartDate) {
        return;
      }

      const targetStudent = getOrCreateStudent(j);
      if (!targetStudent || isExcludedStatus(targetStudent.status)) return;

      const key = targetStudent.discordId || targetStudent.email || targetStudent.name;
      if (!jobsByStudent.has(key)) {
        jobsByStudent.set(key, []);
      }
      jobsByStudent.get(key).push({ ...j, normDate });
    });

    studentsList.forEach(student => {
      if (isExcludedStatus(student.status)) return;
      const key = student.discordId || student.email || student.name;
      const studentJobs = jobsByStudent.get(key) || [];

      // Sort jobs by date ascending to detect consecutive days properly
      const sortedJobs = [...studentJobs].sort((a, b) => {
        const da = a.normDate || '';
        const db = b.normDate || '';
        return da < db ? -1 : da > db ? 1 : 0;
      });

      let maxStreak = 0;
      let currentStreak = 0;
      let prevDate = null;

      sortedJobs.forEach(jobDay => {
        const count = Number(jobDay.count) || 0;
        student.jobTotalApps += count;

        const dayPts = ScoringService.calculateDailyJobScore(count, cohortTarget);
        student.jobPoints += dayPts;

        // Track consecutive days where target was hit
        if (count >= cohortTarget) {
          if (prevDate) {
            const prev = new Date(prevDate);
            const curr = new Date(jobDay.normDate || prevDate);
            const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              currentStreak++;
            } else {
              currentStreak = 1; // reset streak — gap in days
            }
          } else {
            currentStreak = 1;
          }
          prevDate = jobDay.normDate;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
          currentStreak = 0; // missed target — streak breaks
          prevDate = null;
        }
      });

      // Streak points based on longest consecutive run
      student.streakBonus = Math.min(maxStreak * scoring.streakBonusPerDay, scoring.streakCap);
    });

    // 5. Process Interview Points (+1 pt)
    (interviewsRes.interviews || []).forEach(item => {
      const itemStatus = String(item.status || '').toUpperCase();
      const companyName = String(item.company || '').toUpperCase();
      // Skip voided / invalid interview entries
      if (itemStatus === 'VOIDED' || companyName.startsWith('[VOIDED]')) return;

      const itemDate = item.interviewDate || item.date || item.loggedDate;
      const normDate = DateTimeUtil.normalizeDateStr(itemDate);
      if (weeklyOnly) {
        if (!isInCurrentWeek(normDate)) return;
      } else if (normDate && normDate < scoringStartDate) {
        return;
      }

      const student = getOrCreateStudent(item);
      if (student && !isExcludedStatus(student.status)) {
        student.interviewCount += 1;
        student.interviewPoints += scoring.interviewPoints;
      }
    });

    // 6. Process Job Task Points
    (tasksRes.tasks || []).forEach(task => {
      const taskDate = task.submittedAt || task.timestamp || task.createdAt;
      const normDate = DateTimeUtil.normalizeDateStr(taskDate);
      if (weeklyOnly) {
        if (!isInCurrentWeek(normDate)) return;
      } else if (normDate && normDate < scoringStartDate) {
        return;
      }

      const student = getOrCreateStudent(task);
      if (student && !isExcludedStatus(student.status)) {
        student.taskCount += 1;
        student.taskPoints += Number(task.pointsAwarded) || 0;
      }
    });

    // 7. Apply manual point adjustments (stored in cohorts.json by !adjustpoints command)
    const manualAdjs = cohort?.manualAdjustments || {};
    studentsList.forEach(student => {
      if (!student.discordId) return;
      const adjList = manualAdjs[student.discordId] || [];
      student.manualAdjustment = adjList.reduce((sum, a) => {
        const normDate = DateTimeUtil.normalizeDateStr(a.date);
        if (weeklyOnly && normDate && !isInCurrentWeek(normDate)) return sum;
        if (!weeklyOnly && normDate && normDate < scoringStartDate) return sum;
        return sum + (Number(a.amount) || 0);
      }, 0);
    });

    // 8. Calculate total points and breakdown string for all students
    const activeResults = studentsList
      .filter(s => !isExcludedStatus(s.status))
      .map(s => {
        s.totalPoints = Math.round((
          s.attendancePoints +
          s.jobPoints +
          s.streakBonus +
          s.interviewPoints +
          s.taskPoints +
          (s.manualAdjustment || 0)
        ) * 10) / 10;

        const adjStr = s.manualAdjustment ? ` | ✏️ Adj: ${s.manualAdjustment >= 0 ? '+' : ''}${s.manualAdjustment}pts` : '';
        s.details = `📅 Att: ${s.attendancePoints >= 0 ? '+' : ''}${s.attendancePoints}pts | 💼 Jobs: ${s.jobPoints >= 0 ? '+' : ''}${s.jobPoints}pts | 🎯 Int: +${s.interviewPoints}pts | 🛠️ Tasks: ${s.taskPoints >= 0 ? '+' : ''}${s.taskPoints}pts | 🔥 Streak: +${s.streakBonus}pts${adjStr}`;
        return s;
      });

    // Sort descending by totalPoints
    activeResults.sort((a, b) => b.totalPoints - a.totalPoints);
    return activeResults;
  }
}

module.exports = ScoringService;
