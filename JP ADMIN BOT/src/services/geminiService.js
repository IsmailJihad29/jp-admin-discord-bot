/**
 * JP ADMIN — Google Gemini AI Service
 * Powered by @google/genai (gemini-2.0-flash / gemini-1.5-flash)
 */

const { GoogleGenAI } = require('@google/genai');
const { DateTime } = require('luxon');
const Logger = require('../utils/logger');
const GroqService = require('./groqService');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.ai = null;
    if (this.apiKey && this.apiKey !== 'your_gemini_api_key_here') {
      try {
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
        Logger.info("Google Gemini AI client initialized.");
      } catch (err) {
        Logger.warn("Failed to initialize Google Gemini client:", err.message);
      }
    }
  }

  isConfigured() {
    return !!(this.ai && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  }

  /**
   * Generates comprehensive 30-question tailored interview preparation master guide
   */
  async generateInterviewFeedback(content) {
    if (!this.isConfigured()) {
      Logger.info("GEMINI_API_KEY not set. Falling back to GroqService for interview feedback.");
      return GroqService.generateInterviewFeedback(content);
    }

    try {
      const prompt = `You are a Principal Software Architect and Executive Technical Career Mentor in a top software engineering mentorship bootcamp.
A student posted this update about an upcoming job interview:
"${content}"

Analyze the post and extract the company name, job role, and tech stack.
Generate a comprehensive, high-yield **30-Question Interview Master Preparation Guide** tailored specifically to this company, role, and tech stack.

Structure your response clearly with these 4 sections:

### 📌 Section 1: Core Technical & Language Fundamentals (Questions 1 - 8)
Generate 8 in-depth questions testing language mechanics, data structures, runtime internals, memory/async models, and syntax quirks for the specified tech stack.

### 📌 Section 2: Framework, Architecture & State Management (Questions 9 - 16)
Generate 8 questions testing framework patterns, component lifecycle, APIs, optimization, and database/caching design.

### 📌 Section 3: Scenario-Based Problem Solving & System Design (Questions 17 - 24)
Generate 8 questions testing real-world architectural tradeoffs, bug troubleshooting, security, high-load scaling, and edge cases.

### 📌 Section 4: Behavioral, Culture Fit & STAR Scenarios (Questions 25 - 30)
Generate 6 behavioral/STAR questions tailored for this company culture, conflict resolution, project delivery, and motivation.

### 💡 High-Yield Interview Strategy & Advice
Provide 3 concise, actionable tips to stand out and ace this specific interview.

Format each question with its exact number (1. to 30.) and a brief 1-sentence insight on what interviewers look for. Keep formatting clean, highly professional, inspiring, and easy to read.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      return response.text.trim();
    } catch (err) {
      Logger.error("Gemini interview feedback failed, attempting Groq fallback:", err.message);
      return GroqService.generateInterviewFeedback(content);
    }
  }

  /**
   * Parses job task announcement messages to extract structured data and deadline date
   */
  async parseJobTaskAnnouncement(content) {
    // Default fallback extractor via Regex
    const fallbackData = this.extractTaskDetailsRegex(content);

    if (!this.isConfigured()) {
      return fallbackData;
    }

    try {
      const todayIso = DateTime.now().setZone('Asia/Dhaka').toFormat('yyyy-MM-dd');
      const prompt = `You are a parser for student bootcamp job task announcements.
Today's date is ${todayIso}.
The student posted:
"${content}"

Extract the following information and output strictly a valid JSON object with NO markdown backticks:
{
  "company": "Company name or 'Unknown'",
  "role": "Job role/title or 'Software Engineer'",
  "techStack": "Technologies/languages mentioned or 'General'",
  "deadlineDate": "The submission deadline date formatted strictly as YYYY-MM-DD. If year is omitted, assume current/next relevant year.",
  "rawDeadline": "The exact deadline phrase found in the text"
}`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      let rawText = response.text.trim();
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      }

      const parsed = JSON.parse(rawText);
      return {
        company: parsed.company || fallbackData.company,
        role: parsed.role || fallbackData.role,
        techStack: parsed.techStack || fallbackData.techStack,
        deadlineDate: parsed.deadlineDate || fallbackData.deadlineDate,
        rawDeadline: parsed.rawDeadline || fallbackData.rawDeadline
      };
    } catch (err) {
      Logger.warn("Gemini task parse failed, using regex fallback:", err.message);
      return fallbackData;
    }
  }

  /**
   * Helper regex parser for dates like "30 aug 2026", "30-08-2026", "2026-08-30"
   */
  extractTaskDetailsRegex(content) {
    const text = content.trim();
    let company = "Company";
    let role = "Software Engineer";
    let techStack = "General";
    let deadlineDate = "";
    let rawDeadline = "";

    // Match deadline patterns like "30 aug 2026", "30 August 2026", "2026-08-30", "30/08/2026"
    const dateRegexes = [
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i,
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
      /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/
    ];

    for (const rx of dateRegexes) {
      const match = text.match(rx);
      if (match) {
        rawDeadline = match[0];
        try {
          let dt = DateTime.fromFormat(rawDeadline, 'd MMM yyyy');
          if (!dt.isValid) dt = DateTime.fromFormat(rawDeadline, 'd MMMM yyyy');
          if (!dt.isValid) dt = DateTime.fromFormat(rawDeadline, 'MMM d yyyy');
          if (!dt.isValid) dt = DateTime.fromFormat(rawDeadline, 'yyyy-MM-dd');
          if (!dt.isValid) dt = DateTime.fromFormat(rawDeadline, 'dd/MM/yyyy');
          if (!dt.isValid) dt = DateTime.fromFormat(rawDeadline, 'dd-MM-yyyy');

          if (dt.isValid) {
            deadlineDate = dt.toFormat('yyyy-MM-dd');
            break;
          }
        } catch (_) {}
      }
    }

    if (!deadlineDate) {
      // Default to 3 days from now if not specified
      deadlineDate = DateTime.now().setZone('Asia/Dhaka').plus({ days: 3 }).toFormat('yyyy-MM-dd');
    }

    return {
      company,
      role,
      techStack,
      deadlineDate,
      rawDeadline: rawDeadline || deadlineDate
    };
  }

  /**
   * AI-Powered Natural Language Cohort Data Query Engine
   */
  async answerCohortDataQuery(userQuery, cohortSnapshot) {
    if (!this.isConfigured()) {
      return `⚠️ **Google Gemini AI is not configured.** Please check your \`GEMINI_API_KEY\` in \`.env\`. You can still use instant filter commands like \`!data absent 3\`, \`!data nosheet\`, \`!data summary\`.`;
    }

    try {
      const prompt = `You are the Lead Data Analyst and Mentorship AI for the JP Career Mentorship Program.
A mentor has asked the following data query about their cohort:
"${userQuery}"

Here is the complete live dataset snapshot of all active students across all Google Sheet database tabs:
${JSON.stringify(cohortSnapshot, null, 2)}

Instructions:
1. Thoroughly analyze the snapshot to accurately answer the mentor's specific question.
2. If listing students, format each student clearly as: • <@ID> (Name) — [Relevant metric/details].
3. Include summary totals, percentages, and actionable insights for mentors.
4. If the question is in English, Bengali, or Banglish, reply in the same natural, professional, and helpful language.
5. Keep markdown formatting clean, structured with emojis, and ready to be displayed in a Discord embed.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      return response.text.trim();
    } catch (err) {
      Logger.error("Gemini cohort data query failed:", err.message);
      return `⚠️ **AI Query Error:** ${err.message}. You can also run direct filter commands like \`!data nosheet\`, \`!data absent 3\`, or \`!data summary\`.`;
    }
  }
}

module.exports = new GeminiService();
