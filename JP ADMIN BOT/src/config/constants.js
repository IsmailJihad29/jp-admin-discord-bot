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
    SUCCESSFULLY_HIRED: ["successfully-hired", "hired", "placements", "success-stories"]
  },

  // Scoring configuration for Student Performance & Leaderboard
  SCORING: {
    // Attendance points (Sunday - Thursday from Google Form 'Daily Attendance' tab)
    ATTENDANCE_PRESENT: 1,
    ATTENDANCE_ABSENT: -1,
    ATTENDANCE_LEAVE: 0,

    // Daily Job Scraping tiered points
    JOB_TIERS: {
      FULL: 2.0,         // 100% of target (+2.0 pts)
      TIER_80: 1.5,      // 80% to 99% (+1.5 pts)
      TIER_70: 1.0,      // 70% to 79% (+1.0 pt)
      TIER_60: 0.5,      // 60% to 69% (+0.5 pt)
      BELOW_60: -0.5,    // Below 60% (-0.5 pt penalty)
      EXTRA_BONUS: 1.0   // > 100% of target (+1 bonus, total = 3.0 pts)
    },

    // Interview Prep Feedback (+2 points)
    INTERVIEW_POINTS: 2,

    // Job Task Lifecycle points
    TASK_ANNOUNCED: 1,       // Posted in #job-task-update (+1 pt)
    TASK_APPROVED: 1,        // Approved by mentor via !submit (+1 pt)
    TASK_MISSED_DEADLINE: -2,// Overdue without submission (-2 pts penalty)

    // Streaks and Defaults
    STREAK_BONUS_PER_DAY: 3,
    STREAK_CAP: 15,
    DEFAULT_JOB_TARGET: 10
  },

  // Default Daily Timeline Schedule (Asia/Dhaka)
  DEFAULT_SCHEDULE: {
    ATTENDANCE_SCAN: "23:00",          // 23:00 Sun-Thu
    JOB_CHECK: "23:30",                // 23:30 Daily
    TASK_DEADLINE_CHECK: "00:05",      // 00:05 Daily
    WEEKLY_LEADERBOARD_THU: "18:00",   // 18:00 Thursday
    WEEKLY_AT_RISK_THU: "18:30"        // 18:30 Thursday
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
