const axios = require("axios");
const { Markup } = require("telegraf");

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

    if (poster) {
        return ctx.replyWithPhoto(
            poster,
            {
                caption,
                parse_mode: "Markdown"
            }
        );
    }

    return ctx.reply(
        caption,
        {
            parse_mode: "Markdown"
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

const results = res.data.results
    .filter(r => r.media_type === "movie")
    .slice(0, 5);

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

    } catch (err) {

console.error(err.response?.data || err.message);

ctx.reply(
    `❌ ${err.response?.data?.status_message || err.message}`
);

    }

});

};
