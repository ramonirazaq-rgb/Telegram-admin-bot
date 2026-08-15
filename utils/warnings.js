module.exports = async function issueWarning(
    ctx,
    pool,
    target,
    reason,
    issuedBy
) {

    // Save warning
    await pool.query(
        `INSERT INTO warnings
        (user_id, chat_id, reason, issued_by)
        VALUES ($1, $2, $3, $4)`,
        [
            target.id,
            ctx.chat.id,
            reason,
            issuedBy
        ]
    );

    // Count warnings
    const result = await pool.query(
        `SELECT COUNT(*) AS total
         FROM warnings
         WHERE user_id=$1
         AND chat_id=$2`,
        [
            target.id,
            ctx.chat.id
        ]
    );

    const totalWarnings =
        Number(result.rows[0].total);
    // Automatically mute after 3 warnings
    if (totalWarnings >= 3) {

        const muteUntil = new Date(
            Date.now() + (60 * 60 * 1000)
        );

        await ctx.telegram.restrictChatMember(
            ctx.chat.id,
            target.id,
            {
                permissions: {
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
                },
                until_date: Math.floor(
                    muteUntil.getTime() / 1000
                )
            }
        );

        await pool.query(
            `INSERT INTO mutes
            (user_id, chat_id, reason, muted_by, expires_at)
            VALUES ($1, $2, $3, $4, $5)`,
            [
                target.id,
                ctx.chat.id,
                "Reached warning limit",
                issuedBy,
                muteUntil
            ]
        );

        await logAction(
    ctx.chat.id,
    target.id,
    ctx.from.id,
    "AUTO_MUTE",
    "Reached warning limit"
);

        await pool.query(
            `DELETE FROM warnings
             WHERE user_id=$1
             AND chat_id=$2`,
            [
                target.id,
                ctx.chat.id
            ]
        );

        return {
            autoMuted: true,
            totalWarnings: 3,
            muteUntil
        };
    }
    return {
        autoMuted: false,
        totalWarnings
    };

};
