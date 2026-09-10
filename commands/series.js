const axios = require("axios");
const { Markup } = require("telegraf");

async function getTrailer(movieId) {

    try {

        const res = await axios.get(
            `https://api.themoviedb.org/3/tv/${seriesId}/videos`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

        const trailer = res.data.results.find(
            v =>
                v.site === "YouTube" &&
                v.type === "Trailer"
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

    const poster = movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${series.poster_path}`
        : null;

    const caption =
`🎬 *${series.title || series.name}*

⭐ Rating: ${series.vote_average || "N/A"}

📅 Release:
${series.release_date || series.first_air_date || "Unknown"}

📝
${series.overview || "No description available."}`;

const trailerUrl =
    await getTrailer(movie.id);

if (poster) {
    return ctx.replyWithPhoto(
        poster,
        {
            caption,
            parse_mode: "Markdown",
            reply_markup: Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "📥 Download",
                        `download_${series.id}`
                    )
                ],
                [
trailerUrl
    ? Markup.button.url(
        "🎥 Official Trailer",
        trailerUrl
    )
    : Markup.button.callback(
        "🎥 Trailer Not Available",
        "no_trailer"
    )
                ]
            ]).reply_markup
        }
    );
}

return ctx.reply(
    caption,
    {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "📥 Download",
                    `download_${series.id}`
                )
            ],
            [
trailerUrl
    ? Markup.button.url(
        "🎥 Official Trailer",
        trailerUrl
    )
    : Markup.button.callback(
        "🎥 Trailer Not Available",
        "no_trailer"
    )
            ]
        ]).reply_markup
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

        await ctx.reply("🔎 Searching series...");

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

        if (!res.data.results.length) {
            return ctx.reply("❌ No results found.");
        }

const results = res.data.results.slice(0, 5);

if (!results.length) {
    return ctx.reply("❌ No series found.");
}

if (results.length === 1) {
    return showSeries(ctx, results[0]);
}

return ctx.reply(
`🎬 *Multiple series found*

Select the correct series below:`,
{
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard(
        results.map(series => [
            Markup.button.callback(
                `${series.title || series.name} (${(series.release_date || series.first_air_date || "").slice(0,4) || "----"})`,
                `series_${series.id}`
            )
        ])
    ).reply_markup
}
);

    } catch (err) {
        console.error(err);
        return ctx.reply("❌ Failed to search series.");
    }

}); // <-- THIS closes bot.command("movie")

bot.action(/^series_(.+)$/, async (ctx) => {

    try {

        const id = ctx.match[1];

        const res = await axios.get(
            `https://api.themoviedb.org/3/tv/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

        await ctx.answerCbQuery();

        return showSeries(ctx, res.data);

    } catch (err) {

        console.error(err);

        ctx.answerCbQuery("Failed to load movie.");

    }

});

bot.action("no_trailer", async (ctx) => {

    await ctx.answerCbQuery(
        "No official trailer found."
    );

});

bot.action(/^download_(.+)$/, async (ctx) => {

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

        const series = res.data;
        const title = series.title || series.name;

        return ctx.editMessageCaption(
`📥 *DOWNLOAD OPTIONS*

🎬 ${title}

Choose a download source below.`,
            {
                parse_mode: "Markdown",
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.url(
                            "📥 My9jaRocks",
                            `https://www.my9jarocks.bz/?s=${encodeURIComponent(title)}`
                        )
                    ],
                    [
                        Markup.button.url(
                            "📥 PSA",
                            `https://psa.wf/?s=${encodeURIComponent(title)}`
                        ),
                        Markup.button.url(
                            "📥 Pahe",
                            `https://pahe.ink/?s=${encodeURIComponent(title)}`
                        )
                    ],
                    [
                        Markup.button.url(
                            "⭐ IMDb",
                            `https://www.imdb.com/find/?q=${encodeURIComponent(title)}`
                        )
                    ],
                    [
                        Markup.button.callback(
                            "⬅ Back",
                            `series_${id}`
                        )
                    ]
                ]).reply_markup
            }
        );

    } catch (err) {

        console.error(err);

        await ctx.answerCbQuery("Failed.");

    }

});

};
