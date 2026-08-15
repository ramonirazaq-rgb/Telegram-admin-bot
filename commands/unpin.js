module.exports = (bot, canModerate) => {

    bot.command("unpin", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply(
                    "⛔ You must be a Telegram admin to use this command."
                );
            }

            await ctx.telegram.unpinChatMessage(
                ctx.chat.id
            );

            return ctx.reply(
                "📌 The current pinned message has been unpinned."
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to unpin the current message.\n\nMake sure I'm an admin with the 'Pin messages' permission."
            );

        }

    });

};
