/**
 * JP ADMIN — Google Gemini AI Service
 * Powered by @google/genai (gemini-2.5-flash)
 * Groq dependency fully removed — Gemini only.
 */

const { GoogleGenAI } = require('@google/genai');
const { DateTime } = require('luxon');
const Logger = require('../utils/logger');

const GEMINI_MODEL = 'gemini-2.5-flash';

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.ai = null;
    if (this.apiKey && this.apiKey !== 'your_gemini_api_key_here') {
      try {
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
        Logger.info(`Google Gemini AI client initialized (model: ${GEMINI_MODEL}).`);
      } catch (err) {
        Logger.warn('Failed to initialize Google Gemini client:', err.message);
      }
    } else {
      Logger.warn('GEMINI_API_KEY not configured. AI features will be unavailable.');
    }
  }

  isConfigured() {
    return !!(this.ai && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  }

  /**
   * Core Gemini request helper with error handling
   */
  async _generate(prompt) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in .env');
    }
    const response = await this.ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });
    return response.text.trim();
  }

  // ─────────────────────────────────────────────────────
  // 1. Interview Post Validator
  // ─────────────────────────────────────────────────────

  /**
   * Validates whether a message contains proper interview information.
   * Returns { valid, company, role, interviewDate, techStack, missingFields, reason }
   */
  async validateInterviewPost(content) {
    // Fast check: message too short → clearly invalid
    if (!content || content.trim().length < 20) {
      return {
        valid: false,
        missingFields: ['company', 'role', 'interview date'],
        reason: 'Message is too short to contain interview details.'
      };
    }

    if (!this.isConfigured()) {
      return this._validateInterviewOffline(content);
    }

    try {
      const prompt = `You are a strict validator for a student bootcamp Discord channel called #interview-preparation.
Students must post updates when they get an interview, containing:
- Company name (required)
- Job role / position (required)
- Interview date or upcoming date (required)
- Tech stack or notes (optional)

Analyze this message and output ONLY a valid JSON object with NO markdown backticks:
{
  "valid": true or false,
  "company": "company name or null",
  "role": "job role or null",
  "interviewDate": "YYYY-MM-DD or null",
  "techStack": "tech stack or null",
  "missingFields": ["list of missing required fields"],
  "reason": "one sentence explanation if invalid, empty string if valid"
}

Message:
"${content.replace(/"/g, "'")}"

IMPORTANT: Return valid=true ONLY if company, role, AND some date/time reference are all clearly present. Random messages, greetings, and off-topic posts must return valid=false.`;

      const rawText = await this._generate(prompt);
      const cleaned = rawText.startsWith('```')
        ? rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim()
        : rawText;

      const parsed = JSON.parse(cleaned);
      return {
        valid: parsed.valid === true,
        company: parsed.company || null,
        role: parsed.role || null,
        interviewDate: parsed.interviewDate || null,
        techStack: parsed.techStack || null,
        missingFields: parsed.missingFields || [],
        reason: parsed.reason || ''
      };
    } catch (err) {
      Logger.warn('Gemini interview validation failed, using offline fallback:', err.message);
      return this._validateInterviewOffline(content);
    }
  }

  /**
   * Offline keyword-based interview post validator (fallback when Gemini unavailable)
   */
  _validateInterviewOffline(content) {
    const text = content.toLowerCase();
    const hasCompanyHint = /company|at |with |for |ltd|inc|corp|technologies|solutions|software|tech|group|systems|digital|ai|limited/.test(text);
    const hasRoleHint = /engineer|developer|intern|manager|analyst|designer|devops|fullstack|frontend|backend|react|node|python|java|qa|tester|lead|senior|junior/.test(text);
    const hasDateHint = /\d{1,2}[\/\-\.]\d{1,2}|\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|today|tomorrow|monday|tuesday|wednesday|thursday|friday|next week|interview date|scheduled/.test(text);

    const missing = [];
    if (!hasCompanyHint) missing.push('company name');
    if (!hasRoleHint) missing.push('job role/position');
    if (!hasDateHint) missing.push('interview date');

    return {
      valid: missing.length === 0,
      company: null,
      role: null,
      interviewDate: null,
      techStack: null,
      missingFields: missing,
      reason: missing.length > 0 ? `Could not detect: ${missing.join(', ')}.` : ''
    };
  }

  // ─────────────────────────────────────────────────────
  // 2. Interview Prep Guide Generator (30 Questions)
  // ─────────────────────────────────────────────────────

  /**
   * Generates a comprehensive 30-question tailored interview preparation guide using Gemini.
   */
  async generateInterviewFeedback(content) {
    if (!this.isConfigured()) {
      return (
        '⚠️ **Gemini AI not configured.** Please set `GEMINI_API_KEY` in your `.env` file.\n\n' +
        '**General tips while you wait:**\n' +
        '• Review core language fundamentals and data structures.\n' +
        '• Practise STAR-format behavioural answers.\n' +
        '• Research the company\'s products, culture, and tech stack.\n' +
        '• Prepare 3–5 thoughtful questions to ask the interviewer.'
      );
    }

    const prompt = `You are a Principal Software Architect and Executive Technical Career Mentor in a top software engineering mentorship bootcamp.
A student posted this update about an upcoming job interview:
"${content}"

Analyze the post and extract the company name, job role, and tech stack.
Generate a comprehensive, high-yield **30-Question Interview Master Preparation Guide** tailored specifically to this company, role, and tech stack.

Structure your response clearly with these 4 sections:

### 📌 Section 1: Core Technical & Language Fundamentals (Questions 1–8)
Generate 8 in-depth questions testing language mechanics, data structures, runtime internals, memory/async models, and syntax quirks for the specified tech stack.

### 📌 Section 2: Framework, Architecture & State Management (Questions 9–16)
Generate 8 questions testing framework patterns, component lifecycle, APIs, optimization, and database/caching design.

### 📌 Section 3: Scenario-Based Problem Solving & System Design (Questions 17–24)
Generate 8 questions testing real-world architectural tradeoffs, bug troubleshooting, security, high-load scaling, and edge cases.

### 📌 Section 4: Behavioral, Culture Fit & STAR Scenarios (Questions 25–30)
Generate 6 behavioral/STAR questions tailored for this company culture, conflict resolution, project delivery, and motivation.

### 💡 High-Yield Interview Strategy & Advice
Provide 3 concise, actionable tips to stand out and ace this specific interview.

Format each question with its exact number (1. to 30.) and a brief 1-sentence insight on what interviewers look for. Keep formatting clean, professional, and inspiring.`;

    try {
      return await this._generate(prompt);
    } catch (err) {
      Logger.error('Gemini interview feedback failed:', err.message);
      return `❌ **AI generation failed:** ${err.message}\n\nPlease try again in a few seconds, or check your GEMINI_API_KEY.`;
    }
  }

  // ─────────────────────────────────────────────────────
  // 3. Job Task Announcement Parser
  // ─────────────────────────────────────────────────────

  /**
   * Parses job task announcement messages to extract structured data and deadline date.
   */
  async parseJobTaskAnnouncement(content) {
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

      const rawText = await this._generate(prompt);
      const cleaned = rawText.startsWith('```')
        ? rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim()
        : rawText;

      const parsed = JSON.parse(cleaned);
      return {
        company: parsed.company || fallbackData.company,
        role: parsed.role || fallbackData.role,
        techStack: parsed.techStack || fallbackData.techStack,
        deadlineDate: parsed.deadlineDate || fallbackData.deadlineDate,
        rawDeadline: parsed.rawDeadline || fallbackData.rawDeadline
      };
    } catch (err) {
      Logger.warn('Gemini task parse failed, using regex fallback:', err.message);
      return fallbackData;
    }
  }

  /**
   * Regex-based deadline extractor (offline fallback)
   */
  extractTaskDetailsRegex(content) {
    const text = content.trim();
    let company = 'Company';
    let role = 'Software Engineer';
    let techStack = 'General';
    let deadlineDate = '';
    let rawDeadline = '';

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
      deadlineDate = DateTime.now().setZone('Asia/Dhaka').plus({ days: 3 }).toFormat('yyyy-MM-dd');
    }

    return { company, role, techStack, deadlineDate, rawDeadline: rawDeadline || deadlineDate };
  }

  // ─────────────────────────────────────────────────────
  // 4. Cohort Data Query Engine (AI for Mentors)
  // ─────────────────────────────────────────────────────

  /**
   * AI-Powered Natural Language Cohort Data Query Engine
   */
  async answerCohortDataQuery(userQuery, cohortSnapshot) {
    if (!this.isConfigured()) {
      return `⚠️ **Google Gemini AI is not configured.** Please check your \`GEMINI_API_KEY\` in \`.env\`.\nYou can still use instant filter commands like \`!data absent 3\`, \`!data nosheet\`, \`!data summary\`.`;
    }

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

    try {
      return await this._generate(prompt);
    } catch (err) {
      Logger.error('Gemini cohort data query failed:', err.message);
      return `⚠️ **AI Query Error:** ${err.message}\n\nYou can also run direct filter commands like \`!data nosheet\`, \`!data absent 3\`, or \`!data summary\`.`;
    }
  }

  // ─────────────────────────────────────────────────────
  // 5. Question Generator (for quiz drops)
  // ─────────────────────────────────────────────────────

  /**
   * Generates quiz questions for a given category and difficulty
   */
  async generateQuestions(category, difficulty = 'medium', count = 5) {
    if (!this.isConfigured()) {
      return [{
        id: `Q-${Date.now()}-1`,
        category,
        difficulty,
        question: 'Explain the key difference between synchronous and asynchronous execution in JavaScript.',
        modelAnswer: 'Synchronous execution blocks the thread until completion, while asynchronous execution allows operations to run in the background via the event loop.'
      }];
    }

    const prompt = `Generate ${count} high-quality, practical interview-style mentorship questions for category: "${category}" at "${difficulty}" difficulty.
For technical categories (e.g. JavaScript, React, Node.js, Databases, DSA), create conceptual and scenario-based coding/architecture questions.
For communication categories, create behavioral, STAR-method, and professional workplace communication scenarios.

Return ONLY a valid JSON array with NO markdown backticks:
[
  {
    "category": "${category}",
    "difficulty": "${difficulty}",
    "question": "Clear question text",
    "modelAnswer": "Concise bulleted or 2-3 sentence reference model answer"
  }
]`;

    try {
      const rawText = await this._generate(prompt);
      const cleaned = rawText.startsWith('```')
        ? rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim()
        : rawText;

      const parsed = JSON.parse(cleaned);
      const list = Array.isArray(parsed) ? parsed : (parsed.questions || []);
      return list.map((q, i) => ({
        id: `Q-${Date.now().toString(36).toUpperCase()}-${i + 1}`,
        category: q.category || category,
        difficulty: q.difficulty || difficulty,
        question: q.question,
        modelAnswer: q.modelAnswer
      }));
    } catch (err) {
      Logger.error('Gemini question generation failed:', err.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────
  // 6. Answer Scorer (for quiz submissions)
  // ─────────────────────────────────────────────────────

  /**
   * Scores a student's quiz answer against the model answer
   */
  async scoreAnswer(questionText, modelAnswer, studentAnswer) {
    if (!this.isConfigured()) {
      const len = (studentAnswer || '').trim().length;
      return {
        score: len > 50 ? 7 : len > 10 ? 4 : 1,
        feedback: 'Answer recorded (Gemini AI not configured — offline scoring).',
        cheatDetected: false,
        isCorrect: len > 20
      };
    }

    const prompt = `You are an expert technical mentor evaluating a student's answer.

Question:
"${questionText}"

Model Answer:
"${modelAnswer}"

Student's Answer:
"${studentAnswer}"

Evaluate the student's answer and return ONLY a valid JSON object with NO markdown backticks:
{
  "score": <integer 0-10>,
  "feedback": "2-3 sentence constructive feedback mentioning what was good and what was missing",
  "cheatDetected": <true if answer is copy-pasted model answer verbatim, false otherwise>,
  "isCorrect": <true if score >= 6>
}`;

    try {
      const rawText = await this._generate(prompt);
      const cleaned = rawText.startsWith('```')
        ? rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim()
        : rawText;
      return JSON.parse(cleaned);
    } catch (err) {
      Logger.error('Gemini answer scoring failed:', err.message);
      return {
        score: 5,
        feedback: 'Could not evaluate answer automatically. Mentor review recommended.',
        cheatDetected: false,
        isCorrect: false
      };
    }
  }

  // ─────────────────────────────────────────────────────
  // 7. Natural Language Command Parser (replaces Groq parseNaturalQuery)
  // ─────────────────────────────────────────────────────

  async parseNaturalQuery(query, commandCatalog) {
    if (!this.isConfigured()) {
      return {
        suggestedCommand: '!help',
        explanation: 'Natural language query requires GEMINI_API_KEY to be configured.'
      };
    }

    const prompt = `You are JP, the conversational command assistant for JP ADMIN Mentorship Discord Bot.
A supervisor ran "!jp ${query}".

Catalog of available commands:
${JSON.stringify(commandCatalog, null, 2)}

Your goal:
1. Identify which command the supervisor wants to run.
2. Determine if all required arguments are present.
3. Suggest the exact command (e.g. "!target applications 10") or ask ONE short clarifying question.
NEVER execute the command. Suggest it for mentor review.

Return ONLY a valid JSON object with NO markdown backticks:
{
  "suggestedCommand": "exact command string or null if ambiguous",
  "clarifyingQuestion": "short question if missing info or null",
  "explanation": "brief 1-sentence note explaining what this command does"
}`;

    try {
      const rawText = await this._generate(prompt);
      const cleaned = rawText.startsWith('```')
        ? rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim()
        : rawText;
      return JSON.parse(cleaned);
    } catch (err) {
      Logger.error('Gemini natural query parse failed:', err.message);
      return {
        suggestedCommand: '!help',
        explanation: 'Could not parse query via AI. Use !help to browse available commands.'
      };
    }
  }
}

module.exports = new GeminiService();
