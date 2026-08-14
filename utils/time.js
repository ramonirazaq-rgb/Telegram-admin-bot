function parseDuration(text) {
    if (!text) return null;

    const match = text.match(/^(\d+)([mhd])$/);

    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2];

    let ms = 0;

    if (unit === "m") ms = value * 60 * 1000;
    if (unit === "h") ms = value * 60 * 60 * 1000;
    if (unit === "d") ms = value * 24 * 60 * 60 * 1000;

    return new Date(Date.now() + ms);
}

module.exports = { parseDuration };
