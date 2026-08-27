# 📚 JP ADMIN BOT (v3.30) — পূর্ণাঙ্গ কমান্ড রেফারেন্স ম্যানুয়াল

---

## 🛠️ ১. সিস্টেম ও সার্ভার প্রভিশনিং (Supervisors & Administrators Only)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!setgas`** | `!gasurl`, `!gas` | Supervisor | `#jp-admin` | `!setgas <Web_App_URL>`<br>*Ex:* `!setgas https://script.google.com/macros/s/.../exec` | ডিসকর্ড সার্ভারের সাথে গুগল শিটের Google Apps Script (v50) ব্যাকএন্ড লিংক ও কানেক্ট করে। |
| **`!setupserver`** | `!scanserver`, `!checkperms`, `!setup` | Supervisor | `#jp-admin` | `!setupserver` | পুরো সার্ভার স্ক্যান করে স্বয়ংক্রিয়ভাবে ক্যাটাগরি, রোল (`Supervisor`, `Mentor`, `Active Student`, `Hired`, `Referral Restricted`) এবং ১০+ চ্যানেল পারমিশন তৈরি ও মেরামত করে। |
| **`!setchannel`** | `!customchannel`, `!channel` | Supervisor | `#jp-admin` | `!setchannel <KEY> <#channel>`<br>*Ex:* `!setchannel ATTENDANCE #daily-attendance` | কোনো ফিচারের জন্য কাস্টম চ্যানেল নির্ধারণ করে (যেমন: `ATTENDANCE`, `RTBR`, `HEALTH_CHECK`, `JOB_TRACKING`, `LEAVE_REQUEST`, `JOB_TASK`)। |
| **`!supervisor`** | `!supervisors`, `!admin` | Owner / Supervisor | `#jp-admin` | `!supervisor <add/remove> @user`<br>*Ex:* `!supervisor add @John` | কোনো মেম্বারকে কোহোর্ট সুপারভাইজার বা অ্যাডমিনিস্ট্রেটর হিসেবে রেজিস্টার বা রিমুভ করে। |
| **`!cohorts`** | `!cohort` | Supervisor | `#jp-admin` | `!cohorts` | সার্ভারের বর্তমান কোহোর্ট কনফিগারেশন, শিট কানেকশন, টাইমজোন এবং অটোমেশন স্টেটাস প্রদর্শন করে। |
| **`!settrackertemplate`** | `!trackertemplate` | Supervisor / Mentor | `#jp-admin` | `!settrackertemplate <Google_Sheet_URL>`<br>*Ex:* `!settrackertemplate https://docs.google.com/spreadsheets/d/.../copy` | শিক্ষার্থীদের কপি করার জন্য অফিশিয়াল ডেমো জব ট্র্যাকার গুগল শিটের লিংক বটের মেমরিতে সেট করে। |

---

