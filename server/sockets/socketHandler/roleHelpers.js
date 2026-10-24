// ── Role helpers ──────────────────────────────────────────────────────────────
function getOwnedRoomSeat(socket, roomId, room) {
    if (!room || socket.playerRoomId !== roomId) return null;
    const role = socket.playerRole;
    if (role !== "player1" && role !== "player2") return null;
    const player = room.players[role];
    if (!player || player.socketId !== socket.id || player.email !== socket.user.email) return null;
    return role;
}

function getOtherRole(role) {
    return role === "player1" ? "player2" : "player1";
}

module.exports = {
    getOwnedRoomSeat,
    getOtherRole
};