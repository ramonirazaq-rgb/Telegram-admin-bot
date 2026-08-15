require("dotenv").config();

const spamTracker = new Map();
const issueWarning = require("./utils/warnings");
const {
    canModerate,
    canAccessPanel
} = require("./utils/permissions");
const { Telegraf } = require("telegraf");
const { Pool } = require("pg");
const bot = new Telegraf(process.env.BOT_TOKEN);

const OWNER_ID = Number(process.env.OWNER_ID);

// =========================
// DATABASE
// =========================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

async function initDatabase() {
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id BIGINT PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admins (
                user_id BIGINT PRIMARY KEY,
                role TEXT NOT NULL DEFAULT 'moderator',
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS warnings (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                chat_id BIGINT NOT NULL,
                reason TEXT,
                issued_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS filters (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    word TEXT NOT NULL,
    UNIQUE(chat_id, word)
);

            CREATE TABLE IF NOT EXISTS bans (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                chat_id BIGINT NOT NULL,
                reason TEXT,
                banned_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS mutes (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                chat_id BIGINT NOT NULL,
                reason TEXT,
                muted_by BIGINT,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

           CREATE TABLE IF NOT EXISTS group_settings (
    chat_id BIGINT PRIMARY KEY,
    anti_link BOOLEAN DEFAULT FALSE
);

ALTER TABLE group_settings
ADD COLUMN IF NOT EXISTS anti_spam BOOLEAN DEFAULT FALSE;

ALTER TABLE group_settings
ADD COLUMN IF NOT EXISTS welcome BOOLEAN DEFAULT FALSE;

ALTER TABLE group_settings
ADD COLUMN IF NOT EXISTS clean_service BOOLEAN DEFAULT FALSE;

ALTER TABLE group_settings
ADD COLUMN IF NOT EXISTS bad_words BOOLEAN DEFAULT FALSE;

            CREATE TABLE IF NOT EXISTS settings (
                chat_id BIGINT PRIMARY KEY,
                welcome_enabled BOOLEAN DEFAULT true,
                goodbye_enabled BOOLEAN DEFAULT true,
                anti_spam BOOLEAN DEFAULT true,
                anti_links BOOLEAN DEFAULT false,
                anti_flood BOOLEAN DEFAULT true,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS locks (
                chat_id BIGINT PRIMARY KEY,
                text_locked BOOLEAN DEFAULT false,
                links_locked BOOLEAN DEFAULT false,
                photos_locked BOOLEAN DEFAULT false,
                videos_locked BOOLEAN DEFAULT false,
                documents_locked BOOLEAN DEFAULT false,
                stickers_locked BOOLEAN DEFAULT false,
                gifs_locked BOOLEAN DEFAULT false,
                polls_locked BOOLEAN DEFAULT false
            );

            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT,
                user_id BIGINT,
                admin_id BIGINT,
                action TEXT NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auto_responses (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT NOT NULL,
                trigger TEXT NOT NULL,
                response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS scheduled_messages (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT NOT NULL,
                message TEXT NOT NULL,
                scheduled_for TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database tables ready");
    } finally {
        client.release();
    }
}

// =========================
// OWNER CHECK
// =========================

function isOwner(ctx) {
    return ctx.from && ctx.from.id === OWNER_ID;
}
async function isTelegramAdmin(ctx) {
    try {
        const member = await ctx.telegram.getChatMember(
            ctx.chat.id,
            ctx.from.id
        );

        return ["creator", "administrator"].includes(member.status);
    } catch (err) {
        console.error(err);
        return false;
    }
}

async function toggleSetting(chatId, column) {

    const result = await pool.query(
        `SELECT ${column}
         FROM group_settings
         WHERE chat_id=$1`,
        [chatId]
    );

    const current =
        result.rowCount > 0
            ? result.rows[0][column]
            : false;

    await pool.query(
        `INSERT INTO group_settings (chat_id, ${column})
         VALUES ($1, $2)
         ON CONFLICT (chat_id)
         DO UPDATE SET ${column} = EXCLUDED.${column}`,
        [
            chatId,
            !current
        ]
    );

    return !current;

}

const settingMap = {
    toggle_antilink: "anti_link",
    toggle_antispam: "anti_spam",
    toggle_welcome: "welcome",
    toggle_badwords: "bad_words",
    toggle_cleanservice: "clean_service"
};

async function buildSettingsKeyboard(chatId) {

    const result = await pool.query(
        `SELECT
            anti_link,
            anti_spam,
            welcome,
            bad_words,
            clean_service
         FROM group_settings
         WHERE chat_id=$1`,
        [chatId]
    );

    const settings = result.rowCount
        ? result.rows[0]
        : {
            anti_link: false,
            anti_spam: false,
            welcome: false,
            bad_words: false,
            clean_service: false
        };

    return {
        inline_keyboard: [
            [
                {
                    text: `${settings.anti_link ? "🟢" : "🔴"} Anti-Link`,
                    callback_data: "toggle_antilink"
                },
                {
                    text: `${settings.anti_spam ? "🟢" : "🔴"} Anti-Spam`,
                    callback_data: "toggle_antispam"
                }
            ],
            [
                {
                    text: `${settings.welcome ? "🟢" : "🔴"} Welcome`,
                    callback_data: "toggle_welcome"
                },
                {
                    text: `${settings.bad_words ? "🟢" : "🔴"} Bad Words`,
                    callback_data: "toggle_badwords"
                }
            ],
            [
                {
                    text: `${settings.clean_service ? "🟢" : "🔴"} Clean Service`,
                    callback_data: "toggle_cleanservice"
                }
            ],
            [
                {
                    text: "⬅️ Back",
                    callback_data: "panel_back"
                }
            ]
        ]
    };

}

async function startBot() {
}

// =========================
// START
// =========================

bot.start((ctx) => {
    ctx.reply(
        "🛡️ Admin bot is online!\n\n" +
        "Use /panel to open the admin panel."
    );
});

// =========================
// USER ID
// =========================

bot.command("id", (ctx) => {
    ctx.reply(`Your Telegram ID is: ${ctx.from.id}`);
});

// =========================
// OWNER TEST
// =========================

bot.command("owner", (ctx) => {
    if (!isOwner(ctx)) {
        return ctx.reply("⛔ You are not authorized.");
    }

    ctx.reply("👑 Owner access confirmed.");
});

// =========================
// ADMIN PANEL
// =========================

bot.command("panel", async (ctx) => {
    // Private chat: only the owner can access the panel
if (ctx.chat.type === "private") {
    if (ctx.from.id !== Number(process.env.OWNER_ID)) {
        return ctx.reply("⛔ Only the bot owner can use this panel.");
    }
} else {
    // Groups: only admins can access the panel
    if (!(await canModerate(ctx))) {
        return ctx.reply("⛔ Admin access required.");
    }
}

    await ctx.reply(
        "👑 *ADMIN CONTROL PANEL*\n\nChoose an option below:",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🛡 Moderation", callback_data: "panel_moderation" },
                        { text: "🔒 Locks", callback_data: "panel_locks" }
                    ],
                    [
                        { text: "👥 Members", callback_data: "panel_members" },
                        { text: "📢 Broadcast", callback_data: "panel_broadcast" }
                    ],
                    [
                        { text: "📊 Statistics", callback_data: "panel_stats" },
                        { text: "📝 Logs", callback_data: "panel_logs" }
                    ],
                    [
                        { text: "⚙️ Settings", callback_data: "panel_settings" },
                        { text: "❌ Close", callback_data: "panel_close" }
                    ]
                ]
            }
        }
    );
});

// =========================
// MODERATION PANEL
// =========================

bot.action("panel_moderation", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "🛡 *MODERATION*\n\nChoose a moderation tool:",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🔨 Ban", callback_data: "mod_ban" },
                        { text: "🔓 Unban", callback_data: "mod_unban" }
                    ],
                    [
                        { text: "🔇 Mute", callback_data: "mod_mute" },
                        { text: "🔊 Unmute", callback_data: "mod_unmute" }
                    ],
                    [
                        { text: "⚠️ Warnings", callback_data: "mod_warn" },
                        { text: "🧹 Purge", callback_data: "mod_purge" }
                    ],
                    [
                        { text: "⬅️ Back", callback_data: "panel_back" }
                    ]
                ]
            }
        }
    );
});

