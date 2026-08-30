/**
 * Command: !points, !pointsystem, !scoring, !scoresystem, !pointrules
 * Comprehensive Point System Guide & Mentor Broadcast Command
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Embeds = require('../../utils/embedBuilder');
const ChannelHelper = require('../../utils/channelHelper');
const cohortManager = require('../../config/cohortManager');
const constants = require('../../config/constants');

function buildFullGuideEmbed(guildId) {
  const scoring = cohortManager.getCohortScoring(guildId);
  const target = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET || 10;
  const tiers = constants.SCORING.JOB_TIERS;

  return Embeds.info(
    "🌟 JP Mentorship — Official Right-To-Be-Referred (RTBR) Point System Guide",
    `Welcome to the **JP Mentorship Performance & Referral Scoring System**! 🚀\n` +
    `Every activity you complete is tracked and converted into points. Your cumulative score determines your rank on the **Referral Leaderboard (\`!leaderboard\`)** for exclusive company job referrals.\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 📅 ১. উপস্থিতি পয়েন্ট (Attendance & Basecamp)\n` +
    `• 🟢 **উপস্থিত (Present):** \`+${scoring.attendancePresent}.0 পয়েন্ট\` (প্রতি সেশন)\n` +
    `• 🔴 **অনুপস্থিত (Absent):** \`${scoring.attendanceAbsent}.0 পয়েন্ট\` *(জরিমানা)*\n` +
    `• 🟡 **ছুটি (Approved Leave):** \`০ পয়েন্ট\` *(কোনো পেনাল্টি নেই, \`!leave\` দিয়ে আগে আবেদন করতে হবে)*\n` +
    `• ⚪ **মর্নিং বেসক্যাম্প অফ / সরকারি ছুটি (Holiday):** \`০ পয়েন্ট\` *(সবার জন্য মাফ)*\n` +
    `*💡 নিয়ম: Daily Attendance Form (রবি-বৃহস্পতি) এবং Morning Basecamp Form জমা দিতে হবে।*\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 💼 ২. দৈনিক চাকরির আবেদন ও টায়ার্ড স্কোরিং (Job Application Tiers)\n` +
    `প্রতিদিনের স্ট্যান্ডার্ড টার্গেট: **\`${target}টি আবেদন\`** *(গুগল শিট থেকে মধ্যরাতে অটো-স্ক্র্যান হয়)*\n` +
    `• 🟢 **১০০% টার্গেট (${target}টি আবেদন):** \`+${tiers.FULL}.0 পয়েন্ট\`\n` +
    `• 🟡 **৭০% থেকে ৯৯% (${Math.ceil(target * 0.7)}-${target - 1}টি আবেদন):** \`+${tiers.TIER_70} পয়েন্ট\`\n` +
    `• 🔴 **< ৭০% (${Math.ceil(target * 0.7) - 1} বা তার কম আবেদন):** \`${tiers.BELOW_60} পয়েন্ট\` *(পেনাল্টি)*\n` +
    `*💡 স্প্যাম রোধে টার্গেটের অতিরিক্ত আবেদনে বোনাস পয়েন্ট বন্ধ থাকবে।*\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 🔥 ৩. ধারাবাহিক স্ট্রিক বোনাস (Daily Streaks)\n` +
    `• টানা কর্মদিবসগুলোতে **১০০% টার্গেট (${target}+ আবেদন)** পূরণ করলে: প্রতি দিনের জন্য **\`+${scoring.streakBonusPerDay}.0 পয়েন্ট\`**\n` +
    `• সর্বোচ্চ স্ট্রিক ক্যাপ: **\`+${scoring.streakCap}.0 পয়েন্ট পর্যন্ত\`**\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 🎙️ ৪. ভেরিফাইড ইন্টারভিউ কল (Verified Interview)\n` +
    `• ইন্টারভিউ কল পেয়ে প্রুফ সহ পোস্ট করার পর মেন্টর ভেরিফাই করলে: **\`+${scoring.interviewPoints}.0 পয়েন্ট\`**\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 🛠️ ৫. টেকনিক্যাল জব টাস্ক (Technical Assignments)\n` +
    `• কোম্পানি টাস্ক পেয়ে \`#job-task-update\` এ পোস্ট দিলে: **\`+1.0 পয়েন্ট\`**\n` +
    `• ডেডলাইনের আগে GitHub ও Live Demo লিংক সহ \`!submit\` করলে: **\`+1.0 পয়েন্ট\`**\n` +
    `• ডেডলাইন পার হওয়ার পরও জমা না দিলে: **\`-1.0 পয়েন্ট জরিমানা\`**\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 🏆 ৬. সর্বমোট পয়েন্ট ও রেফারেল অগ্রাধিকার (RTBR Score)\n` +
    `আপনার মোট স্কোর হিসাব হয়:\n` +
    `\`Total Score = Attendance + Job Points + Streak Bonus + Verified Interviews + Task Points\`\n\n` +
    `📌 **প্রয়োজনীয় কমান্ডসমূহ (Quick Shortcuts):**\n` +
    `• \`!myhealth\` — আপনার রিয়েল-টাইম স্কোরকার্ড ও হেলথ ডায়াগনোসিস দেখুন\n` +
    `• \`!leaderboard\` — কোহর্টের লাইভ লিডারবোর্ড ও র‍্যাঙ্কিং দেখুন\n` +
    `• \`!linksheet <URL>\` — আপনার জব ট্র্যাকিং গুগল শিট কানেক্ট করুন\n` +
    `• \`!leave <শুরুর তারিখ> <শেষ তারিখ> <কারণ>\` — ছুটির আবেদন করুন\n` +
    `• \`!task <Company> <Role> <Deadline>\` — জব টাস্ক লগ করুন\n` +
    `• \`!interview <Company> <Date> <Role>\` — ইন্টারভিউ লগ করুন`
  );
}

function buildCategoryEmbed(guildId, category) {
  const scoring = cohortManager.getCohortScoring(guildId);
  const target = scoring.jobTarget || constants.SCORING.DEFAULT_JOB_TARGET || 10;
  const tiers = constants.SCORING.JOB_TIERS;

  switch (category) {
    case 'attendance':
      return Embeds.info(
        "📅 Attendance & Morning Basecamp Point System",
        `### উপস্থিতির নিয়মাবলী ও পয়েন্ট বণ্টন:\n\n` +
        `• 🟢 **Present (উপস্থিত):** \`+${scoring.attendancePresent}.0 pt\` — সময়মতো ফর্ম সাবমিট করলে।\n` +
        `• 🔴 **Absent (অনুপস্থিত):** \`${scoring.attendanceAbsent}.0 pt\` — নির্ধারিত ডেডলাইনের মধ্যে ফর্ম সাবমিট না করলে।\n` +
        `• 🟡 **Excused Leave (ছুটি):** \`0.0 pts\` — \`!leave\` কমান্ডের মাধ্যমে আবেদন করে মেন্টর দ্বারা অ্যাপ্রুভড হলে অনুপস্থিতির কোনো পয়েন্ট কাটা যায় না।\n` +
        `• ⚪ **Morning Basecamp OFF:** \`0.0 pts\` — যেদিন মেন্টররা মর্নিং বেসক্যাম্প বন্ধ ঘোষণা করবেন (\`!morningoff\`), সেদিন সবার জন্য ০ পয়েন্ট থাকবে।\n\n` +
        `⏰ **সময়সূচি (Deadlines):**\n` +
        `• **Daily Attendance:** রবিবার - বৃহস্পতিবার (রাত ১১:৫৯ পর্যন্ত)\n` +
        `• **Morning Basecamp:** রবিবার - বৃহস্পতিবার (সকাল ১১:৩০ পর্যন্ত)`
      );

    case 'jobs':
      return Embeds.info(
        "💼 Daily Job Applications Tiered Scoring",
        `### চাকরির আবেদন ও টায়ার্ড পয়েন্ট বণ্টন (Target: ${target} apps/day):\n\n` +
        `প্রতিদিন রাত ১১:৩০ টায় বট স্বয়ংক্রিয়ভাবে আপনার লিঙ্ক করা গুগল শিট (\`!linksheet\`) স্ক্যান করে পয়েন্ট প্রদান করে:\n\n` +
        `• 🌟 **Over-achievement (${target + 1}+ টি আবেদন):** \`+${tiers.FULL + tiers.EXTRA_BONUS}.0 pts\` *(+${tiers.FULL} Base + ${tiers.EXTRA_BONUS} Bonus)*\n` +
        `• 🟢 **Target Achieved (${target}টি আবেদন):** \`+${tiers.FULL}.0 pts\`\n` +
        `• 🟡 **Tier 80% (${Math.ceil(target * 0.8)}-${target - 1}টি আবেদন):** \`+${tiers.TIER_80} pts\`\n` +
        `• 🟠 **Tier 70% (${Math.ceil(target * 0.7)}টি আবেদন):** \`+${tiers.TIER_70} pts\`\n` +
        `• 🔵 **Tier 60% (${Math.ceil(target * 0.6)}টি আবেদন):** \`+${tiers.TIER_60} pts\`\n` +
        `• 🔴 **Below 60% (${Math.ceil(target * 0.6) - 1} বা তার কম):** \`${tiers.BELOW_60} pt\` *(পেনাল্টি)*\n\n` +
        `💡 *টিপস: প্রতিদিন অন্তত ${target}টি আবেদন সম্পন্ন করে শিটে নতুন রো যুক্ত করুন।*`
      );

    case 'streaks':
      return Embeds.info(
        "🔥 Daily Consistency Streak Bonus",
        `### ধারাবাহিক স্ট্রিক পয়েন্টের নিয়মাবলী:\n\n` +
        `• **প্রতিদিনের স্ট্রিক:** প্রতিদিন টানা **${target}টি বা তার বেশি** জব আবেদন সম্পন্ন করলে প্রতিদিনের জন্য অতিরিক্ত **\`+${scoring.streakBonusPerDay}.0 বোনাস পয়েন্ট\`** যোগ হবে!\n` +
        `• **স্ট্রিক ক্যাপ (Max Cap):** সর্বোচ্চ **\`+${scoring.streakCap}.0 পয়েন্ট\`** পর্যন্ত স্ট্রিক বোনাস পাওয়া যাবে।\n` +
        `• **স্ট্রিক ব্রেক:** কোনো একদিন টার্গেটের নিচে আবেদন করলে স্ট্রিক রিসেট হয়ে শূন্যে নেমে যাবে।\n\n` +
        `💡 *স্ট্রিক পয়েন্ট আপনার লিডারবোর্ডের শীর্ষ অবস্থান নিশ্চিত করতে সবচেয়ে বড় ভূমিকা পালন করে!*`
      );

    case 'interviews':
      return Embeds.info(
        "🎙️ Interview Logs & Mock Prep Rewards",
        `### ইন্টারভিউ লগের নিয়মাবলী:\n\n` +
        `• **ইন্টারভিউ রিওয়ার্ড:** যেকোনো রিয়েল-ওয়ার্ল্ড কোম্পানি ইন্টারভিউ কল পেলে বা মক ইন্টারভিউতে অংশ নিলে প্রতিটির জন্য পাবেন **\`+${scoring.interviewPoints}.0 পয়েন্ট\`**!\n` +
        `• **লগ করার উপায়:** ইন্টারভিউ শিডিউল হওয়ার সাথে সাথে ডিসকর্ডে কমান্ড দিন:\n` +
        `  \`!interview "Company Name" YYYY-MM-DD "Role Title"\`\n` +
        `  *উদাহরণ:* \`!interview "Brain Station 23" 2026-09-05 "Frontend Developer"\`\n\n` +
        `💡 *সঠিক সময়ে ইন্টারভিউ লগ করলে মেন্টররা আপনাকে স্পেশাল 1-on-1 ইন্টারভিউ প্রেপারেশনে সাপোর্ট দিতে পারেন।*`
      );

    case 'tasks':
      return Embeds.info(
        "🛠️ Job Tasks & Assignments Lifecycle",
        `### কোম্পানি টেকনিক্যাল অ্যাসাইনমেন্ট ও টাস্ক পয়েন্ট:\n\n` +
        `• 📥 **টাস্ক লগিং (Task Logged):** কোম্পানি থেকে টেকনিক্যাল টাস্ক পাওয়ার পর লগ করলে পাবেন **\`+1.0 পয়েন্ট\`**।\n` +
        `  \`!task "Company" "Role" "YYYY-MM-DD" "Tech Stack" "Task Details/Link"\`\n` +
        `• ✅ **মেন্টর অ্যাপ্রুভাল (Mentor Approved):** ডেডলাইনের পূর্বে সলিউশন জমা দিয়ে মেন্টর কর্তৃক কোড রিভিউ অ্যাপ্রুভ হলে পাবেন আরও **\`+1.0 অতিরিক্ত পয়েন্ট\`**।\n` +
        `  \`!task submit <Task_ID> <GitHub_Link> <Live_Link>\`\n` +
        `• ❌ **ডেডলাইন মিস (Missed Deadline):** সময়মতো কাজ জমা না দিলে বা টাস্ক ড্রপ করলে কাটা যাবে **\`-2.0 পয়েন্ট\`**।\n\n` +
        `💡 *টাস্ক পাওয়ার সাথে সাথে মেন্টরদের সাথে শেয়ার করুন যাতে প্রজেক্ট আর্কিটেকচারে সহায়তা পেতে পারেন।*`
      );

    default:
      return buildFullGuideEmbed(guildId);
  }
}

function buildNavigationRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('points_tab_attendance')
      .setLabel('📅 Attendance')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('points_tab_jobs')
      .setLabel('💼 Job Tiers')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('points_tab_streaks')
      .setLabel('🔥 Streaks')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('points_tab_interviews')
      .setLabel('🎙️ Interviews')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('points_tab_tasks')
      .setLabel('🛠️ Job Tasks')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('points_tab_full')
      .setLabel('🌟 Full Points Guide')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

module.exports = {
  name: 'points',
  aliases: ['pointsystem', 'scoring', 'scoresystem', 'pointrules', 'rulespoint', 'pointguide', 'rtbrpoints', 'scoringrules', 'point'],
  description: 'View full scoring rules, criteria, and point distributions, or broadcast them to student channels',
  usage: '!points [attendance|jobs|streaks|interviews|tasks] | !points post [#channel]',
  supervisorOnly: false, // Students can freely view points guide

  buildFullGuideEmbed,
  buildCategoryEmbed,
  buildNavigationRows,

  async execute(message, args, client) {
    const guild = message.guild;
    const guildId = guild.id;
    const isMentor = cohortManager.isMentor(guildId, message.member);

    const firstArg = (args[0] || '').toLowerCase();

    // -------------------------------------------------------------
    // 1. MENTOR BROADCAST: !points post [#channel] / !points broadcast
    // -------------------------------------------------------------
    if ((firstArg === 'post' || firstArg === 'broadcast' || firstArg === 'announce' || firstArg === 'publish') && isMentor) {
      const targetChannel = message.mentions.channels.first() ||
                            (args[1] ? guild.channels.cache.find(c => c.name.toLowerCase() === args[1].toLowerCase().replace(/^#/, '')) : null) ||
                            ChannelHelper.findChannel(guild, 'ANNOUNCEMENTS') ||
                            ChannelHelper.findChannel(guild, 'DISCUSSION') ||
                            message.channel;

      const studentRole = guild.roles.cache.find(r => r.name.toLowerCase() === (constants.ROLES.ACTIVE_STUDENT || 'active student').toLowerCase());
      const mentionTag = studentRole ? `@everyone <@&${studentRole.id}>` : `@everyone`;

      const embed = buildFullGuideEmbed(guildId);
      const components = buildNavigationRows();

      await targetChannel.send({
        content: `${mentionTag} 📢 **OFFICIAL MENTORSHIP POINT SYSTEM & REFERRAL RULES GUIDE IS LIVE!** 🌟\n*Read the complete guide below to maximize your points and referral rank:*`,
        embeds: [embed],
        components: components
      }).catch(err => {
        return message.reply(`❌ Failed to send announcement to <#${targetChannel.id}>: ${err.message}`);
      });

      return message.reply({
        embeds: [Embeds.success(
          "Point System Guide Published! 📢",
          `✅ **Official Point System Guide** has been successfully broadcasted to <#${targetChannel.id}> with interactive category buttons!\n\n` +
          `• 🎯 **Target Channel:** <#${targetChannel.id}>\n` +
          `• 👥 **Audience:** ${mentionTag}\n` +
          `• 💡 **Interactive:** Students can switch between categories using the attached buttons.`
        )]
      });
    }

    // -------------------------------------------------------------
    // 2. CATEGORY SPECIFIC VIEW: !points [attendance|jobs|streaks|interviews|tasks]
    // -------------------------------------------------------------
    if (['attendance', 'att', 'morning', 'basecamp'].includes(firstArg)) {
      return message.reply({ embeds: [buildCategoryEmbed(guildId, 'attendance')], components: buildNavigationRows() });
    } else if (['job', 'jobs', 'jobsheet', 'tiers', 'applications'].includes(firstArg)) {
      return message.reply({ embeds: [buildCategoryEmbed(guildId, 'jobs')], components: buildNavigationRows() });
    } else if (['streak', 'streaks', 'consistency'].includes(firstArg)) {
      return message.reply({ embeds: [buildCategoryEmbed(guildId, 'streaks')], components: buildNavigationRows() });
    } else if (['interview', 'interviews', 'mock'].includes(firstArg)) {
      return message.reply({ embeds: [buildCategoryEmbed(guildId, 'interviews')], components: buildNavigationRows() });
    } else if (['task', 'tasks', 'assignment', 'assignments'].includes(firstArg)) {
      return message.reply({ embeds: [buildCategoryEmbed(guildId, 'tasks')], components: buildNavigationRows() });
    }

    // -------------------------------------------------------------
    // 3. DEFAULT FULL GUIDE VIEW (For Student or Mentor self-view)
    // -------------------------------------------------------------
    const fullEmbed = buildFullGuideEmbed(guildId);
    const components = buildNavigationRows();

    return message.reply({
      content: `💡 **Here is the complete Point System breakdown for your cohort:**`,
      embeds: [fullEmbed],
      components: components
    });
  }
};
