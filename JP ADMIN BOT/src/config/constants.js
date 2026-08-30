/**
 * JP ADMIN — Constants and System Defaults
 * Version: v3.29 (bot) / v47 (expected Apps Script backend)
 */

module.exports = {
  BOT_VERSION: "v3.30",
  EXPECTED_GAS_VERSION: "v50",
  DEFAULT_TIMEZONE: "Asia/Dhaka",

  // Recognized Channels for auto-discovery and operations
  CHANNELS: {
    DISCUSSION: ["discussion", "general", "main", "chat", "lounge"],
    ANNOUNCEMENTS: ["announcements", "announcement", "nlap-announcements", "notice", "notices"],
    BOT_ADMIN: ["jp-admin", "bot-admin", "cr-discussion", "mentor-zone", "mentors-zone", "admin"],
    ATTENDANCE: ["daily-attendance", "attendance", "morning-attendance", "att"],
    JOB_TRACKING: ["job-tracker", "job-trackers", "daily-job-tracker", "job-applications-tracker", "job-tracking-sheet", "job-tracking", "jobtracker"],
    INTERVIEW_UPDATE: ["interview-preparations", "interview-preparation", "interview-update", "interview-updates", "interviews", "interview-prep"],
    JOB_TASK: ["jobs-task-updates", "interview-task-updates", "job-task-update", "job-tasks", "task-updates", "job-task", "tasks", "task-update"],
    LEAVE: ["leave-request", "leave-requests", "leave", "leaves", "issues", "leave-application", "leave-form", "apply-leave"],
    LEAVE_REQUEST: ["leave-request", "leave-requests", "leave", "leaves", "issues", "leave-application", "leave-form", "apply-leave"],
    RTBR: ["referral-leaderboard", "leaderboard", "leaderboards", "right-to-be-referred", "rtbr", "top-student-referrals"],
    RESUME_REFERRAL: ["resume-needed", "resume-refer", "referrals", "resume"],
    ONE_ON_ONE: ["1on1-support", "1-on-1-support", "mentorship-support", "queries-to-mentor", "support"],
    HEALTH_CHECK: ["dev-health-check", "student-health-check", "my-health-check", "health-check", "healthcheck", "dev-health"],
    DAILY_TASK: ["daily-task", "daily-tasks", "today-task", "todays-task", "daily-assignment", "daily-target", "daily-job-task"],
    SUCCESSFULLY_HIRED: ["successfully-hired", "hired", "placements", "success-stories"]
  },

  // Scoring configuration for Student Performance & Leaderboard
  SCORING: {
    // Attendance points (Sunday - Thursday from Google Form 'Daily Attendance' tab)
    ATTENDANCE_PRESENT: 1.0,
    ATTENDANCE_ABSENT: -1.0,
    ATTENDANCE_LEAVE: 0.0,

    // Daily Job Scraping tiered points (Bonus turned off)
    JOB_TIERS: {
      FULL: 1.0,         // 100% of target (+1.0 pt)
      TIER_80: 0.5,      // 70% to 99% (+0.5 pt)
      TIER_70: 0.5,      // 70% to 99% (+0.5 pt)
      TIER_60: -0.5,     // < 70% (-0.5 pt penalty)
      BELOW_60: -0.5,    // < 70% (-0.5 pt penalty)
      EXTRA_BONUS: 0.0   // Bonus turned off
    },

    // Verified Interview Points (+1.0 point upon mentor verification)
    INTERVIEW_POINTS: 1.0,

    // Job Task Lifecycle points
    TASK_ANNOUNCED: 1.0,       // Posted in #job-task-update (+1.0 pt)
    TASK_SUBMITTED: 1.0,       // Submitted with valid links (+1.0 pt)
    TASK_APPROVED: 1.0,        // Approved by mentor (+1.0 pt)
    TASK_MISSED_DEADLINE: -1.0,// Overdue without submission (-1.0 pt penalty)

    // Streaks and Defaults
    STREAK_BONUS_PER_DAY: 1.0,
    STREAK_CAP: 5.0,
    DEFAULT_JOB_TARGET: 10
  },

  // Default Daily Timeline Schedule (Asia/Dhaka)
  DEFAULT_SCHEDULE: {
    MORNING_BRIEFING: "09:30",         // 09:30 Sun-Thu
    MORNING_ATTENDANCE: "12:00",       // 12:00 Sun-Thu
    UNIFIED_ATTENDANCE_SCAN: "23:45",  // 23:45 Sun-Thu
    JOB_SCRAPER_AND_TASK: "00:05",     // 00:05 Daily
    WEEKLY_CLOSING_LEADERBOARD: "00:20"// 00:20 Fri (Thu night closing)
  },

  // Roles
  ROLES: {
    SUPERVISOR: "Supervisor",
    MENTOR: "Mentor",
    HIRED: "Hired",
    ACTIVE_STUDENT: "Active Student",
    REFERRAL_RESTRICTED: "Referral Restricted"
  }
};
