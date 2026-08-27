# 🤖 JP ADMIN — EJP Mentorship Bot & Automation System

**Version:** `v3.29` (Discord Bot) / `v47` (Google Apps Script Backend)  
**Stack:** Node.js (`discord.js` v14), Google Sheets + Google Apps Script (23-tab Relational Matrix Database), Groq AI (`llama-3.3-70b`), Render Hosting (with automated wake-up).

---

## 🌟 Overview & Key Features

- 📊 **23-Tab Google Sheets Integration**: Automated provisioning, dynamic attendance matrices, question bank, score tracking, leave & appeal ledgers, job tracking, and roster sync.
- 🌅 **Dawn Focus Circle (05:00–07:00 AM Asia/Dhaka)**: Automated message detection, horizontal attendance matrix sync (`P · HH:MM`), role assignment, and leave awareness.
- ❓ **AI Question Drops & Cheat Detection**: Scheduled drops at 07:00, 13:00, and 18:00. Groq AI (`llama-3.3-70b`) scoring (0–10 + 2 bonus), plagiarism detection (30% penalty flag), and automatic question bank refill.
- 🎯 **AI Interview Prep Feedback**: Instant mentoring feedback & questions on `#interview-update` posts (+15 RTBR points).
- 🏆 **Right-To-Be-Referred (RTBR) Score & Leaderboard**: Rolling 7-day scoring engine (Job applications + Streaks + Questions + Interviews + Workshop ✅ poll reactions).
- 💼 **Job Tracking Sheet Audit**: Automated audit of student public Google Sheets, dated row counts, and progress tracking.
- 📢 **Job Post Forwarder**: Cross-server job forwarding (EJP → STRIDE) with real-time edit synchronization and mention suppression.
- 💬 **Conversational Command Center (`!jp`)**: Natural language query assistant suggesting exact verified commands.
- ⏰ **Render Free-Tier Budget Engine**: Built-in `Render-Uptime-Monitor.gs` keeps the bot awake during the configured 04:50–23:30 Asia/Dhaka active window.

---

## 📁 Repository Structure

```
.
├── google-apps-script/
│   ├── Code.gs                   # Complete v47 Google Apps Script Backend & Web App API
│   └── Render-Uptime-Monitor.gs  # 5-minute wake-up trigger for Render free-tier
├── src/
│   ├── config/
│   │   ├── constants.js          # System constants, scoring weights, channel names
│   │   └── cohortManager.js      # Multi-cohort dynamic registry & settings
│   ├── services/
│   │   ├── gasClient.js          # Resilient Apps Script API client with retry logic
│   │   ├── groqService.js        # Groq AI (llama-3.3-70b) evaluation & generator
│   │   ├── jobScraperService.js  # Public Google Sheet CSV scraper & auditor
│   │   ├── scoringService.js     # 7-day rolling RTBR leaderboard calculations
│   │   ├── forwarderService.js   # Job post forwarding & edit-sync engine
│   │   └── scheduler.js          # Asia/Dhaka automated cron timeline
│   ├── handlers/
│   │   ├── commandHandler.js     # Prefix command router & supervisor access gate
│   │   ├── interactionHandler.js # Discord modals, buttons, and select menus
│   │   └── messageHandler.js     # Channel event pipelines & AI triggers
│   ├── commands/                 # Modular command suites across 9 categories
│   └── utils/                    # Luxon date/time, rich embeds, table formatters, logger
├── package.json
├── .env.example
└── DOCUMENTATION.md              # Full system specification reference
```

---

## 🚀 Quick Setup Guide (~20 minutes)

