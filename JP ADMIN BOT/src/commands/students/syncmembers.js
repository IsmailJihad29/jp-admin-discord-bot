/**
 * Commands: !syncmembers, !missingdata, !profilecheck
 */

const GasClient = require('../../services/gasClient');
const Embeds = require('../../utils/embedBuilder');

module.exports = {
  name: 'syncmembers',
  aliases: ['missingdata', 'profilecheck'],
  description: 'Synchronizes Discord server members with Google Sheets Bot_Map and checks missing profile data',
  usage: '!syncmembers | !missingdata | !profilecheck',
  supervisorOnly: true,

  async execute(message, args, client) {
    const commandName = message.content.slice(1).split(/ +/)[0].toLowerCase();
    const guild = message.guild;

    if (commandName === 'syncmembers') {
      const loading = await message.reply("🔄 Synchronizing all Discord server members with Google Sheet `Bot_Map`...");

      try {
        const cohortManager = require('../../config/cohortManager');
        const members = await guild.members.fetch();
        const studentMembers = members.filter(m => !m.user.bot).map(m => {
          const isSupervisor = cohortManager.isSupervisor(guild.id, m);
          const isMentor = m.roles.cache.some(r => r.name.toLowerCase() === 'mentor');
          const isHired = m.roles.cache.some(r => r.name.toLowerCase() === 'hired');

          let status = 'active';
          if (isSupervisor) status = 'supervisor';
          else if (isMentor) status = 'mentor';
          else if (isHired) status = 'hired';

          return {
            discordId: m.id,
            username: m.user.username,
            displayName: m.displayName,
            status: status
          };
        });

        const result = await GasClient.syncRoster(guild.id, studentMembers);

        const supervisorsCount = studentMembers.filter(s => s.status === 'supervisor').length;
        const mentorsCount = studentMembers.filter(s => s.status === 'mentor').length;
        const activeStudentsCount = studentMembers.filter(s => s.status === 'active').length;

        const embed = Embeds.success(
          "Member Roster Synchronized",
          `• **Total Server Members Processed:** ${studentMembers.length}\n` +
          `• **Supervisors (Exempt from Attendance):** ${supervisorsCount}\n` +
          `• **Mentors (Exempt from Attendance):** ${mentorsCount}\n` +
          `• **Active Students:** ${activeStudentsCount}\n` +
          `• **Updated Mappings in Sheet:** ${result.syncedCount || 0}\n` +
          `• **New Members Added:** ${result.addedCount || 0}`
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Sync Failed", err.message)] });
      }
      return;
    }

    if (commandName === 'missingdata' || commandName === 'profilecheck') {
      const loading = await message.reply("📋 Scanning student roster for missing profile fields (Email, Phone, Region)...");

      try {
        const roster = await GasClient.getRoster(guild.id);
        const students = roster.students || [];

        const missing = [];
        students.forEach(s => {
          const missingFields = [];
          if (!s.email) missingFields.push('Email');
          if (!s.phone) missingFields.push('Phone');
          if (!s.region) missingFields.push('Region');

          if (missingFields.length > 0) {
            missing.push({ ...s, missingFields });
          }
        });

        const embed = Embeds.info(
          `Profile Completeness Check · ${students.length - missing.length}/${students.length} Complete`,
          `**Students with Missing Info (${missing.length}):**\n\n${
            missing.length > 0
              ? missing.slice(0, 15).map(m => `• <@${m.discordId}> (${m.name}) — Missing: \`${m.missingFields.join(', ')}\``).join('\n')
              : '✅ All students have complete contact and region profiles!'
          }\n\n*Run \`!profilesurvey #channel\` to prompt incomplete students.*`
        );

        await loading.edit({ content: null, embeds: [embed] });
      } catch (err) {
        await loading.edit({ content: null, embeds: [Embeds.error("Check Failed", err.message)] });
      }
    }
  }
};
