module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // WORD FILTER COMMAND
    // =========================

    bot.command("filter", async (ctx) => {

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
`Usage:

/filter on
/filter off
/filter add word
/filter remove word
/filter list`
    );
}

            const action = args[0].toLowerCase();
            // Enable / Disable filter
            if (action === "on" || action === "off") {

                await pool.query(
                    `INSERT INTO group_settings
                    (chat_id, bad_words)
                    VALUES ($1, $2)
                    ON CONFLICT (chat_id)
                    DO UPDATE SET bad_words = EXCLUDED.bad_words`,
                    [
                        ctx.chat.id,
                        action === "on"
                    ]
                );

                return ctx.reply(
                    action === "on"
                        ? "🟢 Bad Word Filter has been enabled."
                        : "🔴 Bad Word Filter has been disabled."
                );

            }

            // List blocked words
            if (action === "list") {

                const result = await pool.query(
                    `SELECT word
                     FROM filters
                     WHERE chat_id=$1
                     ORDER BY word`,
                    [ctx.chat.id]
                );

                if (result.rowCount === 0) {
                    return ctx.reply("📭 No blocked words have been added.");
                }

                const words = result.rows
                    .map(row => `• ${row.word}`)
                    .join("\n");

                return ctx.reply(
`🚫 *Blocked Words*

${words}`,
                    {
                        parse_mode: "Markdown"
                    }
                );

            }

            if (args.length < 2) {
                return ctx.reply(
                    "❌ Please specify a word."
                );
            }

            const word = args
                .slice(1)
                .join(" ")
                .toLowerCase()
                .trim();
            if (action === "add") {

                await pool.query(
                    `INSERT INTO filters (chat_id, word)
                     VALUES ($1, $2)
                     ON CONFLICT (chat_id, word)
                     DO NOTHING`,
                    [
                        ctx.chat.id,
                        word
                    ]
                );

                return ctx.reply(
                    `✅ "${word}" has been added to the blocked words list.`
                );

            }

            if (action === "remove") {

                const result = await pool.query(
                    `DELETE FROM filters
                     WHERE chat_id=$1
                     AND word=$2
                     RETURNING id`,
                    [
                        ctx.chat.id,
                        word
                    ]
                );

                if (result.rowCount === 0) {
                    return ctx.reply(
                        `❌ "${word}" was not found in the blocked words list.`
                    );
                }

                return ctx.reply(
                    `🗑️ "${word}" has been removed from the blocked words list.`
                );

            }

            return ctx.reply(
                "❌ Invalid action.\n\nUse:\n/filter add word\n/filter remove word\n/filter list"
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to manage the word filter."
            );

        }

    });

};
