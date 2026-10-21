console.log(
    "NEW BROADCAST FILE LOADED"
);
// ── Helper: broadcast full room state to all players in room ─────────────────
function broadcastGameState(io, rooms, roomId) {
    console.log("BROADCAST CALLED:", roomId);

    console.log("ROOMS OBJECT EXISTS:", !!rooms);

    console.log("ROOM FOUND:", !!rooms?.[roomId]);
    ``
    const room = rooms[roomId];
    if (!room) return;
    // Send each socket their personalised view (includes their own role)
    Object.entries(room.players).forEach(([role, player]) => {

        const socketId = player?.socketId;

        console.log("ROLE:", role);
        console.log("SOCKET ID:", socketId);

        if (!socketId) return;
        const targetSocket = io.sockets.sockets.get(socketId);

        console.log(
            "TARGET SOCKET FOUND:",
            !!targetSocket
        );

        if (!targetSocket) return;

        console.log(
            "EMITTING GAME STATE TO:",
            role
        );

        targetSocket.emit("game-state", {
            currentTurn: room.currentTurn,
            isFirstRoll: room.isFirstRoll,
            point: room.point,
            pot: room.pot,
            balances: room.bank.balances,
            loanPool: room.bank.loanPool,
            role                        // each player gets their OWN role here
        });
        console.log("EMIT COMPLETE:", role);
    });
}

module.exports = broadcastGameState;