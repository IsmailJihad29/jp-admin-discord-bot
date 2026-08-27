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
  static async calculateRTBR(guildId) {
    const cohortManager = require('../config/cohortManager');
    const scoring = cohortManager.getCohortScoring(guildId);
    const cohortTarget = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET;

    // Fetch data from Apps Script backend for the 4 core components
    const [rosterRes, jobsRes, interviewsRes, tasksRes, attendanceRes] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getJobsDaily(guildId, 7).catch(() => ({ jobs: [] })),
      GasClient.getInterviews(guildId, 7).catch(() => ({ interviews: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ attendance: [] }))
    ]);

    const activeStudents = (rosterRes.students || []).filter(s =>
      s.status === 'active' && s.status !== 'supervisor' && s.status !== 'mentor' && s.status !== 'staff'
    );
    const studentMap = new Map();

    activeStudents.forEach(s => {
      studentMap.set(s.discordId, {
        discordId: s.discordId,
        name: s.name || s.username,
        email: s.email,
        attendancePoints: 0,
        jobPoints: 0,
        jobTotalApps: 0,
        streakBonus: 0,
        interviewPoints: 0,
        interviewCount: 0,
        taskPoints: 0,
        taskCount: 0,
        totalPoints: 0
      });
    });

    // 1. Daily & Morning Attendance Points (Present, Absent, Leave)
    const attRows = attendanceRes.rows || attendanceRes.attendance || [];
    attRows.forEach(att => {
      const student = studentMap.get(att.discordId);
      if (student) {
        if (att.sessions && typeof att.sessions === 'object') {
          Object.values(att.sessions).forEach(mark => {
            const m = String(mark || "").toUpperCase().trim();
            if (m === 'P' || m === 'PRESENT' || m.startsWith('P')) {
              student.attendancePoints += scoring.attendancePresent;
            } else if (m === 'A' || m === 'ABSENT' || m.startsWith('A')) {
              student.attendancePoints += scoring.attendanceAbsent;
            } // Leave 'L' is 0 points
          });
        } else if (att.status === 'P' || att.status === 'PRESENT') {
          student.attendancePoints += scoring.attendancePresent;
        } else if (att.status === 'A' || att.status === 'ABSENT') {
          student.attendancePoints += scoring.attendanceAbsent;
        }
      }
    });

    // 2. Job Application Tiered Scoring & Streaks
    const jobsByStudent = new Map();
    (jobsRes.jobs || []).forEach(j => {
      if (!jobsByStudent.has(j.discordId)) {
        jobsByStudent.set(j.discordId, []);
      }
      jobsByStudent.get(j.discordId).push(j);
    });

    studentMap.forEach((student, discordId) => {
      const studentJobs = jobsByStudent.get(discordId) || [];
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

    // 3. Interview Points
    (interviewsRes.interviews || []).forEach(item => {
      const student = studentMap.get(item.discordId);
      if (student) {
        student.interviewCount += 1;
        student.interviewPoints += scoring.interviewPoints;
      }
    });

    // 4. Job Task Points
    (tasksRes.tasks || []).forEach(task => {
      const student = studentMap.get(task.discordId);
      if (student) {
        student.taskCount += 1;
        student.taskPoints += Number(task.pointsAwarded) || 0;
      }
    });

    // Calculate total points and breakdown string
    const results = Array.from(studentMap.values()).map(s => {
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
    results.sort((a, b) => b.totalPoints - a.totalPoints);
    return results;
  }
}

module.exports = ScoringService;
