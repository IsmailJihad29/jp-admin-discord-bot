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
   * Generates tailored interview preparation questions and tips
   */
  async generateInterviewFeedback(content) {
    if (!this.isConfigured()) {
      Logger.info("GEMINI_API_KEY not set. Falling back to GroqService for interview feedback.");
      return GroqService.generateInterviewFeedback(content);
    }

    try {
      const prompt = `You are a Senior Tech Lead and Career Mentor in an intensive software engineering bootcamp.
A student posted this update about an upcoming job interview:
"${content}"

Analyze the post, extract the company, role, and technology stack.
Then provide:
1. **5 Tailored Interview Questions**:
   - 3 Deep Technical questions specific to their tech stack & role.
   - 2 High-impact Behavioral/Scenario questions likely for this company/role.
2. **Key Preparation Tips**:
   - 3 actionable, high-yield tips on how to stand out and answer effectively.

Keep your response professional, encouraging, and formatted in clean markdown bullet points.`;

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
}

module.exports = new GeminiService();
