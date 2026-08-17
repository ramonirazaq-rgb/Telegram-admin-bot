module.exports = (bot, pool, canModerate) => {

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

};
