require("dotenv").config();

const spamTracker = new Map();
const issueWarning = require("./utils/warnings");
const {
    canModerate,
    canAccessPanel
} = require("./utils/permissions");
const logAction = require("./utils/logger");
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

CREATE TABLE IF NOT EXISTS broadcast_state (
    chat_id BIGINT PRIMARY KEY,
    admin_id BIGINT NOT NULL,
    mode TEXT NOT NULL
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

ALTER TABLE locks
ADD COLUMN IF NOT EXISTS group_closed BOOLEAN DEFAULT false;

            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT,
                user_id BIGINT,
                admin_id BIGINT,
                action TEXT NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS scheduled_messages (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    admin_id BIGINT NOT NULL,
    message_type TEXT NOT NULL,
    content TEXT,
    file_id TEXT,
    caption TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

            CREATE TABLE IF NOT EXISTS auto_responses (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT NOT NULL,
                trigger TEXT NOT NULL,
                response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS schedule_state (
    chat_id BIGINT PRIMARY KEY,
    admin_id BIGINT NOT NULL,
    scheduled_at TIMESTAMP NOT NULL
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

async function toggleLock(chatId, column) {

    const result = await pool.query(
        `SELECT ${column}
         FROM locks
         WHERE chat_id=$1`,
        [chatId]
    );

    const current =
        result.rowCount
            ? result.rows[0][column]
            : false;

    await pool.query(
        `INSERT INTO locks (chat_id, ${column})
         VALUES ($1, $2)
         ON CONFLICT (chat_id)
         DO UPDATE SET ${column}=EXCLUDED.${column}`,
        [
            chatId,
            !current
        ]
    );

    return !current;

}

const lockMap = {
    lock_text: "text_locked",
    lock_links: "links_locked",
    lock_photos: "photos_locked",
    lock_videos: "videos_locked",
    lock_documents: "documents_locked",
    lock_stickers: "stickers_locked",
    lock_gifs: "gifs_locked",
    lock_polls: "polls_locked"
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

async function buildLocksKeyboard(chatId) {

    const result = await pool.query(
        `SELECT
            text_locked,
            links_locked,
            photos_locked,
            videos_locked,
            documents_locked,
            stickers_locked,
            gifs_locked,
            polls_locked,
            group_closed
         FROM locks
         WHERE chat_id=$1`,
        [chatId]
    );

    const locks = result.rowCount
        ? result.rows[0]
        : {
            text_locked: false,
            links_locked: false,
            photos_locked: false,
            videos_locked: false,
            documents_locked: false,
            stickers_locked: false,
            gifs_locked: false,
            polls_locked: false,
            group_closed: false
        };

    return {
        inline_keyboard: [
            [
                {
                    text: `${locks.text_locked ? "🔒" : "🔓"} Text`,
                    callback_data: "lock_text"
                },
                {
                    text: `${locks.links_locked ? "🔒" : "🔓"} Links`,
                    callback_data: "lock_links"
                }
            ],
            [
                {
                    text: `${locks.photos_locked ? "🔒" : "🔓"} Photos`,
                    callback_data: "lock_photos"
                },
                {
                    text: `${locks.videos_locked ? "🔒" : "🔓"} Videos`,
                    callback_data: "lock_videos"
                }
            ],
            [
                {
                    text: `${locks.documents_locked ? "🔒" : "🔓"} Documents`,
                    callback_data: "lock_documents"
                },
                {
                    text: `${locks.stickers_locked ? "🔒" : "🔓"} Stickers`,
                    callback_data: "lock_stickers"
                }
            ],
            [
                {
                    text: `${locks.gifs_locked ? "🔒" : "🔓"} GIFs`,
                    callback_data: "lock_gifs"
                },
                {
                    text: `${locks.polls_locked ? "🔒" : "🔓"} Polls`,
                    callback_data: "lock_polls"
                }
            ],
            [
    locks.group_closed
        ? {
            text: "🔓 Open Group",
            callback_data: "open_group"
        }
        : {
            text: "🔒 Close Group",
            callback_data: "close_group"
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
        reply_markup: await buildLocksKeyboard(ctx.chat.id)
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

await pool.query(
    `INSERT INTO locks (chat_id, group_closed)
     VALUES ($1, true)
     ON CONFLICT (chat_id)
     DO UPDATE SET group_closed=true`,
    [ctx.chat.id]
);

        await ctx.answerCbQuery();

await ctx.editMessageReplyMarkup(
    await buildLocksKeyboard(ctx.chat.id)
);

await ctx.reply("🔒 *Group has been closed.*\n\nOnly administrators can send messages.", {
    parse_mode: "Markdown"
});

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

await pool.query(
    `INSERT INTO locks (chat_id, group_closed)
     VALUES ($1, false)
     ON CONFLICT (chat_id)
     DO UPDATE SET group_closed=false`,
    [ctx.chat.id]
);

        await ctx.answerCbQuery();

await ctx.editMessageReplyMarkup(
    await buildLocksKeyboard(ctx.chat.id)
);

await ctx.reply("🔓 *Group has been opened.*\n\nAll members can now send messages.", {
    parse_mode: "Markdown"
});

    } catch (err) {

        console.error(err);

        await ctx.answerCbQuery("❌ Failed");

    }

});

Object.keys(lockMap).forEach((action) => {

    bot.action(action, async (ctx) => {

        if (!(await canAccessPanel(ctx)))
            return ctx.answerCbQuery("⛔ Unauthorized.");

        const enabled = await toggleLock(
            ctx.chat.id,
            lockMap[action]
        );

        await ctx.answerCbQuery(
            enabled
                ? "🔒 Locked"
                : "🔓 Unlocked"
        );

        return ctx.editMessageReplyMarkup(
            await buildLocksKeyboard(ctx.chat.id)
        );

    });

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

    const warnings = await pool.query(
        `SELECT COUNT(*) AS total
         FROM warnings
         WHERE chat_id=$1`,
        [ctx.chat.id]
    );

    const mutes = await pool.query(
        `SELECT COUNT(*) AS total
         FROM mutes
         WHERE chat_id=$1`,
        [ctx.chat.id]
    );

    const bans = await pool.query(
        `SELECT COUNT(*) AS total
         FROM bans
         WHERE chat_id=$1`,
        [ctx.chat.id]
    );

    const logs = await pool.query(
        `SELECT COUNT(*) AS total
         FROM logs
         WHERE chat_id=$1`,
        [ctx.chat.id]
    );

const links = await pool.query(
    `SELECT COUNT(*) AS total
     FROM logs
     WHERE chat_id=$1
     AND action='LINK_BLOCKED'`,
    [ctx.chat.id]
);

const badWords = await pool.query(
    `SELECT COUNT(*) AS total
     FROM logs
     WHERE chat_id=$1
     AND action='BAD_WORD_BLOCKED'`,
    [ctx.chat.id]
);

const spam = await pool.query(
    `SELECT COUNT(*) AS total
     FROM logs
     WHERE chat_id=$1
     AND action='SPAM_BLOCKED'`,
    [ctx.chat.id]
);

    await ctx.editMessageText(
`📊 *GROUP STATISTICS*

⚠️ Total Warnings: ${warnings.rows[0].total}
🔇 Total Mutes: ${mutes.rows[0].total}
🚫 Total Bans: ${bans.rows[0].total}
📜 Moderation Logs: ${logs.rows[0].total}
🔗 Links Blocked: ${links.rows[0].total}
🤬 Bad Words Blocked: ${badWords.rows[0].total}
🚨 Spam Blocked: ${spam.rows[0].total}
🕒 Updated: ${new Date().toUTCString()}`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🔄 Refresh",
                            callback_data: "panel_stats"
                        }
                    ],
                    [
                        {
                            text: "⬅️ Back to Settings",
                            callback_data: "panel_settings"
                        }
                    ]
                ]
            }
        }
    );

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

return ctx.editMessageText(
    "📢 *BROADCAST*\n\nChoose what you want to send:",
    {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
    [
        {
            text: "📝 Text",
            callback_data: "broadcast_text"
        },
        {
            text: "📷 Photo",
            callback_data: "broadcast_photo"
        }
    ],
    [
        {
            text: "🎥 Video",
            callback_data: "broadcast_video"
        },
        {
            text: "📄 Document",
            callback_data: "broadcast_document"
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

const broadcastModes = [
    "text",
    "photo",
    "video",
    "document"
];

broadcastModes.forEach(mode => {

    bot.action(`broadcast_${mode}`, async (ctx) => {

        if (!(await canAccessPanel(ctx)))
            return ctx.answerCbQuery("⛔ Unauthorized.");

        await pool.query(
            `INSERT INTO broadcast_state
             (chat_id, admin_id, mode)
             VALUES ($1,$2,$3)
             ON CONFLICT(chat_id)
             DO UPDATE SET
                admin_id=EXCLUDED.admin_id,
                mode=EXCLUDED.mode`,
            [
                ctx.chat.id,
                ctx.from.id,
                mode
            ]
        );

        await ctx.answerCbQuery();

        return ctx.reply(
`📢 Send a ${mode} to broadcast.

Type /cancel to cancel.`
        );

    });

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
require("./commands/userinfo")(bot, pool, canModerate);
require("./commands/pin")(bot, canModerate);
require("./commands/unpin")(bot, canModerate);
require("./commands/purge")(bot, canModerate);
require("./commands/schedule")(
    bot,
    pool,
    canModerate
);

bot.on("message", async (ctx, next) => {

    const result = await pool.query(
        `SELECT *
         FROM schedule_state
         WHERE chat_id=$1
         AND admin_id=$2`,
        [
            ctx.chat.id,
            ctx.from.id
        ]
    );

    if (!result.rowCount)
        return next();

    if (ctx.message.text === "/cancel") {

        await pool.query(
            `DELETE FROM schedule_state
             WHERE chat_id=$1
             AND admin_id=$2`,
            [
                ctx.chat.id,
                ctx.from.id
            ]
        );

        return ctx.reply("❌ Scheduled message cancelled.");

    }

    let messageType = null;
    let content = null;
    let fileId = null;
    let caption = null;

    if (ctx.message.text) {

        messageType = "text";
        content = ctx.message.text;

    }

    else if (ctx.message.photo) {

        messageType = "photo";
        fileId =
            ctx.message.photo[
                ctx.message.photo.length - 1
            ].file_id;

        caption = ctx.message.caption || null;

    }

    else if (ctx.message.video) {

        messageType = "video";
        fileId = ctx.message.video.file_id;
        caption = ctx.message.caption || null;

    }

    else if (ctx.message.document) {

        messageType = "document";
        fileId = ctx.message.document.file_id;
        caption = ctx.message.caption || null;

    }

    else {

        return ctx.reply(
            "❌ Only text, photos, videos and documents are supported."
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
            ctx.chat.id,
            ctx.from.id,
            messageType,
            content,
            fileId,
            caption,
            result.rows[0].scheduled_at
        ]
    );

    await pool.query(
        `DELETE FROM schedule_state
         WHERE chat_id=$1
         AND admin_id=$2`,
        [
            ctx.chat.id,
            ctx.from.id
        ]
    );

    return ctx.reply(
`✅ Scheduled successfully!

📅 ${new Date(result.rows[0].scheduled_at).toLocaleString()}`
    );

});

bot.on("message", async (ctx, next) => {

    const result = await pool.query(
        `SELECT *
         FROM broadcast_state
         WHERE chat_id=$1
         AND admin_id=$2`,
        [
            ctx.chat.id,
            ctx.from.id
        ]
    );

    if (!result.rowCount)
        return next();

    const mode = result.rows[0].mode;

    if (ctx.message.text === "/cancel") {

        await pool.query(
            `DELETE FROM broadcast_state
             WHERE chat_id=$1
             AND admin_id=$2`,
            [
                ctx.chat.id,
                ctx.from.id
            ]
        );

        return ctx.reply("❌ Broadcast cancelled.");

    }

    if (mode === "text" && !ctx.message.text)
        return ctx.reply("❌ Please send a text message.");

    if (mode === "photo" && !ctx.message.photo)
        return ctx.reply("❌ Please send a photo.");

    if (mode === "video" && !ctx.message.video)
        return ctx.reply("❌ Please send a video.");

    if (mode === "document" && !ctx.message.document)
        return ctx.reply("❌ Please send a document.");

    await ctx.copyMessage(ctx.chat.id);

    await pool.query(
        `DELETE FROM broadcast_state
         WHERE chat_id=$1
         AND admin_id=$2`,
        [
            ctx.chat.id,
            ctx.from.id
        ]
    );

});

bot.on("message", async (ctx, next) => {

    if (!ctx.chat || ctx.chat.type === "private")
        return next();

    const result = await pool.query(
        `SELECT
            text_locked,
            links_locked,
            photos_locked,
            videos_locked,
            documents_locked,
            stickers_locked,
            gifs_locked,
            polls_locked
         FROM locks
         WHERE chat_id=$1`,
        [ctx.chat.id]
    );

    if (!result.rowCount)
        return next();

    const locks = result.rows[0];

    // Text
    if (
        locks.text_locked &&
        ctx.message.text &&
        !ctx.message.text.startsWith("/")
    ) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }

if (
    locks.photos_locked &&
    ctx.message.photo
) {
    await ctx.deleteMessage().catch(() => {});
    return;
}

if (
    locks.videos_locked &&
    ctx.message.video
) {
    await ctx.deleteMessage().catch(() => {});
    return;
}

if (
    locks.documents_locked &&
    ctx.message.document
) {
    await ctx.deleteMessage().catch(() => {});
    return;
}

if (
    locks.stickers_locked &&
    ctx.message.sticker
) {
    await ctx.deleteMessage().catch(() => {});
    return;
}

if (
    locks.gifs_locked &&
    ctx.message.animation
) {
    await ctx.deleteMessage().catch(() => {});
    return;
}

if (
    locks.polls_locked &&
    ctx.message.poll
) {
    await ctx.deleteMessage().catch(() => {});
    return;
}

    return next();

});

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

await logAction(
    ctx.chat.id,
    ctx.from.id,
    null,
    "LINK_BLOCKED",
    "Blocked Telegram/URL link"
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

await logAction(
    pool,
    ctx.chat.id,
    ctx.from.id,
    null,
    "SPAM_BLOCKED",
    "Sent too many messages in a short time"
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

await logAction(
    pool,
    ctx.chat.id,
    ctx.from.id,
    null,
    "BAD_WORD_BLOCKED",
    row.word
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

setInterval(async () => {

    try {

        const result = await pool.query(
            `SELECT *
             FROM scheduled_messages
             WHERE sent = FALSE
             AND scheduled_at <= NOW()
             ORDER BY scheduled_at ASC`
        );

console.log("Scheduler found:", result.rowCount,"message(s)");

        for (const row of result.rows) {

            try {

                switch (row.message_type) {

                    case "text":

                        await bot.telegram.sendMessage(
                            row.chat_id,
                            row.content
                        );

                        break;

                    case "photo":

                        await bot.telegram.sendPhoto(
                            row.chat_id,
                            row.file_id,
                            {
                                caption: row.caption || undefined
                            }
                        );

                        break;

                    case "video":

                        await bot.telegram.sendVideo(
                            row.chat_id,
                            row.file_id,
                            {
                                caption: row.caption || undefined
                            }
                        );

                        break;

                    case "document":

                        await bot.telegram.sendDocument(
                            row.chat_id,
                            row.file_id,
                            {
                                caption: row.caption || undefined
                            }
                        );

                        break;

                }

                await pool.query(
                    `UPDATE scheduled_messages
                     SET sent = TRUE
                     WHERE id = $1`,
                    [row.id]
                );

            } catch (err) {

                console.error(
                    "Failed to send scheduled message:",
                    err
                );

            }

        }

    } catch (err) {

        console.error(
            "Scheduler error:",
            err
        );

    }

}, 10000);

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
