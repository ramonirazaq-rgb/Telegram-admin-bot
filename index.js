require("dotenv").config();

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

            CREATE TABLE IF NOT EXISTS filters (
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
    if (!isOwner(ctx)) {
        return ctx.reply("⛔ Admin access required.");
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
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

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
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

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
                        { text: "🔓 Open Group", callback_data: "group_open" },
                        { text: "🔒 Close Group", callback_data: "group_close" }
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
// MEMBERS
// =========================

bot.action("panel_members", async (ctx) => {
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

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
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

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
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

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
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "⚙️ *SETTINGS*\n\n" +
        "Bot configuration will be connected next.",
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
// BROADCAST
// =========================

bot.action("panel_broadcast", async (ctx) => {
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();

    await ctx.reply(
        "📢 Broadcast system will be connected to the database and channel controls next."
    );
});

// =========================
// CLOSE PANEL
// =========================

bot.action("panel_close", async (ctx) => {
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

    await ctx.answerCbQuery();
    await ctx.deleteMessage();
});

// =========================
// BACK
// =========================

bot.action("panel_back", async (ctx) => {
    if (!isOwner(ctx)) return ctx.answerCbQuery("⛔ Unauthorized.");

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
