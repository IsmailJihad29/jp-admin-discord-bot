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
    let rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes, leavesRes;
    if (options.cachedData) {
      rosterRes = options.cachedData.rosterRes;
      jobsRes = options.cachedData.jobsRes;
      interviewsRes = options.cachedData.interviewsRes;
      tasksRes = options.cachedData.tasksRes;
      attendanceRes = options.cachedData.attendanceRes;
      leavesRes = options.cachedData.leavesRes;
    } else {
      [rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes, leavesRes] = await Promise.all([
        GasClient.getRoster(guildId).catch(() => ({ students: [] })),
        GasClient.getJobsDaily(guildId, weeklyOnly ? 7 : 90).catch(() => ({ jobs: [] })),
        GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
        GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
        GasClient.getAttendance(guildId).catch(() => ({ rows: [] })),
        GasClient.getLeaves(guildId).catch(() => ({ leaves: [] }))
      ]);
    }

    const isInCurrentWeek = (dateStr) => DateTimeUtil.isInCurrentWeek(dateStr);

    // Build approved leaves helper to protect students on leave from deductions and streak resets
    const approvedLeaves = (leavesRes?.leaves || []).filter(l => String(l.status || '').toUpperCase() === 'APPROVED');
    const isStudentOnApprovedLeave = (student, dateYMD) => {
      if (!student || !dateYMD) return false;
      const dId = String(student.discordId || '').trim();
      const em = String(student.email || '').toLowerCase().trim();
      const un = String(student.username || '').toLowerCase().trim();
      const nm = String(student.name || '').toLowerCase().trim();
      return approvedLeaves.some(l => {
        const lStart = DateTimeUtil.normalizeDateStr(l.startDate);
        const lEnd = DateTimeUtil.normalizeDateStr(l.endDate) || lStart;
        if (!lStart || dateYMD < lStart || dateYMD > lEnd) return false;
        if (dId && l.discordId && dId === String(l.discordId).trim()) return true;
        if (em && l.email && em === String(l.email).toLowerCase().trim()) return true;
        if (nm && l.name && nm === String(l.name).toLowerCase().trim()) return true;
        if (un && l.name && un === String(l.name).toLowerCase().trim()) return true;
        return false;
      });
    };

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

    const findStudent = (data) => {
      if (!data) return null;
      const discordId = String(data.discordId || data.id || "").trim();
      const email = String(data.email || "").toLowerCase().trim();
      const rawUser = String(data.username || data.user || "").trim();
      const username = rawUser.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      const name = String(data.name || data.studentName || data.displayName || "").trim();

      if (discordId && byDiscordId.has(discordId)) return byDiscordId.get(discordId);
      if (email && byEmail.has(email)) return byEmail.get(email);
      if (username && byUsername.has(username)) return byUsername.get(username);
      if (name && byName.has(name.toLowerCase())) return byName.get(name.toLowerCase());
      return null;
    };

    // 1. Seed students STRICTLY and EXCLUSIVELY from Bot_Map roster
    // Never auto-create students from Discord server members, Attendance, or All Data!
    (rosterRes.students || []).forEach(s => {
      if (!isExcludedStatus(s.status)) {
        const discordId = String(s.discordId || s.id || "").trim();
        const email = String(s.email || "").toLowerCase().trim();
        const rawUser = String(s.username || s.user || "").trim();
        const username = rawUser.toLowerCase().replace(/^@/, '').split('#')[0].trim();
        const name = String(s.name || s.studentName || s.displayName || "").trim();

        let student = findStudent({ discordId, email, username, name });
        if (!student) {
          student = {
            discordId: discordId,
            name: name || username || email || (discordId ? `Student (${discordId.slice(-4)})` : 'Student'),
            username: username || rawUser,
            email: email,
            phone: s.phone || '',
            status: s.status || 'active',
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
          if (!student.discordId && discordId) student.discordId = discordId;
          if (!student.email && email) student.email = email;
          if (!student.username && username) student.username = username;
          if ((!student.name || student.name === 'Student') && name) student.name = name;
          if (!student.phone && s.phone) student.phone = s.phone;
        }

        if (student.discordId) byDiscordId.set(student.discordId, student);
        if (student.email) byEmail.set(student.email, student);
        if (student.username) byUsername.set(student.username, student);
        if (student.name) byName.set(student.name.toLowerCase(), student);
      }
    });

    const attRows = attendanceRes.rows || attendanceRes.attendance || [];

    // Cohort scoring start date (strictly enforces cutoff: e.g. 2026-09-06)
    const cohortStartDate = cohortManager.getScoringStartDate(guildId) || scoring.scoringStartDate || "2026-09-06";

    // Discover individual attendance start date for each student from Attendance tab records
    // STRICT RULE: No student's attendance start date or lifetime scoring can be earlier than cohortStartDate!
    attRows.forEach(att => {
      const student = findStudent(att);
      if (student && !isExcludedStatus(student.status)) {
        if (att.sessions && typeof att.sessions === 'object') {
          // Identify the earliest marked session date ON OR AFTER cohortStartDate
          const markedDates = Object.entries(att.sessions)
            .filter(([d, mark]) => {
              const normDate = DateTimeUtil.normalizeDateStr(d);
              return normDate && normDate >= cohortStartDate && mark !== undefined && mark !== null && String(mark).trim() !== '' && String(mark).trim() !== '-';
            })
            .map(([d]) => DateTimeUtil.normalizeDateStr(d))
            .sort();

          if (markedDates.length > 0) {
            student.attendanceStartDate = markedDates[0];
          } else {
            student.attendanceStartDate = cohortStartDate;
          }
        } else {
          student.attendanceStartDate = cohortStartDate;
        }
      }
    });

    // Fallback for students not explicitly in Attendance tab
    studentsList.forEach(student => {
      if (!student.attendanceStartDate || student.attendanceStartDate < cohortStartDate) {
        student.attendanceStartDate = cohortStartDate;
      }
    });

    // 3. Process Attendance Points
    attRows.forEach(att => {
      const student = findStudent(att);
      if (student && !isExcludedStatus(student.status)) {
        const studentStartDate = student.attendanceStartDate || cohortStartDate;
        if (att.sessions && typeof att.sessions === 'object') {
          Object.entries(att.sessions).forEach(([sessionDate, mark]) => {
            const datePart = DateTimeUtil.normalizeDateStr(sessionDate);
            if (!datePart) return;

            // Strict Sunday-Thursday weekly filter
            if (weeklyOnly) {
              if (!isInCurrentWeek(datePart)) return;
            } else if (datePart < studentStartDate) {
              return;
            }

            const isMorningSession = sessionDate.toLowerCase().includes('morning');
            if (isMorningSession) {
              // 1. If morning attendance feature is turned OFF for cohort -> 0 points for everyone
              if (!cohortManager.isFeatureEnabled(guildId, 'morning_attendance')) {
                return;
              }
              // 2. If Morning Basecamp is OFF for this day -> 0 points for all students
              if (cohortManager.isMorningOff(guildId, datePart)) {
                return;
              }
            } else {
              // Non-morning session: check if daily_attendance feature is enabled
              if (!cohortManager.isFeatureEnabled(guildId, 'daily_attendance')) {
                return;
              }
            }

            const m = String(mark || "").toUpperCase().trim();
            if (m === 'OFF' || m === '0' || m === 'EXCUSED' || m === 'L' || m === 'LEAVE' || m === 'OPT' || m === 'EXEMPT' || m === '') {
              // 0 points
              return;
            }

            // If morning session and student is marked morning optional, missing is never penalized!
            if (isMorningSession && cohortManager.isMorningOptional(guildId, student.discordId, guild)) {
              if (m === 'A' || m === 'ABSENT' || m.startsWith('A')) {
                return; // 0 points, no deduction
              }
            }

            // If student has an approved leave covering this date, NEVER penalize!
            if (isStudentOnApprovedLeave(student, datePart)) {
              return; // Excused leave: exactly 0 points, no deduction
            }

            if (m === 'P' || m === 'PRESENT' || m.startsWith('P')) {
              student.attendancePoints += scoring.attendancePresent;
            } else if (m === 'A' || m === 'ABSENT' || m.startsWith('A')) {
              student.attendancePoints += scoring.attendanceAbsent;
            } // Leave / Off / Optional is 0 points
          });
        } else if (!weeklyOnly) {
          const isAttFeatureOn = cohortManager.isFeatureEnabled(guildId, 'daily_attendance');
          if (isAttFeatureOn) {
            if (att.status === 'P' || att.status === 'PRESENT') {
              student.attendancePoints += scoring.attendancePresent;
            } else if (att.status === 'A' || att.status === 'ABSENT') {
              student.attendancePoints += scoring.attendanceAbsent;
            }
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
      }

      const targetStudent = findStudent(j);
      if (!targetStudent || isExcludedStatus(targetStudent.status)) return;

      const key = targetStudent.discordId || targetStudent.email || targetStudent.name;
      if (!jobsByStudent.has(key)) {
        jobsByStudent.set(key, []);
      }
      jobsByStudent.get(key).push({ ...j, normDate });
    });

    const todayStr = DateTimeUtil.getTodayDateStr();
    const nowDhaka = DateTimeUtil.now();
    const isBeforeNightCutoff = (nowDhaka.hour < 23 || (nowDhaka.hour === 23 && nowDhaka.minute < 30));

    studentsList.forEach(student => {
      if (isExcludedStatus(student.status)) return;
      const key = student.discordId || student.email || student.name;
      const studentJobs = jobsByStudent.get(key) || [];

      // Deduplicate jobs by date: if multiple scrapes exist for the same day, pick the latest / highest count
      const jobsByDate = new Map();
      studentJobs.forEach(jobDay => {
        const d = jobDay.normDate;
        if (!d) return;
        const count = Number(jobDay.count) || 0;
        if (!jobsByDate.has(d) || count > jobsByDate.get(d).count) {
          jobsByDate.set(d, { ...jobDay, count });
        }
      });

      // Sort jobs by date ascending to detect consecutive days properly
      const sortedJobs = Array.from(jobsByDate.values()).sort((a, b) => {
        const da = a.normDate || '';
        const db = b.normDate || '';
        return da < db ? -1 : da > db ? 1 : 0;
      });

      const studentStartDate = student.attendanceStartDate || cohortStartDate;
      // Filter out any job entries before the student's attendance start date (if not weeklyOnly)
      const eligibleJobs = weeklyOnly
        ? sortedJobs
        : sortedJobs.filter(jobDay => !jobDay.normDate || jobDay.normDate >= studentStartDate);

      let maxStreak = 0;
      let currentStreak = 0;
      let prevDate = null;

      eligibleJobs.forEach(jobDay => {
        const count = Number(jobDay.count) || 0;
        student.jobTotalApps += count;

        const onLeave = jobDay.status === 'ON_LEAVE' || isStudentOnApprovedLeave(student, jobDay.normDate);

        let dayPts = 0;
        if (onLeave) {
          // Leave Protected: 0 points (never penalize on approved leave!)
          dayPts = 0;
        } else {
          dayPts = ScoringService.calculateDailyJobScore(count, cohortTarget);
          // If it is TODAY and before the night cutoff (23:30), do not penalize incomplete jobs prematurely
          if (jobDay.normDate === todayStr && isBeforeNightCutoff && dayPts < 0) {
            dayPts = 0; // Day is still in progress; student has until 23:30 to apply
          }
        }
        student.jobPoints += dayPts;

        // Track consecutive days where target was hit (protect streak through approved leave!)
        if (onLeave) {
          // Leave Protected: maintain previous streak and advance date
          if (prevDate) {
            prevDate = jobDay.normDate;
          }
        } else if (count >= cohortTarget) {
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
      const student = findStudent(item);
      if (!student || isExcludedStatus(student.status)) return;

      const studentStartDate = student.attendanceStartDate || cohortStartDate;
      if (weeklyOnly) {
        if (!isInCurrentWeek(normDate)) return;
      } else if (normDate && normDate < studentStartDate) {
        return;
      }

      student.interviewCount += 1;
      student.interviewPoints += scoring.interviewPoints;
    });

    // 6. Process Job Task Points
    (tasksRes.tasks || []).forEach(task => {
      const taskDate = task.submittedAt || task.timestamp || task.createdAt;
      const normDate = DateTimeUtil.normalizeDateStr(taskDate);
      const student = findStudent(task);
      if (!student || isExcludedStatus(student.status)) return;

      const studentStartDate = student.attendanceStartDate || cohortStartDate;
      if (weeklyOnly) {
        if (!isInCurrentWeek(normDate)) return;
      } else if (normDate && normDate < studentStartDate) {
        return;
      }

      student.taskCount += 1;
      student.taskPoints += Number(task.pointsAwarded) || 0;
    });

    // 7. Apply manual point adjustments (stored in cohorts.json by !adjustpoints command)
    const manualAdjs = cohort?.manualAdjustments || {};
    studentsList.forEach(student => {
      if (!student.discordId) return;
      const studentStartDate = student.attendanceStartDate || cohortStartDate;
      const adjList = manualAdjs[student.discordId] || [];
      student.manualAdjustment = adjList.reduce((sum, a) => {
        const normDate = DateTimeUtil.normalizeDateStr(a.date);
        if (weeklyOnly && normDate && !isInCurrentWeek(normDate)) return sum;
        if (!weeklyOnly && normDate && normDate < studentStartDate) return sum;
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

  /**
   * Calculates and saves full student scores snapshot (both Weekly and Lifetime)
   * into Google Sheets 'Scores' tab and appends latest transactions to 'Point_Ledger'.
   */
  static async syncScoresToSheet(guildId, guild = null, options = {}) {
    const Logger = require('../utils/logger');
    try {
      // 1. Fetch raw data once to reuse across weekly and lifetime calculations
      let cachedData = options.cachedData;
      if (!cachedData) {
        const [rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes, leavesRes] = await Promise.all([
          GasClient.getRoster(guildId).catch(() => ({ students: [] })),
          GasClient.getJobsDaily(guildId, 90).catch(() => ({ jobs: [] })),
          GasClient.getInterviews(guildId, 90).catch(() => ({ interviews: [] })),
          GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
          GasClient.getAttendance(guildId).catch(() => ({ rows: [] })),
          GasClient.getLeaves(guildId).catch(() => ({ leaves: [] }))
        ]);
        cachedData = { rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes, leavesRes };
      }

      // 2. Compute Weekly and Lifetime standings
      const [weeklyStandings, lifetimeStandings] = await Promise.all([
        this.calculateRTBR(guildId, guild, { weeklyOnly: true, cachedData }),
        this.calculateRTBR(guildId, guild, { weeklyOnly: false, cachedData })
      ]);

      const weeklyMap = new Map(weeklyStandings.map((s, idx) => [s.discordId, { ...s, rank: idx + 1 }]));
      const nowStr = new Date().toISOString();

      const approvedLeavesList = (cachedData.leavesRes?.leaves || []).filter(l => String(l.status || '').toUpperCase() === 'APPROVED');
      const isApprovedLeaveDay = (student, dYmd) => {
        if (!student || !dYmd) return false;
        const dId = String(student.discordId || '').trim();
        const em = String(student.email || '').toLowerCase().trim();
        const nm = String(student.name || '').toLowerCase().trim();
        return approvedLeavesList.some(l => {
          const lStart = DateTimeUtil.normalizeDateStr(l.startDate);
          const lEnd = DateTimeUtil.normalizeDateStr(l.endDate) || lStart;
          if (!lStart || dYmd < lStart || dYmd > lEnd) return false;
          if (dId && l.discordId && dId === String(l.discordId).trim()) return true;
          if (em && l.email && em === String(l.email).toLowerCase().trim()) return true;
          if (nm && l.name && nm === String(l.name).toLowerCase().trim()) return true;
          return false;
        });
      };

      // 3. Build Scores tab rows
      const attendanceRows = cachedData.attendanceRes?.rows || [];
      const scoreRows = lifetimeStandings.map((s, idx) => {
        const weekly = weeklyMap.get(s.discordId);

        // Calculate weekly attendance marks for active/inactive evaluation
        const attRow = attendanceRows.find(r => r.discordId === s.discordId);
        let weekPresent = 0, weekAbsent = 0, weekLeave = 0;
        if (attRow && attRow.sessions) {
          Object.entries(attRow.sessions).forEach(([sessionDate, mark]) => {
            const datePart = DateTimeUtil.normalizeDateStr(sessionDate);
            if (!datePart || !DateTimeUtil.isInCurrentWeek(datePart)) return;
            const m = String(mark || "").toUpperCase().trim();
            if (m === 'P' || m.startsWith('P')) weekPresent++;
            else if (m === 'A' || m.startsWith('A')) {
              // If on approved leave, count as Leave NOT Absent!
              if (isApprovedLeaveDay(s, datePart)) {
                weekLeave++;
              } else {
                weekAbsent++;
              }
            }
            else if (m === 'L' || m.startsWith('L') || m === 'LEAVE' || m === 'EXCUSED') weekLeave++;
          });
        }

        // Evaluate dynamic weekly status (Weekly based Active / Inactive / At Risk)
        const rosterStatus = String(s.status || "").toLowerCase().trim();
        let weeklyStatus = "Active";
        if (rosterStatus === 'inactive' || rosterStatus === 'dropped') {
          weeklyStatus = "Inactive";
        } else if (weekAbsent >= 3) {
          weeklyStatus = "At Risk (3+ Absences)";
        } else if (weekly && weekly.totalPoints < 0 && (weekPresent + weekAbsent) >= 3) {
          weeklyStatus = "At Risk (Low Points)";
        } else if (weekAbsent >= 2) {
          weeklyStatus = "Needs Attention (2 Absences)";
        } else if (
          weekPresent === 0 &&
          weekAbsent === 0 &&
          weekLeave === 0 &&
          (!weekly || (weekly.jobTotalApps === 0 && weekly.interviewCount === 0 && weekly.taskCount === 0))
        ) {
          weeklyStatus = "Inactive (No Activity)";
        } else {
          weeklyStatus = "Active";
        }

        return {
          discordId: s.discordId,
          name: s.name,
          email: s.email,
          weeklyPoints: weekly ? weekly.totalPoints : 0,
          lifetimePoints: s.totalPoints,
          weeklyAttendance: weekly ? weekly.attendancePoints : 0,
          weeklyJobs: weekly ? weekly.jobPoints : 0,
          weeklyStreak: weekly ? weekly.streakBonus : 0,
          weeklyInterviews: weekly ? weekly.interviewPoints : 0,
          weeklyTasks: weekly ? weekly.taskPoints : 0,
          lifetimeAttendance: s.attendancePoints,
          lifetimeJobs: s.jobPoints,
          lifetimeStreak: s.streakBonus,
          lifetimeInterviews: s.interviewPoints,
          lifetimeTasks: s.taskPoints,
          weeklyRank: weekly ? weekly.rank : null,
          lifetimeRank: idx + 1,
          weeklyStatus: weeklyStatus,
          status: weeklyStatus,
          lastUpdated: nowStr
        };
      });

      // 4. Build Point Ledger audit entries
      const cohortManager = require('../config/cohortManager');
      const cohortStartDate = cohortManager.getScoringStartDate(guildId) || '2026-09-06';

      let ledgerEntries = options.ledgerEntries;
      if (!ledgerEntries || ledgerEntries.length === 0) {
        ledgerEntries = this.generateLedgerEntries(guildId, {
          cachedData,
          lifetimeStandings,
          cohortStartDate,
          isApprovedLeaveDay
        });
      }

      // 5. Send to Google Apps Script
      const res = await GasClient.syncScores(guildId, {
        scores: scoreRows,
        ledgerEntries: ledgerEntries,
        replaceLedger: true
      });

      Logger.info(`[ScoresSync] Successfully synced ${scoreRows.length} student scores and ${ledgerEntries.length} ledger entries to Google Sheets for guild ${guildId}.`);
      return { success: true, scoresCount: scoreRows.length, ledgerCount: ledgerEntries.length, gasResponse: res };
    } catch (err) {
      Logger.error(`[ScoresSync] Failed to sync scores for guild ${guildId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generates comprehensive chronological point ledger audit entries for all students
   * from attendance records, daily jobs, streaks, interviews, job tasks, and adjustments.
   */
  static generateLedgerEntries(guildId, options = {}) {
    const cohortManager = require('../config/cohortManager');
    const scoring = cohortManager.getCohortScoring(guildId);
    const cohortTarget = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET;
    const cohortStartDate = options.cohortStartDate || cohortManager.getScoringStartDate(guildId) || scoring.scoringStartDate || "2026-09-06";
    const todayStr = DateTimeUtil.getTodayDateStr();
    const nowDhaka = DateTimeUtil.now();
    const isBeforeNightCutoff = (nowDhaka.hour < 23 || (nowDhaka.hour === 23 && nowDhaka.minute < 30));

    const cachedData = options.cachedData || {};
    const lifetimeStandings = options.lifetimeStandings || [];
    const isApprovedLeaveDay = options.isApprovedLeaveDay;

    const attRows = cachedData.attendanceRes?.rows || cachedData.attendanceRes?.attendance || [];
    const jobsList = cachedData.jobsRes?.jobs || [];
    const interviewsList = cachedData.interviewsRes?.interviews || [];
    const tasksList = cachedData.tasksRes?.tasks || [];
    const cohort = cohortManager.getCohort(guildId);
    const manualAdjs = cohort?.manualAdjustments || {};

    const approvedLeavesList = (cachedData.leavesRes?.leaves || []).filter(l => String(l.status || '').toUpperCase() === 'APPROVED');
    const checkLeave = isApprovedLeaveDay || ((student, dYmd) => {
      if (!student || !dYmd) return false;
      const dId = String(student.discordId || '').trim();
      const em = String(student.email || '').toLowerCase().trim();
      const nm = String(student.name || '').toLowerCase().trim();
      return approvedLeavesList.some(l => {
        const lStart = DateTimeUtil.normalizeDateStr(l.startDate);
        const lEnd = DateTimeUtil.normalizeDateStr(l.endDate) || lStart;
        if (!lStart || dYmd < lStart || dYmd > lEnd) return false;
        if (dId && l.discordId && dId === String(l.discordId).trim()) return true;
        if (em && l.email && em === String(l.email).toLowerCase().trim()) return true;
        if (nm && l.name && nm === String(l.name).toLowerCase().trim()) return true;
        return false;
      });
    });

    const allLedgerEntries = [];

    lifetimeStandings.forEach(student => {
      if (!student) return;
      const studentId = String(student.discordId || '').trim();
      const studentEmail = String(student.email || '').toLowerCase().trim();
      const studentName = String(student.name || '').toLowerCase().trim();
      const studentUser = String(student.username || '').toLowerCase().replace(/^@/, '').split('#')[0].trim();

      const isStudentMatch = (item) => {
        if (!item) return false;
        const iId = String(item.discordId || item.id || '').trim();
        const iEmail = String(item.email || '').toLowerCase().trim();
        const iRawUser = item.username || item.user || '';
        const iUser = iRawUser ? String(iRawUser).toLowerCase().replace(/^@/, '').split('#')[0].trim() : '';
        const iName = (item.studentName || item.name || item.displayName) ? String(item.studentName || item.name || item.displayName).toLowerCase().trim() : '';

        if (studentId && iId && studentId === iId) return true;
        if (studentEmail && iEmail && studentEmail === iEmail) return true;
        if (studentUser && iUser && studentUser === iUser) return true;
        if (studentName && iName && studentName === iName) return true;
        return false;
      };

      const studentStartDate = student.attendanceStartDate || cohortStartDate;
      const studentTxList = [];

      // 1. Attendance Transactions
      const attRow = attRows.find(r => isStudentMatch(r));

      if (attRow && attRow.sessions && typeof attRow.sessions === 'object') {
        Object.entries(attRow.sessions).forEach(([sessionDate, mark]) => {
          const datePart = DateTimeUtil.normalizeDateStr(sessionDate);
          if (!datePart || datePart < studentStartDate || datePart > todayStr) return;

          const isMorning = sessionDate.toLowerCase().includes('morning');
          if (isMorning) {
            if (!cohortManager.isFeatureEnabled(guildId, 'morning_attendance')) return;
            if (cohortManager.isMorningOff(guildId, datePart)) return;
          } else {
            if (!cohortManager.isFeatureEnabled(guildId, 'daily_attendance')) return;
          }

          const m = String(mark || "").toUpperCase().trim();
          if (m === 'OFF' || m === '0' || m === 'OPT' || m === 'EXEMPT' || m === '') {
            return;
          }

          let pts = 0;
          let remarks = "";
          const isMorningOpt = isMorning && cohortManager.isMorningOptional(guildId, student.discordId);
          const onLeave = checkLeave(student, datePart) || m === 'L' || m === 'LEAVE' || m.startsWith('L') || m === 'EXCUSED';

          if (onLeave) {
            pts = 0;
            remarks = "Approved Leave (Excused)";
          } else if (m === 'P' || m === 'PRESENT' || m.startsWith('P')) {
            pts = scoring.attendancePresent;
            remarks = "Present";
          } else if (m === 'A' || m === 'ABSENT' || m.startsWith('A')) {
            if (isMorningOpt) return;
            pts = scoring.attendanceAbsent;
            remarks = "Absent";
          } else {
            return;
          }

          const sourceLabel = isMorning ? "Morning Attendance" : (sessionDate.toLowerCase().includes('nlap') ? "NLAP Attendance" : "Daily Attendance");
          studentTxList.push({
            timestamp: `${datePart} ${isMorning ? '12:00:00' : '23:45:00'}`,
            date: datePart,
            discordId: student.discordId || "",
            name: student.name || "Student",
            category: "Attendance",
            eventSource: sourceLabel,
            pointsAwarded: pts,
            remarks: remarks
          });
        });
      }

      // 2. Job Application Transactions
      const studentJobs = jobsList.filter(j => isStudentMatch(j));

      const jobsByDate = new Map();
      studentJobs.forEach(jobDay => {
        const d = DateTimeUtil.normalizeDateStr(jobDay.date);
        if (!d || d < studentStartDate || d > todayStr) return;
        const count = Number(jobDay.count) || 0;
        if (!jobsByDate.has(d) || count > jobsByDate.get(d).count) {
          jobsByDate.set(d, { ...jobDay, normDate: d, count });
        }
      });

      Array.from(jobsByDate.values()).forEach(jobDay => {
        const onLeave = jobDay.status === 'ON_LEAVE' || checkLeave(student, jobDay.normDate);
        let dayPts = 0;
        let remarks = `${jobDay.count} applications logged`;

        if (onLeave) {
          dayPts = 0;
          remarks = "Leave Protected (0 pts)";
        } else {
          dayPts = ScoringService.calculateDailyJobScore(jobDay.count, cohortTarget);
          if (jobDay.normDate === todayStr && isBeforeNightCutoff && dayPts < 0) {
            dayPts = 0;
            remarks = `${jobDay.count} applications logged (In progress)`;
          }
        }

        if (dayPts !== 0 || jobDay.count > 0 || onLeave) {
          studentTxList.push({
            timestamp: `${jobDay.normDate} 23:50:00`,
            date: jobDay.normDate,
            discordId: student.discordId || "",
            name: student.name || "Student",
            category: "Job Applications",
            eventSource: "Job Tracker Sheet",
            pointsAwarded: dayPts,
            remarks: remarks
          });
        }
      });

      // 3. Application Streak Bonus
      if (student.streakBonus && student.streakBonus > 0) {
        studentTxList.push({
          timestamp: `${todayStr} 23:55:00`,
          date: todayStr,
          discordId: student.discordId || "",
          name: student.name || "Student",
          category: "Streak Bonus",
          eventSource: "Application Streak",
          pointsAwarded: student.streakBonus,
          remarks: `Application streak bonus (+${student.streakBonus} pts)`
        });
      }

      // 4. Interviews
      interviewsList.forEach(item => {
        if (!isStudentMatch(item)) return;
        const itemStatus = String(item.status || '').toUpperCase();
        const companyName = String(item.company || '').toUpperCase();
        if (itemStatus === 'VOIDED' || companyName.startsWith('[VOIDED]')) return;
        const iDate = DateTimeUtil.normalizeDateStr(item.interviewDate || item.date || item.loggedDate);
        if (!iDate || iDate < studentStartDate) return;

        studentTxList.push({
          timestamp: `${iDate} 15:00:00`,
          date: iDate,
          discordId: student.discordId || "",
          name: student.name || "Student",
          category: "Interviews",
          eventSource: "Verified Interview",
          pointsAwarded: scoring.interviewPoints || 5,
          remarks: `Interview: ${item.company || 'Company'} (${item.roleDetails || item.role || 'Role'})`
        });
      });

      // 5. Job Tasks
      tasksList.forEach(task => {
        if (!isStudentMatch(task)) return;
        const tDate = DateTimeUtil.normalizeDateStr(task.submittedAt || task.timestamp || task.createdAt);
        if (!tDate || tDate < studentStartDate) return;

        studentTxList.push({
          timestamp: `${tDate} 16:00:00`,
          date: tDate,
          discordId: student.discordId || "",
          name: student.name || "Student",
          category: "Job Tasks",
          eventSource: "Completed Task",
          pointsAwarded: Number(task.pointsAwarded) || (constants.SCORING.TASK_POINTS || 5),
          remarks: `Task: ${task.role || 'Role'} at ${task.company || 'Company'}`
        });
      });

      // 6. Manual Adjustments
      const adjs = (student.discordId && manualAdjs[student.discordId]) ||
                   (student.email && manualAdjs[student.email]) ||
                   (student.name && manualAdjs[student.name]) || [];
      adjs.forEach(adj => {
        const aDate = DateTimeUtil.normalizeDateStr(adj.date || adj.at) || todayStr;
        if (aDate < studentStartDate) return;
        studentTxList.push({
          timestamp: adj.at || `${aDate} 12:00:00`,
          date: aDate,
          discordId: student.discordId || "",
          name: student.name || "Student",
          category: "Manual Adjustment",
          eventSource: `Mentor (${adj.by || 'Admin'})`,
          pointsAwarded: Number(adj.amount) || 0,
          remarks: adj.reason || "Manual point adjustment"
        });
      });

      // Sort student transactions chronologically
      studentTxList.sort((a, b) => (a.timestamp || a.date).localeCompare(b.timestamp || b.date));

      let runningLife = 0;
      let runningWeek = 0;
      studentTxList.forEach(tx => {
        runningLife += tx.pointsAwarded;
        if (DateTimeUtil.isInCurrentWeek(tx.date)) {
          runningWeek += tx.pointsAwarded;
        }
        tx.runningLifetimeTotal = Math.round(runningLife * 10) / 10;
        tx.runningWeeklyTotal = Math.round(runningWeek * 10) / 10;
        allLedgerEntries.push(tx);
      });
    });

    // Sort all ledger entries chronologically
    allLedgerEntries.sort((a, b) => (a.timestamp || a.date).localeCompare(b.timestamp || b.date));
    return allLedgerEntries;
  }

  /**
   * Appends a point transaction to the Point_Ledger sheet
   */
  static async recordPointTransaction(guildId, entry) {
    return GasClient.syncScores(guildId, {
      scores: [],
      ledgerEntries: [entry]
    });
  }
}

module.exports = ScoringService;
