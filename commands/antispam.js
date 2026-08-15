module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // ANTISPAM COMMAND
    // =========================

    bot.command("antispam", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (ctx.chat.type === "private") {
                return ctx.reply(
                    "❌ This command only works in groups."
                );
            }

            const args = ctx.message.text
                .split(" ")
                .slice(1);

            if (args.length === 0) {
                return ctx.reply(
                    "Usage:\n/antispam on\n/antispam off"
                );
            }

            const state = args[0].toLowerCase();

            if (state !== "on" && state !== "off") {
                return ctx.reply(
                    "❌ Invalid option.\n\nUse:\n/antispam on\n/antispam off"
                );
            }

            await pool.query(
                `INSERT INTO group_settings (chat_id, anti_spam)
                 VALUES ($1, $2)
                 ON CONFLICT (chat_id)
                 DO UPDATE SET anti_spam = EXCLUDED.anti_spam`,
                [
                    ctx.chat.id,
                    state === "on"
                ]
            );

            await ctx.reply(
                state === "on"
                    ? "🟢 Anti-Spam protection has been enabled."
                    : "🔴 Anti-Spam protection has been disabled."
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to update Anti-Spam settings."
            );

        }

    });

};
