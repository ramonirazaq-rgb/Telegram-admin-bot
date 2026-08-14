module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // KICK COMMAND
    // =========================

    bot.command("kick", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❗ Reply to the user's message with /kick"
                );
            }

            const target = ctx.message.reply_to_message.from;

            if (target.id === ctx.from.id) {
                return ctx.reply("😂 You can't kick yourself.");
            }

            if (target.id === Number(process.env.OWNER_ID)) {
                return ctx.reply("👑 I can't kick the owner.");
            }
            // Check if target is an admin
            const targetMember = await ctx.telegram.getChatMember(
                ctx.chat.id,
                target.id
            );

            if (
                targetMember.status === "administrator" ||
                targetMember.status === "creator"
            ) {
                return ctx.reply("🛡️ I can't kick another admin.");
            }

            // Kick user (ban then immediately unban)
            await ctx.telegram.banChatMember(
                ctx.chat.id,
                target.id
            );

            await ctx.telegram.unbanChatMember(
                ctx.chat.id,
                target.id
            );

            // Save to logs
            await pool.query(
                `INSERT INTO logs
                (chat_id,user_id,admin_id,action)
                VALUES($1,$2,$3,$4)`,
                [
                    ctx.chat.id,
                    target.id,
                    ctx.from.id,
                    "KICK"
                ]
            );
            // Success message
            await ctx.reply(
`👢 *User Kicked Successfully*

👤 User: ${target.first_name}
🆔 ID: \`${target.id}\`
👮 Moderator: ${ctx.from.first_name}`,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);

            ctx.reply("❌ Failed to kick member.");

        }

    });

};
