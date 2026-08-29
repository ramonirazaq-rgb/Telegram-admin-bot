module.exports = (bot, pool, canModerate, canAccessPanel) => {
const pendingSchedules = new Map();

    bot.command("schedule", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply(
                    "⛔ You must be a Telegram admin to use this command."
                );
            }

            const args = ctx.message.text.split(" ").slice(1);

            if (!args.length) {
                return ctx.reply(
`Usage:

/schedule HH:MM

or

/schedule YYYY-MM-DD HH:MM`
                );
            }

            let scheduledAt;

            // Format: HH:MM
            if (args.length === 1) {

                const match = args[0].match(/^(\d{2}):(\d{2})$/);

                if (!match)
                    return ctx.reply("❌ Invalid time format.");

                const now = new Date();

                scheduledAt = new Date(now);

                scheduledAt.setHours(
                    Number(match[1]),
                    Number(match[2]),
                    0,
                    0
                );

// Convert WAT (UTC+1) to UTC before saving
scheduledAt.setHours(scheduledAt.getHours() - 1);

                // If today's time has already passed,
                // schedule for tomorrow.
                if (scheduledAt <= now)
                    scheduledAt.setDate(
                        scheduledAt.getDate() + 1
                    );

            }

            // Format: YYYY-MM-DD HH:MM
            else if (args.length === 2) {

                scheduledAt = new Date(
                    `${args[0]}T${args[1]}:00`
                );

                if (isNaN(scheduledAt.getTime()))
                    return ctx.reply(
                        "❌ Invalid date/time."
                    );

                if (scheduledAt <= new Date())
                    return ctx.reply(
                        "❌ Time must be in the future."
                    );

            }

            else {

                return ctx.reply(
`Usage:

/schedule HH:MM

or

/ schedule YYYY-MM-DD HH:MM`
                );

            }

            await pool.query(
                `INSERT INTO schedule_state
                 (chat_id, admin_id, scheduled_at)
                 VALUES ($1,$2,$3)
                 ON CONFLICT(chat_id)
                 DO UPDATE SET
                    admin_id=EXCLUDED.admin_id,
                    scheduled_at=EXCLUDED.scheduled_at`,
                [
                    ctx.chat.id,
                    ctx.from.id,
                    scheduledAt
                ]
            );

            return ctx.reply(
`📅 Scheduled for

${scheduledAt.toLocaleString()}

Now send the message to schedule.

Type /cancel to cancel.`
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to create schedule."
            );

        }

    });

bot.command("schedulelist", async (ctx) => {

    if (!(await canModerate(ctx)))
        return;

    const result = await pool.query(
        `SELECT id, message_type, scheduled_at
         FROM scheduled_messages
         WHERE chat_id=$1
         AND sent=FALSE
         ORDER BY scheduled_at`,
        [ctx.chat.id]
    );

    if (!result.rowCount)
        return ctx.reply("📭 No scheduled messages.");

    let text = "📅 *Scheduled Messages*\n\n";

    result.rows.forEach((row) => {
        text +=
`🆔 ${row.id}
📂 ${row.message_type}
🕒 ${row.scheduled_at.toLocaleString()}

`;
    });

    text += `Total: ${result.rowCount}`;

    return ctx.reply(text, {
        parse_mode: "Markdown"
    });

});

bot.action("panel_schedule", async (ctx) => {

    if (!(await canAccessPanel(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    return ctx.editMessageText(
`📅 *SCHEDULE MANAGER*

Choose an option:`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "➕ Schedule Message",
                            callback_data: "schedule_new"
                        },
                        {
                            text: "📋 Scheduled List",
                            callback_data: "schedule_list"
                        }
                    ],
                    [
                        {
                            text: "⬅️ Back",
                            callback_data: "panel_back"
                        }
                    ]
                ]
            }
        }
    );

});

