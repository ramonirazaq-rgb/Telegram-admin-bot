async function canModerate(ctx) {
    if (!ctx.chat) return false;

    const member = await ctx.telegram.getChatMember(
        ctx.chat.id,
        ctx.from.id
    );

    return ["creator", "administrator"].includes(member.status);
}

module.exports = { canModerate };
async function canAccessPanel(ctx) {

    // Private chat → only owner
    if (ctx.chat.type === "private") {
        return ctx.from.id === Number(process.env.OWNER_ID);
    }

    // Group → admins
    return await canModerate(ctx);

}

module.exports = {
    canModerate,
    canAccessPanel
};