## ⚙️ ২. পয়েন্ট কাস্টমাইজেশন ও ডায়নামিক স্কোরিং (Mentor & Supervisor)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!points`** | `!scoring`, `!pointsettings` | Mentor / Supervisor | `#jp-admin` | `!points` | সার্ভারে সক্রিয় সকল পয়েন্টের মান (ইন্টারভিউ, উপস্থিতি, অনুপস্থিতি, ডেইলি টার্গেট, স্ট্রিক, টাস্ক) একটি এম্বেডে প্রদর্শন করে। |
| **`!setpoint interview`** | `!setpoint int` | Mentor / Supervisor | `#jp-admin` | `!setpoint interview <points>`<br>*Ex:* `!setpoint interview 10` | প্রতিটি ইন্টারভিউ লগ করার জন্য কত পয়েন্ট দেওয়া হবে তা কাস্টমাইজ করে (ডিফল্ট: ৫ পয়েন্ট)। |
| **`!setpoint attendance`** | `!setpoint att` | Mentor / Supervisor | `#jp-admin` | `!setpoint attendance <present_pts> [absent_pts]`<br>*Ex:* `!setpoint attendance 2 -2` | উপস্থিত (+Present) এবং অনুপস্থিত (-Absent) থাকার পয়েন্ট ইচ্ছামতো পরিবর্তন করে। |
| **`!setpoint target`** | `!setpoint jobtarget` | Mentor / Supervisor | `#jp-admin` | `!setpoint target <count>`<br>*Ex:* `!setpoint target 12` | শিক্ষার্থীদের প্রতিদিনের বাধ্যতামূলক জব অ্যাপ্লিকেশনের দৈনিক টার্গেট সেট করে (ডিফল্ট: ১০টি)। |
| **`!setpoint streak`** | `!setpoint streaks` | Mentor / Supervisor | `#jp-admin` | `!setpoint streak <bonus_per_day> [max_cap]`<br>*Ex:* `!setpoint streak 4 20` | টানা দিন টার্গেট পূরণের জন্য দৈনিক স্ট্রিক বোনাস এবং সর্বোচ্চ ক্যাপ নির্ধারণ করে। |
| **`!setpoint task`** | `!setpoint tasks` | Mentor / Supervisor | `#jp-admin` | `!setpoint task <announced> <approved> [overdue]`<br>*Ex:* `!setpoint task 1 2 -2` | কোম্পানির কোডিং টাস্ক অ্যানাউন্স (+১), মেন্টর অ্যাপ্রুভাল (+১) এবং ডেডলাইন মিসের পেনাল্টি (-২) পয়েন্ট সেট করে। |
| **`!setpoint reset`** | `!setpoint default` | Mentor / Supervisor | `#jp-admin` | `!setpoint reset` | সকল পয়েন্ট ও স্কোরিং রুলস আগের স্ট্যান্ডার্ড ফ্যাক্টরি ডিফল্ট মানে রিসেট করে। |

---

## 📅 ৩. উপস্থিতি ও অ্যাটেন্ডেন্স ম্যানেজমেন্ট (Attendance Operations)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!morningattendance`** | `!morningatt` | Mentor / Supervisor | `#jp-admin` | `!morningattendance [YYYY-MM-DD]`<br>*Ex:* `!morningattendance 2026-08-27` | গুগল ফর্মের **`Morning Attendance`** ট্যাব স্ক্যান করে উপস্থিত (+১), অনুপস্থিত (-১), ছুটি (০) হিসাব করে রিপোর্ট `#daily-attendance`-এ প্রকাশ করে এবং `#jp-admin`-এ রিসিপ্ট দেয়। |
| **`!checkattendance`** | `!attendance`, `!att` | Mentor / Supervisor | `#jp-admin` | `!checkattendance [YYYY-MM-DD]`<br>*Ex:* `!checkattendance` | গুগল ফর্মের **`Daily Attendance`** ট্যাব স্ক্যান করে স্কোর আপডেট করে এবং রিপোর্ট `#daily-attendance` চ্যানেলে প্রকাশ করে। |
| **`!customattendance`** | `!scanfromtab`, `!customatt` | Mentor / Supervisor | `#jp-admin` | `!customattendance "<Tab Name>" [YYYY-MM-DD] [Label]`<br>*Ex:* `!customattendance "Special Workshop"` | নিয়মিত ফর্মের বদলে অন্য যেকোনো **কাস্টম গুগল শিট ট্যাব** থেকে ওই দিনের জন্য অ্যাটেন্ডেন্স স্ক্যান করে পয়েন্ট প্রদান করে। |
| **`!repairattendance`** | `!fixattendance`, `!repairroster` | Mentor / Supervisor | `#jp-admin` | `!repairattendance` | গুগল শিটের `Attendance` ম্যাট্রিক্স স্ক্যান করে অনুপস্থিত শিক্ষার্থীদের নাম ও ইমেইল সিঙ্ক করে এবং নষ্ট হওয়া ফরম্যাট ঠিক করে। |
| **`!absent`** | `!absentees`, `!absentstudents` | Mentor / Supervisor | `#jp-admin` | `!absent [YYYY-MM-DD]`<br>*Ex:* `!absent` | নির্দিষ্ট তারিখে কারা কারা ক্লাসে বা মিটিংয়ে অনুপস্থিত ছিল তাদের তালিকা বের করে। |

