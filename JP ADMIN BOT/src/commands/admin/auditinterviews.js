/**
 * Command: !auditinterviews
 * Retroactively validates ALL interview log entries in Google Sheets.
 * - Fetches every interview record (all-time)
 * - For each entry, fetches the original Discord message via discordLink
 * - Validates the message format (company + role + date required)
 * - VOIDS invalid entries in the sheet (marks as [VOIDED])
 * - Keeps valid entries intact
 * - Reports a full audit summary
 */

const GasClient = require('../../services/gasClient');
const GeminiService = require('../../services/geminiService');
const Embeds = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');
const ChannelHelper = require('../../utils/channelHelper');

// Parse a Discord message URL → { guildId, channelId, messageId }
function parseDiscordMessageUrl(url) {
  const match = String(url || '').match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

module.exports = {
  name: 'auditinterviews',
  aliases: ['interviewaudit', 'fixinterviews', 'cleaninterviews'],
  description: 'Retroactively audits all interview log entries — voids invalid/random posts, keeps properly formatted ones',
  usage: '!auditinterviews',
  supervisorOnly: false,
  mentorOnly: true,

  async execute(message, args, client) {
    const guild = message.guild;
    const guildId = guild.id;

    const loading = await message.reply(
      '🔍 **Starting Interview Log Audit...**\nFetching all interview records from Google Sheets and validating formats. This may take a moment...'
    );

    try {
      // 1. Fetch ALL interview records (all-time, no date filter)
      const interviewsRes = await GasClient.getAllInterviews(guildId).catch(() => ({ interviews: [] }));
      const allInterviews = (interviewsRes.interviews || []);

      if (allInterviews.length === 0) {
        return loading.edit({
          content: null,
          embeds: [Embeds.info('No Interview Records', 'The Interview_Log sheet is empty — nothing to audit.')]
        });
      }

      // Filter out already voided entries
      const toAudit = allInterviews.filter(iv => {
        const status = String(iv.status || '').toUpperCase();
        const company = String(iv.company || '').toUpperCase();
        return status !== 'VOIDED' && !company.startsWith('[VOIDED]');
      });

      await loading.edit({
        content: `🔍 **Auditing ${toAudit.length} interview records** (${allInterviews.length - toAudit.length} already voided)...\nValidating each message — please wait...`
      });

      const results = {
        total: toAudit.length,
        valid: [],
        voided: [],
        skipped: []   // message link missing or message deleted
      };

      // 2. Process each record — rate-limit with small delay to avoid Discord API rate limits
      for (const iv of toAudit) {
        try {
          const discordLink = String(iv.discordLink || '').trim();
          const parsed = parseDiscordMessageUrl(discordLink);

          // Try to fetch the original message content
          let messageContent = iv.roleDetails || '';

          if (parsed) {
            try {
              const targetChannel = guild.channels.cache.get(parsed.channelId)
                || await guild.channels.fetch(parsed.channelId).catch(() => null);

              if (targetChannel) {
                const originalMsg = await targetChannel.messages.fetch(parsed.messageId).catch(() => null);
                if (originalMsg) {
                  messageContent = originalMsg.content;
                }
              }
            } catch (_) {
              // Message deleted or channel not accessible — use roleDetails as fallback
            }
          }

          // 3. Validate the content
          const validation = await GeminiService.validateInterviewPost(messageContent);

          if (validation.valid) {
            results.valid.push({
              name: iv.name,
              discordId: iv.discordId,
              company: iv.company,
              loggedDate: iv.loggedDate
            });
          } else {
            // 4. Void the invalid entry in Google Sheets
            await GasClient.voidInterview(
              guildId,
              discordLink,
              iv.discordId,
              iv.loggedDate ? String(iv.loggedDate).substring(0, 10) : null,
              validation.reason || `Missing: ${(validation.missingFields || []).join(', ')}`
            ).catch(e => Logger.error('Failed to void interview entry:', e.message));

            results.voided.push({
              name: iv.name,
              discordId: iv.discordId,
              company: iv.company,
              loggedDate: iv.loggedDate,
              reason: validation.reason || `Missing: ${(validation.missingFields || []).join(', ')}`,
              missingFields: validation.missingFields || []
            });

            // Optionally DM the student about the void (non-fatal)
            if (iv.discordId) {
              const member = guild.members.cache.get(iv.discordId)
                || await guild.members.fetch(iv.discordId).catch(() => null);
              if (member) {
                const dmEmbed = Embeds.warning(
                  '⚠️ Interview Point Removed — Format Audit',
                  `Hello **${iv.name || member.displayName}**, your interview log entry from **\`${String(iv.loggedDate).substring(0, 10)}\`** has been **voided and removed** during a format audit.\n\n` +
                  `**Reason:** Your original post was missing required information:\n` +
                  `${(validation.missingFields || []).map(f => `• ❌ **${f}**`).join('\n') || '• ❌ Insufficient interview details'}\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `📋 **To re-earn your points, repost in <#${ChannelHelper.findChannel(guild, 'INTERVIEW_UPDATE')?.id || 'interview-preparations'}> with the correct format:**\n` +
                  `\`\`\`\n` +
                  `🏢 Company: [Company Name]\n` +
                  `💼 Role: [Job Title / Position]\n` +
                  `📅 Interview Date: [DD Month YYYY]\n` +
                  `🛠️ Tech Stack: [Languages / Frameworks] (optional)\n` +
                  `\`\`\`\n` +
                  `✏️ **Repost with the correct format to get your points back!**`
                );
                member.send({ embeds: [dmEmbed] }).catch(() => {});
              }
            }
          }

          // Small delay to avoid rate limits
          await new Promise(r => setTimeout(r, 300));

        } catch (err) {
          Logger.error(`Audit error for entry ${iv.discordId}:`, err.message);
          results.skipped.push({ name: iv.name, discordId: iv.discordId });
        }
      }

      // 5. Build audit summary report
      const voidedList = results.voided.slice(0, 15).map((v, i) =>
        `**${i + 1}.** ${v.discordId ? `<@${v.discordId}>` : `**${v.name}**`} — \`${String(v.loggedDate).substring(0, 10)}\`\n   ↳ *${v.reason || 'Invalid format'}*`
      ).join('\n');

      const validList = results.valid.slice(0, 10).map((v, i) =>
        `**${i + 1}.** ${v.discordId ? `<@${v.discordId}>` : `**${v.name}**`} — ${v.company} ✅`
      ).join('\n');

      const summaryDesc =
        `📊 **Audit Complete — ${toAudit.length} Records Processed**\n\n` +
        `• ✅ **Valid & Kept:** **${results.valid.length}** entries\n` +
        `• 🗑️ **Voided (Invalid Format):** **${results.voided.length}** entries\n` +
        `• ⏭️ **Skipped (Errors):** **${results.skipped.length}** entries\n` +
        `• 📬 **DM Notifications Sent:** **${results.voided.length}** students notified\n\n` +
        (results.voided.length > 0
          ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🗑️ **Voided Entries:**\n${voidedList}${results.voided.length > 15 ? `\n*...and ${results.voided.length - 15} more*` : ''}\n\n`
          : '') +
        (results.valid.length > 0
          ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ **Valid Entries (sample):**\n${validList}${results.valid.length > 10 ? `\n*...and ${results.valid.length - 10} more*` : ''}`
          : '');

      const finalEmbed = results.voided.length > 0
        ? Embeds.warning('🔍 Interview Audit Complete', summaryDesc)
        : Embeds.success('🔍 Interview Audit Complete', summaryDesc);

      await loading.edit({ content: null, embeds: [finalEmbed] });

    } catch (err) {
      Logger.error('Interview audit failed:', err);
      await loading.edit({
        content: null,
        embeds: [Embeds.error('Audit Failed', `An error occurred during the audit: ${err.message}`)]
      });
    }
  }
};
