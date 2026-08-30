/**
 * JP ADMIN — Master Cohort Data & Analytical Aggregation Service
 * Scans, correlates, and aggregates all Google Sheet database tabs into unified student intelligence.
 */

const GasClient = require('./gasClient');
const ScoringService = require('./scoringService');
const cohortManager = require('../config/cohortManager');
const constants = require('../config/constants');
const DateTimeUtil = require('../utils/dateTime');
const Logger = require('../utils/logger');

class CohortDataService {
  /**
   * Fetches all database sources simultaneously and correlates student metrics
   */
  static async getFullCohortData(guildId) {
    const scoring = cohortManager.getCohortScoring(guildId);
    const scoringStartDate = scoring.scoringStartDate || "2026-08-30";
    const cohortTarget = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET;

    const [
      rosterRes,
      attendanceRes,
      jobsRes,
      tasksRes,
      interviewsRes,
      leavesRes,
      sheetsRes,
      standings
    ] = await Promise.all([
      GasClient.getRoster(guildId).catch(() => ({ students: [] })),
      GasClient.getAttendance(guildId).catch(() => ({ rows: [], dates: [] })),
      GasClient.getJobsDaily(guildId, 14).catch(() => ({ jobs: [] })),
      GasClient.getJobTasks(guildId).catch(() => ({ tasks: [] })),
      GasClient.getInterviews(guildId, 30).catch(() => ({ interviews: [] })),
      GasClient.getLeaves(guildId).catch(() => ({ leaves: [] })),
      GasClient.request(guildId, 'getJobSheets', {}).catch(() => ({ sheets: [] })),
      ScoringService.calculateRTBR(guildId).catch(() => [])
    ]);

    const activeStudents = (rosterRes.students || []).filter(s =>
      s.status === 'active' && s.status !== 'supervisor' && s.status !== 'mentor' && s.status !== 'staff'
    );

    const linkedSheetMap = new Map((sheetsRes.sheets || []).map(s => [s.discordId, s]));
    const attendanceMap = new Map((attendanceRes.rows || []).map(r => [r.discordId, r]));
    const standingsMap = new Map(standings.map(s => [s.discordId, s]));

    // Group jobs by student
    const jobsByStudent = new Map();
    (jobsRes.jobs || []).forEach(j => {
      if (!jobsByStudent.has(j.discordId)) jobsByStudent.set(j.discordId, []);
      jobsByStudent.get(j.discordId).push(j);
    });

    // Group interviews by student
    const interviewsByStudent = new Map();
    (interviewsRes.interviews || []).forEach(i => {
      if (!interviewsByStudent.has(i.discordId)) interviewsByStudent.set(i.discordId, []);
      interviewsByStudent.get(i.discordId).push(i);
    });

    // Group tasks by student
    const tasksByStudent = new Map();
    (tasksRes.tasks || []).forEach(t => {
      if (!tasksByStudent.has(t.discordId)) tasksByStudent.set(t.discordId, []);
      tasksByStudent.get(t.discordId).push(t);
    });

    // Group leaves by student
    const leavesByStudent = new Map();
    (leavesRes.leaves || []).forEach(l => {
      if (!leavesByStudent.has(l.discordId)) leavesByStudent.set(l.discordId, []);
      leavesByStudent.get(l.discordId).push(l);
    });

    const todayStr = DateTimeUtil.getTodayDateStr();

    // Map each student to a 360-degree profile
    const studentProfiles = activeStudents.map(student => {
      const discordId = student.discordId;
      const sheet = linkedSheetMap.get(discordId);
      const attRecord = attendanceMap.get(discordId);
      const standing = standingsMap.get(discordId) || { totalPoints: 0, details: '' };

      const studentJobs = jobsByStudent.get(discordId) || [];
      const studentInterviews = interviewsByStudent.get(discordId) || [];
      const studentTasks = tasksByStudent.get(discordId) || [];
      const studentLeaves = leavesByStudent.get(discordId) || [];

      // Attendance metrics (filtered by scoringStartDate)
      let presentCount = 0;
      let absentCount = 0;
      let leaveCount = 0;
      let totalSessions = 0;
      const sessionHistory = {};

      if (attRecord && attRecord.sessions) {
        Object.entries(attRecord.sessions).forEach(([sessionDate, mark]) => {
          const datePart = sessionDate.substring(0, 10);
          const rawMark = String(mark || "").toUpperCase().trim();
          sessionHistory[datePart] = rawMark;
          if (datePart >= scoringStartDate) {
            const isMorningSession = sessionDate.toLowerCase().includes('morning');
            const isMorningOff = isMorningSession && cohortManager.isMorningOff(guildId, datePart);

            if (rawMark === 'OFF' || rawMark === '0' || rawMark === 'EXCUSED' || isMorningOff) {
              // Excused / Off session - not counted as absence
              leaveCount++;
              return;
            }

            totalSessions++;
            if (rawMark === 'P' || rawMark.startsWith('P')) presentCount++;
            else if (rawMark === 'A' || rawMark.startsWith('A')) absentCount++;
            else if (rawMark === 'L' || rawMark.startsWith('L')) leaveCount++;
          }
        });
      }

      // Recent 3 and 5 sessions absence analysis
      const validDates = (attendanceRes.dates || []).filter(d => d >= scoringStartDate);
      const last3Dates = validDates.slice(-3);
      const last5Dates = validDates.slice(-5);

      let absentLast3Days = 0;
      last3Dates.forEach(d => {
        if (sessionHistory[d] === 'A' || sessionHistory[d]?.startsWith('A')) absentLast3Days++;
      });

      let absentLast5Days = 0;
      last5Dates.forEach(d => {
        if (sessionHistory[d] === 'A' || sessionHistory[d]?.startsWith('A')) absentLast5Days++;
      });

      // Jobs metrics
      const todayJob = studentJobs.find(j => j.date === todayStr);
      const todayJobCount = todayJob ? Number(todayJob.count) || 0 : 0;
      const totalJobsWeek = studentJobs.reduce((sum, j) => sum + (Number(j.count) || 0), 0);

      // Overdue tasks
      const overdueTasks = studentTasks.filter(t =>
        t.submissionStatus === 'Overdue' ||
        (t.submissionStatus === 'Announced' && t.deadline && t.deadline < todayStr)
      );

      // Active leave today
      const hasActiveLeaveToday = studentLeaves.some(l =>
        l.status === 'APPROVED' && todayStr >= l.startDate && todayStr <= l.endDate
      );

      return {
        discordId,
        name: student.name || student.username,
        email: student.email,
        region: student.region || "Unspecified",
        status: student.status,
        hasTrackerLinked: !!(sheet && sheet.sheetUrl),
        trackerUrl: sheet?.sheetUrl || null,
        trackerStatus: sheet?.status || 'Unlinked',
        totalPoints: standing.totalPoints || 0,
        totalSessions,
        presentCount,
        absentCount,
        leaveCount,
        absentLast3Days,
        absentLast5Days,
        todayJobCount,
        totalJobsWeek,
        metTodayTarget: todayJobCount >= cohortTarget,
        interviewCount: studentInterviews.length,
        interviews: studentInterviews,
        tasksCount: studentTasks.length,
        overdueTasksCount: overdueTasks.length,
        overdueTasks,
        hasActiveLeaveToday,
        leaves: studentLeaves,
        rawSessions: sessionHistory
      };
    });

    return {
      guildId,
      scoringStartDate,
      cohortTarget,
      totalActiveStudents: studentProfiles.length,
      students: studentProfiles,
      allAttendanceDates: attendanceRes.dates || [],
      validScoringDates: (attendanceRes.dates || []).filter(d => d >= scoringStartDate)
    };
  }

