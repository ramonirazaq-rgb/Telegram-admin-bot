module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // BAN
    // =========================
    bot.command("ban", async (ctx) => {
        if (!(await canModerate(ctx))) {
            return ctx.reply("⛔ You must be a Telegram admin.">
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply("❗ Reply to the user's message wi>
        }

        const target = ctx.message.reply_to_message.from;

        if (target.id === Number(process.env.OWNER_ID)) {
            return ctx.reply("👑 I can't ban the owner.");
        }

        if (target.id === ctx.from.id) {
            return ctx.reply("😂 You can't ban yourself.");
        }

        try {
            await ctx.telegram.banChatMember(ctx.chat.id, targe>

            await pool.query(
                `INSERT INTO bans (user_id, chat_id, banned_by)
                 VALUES ($1,$2,$3)`,
                [target.id, ctx.chat.id, ctx.from.id]
            );

            await pool.query(
                `INSERT INTO logs (chat_id,user_id,admin_id,act>
                 VALUES ($1,$2,$3,$4)`,
                [ctx.chat.id, target.id, ctx.from.id, "BAN"]
            );

            ctx.reply(`🔨 ${target.first_name} has been banned.>
        } catch (err) {
            console.error(err);
            ctx.reply("❌ Failed to ban member.");
        }
    });

    // =========================
    // UNBAN
    // =========================
    bot.command("unban", async (ctx) => {
        if (!(await canModerate(ctx))) {
            return ctx.reply("⛔ You must be a Telegram admin.">
        }

        const args = ctx.message.text.split(" ");

        if (args.length < 2) {
            return ctx.reply("Usage:\n/unban USER_ID");
        }
        const userId = Number(args[1]);

        if (!userId) {
            return ctx.reply("❌ Invalid user ID.");
        }

        try {
            await ctx.telegram.unbanChatMember(ctx.chat.id, use>

            await pool.query(
                `INSERT INTO logs(chat_id,user_id,admin_id,acti>
                 VALUES($1,$2,$3,$4)`,
                [ctx.chat.id, userId, ctx.from.id, "UNBAN"]
            );

            ctx.reply("✅ User has been unbanned.");
        } catch (err) {
            console.error(err);
            ctx.reply("❌ Failed to unban user.");
        }
};
