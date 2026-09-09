const axios = require("axios");

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
            "https://api.themoviedb.org/3/search/multi",
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

        const movie = res.data.results[0];

        const poster = movie.poster_path
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : null;

        const caption =
`🎬 *${movie.title || movie.name}*

⭐ Rating: ${movie.vote_average || "N/A"}

📅 Release:
${movie.release_date || movie.first_air_date || "Unknown"}

📝 ${movie.overview || "No description available."}`;

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

    } catch (err) {

        console.error(err);

        ctx.reply("❌ Failed to search movie.");

    }

});

};