bot.action("schedule_list", async (ctx) => {
    if (!(await canModerate(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    try {
        const result = await pool.query(
            `SELECT id, message_type, scheduled_at
             FROM scheduled_messages
             WHERE chat_id = $1
             AND sent = FALSE
             ORDER BY scheduled_at ASC`,
            [ctx.chat.id]
        );

        if (!result.rowCount) {
            return ctx.editMessageText(
                "📋 *SCHEDULED MESSAGES*\n\nNo scheduled messages found.",
                {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "⬅️ Back",
                                    callback_data: "panel_schedule"
                                }
                            ]
                        ]
                    }
                }
            );
        }

        let text = "📋 *SCHEDULED MESSAGES*\n\n";

        result.rows.forEach((row, index) => {
            text +=
`*${index + 1}.*
📅 ${new Date(row.scheduled_at).toLocaleDateString()}
🕒 ${new Date(row.scheduled_at).toLocaleTimeString()}
📦 ${row.message_type}
🆔 ${row.id}

──────────────────

`;
        });

        text += `Total: *${result.rowCount}*`;

        await ctx.editMessageText(text, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "⬅️ Back",
                            callback_data: "panel_schedule"
                        }
                    ]
                ]
            }
        });

    } catch (err) {
        console.error(err);

        ctx.reply("❌ Failed to load scheduled messages.");
    }
});

bot.action("schedule_new", async (ctx) => {

    if (!(await canModerate(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    pendingSchedules.set(ctx.from.id, {
        chatId: ctx.chat.id,
        step: "message"
    });

    await ctx.editMessageText(
`📅 *NEW SCHEDULE*

Send the message you want to schedule.

Supported:

📝 Text
🖼 Photo
🎥 Video
📄 Document

Type /cancel to cancel.`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "⬅️ Back",
                            callback_data: "panel_schedule"
                        }
                    ]
                ]
            }
        }
    );

});

bot.on("message", async (ctx, next) => {

    const state = pendingSchedules.get(ctx.from.id);

    if (!state)
        return next();

    // STEP 1: Waiting for the message
    if (state.step === "message") {

        state.message = ctx.message;
        state.step = "time";

        pendingSchedules.set(ctx.from.id, state);

        return ctx.reply(
`📅 *MESSAGE SAVED*

Now send the schedule time.

Examples:

18:30

or

2026-09-15 18:30`,
            {
                parse_mode: "Markdown"
            }
        );
    }

    // STEP 2: Waiting for the time
    if (state.step === "time") {

        try {

            const input = ctx.message.text.trim();

            let scheduledAt;

            const now = new Date();

            // HH:MM
            let match = input.match(/^(\d{1,2}):(\d{2})$/);

            if (match) {

                scheduledAt = new Date(now);

                scheduledAt.setHours(
                    Number(match[1]),
                    Number(match[2]),
                    0,
                    0
                );

                // Your GMT adjustment
                scheduledAt.setHours(
                    scheduledAt.getHours() - 1
                );

                if (scheduledAt <= now)
                    scheduledAt.setDate(
                        scheduledAt.getDate() + 1
                    );

            } else {

                // YYYY-MM-DD HH:MM
                scheduledAt = new Date(input);

                if (isNaN(scheduledAt))
                    return ctx.reply(
                        "❌ Invalid date/time format."
                    );

            }

            const msg = state.message;

            let messageType = "text";
            let content = "";
            let fileId = null;
            let caption = null;

            if (msg.text) {

                content = msg.text;

            } else if (msg.photo) {

                messageType = "photo";
                fileId =
                    msg.photo[msg.photo.length - 1].file_id;
                caption = msg.caption || "";

            } else if (msg.video) {

                messageType = "video";
                fileId = msg.video.file_id;
                caption = msg.caption || "";

            } else if (msg.document) {

                messageType = "document";
                fileId = msg.document.file_id;
                caption = msg.caption || "";

            } else {

                return ctx.reply(
                    "❌ Unsupported message type."
                );

            }

            await pool.query(
                `INSERT INTO scheduled_messages
                (
                    chat_id,
                    admin_id,
                    message_type,
                    content,
                    file_id,
                    caption,
                    scheduled_at
                )
                VALUES
                ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    state.chatId,
                    ctx.from.id,
                    messageType,
                    content,
                    fileId,
                    caption,
                    scheduledAt
                ]
            );

            pendingSchedules.delete(ctx.from.id);

            return ctx.reply(
`✅ *MESSAGE SCHEDULED*

📅 ${scheduledAt.toLocaleString()}

Your message will be sent automatically.`,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);

            return ctx.reply(
                "❌ Failed to schedule message."
            );

        }

    }

    return next();

});

};
