module.exports = (bot, pool, canModerate, isOwner) => {

    // =========================
    // CLOSE GROUP
    // =========================

    bot.command("close", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (ctx.chat.type === "private") {
                return ctx.reply("❌ This command only works in groups.");
            }
            // Lock the group
            await ctx.telegram.setChatPermissions(
                ctx.chat.id,
                {
                    can_send_messages: false,
                    can_send_audios: false,
                    can_send_documents: false,
                    can_send_photos: false,
                    can_send_videos: false,
                    can_send_video_notes: false,
                    can_send_voice_notes: false,
                    can_send_polls: false,
                    can_send_other_messages: false,
                    can_add_web_page_previews: false,
                    can_change_info: false,
                    can_invite_users: false,
                    can_pin_messages: false
                }
            );

            // Save to logs
            await pool.query(
                `INSERT INTO logs
                (chat_id,user_id,admin_id,action)
                VALUES($1,$2,$3,$4)`,
                [
                    ctx.chat.id,
                    ctx.from.id,
                    ctx.from.id,
                    "GROUP_CLOSED"
                ]
            );

            await ctx.reply(
`🔒 *GROUP CLOSED*

👥 Group: ${ctx.chat.title}
👮 Closed by: ${ctx.from.first_name}
🆔 Admin ID: ${ctx.from.id}
🕒 Time: ${new Date().toUTCString()}

🚫 Members can no longer send messages.
Only administrators may chat until the group is reopened.`,
{
    parse_mode: "Markdown"
});

        } catch (err) {

            console.error(err);

            return ctx.reply("❌ Failed to close the group.");

        }

    });
    // =========================
    // OPEN GROUP
    // =========================

    bot.command("open", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin.");
            }

            if (ctx.chat.type === "private") {
                return ctx.reply("❌ This command only works in groups.");
            }

            // Restore group permissions
            await ctx.telegram.setChatPermissions(
                ctx.chat.id,
                {
                    can_send_messages: true,
                    can_send_audios: true,
                    can_send_documents: true,
                    can_send_photos: true,
                    can_send_videos: true,
                    can_send_video_notes: true,
                    can_send_voice_notes: true,
                    can_send_polls: true,
                    can_send_other_messages: true,
                    can_add_web_page_previews: true,
                    can_change_info: false,
                    can_invite_users: true,
                    can_pin_messages: false
                }
            );

            // Save to logs
            await pool.query(
                `INSERT INTO logs
                (chat_id,user_id,admin_id,action)
                VALUES($1,$2,$3,$4)`,
                [
                    ctx.chat.id,
                    ctx.from.id,
                    ctx.from.id,
                    "GROUP_OPENED"
                ]
            );

            await ctx.reply(
`🔓 *GROUP REOPENED*

👥 Group: ${ctx.chat.title}
👮 Opened by: ${ctx.from.first_name}
🆔 Admin ID: ${ctx.from.id}
🕒 Time: ${new Date().toUTCString()}

✅ Members can now send messages again.`,
{
    parse_mode: "Markdown"
});

        } catch (err) {

            console.error(err);

            return ctx.reply("❌ Failed to open the group.");

        }

    });

bot.action("close_group", async (ctx) => {

    try {

        if (!(await canModerate(ctx)))
            return ctx.answerCbQuery("⛔ Unauthorized.");

        await ctx.telegram.setChatPermissions(
            ctx.chat.id,
            {
                can_send_messages: false,
                can_send_audios: false,
                can_send_documents: false,
                can_send_photos: false,
                can_send_videos: false,
                can_send_video_notes: false,
                can_send_voice_notes: false,
                can_send_polls: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false,
                can_change_info: false,
                can_invite_users: false,
                can_pin_messages: false
            }
        );

        await ctx.answerCbQuery("🔒 Group Closed");

    } catch (err) {

        console.error(err);

        await ctx.answerCbQuery("❌ Failed");

    }

});

bot.action("open_group", async (ctx) => {

    try {

        if (!(await canModerate(ctx)))
            return ctx.answerCbQuery("⛔ Unauthorized.");

        await ctx.telegram.setChatPermissions(
            ctx.chat.id,
            {
                can_send_messages: true,
                can_send_audios: true,
                can_send_documents: true,
                can_send_photos: true,
                can_send_videos: true,
                can_send_video_notes: true,
                can_send_voice_notes: true,
                can_send_polls: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
                can_change_info: false,
                can_invite_users: true,
                can_pin_messages: false
            }
        );

        await ctx.answerCbQuery("🔓 Group Opened");

    } catch (err) {

        console.error(err);

        await ctx.answerCbQuery("❌ Failed");

    }

});

};
