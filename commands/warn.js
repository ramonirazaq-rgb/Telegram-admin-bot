module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // WARN COMMAND
    // =========================

    bot.command("warn", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❗ Reply to the user's message with /warn"
                );
            }

            const target = ctx.message.reply_to_message.from;

            if (target.id === ctx.from.id) {
                return ctx.reply("😂 You can't warn yourself.");
            }

            if (target.id === Number(process.env.OWNER_ID)) {
                return ctx.reply("👑 I can't warn the owner.");
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
                return ctx.reply("🛡️ I can't warn another admin.");
            }

            // Get reason (optional)
            const args = ctx.message.text.split(" ").slice(1);
            const reason = args.length
                ? args.join(" ")
                : "No reason provided";

            // Save warning
            await pool.query(
                `INSERT INTO warnings
                (user_id, chat_id, reason, issued_by)
                VALUES ($1, $2, $3, $4)`,
                [
                    target.id,
                    ctx.chat.id,
                    reason,
                    ctx.from.id
                ]
            );

            // Count total warnings
            const result = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM warnings
                 WHERE user_id=$1
                 AND chat_id=$2`,
                [
                    target.id,
                    ctx.chat.id
                ]
            );

            const totalWarnings = Number(result.rows[0].total);
            // Automatically mute after 3 warnings
            if (totalWarnings >= 3) {

                const muteUntil = new Date(
                    Date.now() + (60 * 60 * 1000) // 1 hour
                );

                await ctx.telegram.restrictChatMember(
                    ctx.chat.id,
                    target.id,
                    {
                        permissions: {
                            can_send_messages: false,
                            can_send_audios: false,
                            can_send_documents: false,
                            can_send_photos: false,
                            can_send_videos: false,
                            can_send_video_notes: false,
                            can_send_voice_notes: false,
                            can_send_polls: false,
                            can_send_other_messages: false,
                            can_add_web_page_previews: false
                        },
                        until_date: Math.floor(muteUntil.getTime() / 1000)
                    }
                );

                await pool.query(
                    `INSERT INTO mutes
                    (user_id, chat_id, reason, muted_by, expires_at)
                    VALUES ($1, $2, $3, $4, $5)`,
                    [
                        target.id,
                        ctx.chat.id,
                        "Reached warning limit",
                        ctx.from.id,
                        muteUntil
                    ]
                );
                // Log the automatic mute
                await pool.query(
                    `INSERT INTO logs
                    (chat_id, user_id, admin_id, action)
                    VALUES ($1, $2, $3, $4)`,
                    [
                        ctx.chat.id,
                        target.id,
                        ctx.from.id,
                        "AUTO_MUTE"
                    ]
                );

                // Clear warnings after punishment
                await pool.query(
                    `DELETE FROM warnings
                     WHERE user_id=$1
                     AND chat_id=$2`,
                    [
                        target.id,
                        ctx.chat.id
                    ]
                );

                return ctx.reply(
`🔇 *USER AUTOMATICALLY MUTED*

👤 User: ${target.first_name}
🆔 User ID: ${target.id}
⚠️ Warning Limit: 3/3
⏱ Duration: 1 Hour
🤖 Action: Automatic Mute
🕒 Time: ${new Date().toUTCString()}

The user's warnings have been reset.`,
                    {
                        parse_mode: "Markdown"
                    }
                );

            }
            await ctx.reply(
`⚠️ *USER WARNED*

👥 User: ${target.first_name}
🆔 User ID: ${target.id}
👮 Warned by: ${ctx.from.first_name}
📝 Reason: ${reason}
📊 Warnings: ${totalWarnings}/3
🕒 Time: ${new Date().toUTCString()}`,
                {
                    parse_mode: "Markdown"
                }
            );

            // Auto-punishment placeholder
            // We'll implement automatic mute/kick at 3 warnings later.

        } catch (err) {

            console.error(err);

            return ctx.reply("❌ Failed to warn user.");

        }

    });
    // =========================
    // WARNINGS COMMAND
    // =========================

    bot.command("warnings", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❗ Reply to the user's message with /warnings"
                );
            }

            const target = ctx.message.reply_to_message.from;

            const result = await pool.query(
                `SELECT reason, created_at
                 FROM warnings
                 WHERE user_id=$1
                 AND chat_id=$2
                 ORDER BY created_at DESC`,
                [
                    target.id,
                    ctx.chat.id
                ]
            );

            if (result.rows.length === 0) {
                return ctx.reply(
                    "✅ This user has no warnings."
                );
            }

            let message =
`⚠️ *WARNING HISTORY*

👤 User: ${target.first_name}
🆔 ID: ${target.id}

`;

            result.rows.forEach((warn, index) => {

                message +=
`${index + 1}. ${warn.reason}
📅 ${new Date(warn.created_at).toUTCString()}

`;

            });

            message += `📊 Total Warnings: ${result.rows.length}`;

            await ctx.reply(
                message,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to retrieve warnings."
            );

        }

    });
    // =========================
    // CLEAR WARNINGS COMMAND
    // =========================

    bot.command("clearwarns", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❗ Reply to the user's message with /clearwarns"
                );
            }

            const target = ctx.message.reply_to_message.from;

            const result = await pool.query(
                `DELETE FROM warnings
                 WHERE user_id=$1
                 AND chat_id=$2
                 RETURNING id`,
                [
                    target.id,
                    ctx.chat.id
                ]
            );

            if (result.rowCount === 0) {
                return ctx.reply(
                    "ℹ️ This user has no warnings to clear."
                );
            }

            await ctx.reply(
`🧹 *WARNINGS CLEARED*

👤 User: ${target.first_name}
🆔 User ID: ${target.id}
👮 Cleared by: ${ctx.from.first_name}
📊 Removed Warnings: ${result.rowCount}
🕒 Time: ${new Date().toUTCString()}`,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to clear warnings."
            );

        }

    });

};
