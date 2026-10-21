function applyBankRules(room, player) {

    // room 
    if (!room.winStreak) room.winStreak = { player1: 0, player2: 0 }
    if (!room.winStreak) room.totalWins = { player1: 0, player2: 0 }
    if (!room.winStreak) room.last3Bets = { player1: [], player2: [] }

    const last3 = room.bank.last3Bets[player] || [];

    const maxBet =
        last3.length > 0
            ? Math.max(...last3)
            : 0;

    // 3-win streak tax
    if (room.bank.winStreak[player] === 3) {

        const fee = Math.min(
            maxBet * 0.3,
            room.bank.balances[player]
        );

        room.bank.loanPool += fee;

        room.bank.balances[player] -= fee;

        room.bank.winStreak[player] = 0;

        return {
            taxed: true,
            message: `🏦 Streak Tax applied to ${player} (-R${fee.toFixed(2)})`
        };
    }

    // 5 total wins tax
    if (room.bank.totalWins[player] === 5) {

        const fee = Math.min(
            maxBet * 3,
            room.bank.balances[player]
        );

        room.bank.loanPool += fee;

        room.bank.balances[player] -= fee;

        room.bank.totalWins[player] = 0;

        return {
            taxed: true,
            message: `🏦 Wins-5 Tax applied to ${player} (-R${fee.toFixed(2)})`
        };
    }

    return {
        taxed: false
    };
}

function requestLoan(
    room,
    player,
    amount
) {

    const loanAmount =
        Number(amount);

    const last3 =
        room.bank.last3Bets[player] || [];

    const contributions =
        last3.reduce(
            (a, b) => a + b,
            0
        );

    if (
        loanAmount >
        room.bank.loanPool
    ) {

        throw new Error(
            "Loan exceeds available pool"
        );
    }

    if (
        contributions > 0 &&
        loanAmount >
        contributions * 2
    ) {

        throw new Error(
            `Loan exceeds limit (R${contributions * 2})`
        );
    }

    room.bank.balances[player] += loanAmount;

    room.bank.loanPool -= loanAmount;

    return {
        success: true,
        message: `💳 ${player} borrowed R${loanAmount}`
    };
}

module.exports = {
    applyBankRules,
    requestLoan
};