---

## 🌴 ৪. ছুটি ও হলিডে সিস্টেম (Leaves & Offdays Management)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!leave`** | `!applyleave`, `!requestleave` | Student / Staff | **`#leave-request`** | `!leave` | শিক্ষার্থীদের ছুটির আবেদন করার জন্য একটি ইন্টারেক্টিভ পপআপ মডাল ওপেন করে। |
| **`!leaves`** | `!allleaves`, `!listleaves` | Mentor / Supervisor | `#jp-admin` | `!leaves [pending / approved / rejected]`<br>*Ex:* `!leaves pending` | শিক্ষার্থীদের জমা দেওয়া সকল ছুটির আবেদন **[Approve]** ও **[Reject]** বাটন সহ প্রদর্শন করে। |
| **`!approve`** | `!acceptleave` | Mentor / Supervisor | `#jp-admin` | `!approve <Request_ID>`<br>*Ex:* `!approve LR-20260827-A1B2` | নির্দিষ্ট ছুটির আবেদন মঞ্জুর করে (অনুমোদিত দিনে অ্যাটেন্ডেন্সে কোনো মাইনাস হবে না, ০ পয়েন্ট থাকবে)। |
| **`!reject`** | `!denyleave`, `!deny` | Mentor / Supervisor | `#jp-admin` | `!reject <Request_ID>`<br>*Ex:* `!reject LR-20260827-A1B2` | নির্দিষ্ট ছুটির আবেদন বাতিল করে। |
| **`!offday today`** | `!holiday today`, `!break` | Mentor / Supervisor | `#jp-admin` | `!offday today [ছুটির কারণ]`<br>*Ex:* `!offday today Govt Holiday` | আজকের দিনটিকে অফডে ঘোষণা করে `#announcements`-এ নোটিশ দেয় এবং রাত ১১:৩০ এর জব অডিট ও অ্যাবসেন্ট পেনাল্টি বন্ধ রাখে। |
| **`!offday <Range>`** | `!holiday <Range>` | Mentor / Supervisor | `#jp-admin` | `!offday YYYY-MM-DD to YYYY-MM-DD [কারণ]`<br>*Ex:* `!offday 2026-08-28 to 2026-08-30 Eid Vacation` | টানা কয়েকদিনের ছুটি শিডিউল করে, গুগল শিটের `Holidays` ট্যাবে সেভ করে এবং এই দিনগুলোতে পেনাল্টি পজ রাখে। |
| **`!offdays`** | `!holidays`, `!listholidays` | Mentor / Supervisor | `#jp-admin` | `!offdays` | সার্ভারে শিডিউল করা সকল সক্রিয় ও ভবিষ্যৎ ছুটির ক্যালেন্ডার প্রদর্শন করে। |
| **`!removeoffday`** | `!clearoffday`, `!deleteholiday` | Mentor / Supervisor | `#jp-admin` | `!removeoffday <YYYY-MM-DD>`<br>*Ex:* `!removeoffday 2026-08-28` | কোনো শিডিউল করা ছুটি বাতিল করে নিয়মিত ট্র্যাকিং পুনরায় চালু করে। |

---

