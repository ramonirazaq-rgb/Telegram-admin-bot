module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // BAN COMMAND
    // =========================

    bot.command("ban", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❗ Reply to the user's message with /ban"
                );
            }

            const target = ctx.message.reply_to_message.from;

            if (target.id === ctx.from.id) {
                return ctx.reply("😂 You can't ban yourself.");
            }

            if (target.id === Number(process.env.OWNER_ID)) {
                return ctx.reply("👑 I can't ban the owner.");
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
                return ctx.reply("🛡️ I can't ban another admin.");
            }

            // Ban the user
            await ctx.telegram.banChatMember(
                ctx.chat.id,
                target.id
            );

            // Save to bans table
            await pool.query(
                `INSERT INTO bans
                (user_id, chat_id, reason, banned_by)
                VALUES ($1, $2, $3, $4)`,
                [
                    target.id,
                    ctx.chat.id,
                    "Not specified",
                    ctx.from.id
                ]
            );
            // Save to logs table
            await pool.query(
                `INSERT INTO logs
                (chat_id, user_id, admin_id, action)
                VALUES ($1, $2, $3, $4)`,
                [
                    ctx.chat.id,
                    target.id,
                    ctx.from.id,
                    "BAN"
                ]
            );

            // Success message
            await ctx.reply(
`🚫 *User Banned Successfully*

👤 User: ${target.first_name}
🆔 ID: \`${target.id}\`
👮 Moderator: ${ctx.from.first_name}
📝 Reason: Not specified`,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);

            ctx.reply("❌ Failed to ban member.");

        }

    });
    // =========================
    // UNBAN COMMAND
    // =========================

    bot.command("unban", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            const args = ctx.message.text.trim().split(/\s+/);

            if (args.length < 2) {
                return ctx.reply(
                    "Usage:\n/unban USER_ID"
                );
            }

            const userId = Number(args[1]);

            if (!userId) {
                return ctx.reply("❌ Invalid user ID.");
            }

            await ctx.telegram.unbanChatMember(
                ctx.chat.id,
                userId
            );

            await pool.query(
                `DELETE FROM bans
                 WHERE user_id=$1
                 AND chat_id=$2`,
                [
                    userId,
                    ctx.chat.id
                ]
            );

            await pool.query(
                `INSERT INTO logs
                (chat_id,user_id,admin_id,action)
                VALUES($1,$2,$3,$4)`,
                [
                    ctx.chat.id,
                    userId,
                    ctx.from.id,
                    "UNBAN"
                ]
            );

            await ctx.reply(
`✅ *User Unbanned Successfully*

🆔 User ID: \`${userId}\`
👮 Moderator: ${ctx.from.first_name}`,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);

            ctx.reply("❌ Failed to unban member.");

        }

    });

};
