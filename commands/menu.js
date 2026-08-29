module.exports = (bot, pool, canModerate, canAccessPanel) => {

bot.command("menu", async (ctx) => {

const user = ctx.from.first_name || "Admin";

const uptime = Math.floor(process.uptime());
const hrs = Math.floor(uptime / 3600);
const mins = Math.floor((uptime % 3600) / 60);
const secs = uptime % 60;

const menu = `
╔════════════════════╗
      🤖 PREMIUM ADMIN BOT
╚════════════════════╝

👤 User: ${user}
🆔 ID: ${ctx.from.id}
💬 Chat: ${ctx.chat.title || "Private Chat"}

━━━━━━━━━━━━━━━━━━

⚡ BOT INFORMATION

🟢 Status : Online
⚙️ Version : v2.0 Premium
⏰ Uptime : ${hrs}h ${mins}m ${secs}s

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

❤️ Developed by Patrick
`;

await ctx.reply(menu);

});

};
