module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // WELCOME COMMAND
    // =========================

    bot.command("welcome", async (ctx) => {

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
                    "Usage:\n/welcome on\n/welcome off"
                );
            }

            const state = args[0].toLowerCase();
            if (state !== "on" && state !== "off") {
                return ctx.reply(
                    "❌ Invalid option.\n\nUse:\n/welcome on\n/welcome off"
                );
            }

            await pool.query(
                `INSERT INTO group_settings (chat_id, welcome)
                 VALUES ($1, $2)
                 ON CONFLICT (chat_id)
                 DO UPDATE SET welcome = EXCLUDED.welcome`,
                [
                    ctx.chat.id,
                    state === "on"
                ]
            );

            await ctx.reply(
                state === "on"
                    ? "🟢 Welcome messages have been enabled."
                    : "🔴 Welcome messages have been disabled."
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to update Welcome settings."
            );

        }

    });

};
