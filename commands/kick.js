module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // KICK
    // =========================
    bot.command("kick", async (ctx) => {
        if (!(await canModerate(ctx))) {
            return ctx.reply("⛔ You must be a Telegram admin.">
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply("❗ Reply to the user's message wi>
        }

        const target = ctx.message.reply_to_message.from;

        if (target.id === Number(process.env.OWNER_ID)) {
            return ctx.reply("👑 I can't kick the owner.");
        }

        if (target.id === ctx.from.id) {
            return ctx.reply("😂 You can't kick yourself.");
        }

        try {
            await ctx.telegram.banChatMember(ctx.chat.id, targe>
            await ctx.telegram.unbanChatMember(ctx.chat.id, tar>

            await pool.query(
                `INSERT INTO logs(chat_id,user_id,admin_id,acti>
                 VALUES($1,$2,$3,$4)`,
                [ctx.chat.id, target.id, ctx.from.id, "KICK"]
            );

            ctx.reply(`👢 ${target.first_name} has been kicked.>
        } catch (err) {
            console.error(err);
            ctx.reply("❌ Failed to kick member.");
        }
    });
};
