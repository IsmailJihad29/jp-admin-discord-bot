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
}

module.exports = Embeds;
