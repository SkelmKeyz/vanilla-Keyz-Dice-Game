const rateLimits = {};
// ── Rate limiting ─────────────────────────────────────────────────────────────
function isRateLimited(socketId, event, maxPerSecond = 1) {
    const key = `${socketId}:${event}`;
    const now = Date.now();
    if (!rateLimits[key]) rateLimits[key] = [];
    rateLimits[key] = rateLimits[key].filter(t => now - t < 1000);
    if (rateLimits[key].length >= maxPerSecond) return true;
    rateLimits[key].push(now);
    return false;
}

// Cleaner
function cleanRateLimits(socketId) {
    Object.keys(rateLimits).forEach(key => {
        if (key.startsWith(`${socketId}:`)) delete rateLimits[key];
    });
}

module.exports = {
    isRateLimited,
    cleanRateLimits
};