function requestLoan(
    room,
    role,
    amount
) {

    const MAX_LOAN = 500;

    if (!room.bank.loansIssued) {

        room.bank.loansIssued = {
            player1: 0,
            player2: 0
        };

    }

    if (
        room.bank.loansIssued[role] +
        amount >
        MAX_LOAN
    ) {
        throw new Error(
            `Loan limit of R${MAX_LOAN} reached`
        );
    }

    if (
        room.bank.loanPool < amount
    ) {
        throw new Error(
            "Loan pool has insufficient funds"
        );
    }

    room.bank.loanPool -= amount;

    room.bank.balances[role] += amount;

    room.bank.loansIssued[role] += amount;
}

module.exports = {
    requestLoan
};