function reconnectPlayer(
    io,
    socket,
    room,
    roomId
) {

    for (const role of [
        "player1",
        "player2"
    ]) {

        const player =
            room.players[role];

        if (
            player?.email ===
            socket.user.email
        ) {

            if (
                player.socketId &&
                player.socketId !== socket.id
            ) {

                const previous =
                    io.sockets.sockets.get(
                        player.socketId
                    );

                if (previous) {

                    previous.leave(roomId);

                    previous.playerRole = null;

                    previous.playerRoomId = null;

                    previous.disconnect(true);
                }
            }

            player.socketId =
                socket.id;

            return role;
        }
    }

    return null;
}

module.exports = {
    reconnectPlayer
};