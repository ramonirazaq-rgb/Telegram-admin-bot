module.exports = (bot, canModerate) => {

    bot.command("pin", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin to use this command.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❌ Reply to the message you want to pin."
                );
            }

            await ctx.telegram.pinChatMessage(
                ctx.chat.id,
                ctx.message.reply_to_message.message_id,
                {
                    disable_notification: false
                }
            );

            return ctx.reply("📌 Message pinned successfully.");

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to pin the message.\n\nMake sure I'm an admin with the 'Pin messages' permission."
            );

        }

    });

};