// =========================
// LOCKS PANEL
// =========================

bot.action("panel_locks", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "🔒 *GROUP LOCKS*\n\nChoose a restriction:",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "💬 Text", callback_data: "lock_text" },
                        { text: "🔗 Links", callback_data: "lock_links" }
                    ],
                    [
                        { text: "📷 Photos", callback_data: "lock_photos" },
                        { text: "🎥 Videos", callback_data: "lock_videos" }
                    ],
                    [
                        { text: "📄 Documents", callback_data: "lock_documents" },
                        { text: "🎭 Stickers", callback_data: "lock_stickers" }
                    ],
                    [
                        { text: "🎞 GIFs", callback_data: "lock_gifs" },
                        { text: "📊 Polls", callback_data: "lock_polls" }
                    ],
                    [
                        { text: "🔓 Open Group", callback_data: "lock_open" },
                        { text: "🔒 Close Group", callback_data: "lock_close" }
                    ],
                    [
                        { text: "⬅️ Back", callback_data: "panel_back" }
                    ]
                ]
            }
        }
    );
});

bot.action("lock_close", async (ctx) => {

    if (!(await canAccessPanel(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

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
            can_add_web_page_previews: false
        }
    );

    await ctx.editMessageText(
`🔒 *GROUP CLOSED*

👥 Group: ${ctx.chat.title}
👮 Closed by: ${ctx.from.first_name}
🆔 Admin ID: ${ctx.from.id}
🕒 Time: ${new Date().toUTCString()}

🚫 Members can no longer send messages.
Only administrators may chat until the group is reopened.`,
        {
            parse_mode: "Markdown"
        }
    );

});

bot.action("lock_open", async (ctx) => {

    if (!(await canAccessPanel(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

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
            can_add_web_page_previews: true
        }
    );

    await ctx.editMessageText(
`🔓 *GROUP REOPENED*

👥 Group: ${ctx.chat.title}
👮 Opened by: ${ctx.from.first_name}
🆔 Admin ID: ${ctx.from.id}
🕒 Time: ${new Date().toUTCString()}

✅ Members can now send messages again.`,
        {
            parse_mode: "Markdown"
        }
    );

});

// =========================
// MEMBERS
// =========================

bot.action("panel_members", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "👥 *MEMBERS*\n\n" +
        "Member management will be connected to the moderation engine.",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⬅️ Back", callback_data: "panel_back" }]
                ]
            }
        }
    );
});

