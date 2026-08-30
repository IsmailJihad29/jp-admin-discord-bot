/**
 * JP ADMIN — Embed Builder Utility
 */

const { EmbedBuilder } = require('discord.js');
const constants = require('../config/constants');
const DateTimeUtil = require('./dateTime');

class Embeds {
  static default(title, description) {
    return new EmbedBuilder()
      .setColor(0x5865F2) // Discord Blurple
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}` });
  }

  static success(title, description) {
    return new EmbedBuilder()
      .setColor(0x10B981) // Emerald Green
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}` });
  }

  static error(title, description) {
    return new EmbedBuilder()
      .setColor(0xEF4444) // Rose Red
      .setTitle(`❌ ${title}`)
      .setDescription(description)
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}` });
  }

  static warning(title, description) {
    return new EmbedBuilder()
      .setColor(0xF59E0B) // Amber
      .setTitle(`⚠️ ${title}`)
      .setDescription(description)
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}` });
  }

  static info(title, description) {
    return new EmbedBuilder()
      .setColor(0x3B82F6) // Sky Blue
      .setTitle(`ℹ️ ${title}`)
      .setDescription(description)
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}` });
  }

  static question(category, difficulty, questionText, questionId) {
    const isTech = category.toLowerCase().includes('tech');
    return new EmbedBuilder()
      .setColor(isTech ? 0x6366F1 : 0xEC4899)
      .setTitle(`❓ ${category.toUpperCase()} DROP · [${difficulty.toUpperCase()}]`)
      .setDescription(`**Question ID:** \`${questionId}\`\n\n${questionText}\n\n> *Submit your answer by replying to this message!*`)
      .addFields(
        { name: "Scoring Rules", value: "• 0–10 points based on accuracy\n• +2 bonus for 1st correct answer\n• 30% penalty if AI cheat detected", inline: true }
      )
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · Auto-scored by Groq AI` });
  }

  static leaderboard(title, entries, footerNote) {
    let desc = "";
    if (!entries || entries.length === 0) {
      desc = "No scores recorded for this period yet.";
    } else {
      desc = entries.map((e, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `**#${idx + 1}**`;
        return `${medal} <@${e.discordId}> — **${e.totalPoints} pts** ${e.details ? `*(${e.details})*` : ''}`;
      }).join('\n');
    }

    return new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle(`🏆 ${title}`)
      .setDescription(desc)
      .setFooter({ text: footerNote || `JP ADMIN ${constants.BOT_VERSION} · Weekly Leaderboard` });
  }

  static fullWeeklyLeaderboardEmbeds(title, entries, footerNote) {
    if (!entries || entries.length === 0) {
      return [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle(`🏆 ${title}`)
          .setDescription("No student performance records found for this period yet.")
          .setFooter({ text: footerNote || `JP ADMIN ${constants.BOT_VERSION} · Weekly Leaderboard` })
      ];
    }

    const embeds = [];
    const top10 = entries.slice(0, 10);
    const rest = entries.slice(10);

    // Embed 1: Top 10 High Performers (Full details)
    let topDesc = `📊 **Top 10 High Performers · Right-To-Be-Referred (RTBR)**\n\n`;
    topDesc += top10.map((e, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `**#${idx + 1}**`;
      const nameStr = e.name ? `(**${e.name}**)` : '';
      return `${medal} <@${e.discordId}> ${nameStr} ➔ **${e.totalPoints} PTS**\n   ↳ ${e.details || ''}`;
    }).join('\n\n');

    topDesc += `\n\n──────────────────────────────\n` +
      `💡 *Score Formula: Attendance (+1/-1) + Jobs Tiered Score + Streak (+3/day) + Interviews (+2) + Tasks (+1/+1)*`;

    if (topDesc.length > 3800) {
      topDesc = topDesc.substring(0, 3750) + "\n...*(truncated)*";
    }

    const topEmbed = new EmbedBuilder()
      .setColor(0xF59E0B) // Amber Gold
      .setTitle(`🏆 ${title} · (Top 10 Performers)`)
      .setDescription(topDesc);

    if (rest.length === 0) {
      topEmbed.setFooter({ text: footerNote || `JP ADMIN ${constants.BOT_VERSION} · Total ${entries.length} Active Students` });
      return [topEmbed];
    }

    embeds.push(topEmbed);

    // Embeds for Remaining Students in clean compact chunks (20 students per embed)
    const chunkSize = 20;
    for (let i = 0; i < rest.length; i += chunkSize) {
      const chunk = rest.slice(i, i + chunkSize);
      const startRank = 11 + i;
      const endRank = startRank + chunk.length - 1;

      let restDesc = `📋 **Cohort Performance Standings (Ranks #${startRank} – #${endRank}):**\n\n`;
      restDesc += chunk.map((e, cIdx) => {
        const rankNum = startRank + cIdx;
        const nameStr = e.name ? `(${e.name})` : '';
        return `**#${rankNum}** <@${e.discordId}> ${nameStr} — **${e.totalPoints} pts** ${e.details ? `\n   ↳ *${e.details}*` : ''}`;
      }).join('\n');

      if (restDesc.length > 3800) {
        restDesc = restDesc.substring(0, 3750) + "\n...*(truncated)*";
      }

      const restEmbed = new EmbedBuilder()
        .setColor(0x3B82F6) // Sapphire Blue
        .setTitle(`📊 Cohort Leaderboard (Ranks #${startRank} – #${endRank})`)
        .setDescription(restDesc);

      if (i + chunkSize >= rest.length) {
        restEmbed.setFooter({ text: footerNote || `JP ADMIN ${constants.BOT_VERSION} · Total ${entries.length} Active Students` });
      }

      embeds.push(restEmbed);
    }

    return embeds;
  }

  static attendanceReport(title, dateStr, res) {
    const records = res.records || [];
    const present = records.filter(r => r.status === 'P');
    const absent = records.filter(r => r.status === 'A');
    const leave = records.filter(r => r.status === 'L');

    let desc = `📊 **Summary Statistics:**\n` +
      `• **Present (+1 pt):** ${res.present !== undefined ? res.present : present.length}\n` +
      `• **Absent (-1 pt):** ${res.absent !== undefined ? res.absent : absent.length}\n` +
      `• **Approved Leave (0 pt):** ${res.leave !== undefined ? res.leave : leave.length}\n` +
      `• **Total Active Students:** ${res.totalActive || records.length}\n\n` +
      `──────────────────────────────\n` +
      `📋 **Student Attendance & Point Breakdown:**\n\n`;

    if (present.length > 0) {
      desc += `**✅ Attended (+1 pt) [${present.length}]:**\n` +
        present.map(r => `• ${r.discordId ? `<@${r.discordId}>` : `**${r.name}**`} — \`+1 pt\``).join('\n') + '\n\n';
    }

    if (absent.length > 0) {
      desc += `**❌ Absent (-1 pt) [${absent.length}]:**\n` +
        absent.map(r => `• ${r.discordId ? `<@${r.discordId}>` : `**${r.name}**`} — \`-1 pt\``).join('\n') + '\n\n';
    }

    if (leave.length > 0) {
      desc += `**🌴 Approved Leave (0 pt) [${leave.length}]:**\n` +
        leave.map(r => `• ${r.discordId ? `<@${r.discordId}>` : `**${r.name}**`} — \`0 pt\``).join('\n') + '\n\n';
    }

    if (records.length === 0) {
      desc += `*No student records found.*`;
    }

    if (desc.length > 4000) {
      desc = desc.substring(0, 3950) + "\n\n*...and more students*";
    }

    return new EmbedBuilder()
      .setColor(0x10B981) // Emerald Green
      .setTitle(`🌅 ${title} · ${dateStr}`)
      .setDescription(desc)
      .setFooter({ text: `JP ADMIN ${constants.BOT_VERSION} · ${DateTimeUtil.getFullTimestamp()}` });
  }
}

module.exports = Embeds;
