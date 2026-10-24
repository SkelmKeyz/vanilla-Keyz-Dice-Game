const { processRoll } = require("../../services/gameService");
const { creditBalance } = require("./bankHandler");
const { getOtherRole } = require("./roleHelpers");

/**
 * handleWinner — staged helper, not yet imported by gameSocket.js.
 * When integrated, call this after processRoll returns roundOver: true.
 * WARNING: Do not import alongside the inline winner logic in gameSocket.js
 * or it will cause double payouts.
 */
function handleWinner(io, roomId, room, winnerRole) {
    const payout = room.pot;

    creditBalance(room, winnerRole, payout);

    room.pot = 0;
    room.player1Stake = 0;
    room.player2Stake = 0;
    room.isFirstRoll = true;
    room.point = null;
    room.currentTurn = getOtherRole(winnerRole);

    io.to(roomId).emit("round-winner", {
        winner: winnerRole,
        payout,
        balances: room.bank.balances
    });
}

module.exports = { handleWinner };