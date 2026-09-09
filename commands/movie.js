module.exports = (bot) => {

    bot.command("movie", async (ctx) => {

        const query = ctx.message.text
            .replace(/^\/movie/i, "")
            .trim();

        if (!query) {
            return ctx.reply(
                "🎬 *Movie Search*\n\nUsage:\n`/movie Avengers`",
                {
                    parse_mode: "Markdown"
                }
            );
        }

        await ctx.reply(
            `🔎 Searching for *${query}*...`,
            {
                parse_mode: "Markdown"
            }
        );

    });

};