// =========================
// STATISTICS
// =========================

bot.action("panel_stats", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM warnings) AS warnings,
                (SELECT COUNT(*) FROM bans) AS bans,
                (SELECT COUNT(*) FROM mutes) AS mutes,
                (SELECT COUNT(*) FROM logs) AS logs
        `);

        const stats = result.rows[0];

        await ctx.editMessageText(
            "📊 *BOT STATISTICS*\n\n" +
            `👥 Users: ${stats.users}\n` +
            `⚠️ Warnings: ${stats.warnings}\n` +
            `🔨 Bans: ${stats.bans}\n` +
            `🔇 Mutes: ${stats.mutes}\n` +
            `📝 Logs: ${stats.logs}`,
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⬅️ Back", callback_data: "panel_back" }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error(error);
        ctx.reply("❌ Could not retrieve statistics.");
    }
});

// =========================
// LOGS
// =========================

bot.action("panel_logs", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "📝 *ADMIN LOGS*\n\n" +
        "All moderation actions will be recorded here.",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⬅️ Back", callback_data: "panel_back" }]
                ]
            }
        }
    );
});

// =========================
// SETTINGS
// =========================

bot.action("panel_settings", async (ctx) => {

    if (!(await canAccessPanel(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.editMessageText(
    "⚙️ *GROUP SETTINGS*\n\nTap a button to enable or disable a feature.",
    {
        parse_mode: "Markdown",
        reply_markup: await buildSettingsKeyboard(ctx.chat.id)
    }
);

});

bot.action(/^toggle_/, async (ctx) => {

    if (!(await canAccessPanel(ctx)))
        return ctx.answerCbQuery("⛔ Unauthorized.");

    const action = ctx.callbackQuery.data;
    const column = settingMap[action];

    if (!column)
        return ctx.answerCbQuery("❌ Unknown setting.");

    await toggleSetting(
        ctx.chat.id,
        column
    );

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "⚙️ *GROUP SETTINGS*\n\nTap a button to enable or disable a feature.",
        {
            parse_mode: "Markdown",
            reply_markup: await buildSettingsKeyboard(ctx.chat.id)
        }
    );

});

// =========================
// BROADCAST
// =========================

bot.action("panel_broadcast", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.reply(
        "📢 Broadcast system will be connected to the database and channel controls next."
    );
});

// =========================
// CLOSE PANEL
// =========================

bot.action("panel_close", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();
    await ctx.deleteMessage();
});

// =========================
// BACK
// =========================

bot.action("panel_back", async (ctx) => {
    if (!(await canAccessPanel(ctx)))
    return ctx.answerCbQuery("⛔ Unauthorized."); 

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "👑 *ADMIN CONTROL PANEL*\n\nChoose an option below:",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🛡 Moderation", callback_data: "panel_moderation" },
                        { text: "🔒 Locks", callback_data: "panel_locks" }
                    ],
                    [
                        { text: "👥 Members", callback_data: "panel_members" },
                        { text: "📢 Broadcast", callback_data: "panel_broadcast" }
                    ],
                    [
                        { text: "📊 Statistics", callback_data: "panel_stats" },
                        { text: "📝 Logs", callback_data: "panel_logs" }
                    ],
                    [
                        { text: "⚙️ Settings", callback_data: "panel_settings" },
                        { text: "❌ Close", callback_data: "panel_close" }
                    ]
                ]
            }
        }
    );
});

// =========================
// ERRORS
// =========================

bot.catch((err) => {
    console.error("BOT ERROR:", err);
});

// =========================
// START
// =========================

async function startBot() {
    try {
        await initDatabase();

require("./commands/ban")(bot, pool, canModerate, isOwner);
require("./commands/kick")(bot, pool, canModerate, isOwner);
require("./commands/mute")(bot, pool, canModerate, isOwner);
require("./commands/warn")(bot, pool, canModerate, isOwner);
require("./commands/group")(bot, pool, canModerate, isOwner);
require("./commands/antilink")(bot, pool, canModerate, isOwner);
require("./commands/antispam")(bot, pool, canModerate, isOwner);
require("./commands/welcome")(bot, pool, canModerate, isOwner);
require("./commands/cleanservice")(bot, pool, canModerate, isOwner);
require("./commands/filter")(bot, pool, canModerate, isOwner);

bot.on("message", async (ctx, next) => {

    try {

        // Ignore private chats
        if (ctx.chat.type === "private")
            return next();

        // Ignore messages without text
        if (!ctx.message.text)
            return next();

        // Check if Anti-Link is enabled
        const settings = await pool.query(
            `SELECT anti_link
             FROM group_settings
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        if (
            settings.rowCount === 0 ||
            !settings.rows[0].anti_link
        ) {
            return next();
        }

        // Ignore admins
        const member = await ctx.telegram.getChatMember(
            ctx.chat.id,
            ctx.from.id
        );

        if (
            member.status === "administrator" ||
            member.status === "creator"
        ) {
            return next();
        }

        // Detect links
        const linkRegex =
            /(https?:\/\/|t\.me\/|www\.|telegram\.me\/)/i;

        if (!linkRegex.test(ctx.message.text))
            return next();
        // Delete the message
        await ctx.deleteMessage();

