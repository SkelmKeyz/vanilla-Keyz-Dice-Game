const MIN_BET = 20;
const MAX_BET = 10000;


// ── Validation ────────────────────────────────────────────────────────────────
function isValidRoomId(roomId) {
    return (
        typeof roomId === "string" &&
        roomId.length > 0 &&
        roomId.length <= 64 &&
        /^[A-Za-z0-9_-]+$/.test(roomId)
    );
}

function isValidAmount(amount) {
    return Number.isFinite(amount) && amount >= MIN_BET && amount <= MAX_BET;
}



module.exports = { isValidRoomId, isValidAmount };