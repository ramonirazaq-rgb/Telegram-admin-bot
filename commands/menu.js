module.exports = (bot, pool, canModerate, canAccessPanel) => {

bot.command("menu", async (ctx) => {

const user = ctx.from.first_name || "Admin";

const uptime = Math.floor(process.uptime());
const hrs = Math.floor(uptime / 3600);
const mins = Math.floor((uptime % 3600) / 60);
const secs = uptime % 60;
const users = await pool.query(
    "SELECT COUNT(*) FROM users"
);

const warns = await pool.query(
    "SELECT COUNT(*) FROM warnings"
);

const mutes = await pool.query(
    "SELECT COUNT(*) FROM mutes"
);

const bans = await pool.query(
    "SELECT COUNT(*) FROM bans"
);

const schedules = await pool.query(
    "SELECT COUNT(*) FROM scheduled_messages WHERE sent = FALSE"
);

const menu = `
╔════════════════════╗
      🤖 PREMIUM ADMIN BOT
╚════════════════════╝

👤 User: ${user}
🆔 ID: ${ctx.from.id}
💬 Chat: ${ctx.chat.title || "Private Chat"}

━━━━━━━━━━━━━━━━━━

⚡ BOT INFORMATION

🟢 Status      : Online
⚙️ Version     : v2.0 Premium
⏰ Uptime      : ${hrs}h ${mins}m ${secs}s
🧠 RAM Usage   : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB
🖥️ Platform    : ${process.platform}
📦 Node.js     : ${process.version}

━━━━━━━━━━━━━━━━━━

🛡️ MODERATION

• /ban
• /unban
• /kick
• /mute
• /unmute
• /warn

━━━━━━━━━━━━━━━━━━

🔒 GROUP CONTROL

• /open
• /close
• /lock
• /unlock

━━━━━━━━━━━━━━━━━━

🛡️ SECURITY

• /antilink
• /antispam
• /filter
• /cleanservice

━━━━━━━━━━━━━━━━━━

📅 SCHEDULER

• /schedule
• Scheduled Messages
• Recurring Messages
• Schedule List

━━━━━━━━━━━━━━━━━━

📊 UTILITIES

• /panel
• /userinfo
• /stats
• /logs
• /pin
• /unpin
• /purge

━━━━━━━━━━━━━━━━━━

📊 LIVE STATISTICS

👥 Users       : ${users.rows[0].count}
⚠️ Warnings    : ${warns.rows[0].count}
🔇 Mutes       : ${mutes.rows[0].count}
🚫 Bans        : ${bans.rows[0].count}
📅 Scheduled   : ${schedules.rows[0].count}

━━━━━━━━━━━━━━━━━━

🌟 PATRICX ADMIN BOT

⚡ Fast • Secure • Reliable

💎 Premium Telegram Group Management

© 2026 Patrick
`;

await ctx.reply(menu);

});

};
