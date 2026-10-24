// ── Balance helpers ───────────────────────────────────────────────────────────
function debitBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Invalid amount");
    }
    if (room.bank.balances[role] < amount) {
        throw new Error("Insufficient balance");
    }
    room.bank.balances[role] -= amount;
}

function creditBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Invalid credit amount");
    }
    room.bank.balances[role] += amount;
}

module.exports = {
    debitBalance,
    creditBalance
};