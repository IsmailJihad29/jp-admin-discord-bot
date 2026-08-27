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
        const members = await guild.members.fetch();
        const studentMembers = members.filter(m => !m.user.bot).map(m => ({
          discordId: m.id,
          username: m.user.username,
          displayName: m.displayName,
          status: 'active'
        }));

        const result = await GasClient.syncRoster(guild.id, studentMembers);

        const embed = Embeds.success(
          "Member Roster Synchronized",
          `• **Total Server Members Processed:** ${studentMembers.length}\n• **Updated Mappings:** ${result.syncedCount || 0}\n• **New Members Added to Bot_Map:** ${result.addedCount || 0}\n• Master source \`All Data\` and \`Roster Review\` updated.`
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
