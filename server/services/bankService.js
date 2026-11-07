const BUYBACK_FEE = 200;
const MAX_WINS_BEFORE_BUYBACK = 5;
const STREAK_TAX_THRESHOLD = 3;

function applyBankRules(room, winnerRole) {
    console.log("BEFORE TAX CHECK");

    console.log("Wins:", room.bank.totalWins);
    console.log("WinStreak:", room.bank.winStreak);
    console.log("LossStreak:", room.bank.lossStreak);

    // Guard initialisations
    if (!room.bank.winStreak) room.bank.winStreak = { player1: 0, player2: 0 };
    if (!room.bank.lossStreak) room.bank.lossStreak = { player1: 0, player2: 0 };
    if (!room.bank.totalWins) room.bank.totalWins = { player1: 0, player2: 0 };
    if (!room.bank.last3Bets) room.bank.last3Bets = { player1: [], player2: [] };
    if (!room.bank.loansIssued) room.bank.loansIssued = { player1: 0, player2: 0 };

    const loserRole = winnerRole === "player1" ? "player2" : "player1";

    const last3 = room.bank.last3Bets[winnerRole];
    const maxBet = last3.length > 0 ? Math.max(...last3) : 20;

    let taxResult = { taxed: false, message: null, rollerTransfer: false };
    console.log(
        "BUYBACK CHECK:",
        winnerRole,
        room.bank.totalWins[winnerRole]
    );

    // STREAK TAX — fires at exactly 3, then resets (else if prevents double tax)
    if (room.bank.winStreak[winnerRole] >= STREAK_TAX_THRESHOLD) {

        const fee = Math.min(
            maxBet * 0.3,
            room.bank.balances[winnerRole]
        );

        room.bank.balances[winnerRole] -= fee;
        room.bank.loanPool += fee;

        // Restart cycle
        room.bank.winStreak[winnerRole] = 0;
        room.bank.totalWins[winnerRole] = 0;

        taxResult = {
            taxed: true,
            message: `🏦 Streak Tax: -${fee.toFixed(2)} from ${winnerRole}`,
            rollerTransfer: false
        };

    }
    // BUYBACK
    else if (room.bank.totalWins[winnerRole] >= MAX_WINS_BEFORE_BUYBACK) {

        if (room.bank.balances[winnerRole] >= BUYBACK_FEE) {

            room.bank.balances[winnerRole] -= BUYBACK_FEE;
            room.bank.loanPool += BUYBACK_FEE;

            // Restart cycle
            room.bank.totalWins[winnerRole] = 0;
            room.bank.winStreak[winnerRole] = 0;

            taxResult = {
                taxed: true,
                message: `🔄 Buyback paid by ${winnerRole}: -${BUYBACK_FEE}`,
                rollerTransfer: false
            };

        } else {

            // Restart cycle
            room.bank.totalWins[winnerRole] = 0;
            room.bank.winStreak[winnerRole] = 0;

            taxResult = {
                taxed: false,
                message: `⚠️ ${winnerRole} cannot afford buyback — roller transfers`,
                rollerTransfer: true
            };
        }
    }
    return taxResult;
}

function requestLoan(room, player, amount) {
    const loanAmount = Number(amount);
    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
        throw new Error("Loan amount must be a positive number");
    }
    if (!room.bank.loansIssued) {
        room.bank.loansIssued = { player1: 0, player2: 0 };
    }

    const MAX_LOAN = 500;
    if (room.bank.loansIssued[player] + loanAmount > MAX_LOAN) {
        throw new Error(`Loan limit of R${MAX_LOAN} reached`);
    }
    if (room.bank.loanPool < loanAmount) {
        throw new Error("Loan pool has insufficient funds");
    }

    room.bank.loanPool -= loanAmount;
    room.bank.balances[player] += loanAmount;
    room.bank.loansIssued[player] += loanAmount;

    return { success: true, message: `💳 ${player} borrowed ${loanAmount}` };
}

module.exports = {
    applyBankRules,
    requestLoan
};