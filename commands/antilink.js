module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // ANTILINK COMMAND
    // =========================

    bot.command("antilink", async (ctx) => {

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
                    "Usage:\n/antilink on\n/antilink off"
                );
            }

            const state = args[0].toLowerCase();
            if (state !== "on" && state !== "off") {
                return ctx.reply(
                    "❌ Invalid option.\n\nUse:\n/antilink on\n/antilink off"
                );
            }

            await pool.query(
                `INSERT INTO group_settings (chat_id, anti_link)
                 VALUES ($1, $2)
                 ON CONFLICT (chat_id)
                 DO UPDATE SET anti_link = EXCLUDED.anti_link`,
                [
                    ctx.chat.id,
                    state === "on"
                ]
            );

            await ctx.reply(
                state === "on"
                    ? "🟢 Anti-Link protection has been enabled."
                    : "🔴 Anti-Link protection has been disabled."
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to update Anti-Link settings."
            );

        }

    });
};
