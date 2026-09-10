const axios = require("axios");
const { Markup } = require("telegraf");

async function getTrailer(movieId) {

    try {

        const res = await axios.get(
            `https://api.themoviedb.org/3/movie/${movieId}/videos`,
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

async function showMovie(ctx, movie) {

    const poster = movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null;

    const caption =
`🎬 *${movie.title || movie.name}*

⭐ Rating: ${movie.vote_average || "N/A"}

📅 Release:
${movie.release_date || movie.first_air_date || "Unknown"}

📝
${movie.overview || "No description available."}`;

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
                        `download_${movie.id}`
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
                    `download_${movie.id}`
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

bot.command("movie", async (ctx) => {

const parts = ctx.message.text.trim().split(/\s+/);

    if (parts.length < 2) {
        return ctx.reply(
            "❌ Usage:\n/movie movie name"
        );
    }

    const query = parts.slice(1).join(" ");

    try {

        await ctx.reply("🔎 Searching movie...");

        const res = await axios.get(
            "https://api.themoviedb.org/3/search/movie",
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
    return ctx.reply("❌ No movie found.");
}

if (results.length === 1) {
    return showMovie(ctx, results[0]);
}

return ctx.reply(
`🎬 *Multiple movies found*

Select the correct movie below:`,
{
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard(
        results.map(movie => [
            Markup.button.callback(
                `${movie.title || movie.name} (${(movie.release_date || movie.first_air_date || "").slice(0,4) || "----"})`,
                `movie_${movie.id}`
            )
        ])
    ).reply_markup
}
);

    } catch (err) {
        console.error(err);
        return ctx.reply("❌ Failed to search movie.");
    }

}); // <-- THIS closes bot.command("movie")

bot.action(/^movie_(.+)$/, async (ctx) => {

    try {

        const id = ctx.match[1];

        const res = await axios.get(
            `https://api.themoviedb.org/3/movie/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

        await ctx.answerCbQuery();

        return showMovie(ctx, res.data);

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
            `https://api.themoviedb.org/3/movie/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
                }
            }
        );

        const movie = res.data;
        const title = movie.title || movie.name;

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
                            `movie_${id}`
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
