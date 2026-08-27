/**
 * Command: !data, !analytics, !stats, !auditdata
 * Instant sub-second cohort data filters, cross-sheet analytics, and bulk action triggers
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const CohortDataService = require('../../services/cohortDataService');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');
const DateTimeUtil = require('../../utils/dateTime');

module.exports = {
  name: 'data',
  aliases: ['analytics', 'stats', 'auditdata', 'cohortdata'],
  description: 'Instant analytical filters and reports across all Google Sheet database tabs',
  usage: '!data <nosheet | absent [days] | nojobs | tasks | leaves | summary | @student>',
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const sub = args[0] ? args[0].toLowerCase() : 'summary';

    // Mentioned student profile inspection: !data @student
    if (message.mentions.members.first()) {
      const targetMember = message.mentions.members.first();
      const inspectCmd = require('./inspect');
      return inspectCmd.execute(message, [targetMember.id], client);
    }

    // 1. Missing / Unlinked Tracker Sheets: !data nosheet / !data notracker
    if (sub === 'nosheet' || sub === 'notracker' || sub === 'missingtracker' || sub === 'notrackers') {
      const loading = await message.reply("🔍 Scanning all student job sheet records...");
      try {
        const unlinked = await CohortDataService.getStudentsWithoutTracker(guild.id);

        if (unlinked.length === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.success(
              "All Trackers Linked! 🎉",
              "✅ **100% of enrolled active students have linked their Google Sheet job trackers!**"
            )]
          });
        }

        const mentions = unlinked.map((s, idx) => `**${idx + 1}.** <@${s.discordId}> (${s.name}) — \`${s.email}\``).join('\n');

        const embed = Embeds.warning(
          `⚠️ Students Without Linked Job Trackers (${unlinked.length} Total)`,
          `Here are the active students who have **not linked their official job tracking Google Sheet**:\n\n` +
          `${mentions}\n\n` +
          `──────────────────────────────\n` +
          `💡 *Click below to automatically ping these students in <#${guild.channels.cache.find(c => c.name.includes('tracker'))?.id || 'job-tracker'}> with registration instructions:*`,
          `JP ADMIN ${constants.BOT_VERSION} · Job Tracker Registry`
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('nudge_nosheet')
            .setLabel(`🔔 Ping Missing Trackers (${unlinked.length})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📢'),
          new ButtonBuilder()
            .setCustomId('export_csv_nosheet')
            .setLabel('📥 Download CSV')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📄')
        );

        return loading.edit({ content: null, embeds: [embed], components: [row] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Data Error", err.message)] });
      }
    }

    // 2. Absentees in Last N Sessions: !data absent [days]
    if (sub === 'absent' || sub === 'absentees' || sub === 'attendance') {
      const days = parseInt(args[1], 10) || 3;
      const loading = await message.reply(`🔍 Analyzing attendance matrix for last ${days} sessions...`);

      try {
        const { targetDates, affectedStudents } = await CohortDataService.getAbsentsInLastNDays(guild.id, days);

        if (affectedStudents.length === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.success(
              `Perfect Attendance! 🎉`,
              `✅ **Zero absences recorded across the active scoring window** (${targetDates.join(', ') || 'Current Baseline'}).`
            )]
          });
        }

        const list = affectedStudents.map((s, idx) =>
          `**${idx + 1}.** <@${s.discordId}> (${s.name}) — **${s.absentDaysCount}/${targetDates.length} Days Absent**\n` +
          `   *Dates: ${s.absentOnDates.map(d => `\`${d}\``).join(', ')}*`
        ).join('\n\n');

        const embed = Embeds.warning(
          `📅 Absentees in Last ${targetDates.length} Sessions (${affectedStudents.length} Students)`,
          `**Analyzed Sessions:** ${targetDates.map(d => `\`${d}\``).join(' · ')}\n\n` +
          `${list}\n\n` +
          `──────────────────────────────\n` +
          `💡 *Click below to alert chronic absentees or export the full matrix:*`,
          `JP ADMIN ${constants.BOT_VERSION} · Attendance Analytics`
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`nudge_absent_${days}`)
            .setLabel(`🔔 Ping Chronic Absentees`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚠️'),
          new ButtonBuilder()
            .setCustomId(`export_csv_absent_${days}`)
            .setLabel('📥 Download CSV')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📄')
        );

        return loading.edit({ content: null, embeds: [embed], components: [row] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Data Error", err.message)] });
      }
    }

    // 3. Below Target / Zero Application Students: !data nojobs / !data lowjobs
    if (sub === 'nojobs' || sub === 'lowjobs' || sub === 'belowtarget' || sub === 'jobs') {
      const loading = await message.reply("🔍 Auditing today's job application records...");
      try {
        const { cohortTarget, totalBelow, zeroCount, belowTargetStudents, zeroStudents } =
          await CohortDataService.getStudentsBelowTarget(guild.id);

        if (totalBelow === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.success(
              "100% Target Met! 🚀",
              `✅ **All active students have met or exceeded today's target of ${cohortTarget} applications!**`
            )]
          });
        }

        const zeroList = zeroStudents.slice(0, 15).map(s => `• <@${s.discordId}> (${s.name}) — **0/${cohortTarget} apps**`).join('\n');
        const lowList = belowTargetStudents.filter(s => s.todayJobCount > 0).slice(0, 15).map(s => `• <@${s.discordId}> (${s.name}) — **${s.todayJobCount}/${cohortTarget} apps**`).join('\n');

        const embed = Embeds.info(
          `💼 Today's Job Application Audit (Target: ${cohortTarget}/day)`,
          `• 🔴 **Zero Applications Today (${zeroCount} students):**\n${zeroList || 'None! Everyone submitted at least 1 app.'}\n\n` +
          `• 🟡 **Below Daily Target (${totalBelow - zeroCount} students):**\n${lowList || 'None'}\n\n` +
          `──────────────────────────────\n` +
          `💡 *Click below to broadcast a gentle encouragement nudge to students:*`,
          `JP ADMIN ${constants.BOT_VERSION} · Daily Job Audit`
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('nudge_nojobs')
            .setLabel(`🔔 Ping Below Target Students (${totalBelow})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📢')
        );

        return loading.edit({ content: null, embeds: [embed], components: [row] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Data Error", err.message)] });
      }
    }

    // 4. Overdue Tasks: !data tasks / !data overdue
    if (sub === 'tasks' || sub === 'overdue' || sub === 'jobtasks') {
      const loading = await message.reply("🔍 Checking hiring task submissions and deadlines...");
      try {
        const overdueStudents = await CohortDataService.getOverdueTaskStudents(guild.id);

        if (overdueStudents.length === 0) {
          return loading.edit({
            content: null,
            embeds: [Embeds.success(
              "No Overdue Tasks! 🎉",
              "✅ **All student coding tasks are submitted or within deadline.**"
            )]
          });
        }

        const list = overdueStudents.map(s => {
          const tasksDetails = s.overdueTasks.map(t => `  - \`${t.taskId}\` (${t.company || 'Task'}): Deadline was \`${t.deadline}\``).join('\n');
          return `• <@${s.discordId}> (${s.name}) — **${s.overdueTasksCount} Overdue Task(s)**\n${tasksDetails}`;
        }).join('\n\n');

        const embed = Embeds.warning(
          `🛠️ Students with Overdue Tasks (${overdueStudents.length} Total)`,
          `${list}\n\n*Students with overdue tasks receive -2 penalty points until resolved.*`,
          `JP ADMIN ${constants.BOT_VERSION} · Task Diagnostics`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Data Error", err.message)] });
      }
    }

    // 5. Leaves Overview: !data leaves
    if (sub === 'leaves' || sub === 'leave') {
      const loading = await message.reply("🔍 Fetching active and pending leaves...");
      try {
        const { todayStr, onLeaveToday, pendingLeaves } = await CohortDataService.getLeaveOverview(guild.id);

        const onLeaveList = onLeaveToday.map(s => `• <@${s.discordId}> (${s.name})`).join('\n');
        const pendingList = pendingLeaves.map(l => `• \`${l.requestId}\`: <@${l.discordId}> (${l.studentName}) — \`${l.startDate}\` to \`${l.endDate}\``).join('\n');

        const embed = Embeds.info(
          `🌴 Cohort Leaves & Offdays Overview (${todayStr})`,
          `• 🟢 **Students on Approved Leave Today (${onLeaveToday.length}):**\n${onLeaveList || 'No students on leave today.'}\n\n` +
          `• ⏳ **Pending Leave Requests for Review (${pendingLeaves.length}):**\n${pendingList || '✅ No pending leave requests!'}\n\n` +
          `*Use \`!leaves pending\` to approve or reject pending requests.*`,
          `JP ADMIN ${constants.BOT_VERSION} · Leave Manager`
        );

        return loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loading.edit({ content: null, embeds: [Embeds.error("Data Error", err.message)] });
      }
    }

    // 6. Complete Cohort Summary Dashboard: !data summary / !data all
    const loading = await message.reply("🔍 Aggregating comprehensive cohort analytics dashboard...");
    try {
      const fullData = await CohortDataService.getFullCohortData(guild.id);
      const unlinkedCount = fullData.students.filter(s => !s.hasTrackerLinked).length;
      const onLeaveCount = fullData.students.filter(s => s.hasActiveLeaveToday).length;
      const overdueTaskCount = fullData.students.filter(s => s.overdueTasksCount > 0).length;
      const totalInterviews = fullData.students.reduce((sum, s) => sum + s.interviewCount, 0);

      const embed = Embeds.info(
        `📊 Master Cohort Analytics Dashboard (${guild.name})`,
        `👥 **Cohort Overview:**\n` +
        `• Total Active Enrolled Students: **${fullData.totalActiveStudents} Students**\n` +
        `• 💼 Linked Job Trackers: **${fullData.totalActiveStudents - unlinkedCount}/${fullData.totalActiveStudents}** ${unlinkedCount > 0 ? `(\`${unlinkedCount} missing\`)` : '✅ (100%)'}\n` +
        `• 🗓️ Scoring Baseline Start Date: **\`${fullData.scoringStartDate}\`**\n` +
        `• 🎯 Daily Mandatory Job Target: **${fullData.cohortTarget} Applications/day**\n\n` +
        `📈 **Activity & Engagement Metrics:**\n` +
        `• 🎙️ Total Interviews Logged: **${totalInterviews} Interviews**\n` +
        `• 🛠️ Students with Overdue Tasks: **${overdueTaskCount} Students**\n` +
        `• 🌴 Students on Leave Today: **${onLeaveCount} Students**\n\n` +
        `──────────────────────────────\n` +
        `💡 **QUICK DATA FILTERS:**\n` +
        `• \`!data nosheet\` → List students missing tracker sheets\n` +
        `• \`!data absent 3\` → List students absent in last 3 sessions\n` +
        `• \`!data nojobs\` → List students below today's job application target\n` +
        `• \`!data tasks\` → List students with overdue tasks\n` +
        `• \`!data leaves\` → List active and pending student leaves\n` +
        `• \`!query <question>\` → Ask any custom question with AI Analysis`,
        `JP ADMIN ${constants.BOT_VERSION} · Generated at ${DateTimeUtil.getFullTimestamp()}`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('export_csv_summary')
          .setLabel('📥 Export Full Cohort CSV')
          .setStyle(ButtonStyle.Success)
          .setEmoji('📊')
      );

      return loading.edit({ content: null, embeds: [embed], components: [row] });
    } catch (err) {
      return loading.edit({ content: null, embeds: [Embeds.error("Dashboard Error", err.message)] });
    }
  }
};
