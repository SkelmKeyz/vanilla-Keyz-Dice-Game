function assignPlayerToRoom(
    room,
    role,
    socket,
    stakeAmount
) {

    room.players[role] = {
        socketId: socket.id,
        email: socket.user.email
    };

    if (role === "player1") {

        room.stake =
            stakeAmount;

        room.player1Stake =
            stakeAmount;

        room.player2Stake = 0;

        room.pot =
            stakeAmount;

        room.currentTurn =
            "player1";

        room.isFirstRoll =
            true;

        room.point = null;

    } else {

        room.player2Stake =
            stakeAmount;

        room.pot +=
            stakeAmount;
    }
}

module.exports = {
    assignPlayerToRoom
};