const axios = require("axios");
const { Markup } = require("telegraf");

async function getTrailer(seriesId) {

    try {

        const res = await axios.get(
            `https://api.themoviedb.org/3/tv/${seriesId}/videos`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

       console.log(res.data.results);

        const trailer = res.data.results.find(
            video =>
                video.site === "YouTube" &&
                video.type === "Trailer"
        );

        if (!trailer)
            return null;

        return `https://www.youtube.com/watch?v=${trailer.key}`;

    } catch (err) {

        console.error(err);

        return null;

    }

}
async function showSeries(ctx, series) {

    const poster = series.poster_path
        ? `https://image.tmdb.org/t/p/w500${series.poster_path}`
        : null;

    const trailerUrl = await getTrailer(series.id);

    const caption =
`📺 *${series.name}*

⭐ Rating: ${series.vote_average || "N/A"}

📅 First Air Date:
${series.first_air_date || "Unknown"}

🎞 Seasons: ${series.number_of_seasons ?? "Unknown"}

📺 Episodes: ${series.number_of_episodes ?? "Unknown"}

🟢 Status:
${series.status || "Unknown"}

📝
${series.overview || "No description available."}`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback(
                "📥 Download",
                `series_download_${series.id}`
            )
        ],
        [
            trailerUrl
                ? Markup.button.url(
                    "🎥 Official Trailer",
                    trailerUrl
                )
                : Markup.button.callback(
                    "🎥 No Trailer",
                    "series_no_trailer"
                )
        ]
    ]).reply_markup;

    if (poster) {

        return ctx.replyWithPhoto(
            poster,
            {
                caption,
                parse_mode: "Markdown",
                reply_markup: keyboard
            }
        );

    }

    return ctx.reply(
        caption,
        {
            parse_mode: "Markdown",
            reply_markup: keyboard
        }
    );

}

module.exports = (bot) => {

bot.command("series", async (ctx) => {

    const parts = ctx.message.text.trim().split(/\s+/);

    if (parts.length < 2) {
        return ctx.reply(
            "❌ Usage:\n/series series name"
        );
    }

    const query = parts.slice(1).join(" ");

    try {

        await ctx.reply("🔎 Searching TV series...");

        const res = await axios.get(
            "https://api.themoviedb.org/3/search/tv",
            {
                params: {
                    query,
                    include_adult: false
                },
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

        const results = res.data.results.slice(0, 5);

        if (!results.length) {
            return ctx.reply(
                "❌ No TV series found."
            );
        }

        // One result
        if (results.length === 1) {

            const details = await axios.get(
                `https://api.themoviedb.org/3/tv/${results[0].id}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                    }
                }
            );

            return showSeries(
                ctx,
                details.data
            );

        }

        // Multiple results
        return ctx.reply(
`📺 *Multiple TV series found*

Select the correct one below:`,
            {
                parse_mode: "Markdown",
                reply_markup: Markup.inlineKeyboard(
                    results.map(series => [
                        Markup.button.callback(
                            `${series.name} (${(series.first_air_date || "").slice(0,4) || "----"})`,
                            `series_${series.id}`
                        )
                    ])
                ).reply_markup
            }
        );

    } catch (err) {

        console.error(err);

        return ctx.reply(
            "❌ Failed to search TV series."
        );

    }

});
bot.action(/^series_(.+)$/, async (ctx) => {

    try {

        await ctx.answerCbQuery();

        const id = ctx.match[1];

        const res = await axios.get(
            `https://api.themoviedb.org/3/tv/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

        return showSeries(
            ctx,
            res.data
        );

    } catch (err) {

        console.error(err);

        await ctx.reply(
            `❌ ${err.response?.data?.status_message || err.message}`
        );

    }

});
bot.action("series_no_trailer", async (ctx) => {

    await ctx.answerCbQuery(
        "No official trailer found."
    );

});

};
