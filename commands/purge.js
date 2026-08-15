module.exports = (bot, canModerate) => {

    bot.command("purge", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply(
                    "⛔ You must be a Telegram admin to use this command."
                );
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❌ Reply to a message with:\n/purge <number>"
                );
            }

            const args = ctx.message.text.split(" ");

            const amount = parseInt(args[1]);

            if (isNaN(amount) || amount < 1 || amount > 100) {
                return ctx.reply(
                    "❌ Choose a number between 1 and 100."
                );
            }

            const start = ctx.message.reply_to_message.message_id;

            let deleted = 0;

            for (let i = 0; i < amount; i++) {

                try {

                    await ctx.telegram.deleteMessage(
                        ctx.chat.id,
                        start + i
                    );

                    deleted++;

                } catch (_) {}

            }

            await ctx.deleteMessage().catch(() => {});

            return ctx.reply(
                `🧹 Successfully deleted ${deleted} message(s).`
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to purge messages."
            );

        }

    });

};