## 💼 ৫. জব ট্র্যাকিং ও কোডিং টাস্ক (Job Applications & Coding Tasks)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!linksheet`** | `!trackersheet`, `!jobsheet`, `!mytracker` | Student / Staff | **`#job-tracker`** | `!linksheet <Google_Sheet_URL>`<br>*Ex:* `!linksheet https://docs.google.com/spreadsheets/d/.../edit` | শিক্ষার্থীর পার্সোনাল গুগল শিট ট্র্যাকারটি ১ বার ভেরিফাই ও লিঙ্ক করে (২৪/৭ অটোমেটিক রাত ১১:৩০ এর অডিটের জন্য)। |
| **`!mysheet`** | `!registersheet`, `!sheet` | Student / Staff | **`#job-tracker`** | `!mysheet` | নিজের লিঙ্ক করা গুগল শিটের লাইভ অবস্থা, মোট আবেদন সংখ্যা এবং অটো-স্ক্র্যাপার সক্রিয় আছে কিনা তা দেখায়। |
| **`!submit`** | `!submittask`, `!tasksolution` | Student / Staff | **`#jobs-task-updates`** | `!submit` *(পূর্ববর্তী টাস্ক অ্যানাউন্সমেন্টে Reply করে)* | কোম্পানির কোডিং টাস্কের গিটহাব লিংক ও লাইভ ডেমো সাবমিট করার জন্য পপআপ ফর্ম ওপেন করে। |
| **`!tasks`** | `!jobtasks`, `!tasklist` | Mentor / Supervisor | `#jp-admin` | `!tasks [pending / all]` | শিক্ষার্থীদের সাবমিট করা সকল কোডিং অ্যাসাইনমেন্টের তালিকা ও কোড রিভিউ বাটন প্রদর্শন করে। |
| **`!review`** | `!reviewtask` | Mentor / Supervisor | `#jp-admin` | `!review <TaskID> <approve/reject> [Note]`<br>*Ex:* `!review TASK-123456 approve Good Code` | টাস্ক অ্যাপ্রুভ করে অতিরিক্ত +১ পয়েন্ট যোগ করে অথবা রিজেক্ট করে। |
| **`!jobscheck`** | `!notapplying`, `!jobaudit` | Mentor / Supervisor | `#jp-admin` | `!jobscheck` | আজ কারা কারা দৈনিক জব অ্যাপ্লিকেশনের টার্গেট পূরণ করতে ব্যর্থ হয়েছে তাদের তালিকা প্রকাশ করে। |
| **`!outreachcheck`** | `!outreach` | Mentor / Supervisor | `#jp-admin` | `!outreachcheck` | শিক্ষার্থীদের লিঙ্কডইন এবং নেটওয়ার্কিং আউটরিচ পরিসংখ্যান প্রদর্শন করে। |

---

## 🩺 ৬. শিক্ষার্থী স্বাস্থ্য, স্কোরকার্ড ও লিডারবোর্ড (Scorecards & Leaderboards)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!myhealth`** | `!myprofile`, `!mystatus`, `!healthcheck`, `!me` | Student / Staff | **`#dev-health-check`** | `!myhealth` | শিক্ষার্থীর সম্পূর্ণ স্কোরকার্ড, র‍্যাঙ্ক, উপস্থিতি, জব এনালিটিক্স (ইউনিক কোম্পানি, টপ রোল, প্ল্যাটফর্ম) ও মেন্টর পরামর্শ প্রদর্শন করে। |
| **`!panelhealth`** | `!healthpanel` | Mentor / Supervisor | `#dev-health-check` | `!panelhealth` | `#dev-health-check` চ্যানেলে শিক্ষার্থীদের জন্য **[ 🩺 Check My Health & Status ]** ওয়ান-ক্লিক বাটনটি পোস্ট করে। |
| **`!leaderboard`** | `!rtbr`, `!weeklyreport`, `!topstudents`, `!ranks` | Student / Staff | **`#referral-leaderboard`** | `!leaderboard` | টপ ১০ সহ **সকল শিক্ষার্থীর পূর্ণাঙ্গ লিডারবোর্ড** `@everyone` মেনশন সহ `#referral-leaderboard` চ্যানেলে প্রকাশ করে। |
| **`!hired`** | `!gotjob`, `!placed` | Mentor / Supervisor | `#jp-admin` | `!hired @student <Company> [Role]`<br>*Ex:* `!hired @John Google Software Engineer` | শিক্ষার্থী চাকরি পেলে `#successfully-hired` চ্যানেলে সেলিব্রেশন ব্যানার পাঠায় এবং `Hired` রোল অ্যাসাইন করে। |
| **`!referralaccess`** | `!referrallock`, `!referral` | Mentor / Supervisor | `#jp-admin` | `!referralaccess @student <grant/restrict>`<br>*Ex:* `!referralaccess @John restrict` | শিক্ষার্থীর পারফরম্যান্স অনুযায়ী `#resume-needed` রেফারেল চ্যানেল আনলক বা লক করে। |
| **`!atrisk`** | `!dropouts`, `!atriskstudents` | Mentor / Supervisor | `#jp-admin` | `!atrisk` | গত ৭ দিনের ডাটা এনালাইসিস করে ড্রপ-আউট ঝুঁকিতে থাকা শিক্ষার্থীদের শনাক্ত করে। |
| **`!warnings`** | `!absentwarnings`, `!inactive` | Mentor / Supervisor | `#jp-admin` | `!warnings` | চলতি সপ্তাহে ৩ বার বা তার বেশি অনুপস্থিত থাকা ঝুঁকিপূর্ণ শিক্ষার্থীদের তালিকা প্রদর্শন করে। |
| **`!syncmembers`** | `!syncroster`, `!syncstudents` | Mentor / Supervisor | `#jp-admin` | `!syncmembers` | ডিসকর্ড সার্ভারের সকল সদস্যকে রোল অনুযায়ী গুগল শিটের `Bot_Map`-এ আপডেট ও সিঙ্ক করে। |
| **`!students`** | `!studentlist`, `!allstudents` | Mentor / Supervisor | `#jp-admin` | `!students` | কোহোর্টের সকল সক্রিয় শিক্ষার্থীর নামের তালিকা ও তাদের ডিসকর্ড আইডি দেখায়। |
| **`!studentreport`** | `!report` | Mentor / Supervisor | `#jp-admin` | `!studentreport @student`<br>*Ex:* `!studentreport @John` | নির্দিষ্ট কোনো শিক্ষার্থীর সার্বিক পারফরম্যান্সের গভীর অ্যানালাইসিস রিপোর্ট দেয়। |

