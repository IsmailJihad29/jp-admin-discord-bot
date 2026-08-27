/**
 * Commands: !students, !studentreport, !notapplying, !onboardingpanel, !onboardingstatus
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');
const constants = require('../../config/constants');

module.exports = {
  name: 'students',
  aliases: ['studentreport', 'notapplying', 'onboardingpanel', 'onboardingstatus'],
  description: 'View student rosters, region directory, onboarding status, and non-applicant alerts',
  usage: '!students [region] | !studentreport | !notapplying [days] | !onboardingpanel',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    // --- !onboardingpanel ---
    if (commandName === 'onboardingpanel') {
      const welcomeCh = guild.channels.cache.find(c => c.name.toLowerCase() === constants.CHANNELS.WELCOME);
      const targetChannel = welcomeCh || message.channel;

      const embed = Embeds.info(
        "👋 Welcome to the Mentorship Bootcamp!",
        "To get started and activate your attendance, daily job tracking, and mentor referral profile, please click the button below to submit your details.\n\n*Your information is stored securely in our database.*"
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_profile_survey')
          .setLabel('📝 Complete Join Profile')
          .setStyle(ButtonStyle.Primary)
      );

      await targetChannel.send({ embeds: [embed], components: [row] });
      return message.reply(`✅ Onboarding panel posted in ${targetChannel}.`);
    }

    // --- !students ---
    if (commandName === 'students') {
      const regionFilter = args[0]?.toLowerCase();
      const loading = await message.reply("📋 Loading student directory from Sheet...");

      try {
        const roster = await GasClient.getRoster(guild.id);
        let students = (roster.students || []).filter(s => s.status === 'active');

        if (regionFilter) {
          students = students.filter(s => (s.region || '').toLowerCase().includes(regionFilter));
        }

        const embed = Embeds.info(
          `Student Directory (${students.length} Active)`,
          students.length > 0
            ? students.slice(0, 20).map(s => `• <@${s.discordId}> — **${s.name}** | Region: \`${s.region || 'Unset'}\` | Phone: \`${s.phone || 'Unset'}\``).join('\n')
            : "No students matching criteria."
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
      return;
    }

    // --- !notapplying ---
    if (commandName === 'notapplying') {
      const days = parseInt(args[0]) || 3;
      const loading = await message.reply(`🔍 Scanning for active students with 0 job applications in the last ${days} days...`);

      try {
        const jobsRes = await GasClient.getJobsDaily(guild.id, days);
        const roster = await GasClient.getRoster(guild.id);

        const appliedIds = new Set((jobsRes.jobs || []).map(j => j.discordId));
        const notApplying = (roster.students || []).filter(s => s.status === 'active' && !appliedIds.has(s.discordId));

        const embed = Embeds.warning(
          `Students Not Applying (${days} Days Window)`,
          notApplying.length > 0
            ? notApplying.map(s => `• <@${s.discordId}> (${s.name || s.username})`).join('\n')
            : "🎉 All active students have logged applications recently!"
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Error", err.message)] });
      }
      return;
    }

    // --- !studentreport ---
    if (commandName === 'studentreport') {
      const loading = await message.reply("📊 Generating comprehensive student health and performance report...");
      try {
        const roster = await GasClient.getRoster(guild.id);
        const total = roster.students?.length || 0;
        const active = (roster.students || []).filter(s => s.status === 'active').length;
        const hired = (roster.students || []).filter(s => s.status === 'hired').length;
        const inactive = (roster.students || []).filter(s => s.status === 'inactive' || s.status === 'left').length;

        const embed = Embeds.info(
          "Cohort Health & Roster Summary",
          `• **Total Students Recorded:** **${total}**\n• **🟢 Active Students:** **${active}**\n• **🎉 Hired Students:** **${hired}**\n• **🔴 Inactive / Dropped:** **${inactive}**\n\nRun \`!audit\` or \`!missingdata\` for detailed breakdown.`
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Report Error", err.message)] });
      }
    }
  }
};