  /**
   * 1. Get students who haven't linked their tracker sheet
   */
  static async getStudentsWithoutTracker(guildId) {
    const data = await this.getFullCohortData(guildId);
    return data.students.filter(s => !s.hasTrackerLinked);
  }

  /**
   * 2. Get students absent in last N working sessions
   */
  static async getAbsentsInLastNDays(guildId, days = 3) {
    const data = await this.getFullCohortData(guildId);
    const validDates = data.validScoringDates;
    const targetDates = validDates.slice(-days);

    if (targetDates.length === 0) {
      return { targetDates: [], affectedStudents: [] };
    }

    const affected = [];

    data.students.forEach(student => {
      let absentDaysCount = 0;
      const absentOnDates = [];

      targetDates.forEach(d => {
        const mark = student.rawSessions[d];
        if (mark === 'A' || mark?.startsWith('A')) {
          absentDaysCount++;
          absentOnDates.push(d);
        }
      });

      if (absentDaysCount > 0) {
        affected.push({
          ...student,
          absentDaysCount,
          absentOnDates
        });
      }
    });

    // Sort descending by number of absences
    affected.sort((a, b) => b.absentDaysCount - a.absentDaysCount);

    return {
      targetDates,
      affectedStudents: affected
    };
  }

  /**
   * 3. Get students with 0 or below target applications today
   */
  static async getStudentsBelowTarget(guildId) {
    const data = await this.getFullCohortData(guildId);
    const belowTarget = data.students.filter(s => !s.metTodayTarget && !s.hasActiveLeaveToday);
    const zeroApplications = belowTarget.filter(s => s.todayJobCount === 0);
    return {
      cohortTarget: data.cohortTarget,
      totalBelow: belowTarget.length,
      zeroCount: zeroApplications.length,
      belowTargetStudents: belowTarget,
      zeroStudents: zeroApplications
    };
  }

