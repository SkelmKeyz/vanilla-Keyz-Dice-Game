// ── Broadcast full room state to all players in room ──────────────────────────
function broadcastGameState(io, rooms, roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const state = {
        currentTurn: room.currentTurn,
        isFirstRoll: room.isFirstRoll,
        point: room.point,
        pot: room.pot,
        stake: room.stake,
        player1Stake: room.player1Stake,
        player2Stake: room.player2Stake,
        balances: room.bank.balances,
        loanPool: room.bank.loanPool
    };

    io.to(roomId).emit("game-state", state);
}

module.exports = broadcastGameState;