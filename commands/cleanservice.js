module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // CLEAN SERVICE COMMAND
    // =========================

    bot.command("cleanservice", async (ctx) => {

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
                    "Usage:\n/cleanservice on\n/cleanservice off"
                );
            }

            const state = args[0].toLowerCase();
            if (state !== "on" && state !== "off") {
                return ctx.reply(
                    "❌ Invalid option.\n\nUse:\n/cleanservice on\n/cleanservice off"
                );
            }

            await pool.query(
                `INSERT INTO group_settings (chat_id, clean_service)
                 VALUES ($1, $2)
                 ON CONFLICT (chat_id)
                 DO UPDATE SET clean_service = EXCLUDED.clean_service`,
                [
                    ctx.chat.id,
                    state === "on"
                ]
            );

            await ctx.reply(
                state === "on"
                    ? "🧹 Service message cleanup has been enabled."
                    : "🧹 Service message cleanup has been disabled."
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to update Clean Service settings."
            );

        }

    });

};