### Step 1: Google Sheets & Apps Script Setup (5 min)
1. Create a new Google Spreadsheet in Google Drive.
2. Go to **Extensions** → **Apps Script**.
3. Replace the script content with [`google-apps-script/Code.gs`](file:///g:/Apps/Discord%20Bot/google-apps-script/Code.gs).
4. Set your custom `SECRET_KEY` inside `Code.gs` (or keep the default).
5. Click **Deploy** → **New deployment** → Choose **Web app**:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
6. Click **Deploy** and copy the `/exec` Web App URL.
7. (Optional) Create a second script file in the same project with [`google-apps-script/Render-Uptime-Monitor.gs`](file:///g:/Apps/Discord%20Bot/google-apps-script/Render-Uptime-Monitor.gs) and run `installUptimeTrigger()`.

---

### Step 2: Discord Bot & Developer Portal (3 min)
1. Go to [Discord Developer Portal](https://discord.com/developers/applications) and create a New Application.
2. Under **Bot**, enable all **Privileged Gateway Intents**:
   - ✅ `PRESENCE INTENT`
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `MESSAGE CONTENT INTENT`
3. Copy the Bot **Token** and **Client ID**.
4. Invite the bot to your Discord Server with **Administrator** permission:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot
   ```

---

### Step 3: Local Installation & Configuration (2 min)
1. Clone / open this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your keys:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GROQ_API_KEY=your_groq_api_key_here
   DEFAULT_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   DEFAULT_GAS_SECRET=CHANGE_THIS_SECRET_KEY
   DEFAULT_TIMEZONE=Asia/Dhaka
   ```
4. Start the bot locally for testing:
   ```bash
   npm start
   ```

---

### Step 4: First-Time Cohort Server Initialization (5 min)
In your Discord server, run the following commands in order:

1. **Provision Channels & Roles:**
   ```
   !setupserver
   ```
2. **Bind Google Sheet & Provision 23 Database Tabs:**
   ```
   !setupcohortsheet fresh confirm https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
   ```
3. **Run System Diagnosis:**
   ```
   !doctor
   ```
4. **Sync Discord Members to Database:**
   ```
   !syncmembers
   ```
5. **Post Student Onboarding Panel in `#welcome-to-the-bootcamp`:**
   ```
   !onboardingpanel
   ```

---

## 🎛️ Command Center Reference

Type `!help` or `!commandcenter` in Discord to open the interactive UI, or ask `!jp <natural request>` in plain English!

| Category | Key Commands |
|---|---|
| **Admin & Doctor** | `!doctor`, `!setupserver`, `!checkperms`, `!cohorts`, `!supervisor add/remove @user`, `!audit` |
| **Attendance & Forms** | `!openform`, `!closeform [silent]`, `!attendance`, `!absent [date]`, `!dawn sync`, `!formtemplate` |
| **Identity & Roster** | `!syncmembers`, `!missingdata`, `!profilesurvey`, `!studentstatus @student <status>`, `!students` |
| **Questions & AI** | `!questions`, `!dropquestion [cat]`, `!genquestions <cat> <count>`, `!leaderboard`, `!rtbr` |
| **Workshops & Polls** | `!workshop`, `!workshopannounce`, `!workshoppoll [slot]` |
| **Leaves & Appeals** | `!leave` (student), `!leaves` (mentor approval), `!warnings @student`, `!appeals` |
| **Jobs & Outreach** | `!jobscheck`, `!outreachcheck`, `!backfilloutreach`, `!backfillinterviews` |
| **Forwarder** | `!forwarder status`, `!forwarder set <srcId> <dstId>`, `!forwarder start/stop` |
| **Automation Clocks** | `!control`, `!times`, `!time <key> <HH:MM>`, `!schedule <key> <days>`, `!targets` |
| **Conversational AI** | `!jp <plain English request>` (powered by Groq `llama-3.3-70b`) |

---

## 🌐 Deploying to Render (Free Tier)

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub repository.
3. Configure the service:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
4. Add your Environment Variables (`DISCORD_TOKEN`, `GROQ_API_KEY`, `DEFAULT_GAS_URL`, `DEFAULT_GAS_SECRET`, `PORT=3000`).
5. Set `Render-Uptime-Monitor.gs` in your Google Apps Script project with your Render URL (`https://your-service.onrender.com`) to automate sleep/wake schedules.
