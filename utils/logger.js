module.exports = async function logAction(
    pool,
    chatId,
    userId,
    adminId,
    action,
    reason = null
) {

    await pool.query(
        `INSERT INTO logs
        (chat_id, user_id, admin_id, action, reason)
        VALUES ($1, $2, $3, $4, $5)`,
        [
            chatId,
            userId,
            adminId,
            action,
            reason
        ]
    );

};

