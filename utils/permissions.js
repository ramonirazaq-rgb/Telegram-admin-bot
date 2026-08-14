async function canModerate(ctx) {
    if (!ctx.chat) return false;

    const member = await ctx.telegram.getChatMember(
        ctx.chat.id,
        ctx.from.id
    );

    return ["creator", "administrator"].includes(member.status);
}

module.exports = { canModerate };