  /**
   * 4. Get students with overdue hiring tasks
   */
  static async getOverdueTaskStudents(guildId) {
    const data = await this.getFullCohortData(guildId);
    return data.students.filter(s => s.overdueTasksCount > 0);
  }

  /**
   * 5. Get students with active or pending leaves
   */
  static async getLeaveOverview(guildId) {
    const data = await this.getFullCohortData(guildId);
    const todayStr = DateTimeUtil.getTodayDateStr();

    const onLeaveToday = data.students.filter(s => s.hasActiveLeaveToday);
    const allPendingLeaves = [];

    data.students.forEach(s => {
      s.leaves.forEach(l => {
        if (l.status === 'PENDING') {
          allPendingLeaves.push({ ...l, studentName: s.name, discordId: s.discordId });
        }
      });
    });

    return {
      todayStr,
      onLeaveToday,
      pendingLeaves: allPendingLeaves
    };
  }

  /**
   * 6. Generate compact token-efficient JSON snapshot for Gemini AI natural language queries
   */
  static async getCompactCohortSnapshot(guildId) {
    const data = await this.getFullCohortData(guildId);
    const todayStr = DateTimeUtil.getTodayDateStr();

    return {
      todayDate: todayStr,
      scoringStartDate: data.scoringStartDate,
      dailyApplicationTarget: data.cohortTarget,
      totalActiveStudents: data.totalActiveStudents,
      unlinkedTrackerCount: data.students.filter(s => !s.hasTrackerLinked).length,
      students: data.students.map(s => ({
        id: s.discordId,
        name: s.name,
        email: s.email,
        hasTracker: s.hasTrackerLinked,
        points: s.totalPoints,
        present: s.presentCount,
        absent: s.absentCount,
        leave: s.leaveCount,
        absentLast3Days: s.absentLast3Days,
        todayApps: s.todayJobCount,
        weekApps: s.totalJobsWeek,
        interviewsLogged: s.interviewCount,
        overdueTasks: s.overdueTasksCount,
        onLeaveToday: s.hasActiveLeaveToday
      }))
    };
  }

  /**
   * 7. Generate clean CSV string from data
   */
  static generateCSV(type, students) {
    if (!students || students.length === 0) {
      return "DiscordID,Name,Email,Status\n";
    }

    if (type === 'nosheet' || type === 'notracker') {
      const headers = ["Discord_ID", "Student_Name", "Email", "Tracker_Status"];
      const rows = students.map(s => `"${s.discordId}","${s.name}","${s.email}","Unlinked"`);
      return [headers.join(','), ...rows].join('\n');
    }

    if (type === 'absent') {
      const headers = ["Discord_ID", "Student_Name", "Email", "Absences_Count", "Absent_Dates"];
      const rows = students.map(s => `"${s.discordId}","${s.name}","${s.email}",${s.absentDaysCount || s.absentCount},"${(s.absentOnDates || []).join('; ')}"`);
      return [headers.join(','), ...rows].join('\n');
    }

    // Default full summary CSV
    const headers = [
      "Discord_ID",
      "Student_Name",
      "Email",
      "Total_Points",
      "Tracker_Linked",
      "Present_Sessions",
      "Absent_Sessions",
      "Leave_Sessions",
      "Today_Applications",
      "Week_Applications",
      "Interviews_Count",
      "Overdue_Tasks"
    ];

    const rows = students.map(s =>
      `"${s.discordId}","${s.name}","${s.email}",${s.totalPoints || 0},"${s.hasTrackerLinked ? 'Yes' : 'No'}",${s.presentCount || 0},${s.absentCount || 0},${s.leaveCount || 0},${s.todayJobCount || 0},${s.totalJobsWeek || 0},${s.interviewCount || 0},${s.overdueTasksCount || 0}`
    );

    return [headers.join(','), ...rows].join('\n');
  }
}

module.exports = CohortDataService;