---

## 📢 ৭. গাইডলাইন পাবলিশার, হেল্প ও সাধারণ কমান্ড (Guidelines & Help)

| কমান্ডের নাম (Command) | বিকল্প নাম (Aliases) | অনুমতি (Role) | অনুমোদিত চ্যানেল (Channel) | সিনট্যাক্স ও উদাহরণ (Syntax & Example) | কাজের বিস্তারিত বিবরণ (Description) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`!posttemplates`** | `!guidelines`, `!formatguidelines`, `!templates` | Mentor / Supervisor | `#jp-admin` | `!posttemplates` *(বা `!posttemplates interview / task / tracker / all`)* | শিক্ষার্থীদের চ্যানেলে স্ট্যান্ডার্ড পোস্ট ফরম্যাট পাঠায় (ইন্টারেক্টিভ বাটন হাব ওপেন হয় যাতে বেছে বেছে পোস্ট করা যায়)। |
| **`!mentor`** | `!giverole`, `!removerole`, `!role` | Supervisor | `#jp-admin` | `!mentor <add/remove> @user`<br>*Ex:* `!mentor add @John` | মেম্বারকে মেন্টর রোল ও পারমিশন প্রদান করে অথবা প্রত্যাহার করে। |
| **`!doctor`** | `!diagnose`, `!gasdoctor` | Mentor / Supervisor | `#jp-admin` | `!doctor` | বট, ডিসকর্ড এপিআই, গুগল শিটের v50 ব্যাকএন্ড এবং ১১টি ডেটাবেজ ট্যাবের সার্বিক সংযোগ ও স্বাস্থ্য পরীক্ষা করে। |
| **`!jp`** | `!askjp` | Everyone | Any Channel | `!jp <আপনার প্রশ্ন>`<br>*Ex:* `!jp আমার লিডারবোর্ড স্কোর কীভাবে বাড়াব?` | Google Gemini AI চালিত ন্যাচারাল ল্যাঙ্গুয়েজ অ্যাসিস্ট্যান্ট যা কোহোর্ট সংক্রান্ত যেকোনো প্রশ্নের উত্তর দেয়। |
| **`!help`** | `!commands`, `!bothelp` | Everyone | Any Channel | `!help` | বটের সাধারণ কমান্ড সহায়িকা ও ব্যবহার নির্দেশিকা প্রদর্শন করে। |