const result = await issueWarning(
    ctx,
    pool,
    ctx.from,
    "Posted a prohibited link",
    0
);

        if (result.autoMuted) {

    return ctx.reply(
`🔇 *USER AUTOMATICALLY MUTED*

👤 User: ${ctx.from.first_name}
⚠️ Reason: Repeated link sharing
⏱ Duration: 1 Hour`,
        {
            parse_mode: "Markdown"
        }
    );

}

await ctx.reply(
`⚠️ *LINK REMOVED*

👤 User: ${ctx.from.first_name}
📊 Warnings: ${result.totalWarnings}/3

🚫 Links are not allowed in this group.`,
    {
        parse_mode: "Markdown"
    }
);

    } catch (err) {

        console.error(err);

    }

    return next();

});

bot.on("message", async (ctx, next) => {

    try {

        if (ctx.chat.type === "private")
            return next();

        const settings = await pool.query(
            `SELECT anti_spam
             FROM group_settings
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        if (
            settings.rowCount === 0 ||
            !settings.rows[0].anti_spam
        ) {
            return next();
        }

        const member = await ctx.telegram.getChatMember(
            ctx.chat.id,
            ctx.from.id
        );

        if (
            member.status === "administrator" ||
            member.status === "creator"
        ) {
            return next();
        }

        const key = `${ctx.chat.id}:${ctx.from.id}`;
        const now = Date.now();
        if (!spamTracker.has(key)) {
            spamTracker.set(key, []);
        }

        const messages = spamTracker.get(key);

        // Keep only messages from the last 8 seconds
        const recent = messages.filter(
            time => now - time < 8000
        );

        recent.push(now);

        spamTracker.set(key, recent);

        // 5 or more messages in 8 seconds = spam
        if (recent.length >= 5) {

            await ctx.deleteMessage().catch(() => {});

            const result = await issueWarning(
                ctx,
                pool,
                ctx.from,
                "Spam / Flood detected",
                0
            );

            spamTracker.delete(key);

            if (result.autoMuted) {

                return ctx.reply(
`🔇 *USER AUTOMATICALLY MUTED*

👤 User: ${ctx.from.first_name}
⚠️ Reason: Spam / Flood
⏱ Duration: 1 Hour`,
                    {
                        parse_mode: "Markdown"
                    }
                );

            }

            return ctx.reply(
`🚨 *SPAM DETECTED*

👤 User: ${ctx.from.first_name}
📊 Warnings: ${result.totalWarnings}/3

⚠️ Please stop flooding the chat.`,
                {
                    parse_mode: "Markdown"
                }
            );

        }

    } catch (err) {

        console.error(err);

    }

    return next();

});

bot.on("new_chat_members", async (ctx) => {

    try {

        const settings = await pool.query(
            `SELECT welcome
             FROM group_settings
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        if (
            settings.rowCount === 0 ||
            !settings.rows[0].welcome
        ) {
            return;
        }

        for (const member of ctx.message.new_chat_members) {

            const count = await ctx.getChatMembersCount();
            await ctx.replyWithMarkdown(
`👋 *WELCOME!*

🎉 Welcome, [${member.first_name}](tg://user?id=${member.id})!

👥 Group: *${ctx.chat.title}*
📊 Members: *${count}*
🕒 Joined: *${new Date().toUTCString()}*

📖 Please read the group rules and enjoy your stay!`
            );

        }

    } catch (err) {

        console.error(err);

    }

});

bot.on("left_chat_member", async (ctx) => {

    try {

        const settings = await pool.query(
            `SELECT welcome
             FROM group_settings
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        if (
            settings.rowCount === 0 ||
            !settings.rows[0].welcome
        ) {
            return;
        }

        const member = ctx.message.left_chat_member;

        const count = await ctx.getChatMembersCount();
        await ctx.replyWithMarkdown(
`👋 *MEMBER LEFT*

👤 User: ${member.first_name}
👥 Group: *${ctx.chat.title}*
📊 Members: *${count}*
🕒 Time: *${new Date().toUTCString()}*

👋 We hope to see you again!`
        );

    } catch (err) {

        console.error(err);

    }

});

bot.on("message", async (ctx, next) => {

    try {

        if (ctx.chat.type === "private")
            return next();

        const settings = await pool.query(
            `SELECT clean_service
             FROM group_settings
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        if (
            settings.rowCount === 0 ||
            !settings.rows[0].clean_service
        ) {
            return next();
        }

        const msg = ctx.message;
        if (
            msg.new_chat_members ||
            msg.left_chat_member ||
            msg.new_chat_title ||
            msg.new_chat_photo ||
            msg.delete_chat_photo ||
            msg.group_chat_created ||
            msg.supergroup_chat_created ||
            msg.channel_chat_created ||
            msg.pinned_message
        ) {

            await ctx.deleteMessage().catch(() => {});

        }

    } catch (err) {

        console.error(err);

    }

    return next();

});

bot.on("message", async (ctx, next) => {

    try {

        if (ctx.chat.type === "private")
            return next();

        if (!ctx.message.text)
            return next();

        const settings = await pool.query(
            `SELECT bad_words
             FROM group_settings
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        if (
            settings.rowCount === 0 ||
            !settings.rows[0].bad_words
        ) {
            return next();
        }

        const member = await ctx.telegram.getChatMember(
            ctx.chat.id,
            ctx.from.id
        );

        if (
            member.status === "administrator" ||
            member.status === "creator"
        ) {
            return next();
        }

        const result = await pool.query(
            `SELECT word
             FROM filters
             WHERE chat_id=$1`,
            [ctx.chat.id]
        );

        const text = ctx.message.text.toLowerCase();
        for (const row of result.rows) {

            // Escape regex special characters in the blocked word
            const escaped = row.word.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            // Match whole words (case-insensitive)
            const regex = new RegExp(
                `\\b${escaped}\\b`,
                "i"
            );

            if (!regex.test(text)) {
                continue;
            }

            await ctx.deleteMessage().catch(() => {});

            const warning = await issueWarning(
                ctx,
                pool,
                ctx.from,
                `Used blocked word: "${row.word}"`,
                0
            );

            if (warning.autoMuted) {

                return ctx.reply(
`🔇 *USER AUTOMATICALLY MUTED*

👤 User: ${ctx.from.first_name}
🤬 Reason: Used a blocked word
⏱ Duration: 1 Hour`,
                    {
                        parse_mode: "Markdown"
                    }
                );

            }

            return ctx.reply(
`🚫 *BLOCKED WORD DETECTED*

👤 User: ${ctx.from.first_name}
⚠️ Word: ${row.word}
📊 Warnings: ${warning.totalWarnings}/3

Please keep the chat respectful.`,
                {
                    parse_mode: "Markdown"
                }
            );

        }

    } catch (err) {

        console.error(err);

    }

    return next();

});

        await bot.launch();

        console.log("🛡️ Admin bot connected to Telegram");
    } catch (error) {
        console.error("❌ STARTUP ERROR:", error);
    }
}

startBot();

// =========================
// SAFE SHUTDOWN
// =========================

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
