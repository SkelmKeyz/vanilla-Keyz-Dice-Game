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

function creditBalance(room, winnerRole, payout) {

    if (
        typeof payout !== "number" ||
        payout <= 0
    ) {
        throw new Error(
            `Invalid credit amount: ${payout}`
        );
    }

    room.bank.balances[winnerRole] += payout;

    console.log("Winner:", winnerRole);
    console.log("Pot:", room.pot);
    console.log("Payout:", payout);
}

module.exports = {
    debitBalance,
    creditBalance
};