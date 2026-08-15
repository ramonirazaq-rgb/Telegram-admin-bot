module.exports = (bot, pool, canModerate) => {

    bot.command("userinfo", async (ctx) => {

        try {

            if (!(await canModerate(ctx))) {
                return ctx.reply("⛔ You must be a Telegram admin to use this command.");
            }

            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    "❌ Reply to a user's message with /userinfo."
                );
            }

            const user = ctx.message.reply_to_message.from;

            const warnings = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM warnings
                 WHERE chat_id=$1
                 AND user_id=$2`,
                [
                    ctx.chat.id,
                    user.id
                ]
            );

            const mutes = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM mutes
                 WHERE chat_id=$1
                 AND user_id=$2`,
                [
                    ctx.chat.id,
                    user.id
                ]
            );

            const bans = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM bans
                 WHERE chat_id=$1
                 AND user_id=$2`,
                [
                    ctx.chat.id,
                    user.id
                ]
            );

            const userInfo = await pool.query(
                `SELECT created_at
                 FROM users
                 WHERE user_id=$1`,
                [
                    user.id
                ]
            );

            const firstSeen =
                userInfo.rowCount
                    ? new Date(userInfo.rows[0].created_at).toLocaleString()
                    : "Unknown";

            return ctx.reply(
`👤 *USER INFORMATION*

🆔 ID: \`${user.id}\`
👤 Name: ${user.first_name}${user.last_name ? " " + user.last_name : ""}
📛 Username: ${user.username ? "@" + user.username : "None"}

⚠️ Total Warnings: ${warnings.rows[0].total}
🔇 Total Mutes: ${mutes.rows[0].total}
🚫 Total Bans: ${bans.rows[0].total}

📅 First Seen: ${firstSeen}`,
                {
                    parse_mode: "Markdown"
                }
            );

        } catch (err) {

            console.error(err);
            return ctx.reply("❌ Failed to fetch user information.");

        }

    });

};
