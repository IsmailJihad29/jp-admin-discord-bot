/**
 * JP ADMIN — Groq AI Service (llama-3.3-70b)
 */

const Groq = require('groq-sdk');
const Logger = require('../utils/logger');

class GroqService {
  constructor() {
    this.groq = null;
    this.model = "llama-3.3-70b-versatile";
    this.init();
  }

  init() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey && apiKey !== "your_groq_api_key_here") {
      try {
        this.groq = new Groq({ apiKey });
      } catch (err) {
        Logger.error("Failed to initialize Groq SDK:", err.message);
      }
    } else {
      Logger.warn("GROQ_API_KEY is not configured. AI features will use fallback logic.");
    }
  }

  async scoreAnswer(questionText, modelAnswer, studentAnswer) {
    if (!this.groq) {
      // Fallback: heuristic scoring if no API key
      const len = (studentAnswer || '').trim().length;
      return {
        score: len > 50 ? 7 : len > 10 ? 4 : 1,
        feedback: "Answer recorded (Offline evaluation fallback).",
        cheatDetected: false,
        isCorrect: len > 20
      };
    }

    try {
      const prompt = `You are an expert technical mentor and communication evaluator for a prestigious software engineering mentorship bootcamp.
Evaluate the student's answer against the given question and model answer.

Question:
"${questionText}"

Model / Expected Answer:
"${modelAnswer}"

Student's Submitted Answer:
"${studentAnswer}"

Evaluate strictly and return a JSON object with:
- "score": an integer from 0 to 10. (0 = irrelevant/wrong, 5 = partially correct, 8 = good, 10 = exceptional).
- "feedback": 1 or 2 concise, encouraging sentences highlighting what was good or what was missed.
- "cheatDetected": boolean (true if the answer appears copy-pasted directly from ChatGPT/Google without personal comprehension or formatting cues).
- "isCorrect": boolean (true if score >= 6).

Output ONLY valid JSON matching this schema:
{"score": number, "feedback": string, "cheatDetected": boolean, "isCorrect": boolean}`;

      const chatCompletion = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content || '{}';
      return JSON.parse(responseText);
    } catch (err) {
      Logger.error("Error scoring answer with Groq:", err.message);
      return {
        score: 5,
        feedback: "Evaluated automatically (AI evaluation fallback).",
        cheatDetected: false,
        isCorrect: true
      };
    }
  }

  async generateQuestions(category, difficulty = 'medium', count = 5) {
    if (!this.groq) {
      return [
        {
          id: `Q-${Date.now()}-1`,
          category: category,
          difficulty: difficulty,
          question: `Explain the key difference between synchronous and asynchronous execution in JavaScript.`,
          modelAnswer: `Synchronous execution blocks the thread until completion, while asynchronous execution allows operations to run in the background (event loop) without blocking.`
        }
      ];
    }

    try {
      const prompt = `Generate ${count} high-quality, practical interview-style mentorship questions for category: "${category}" at "${difficulty}" difficulty.
For technical categories (e.g. JavaScript, React, Node.js, Databases, DSA), create conceptual and scenario-based coding/architecture questions.
For communication categories, create behavioral, STAR-method, and professional workplace communication scenarios.

Return ONLY a JSON array of objects with the schema:
[
  {
    "category": "${category}",
    "difficulty": "${difficulty}",
    "question": "Clear question text",
    "modelAnswer": "Concise bulleted or 2-3 sentence reference model answer"
  }
]`;

      const response = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content || '{"questions":[]}';
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed.questions || []);
      return list.map((q, i) => ({
        id: `Q-${Date.now().toString(36).toUpperCase()}-${i + 1}`,
        category: q.category || category,
        difficulty: q.difficulty || difficulty,
        question: q.question,
        modelAnswer: q.modelAnswer
      }));
    } catch (err) {
      Logger.error("Error generating questions with Groq:", err.message);
      return [];
    }
  }

  async parseNaturalQuery(query, commandCatalog) {
    if (!this.groq) {
      return {
        suggestedCommand: `!help`,
        explanation: `Natural language query parser requires GROQ_API_KEY.`
      };
    }

    try {
      const prompt = `You are JP, the conversational command assistant for JP ADMIN Mentorship Discord Bot.
A supervisor ran "!jp ${query}".

Catalog of available commands:
${JSON.stringify(commandCatalog, null, 2)}

Your goal:
1. Identify which command the supervisor wants to run.
2. Determine if all required arguments are present or if a parameter is ambiguous.
3. Suggest the exact command to review (e.g. "!target applications 10") or ask ONE short clarifying question.
NEVER execute or pretend to execute the command. Suggest it for mentor review.

Return ONLY JSON:
{
  "suggestedCommand": "exact command string or null if ambiguous",
  "clarifyingQuestion": "short question if missing info or null",
  "explanation": "brief 1-sentence note explaining what this command does"
}`;

      const response = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (err) {
      Logger.error("Error parsing natural query with Groq:", err.message);
      return {
        suggestedCommand: "!help",
        explanation: "Could not parse query via AI. Use !help to browse available commands."
      };
    }
  }

  async generateInterviewFeedback(interviewPostText) {
    if (!this.groq) {
      return "🎉 Great job scheduling this interview! Review core fundamentals for your role, system design patterns, and standard STAR behavioral questions.";
    }

    try {
      const prompt = `A student in a software engineering mentorship bootcamp posted an interview update:
"${interviewPostText}"

Generate a 30-Question Interview Master Guide categorized into:
1. Core Technical & Language Fundamentals (Q1-Q8)
2. Framework & Architecture (Q9-Q16)
3. System Design & Scenario Problem Solving (Q17-Q24)
4. Behavioral & Culture Fit (Q25-Q30)
5. 3 Actionable Tips to ace the interview.

Format each question numbered 1 to 30 clearly in clean markdown.`;

      const response = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        temperature: 0.5
      });

      return response.choices[0]?.message?.content || "Keep up the great work!";
    } catch (err) {
      Logger.error("Error generating interview feedback:", err.message);
      return "Best of luck with your interview preparation!";
    }
  }
}

module.exports = new GroqService();
