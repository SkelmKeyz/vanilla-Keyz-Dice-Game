const { processRoll } = require("../services/gameService");
const MIN_BET = 20;
const MIN_LOAN = 20;
const rateLimits = {};


function isValidRoomId(roomId) {
    return (
        typeof roomId === "string" &&
        roomId.length > 0 &&
        roomId.length <= 64 &&
        /^[A-Za-z0-9_-]+$/.test(roomId)
    );
}

function getOwnedRoomSeat(socket, roomId, room) {
    if (!room || socket.playerRoomId !== roomId) {
        return null;
    }

    const role = socket.playerRole;

    if (role !== "player1" && role !== "player2") {
        return null;
    }

    const player = room.players[role];

    if (
        !player ||
        player.socketId !== socket.id ||
        player.email !== socket.user.email
    ) {
        return null;
    }

    return role;
}

function getOtherRole(role) {
    return role === "player1" ? "player2" : "player1";
}

function emitRoomState(io, rooms, roomId, broadcastGameState) {
    broadcastGameState(io, rooms, roomId);
}

function isRateLimited(socketId, event, maxPerSecond = 2) {
    const key = `${socketId}:${event}`;
    const now = Date.now();
    if (!rateLimits[key]) rateLimits[key] = [];
    rateLimits[key] = rateLimits[key].filter(t => now - t < 1000);
    if (rateLimits[key].length >= maxPerSecond) return true;
    rateLimits[key].push(now);
    return false;
}

module.exports = (
    io,
    rooms,
    createRoom,
    getRoom,
    broadcastGameState
) => {
    io.on("connection", (socket) => {
        console.log(`✅ ${socket.user.email} connected [${socket.id}]`);

        socket.on("join-room", (roomId) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            if (socket.currentRoomId && socket.currentRoomId !== roomId) {
                socket.emit("error", "You are already assigned to another room");
                return;
            }

            const room = createRoom(roomId);
            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }
            let assignedRole = null;

            for (const role of ["player1", "player2"]) {
                const player = room.players[role];

                if (player?.email === socket.user.email) {
                    const previousSocketId = player.socketId;

                    if (previousSocketId && previousSocketId !== socket.id) {
                        const previousSocket =
                            io.sockets.sockets.get(previousSocketId);

                        if (previousSocket) {
                            previousSocket.leave(roomId);
                            previousSocket.playerRole = null;
                            previousSocket.playerRoomId = null;
                        }
                    }

                    player.socketId = socket.id;
                    assignedRole = role;
                    break;
                }
            }

            if (!assignedRole) {
                for (const role of ["player1", "player2"]) {
                    const player = room.players[role];

                    if (!player?.socketId) {
                        room.players[role] = {
                            socketId: socket.id,
                            email: socket.user.email
                        };
                        assignedRole = role;
                        break;
                    }
                }
            }

            if (!assignedRole) {
                socket.emit("room-full", "Room is full");
                console.log(`Room ${roomId} is full — rejected ${socket.user.email}`);
                return;
            }

            socket.join(roomId);
            socket.currentRoomId = roomId;
            socket.playerRoomId = roomId;
            socket.playerRole = assignedRole;

            socket.emit("player-role", assignedRole);
            socket.emit("game-state", {
                currentTurn: room.currentTurn,
                isFirstRoll: room.isFirstRoll,
                point: room.point,
                pot: room.pot,
                balances: room.bank.balances,
                loanPool: room.bank.loanPool,
                role: assignedRole
            });


            console.log(
                `${socket.user.email} joined room ${roomId} as ${assignedRole}`
            );
            emitRoomState(io, rooms, roomId, broadcastGameState);
        });

        socket.on("roll-dice", (payload) => {
            const roomId = payload?.roomId;

            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            const room = getRoom(roomId);

            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            const role = getOwnedRoomSeat(socket, roomId, room);

            if (!role) {
                socket.emit("error", "You are not an assigned player in this room");
                return;
            }

            const bothPlayersConnected = ["player1", "player2"].every((playerRole) => {
                const player = room.players[playerRole];

                return (
                    player?.socketId &&
                    io.sockets.sockets.has(player.socketId)
                );
            });

            if (!bothPlayersConnected) {
                socket.emit("error", "Waiting for both players to connect");
                return;
            }

            if (role !== room.currentTurn) {
                socket.emit("error", "Not your turn");
                return;
            }

            console.log(
                "ROUND CONTRIBUTIONS:",
                room.roundContributions
            );

            if (room.roundContributions.player1 === 20 || room.roundContributions.player2 === 0) {
                socket.emit("error", "Both players must contribute to the pot before rolling");
                return;
            }

            if (isRateLimited(socket.id, "roll-dice")) {
                socket.emit("error", "Rolling too fast - slow down");
                return;
            }

            const result = processRoll(room);
            let payout = 0;

            if (result.roundOver && result.winnerRole) {
                payout = room.pot;
                room.bank.balances[result.winnerRole] += payout;
                room.pot = 0;
                room.roundContributions.player1 = 0;
                room.roundContributions.player2 = 0;
            }

            io.to(roomId).emit("dice-result", {
                ...result,
                payout
            });

            emitRoomState(
                io,
                rooms,
                roomId,
                broadcastGameState
            );

            if (room._turnTimer) clearTimeout(room._turnTimer);
            room._turnTimer = setTimeout(() => {
                const afkRole = room.currentTurn;
                io.to(roomId).emit("error-targeted", {
                    role: afkRole,
                    message: "⏰ Turn timeout - turn passed automatically"
                });
                room.currentTurn = afkRole === "player1" ? "player2" : "player1";
                emitRoomState(io, rooms, roomId, broadcastGameState);
            }, 60_000);
        });

        socket.on("place-bet", (payload) => {
            const roomId = payload?.roomId;
            const requestedPlayer = payload?.player;

            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            const room = getRoom(roomId);

            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            const role = getOwnedRoomSeat(socket, roomId, room);

            if (!role) {
                socket.emit("error", "You are not an assigned player in this room");
                return;
            }

            if (requestedPlayer !== role) {
                socket.emit("error", "You can only place bets for your own player");
                return;
            }

            const amount = Number(payload.amount);

            if (!Number.isFinite(amount) || amount < MIN_BET) {
                socket.emit("error", `Minimum bet is R${MIN_BET}`);
                return;
            }

            const MAX_BET = 500;

            if (amount > MAX_BET) {
                socket.emit("error", `Maximum bet is R${MAX_BET}`);
                return;
            }

            const balance = room.bank.balances[role];

            if (!Number.isFinite(balance) || amount > balance) {
                socket.emit("error", "Insufficient funds");
                return;
            }

            room.bank.balances[role] -= amount;
            room.pot += amount;

            if (!Array.isArray(room.bank.last3Bets[role])) {
                room.bank.last3Bets[role] = [];
            }

            room.bank.last3Bets[role].push(amount);
            room.bank.last3Bets[role] =
                room.bank.last3Bets[role].slice(-3);
            room.roundContributions[role] += amount;

            console.log(`BET: ${role} placed R${amount}`);

            emitRoomState(io, rooms, roomId, broadcastGameState);
        });

        socket.on("request-loan", (payload) => {
            const roomId = payload?.roomId;
            const requestedPlayer = payload?.player;

            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            const room = getRoom(roomId);

            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            const role = getOwnedRoomSeat(socket, roomId, room);

            if (!role) {
                socket.emit("error", "You are not an assigned player in this room");
                return;
            }

            if (requestedPlayer !== role) {
                socket.emit("error", "You can only request a loan for your own player");
                return;
            }

            const amount = Number(payload.amount);

            if (!Number.isFinite(amount) || amount < MIN_LOAN) {
                socket.emit("error", `Minimum loan is R${MIN_LOAN}`);
                return;
            }

            if (amount > room.bank.loanPool) {
                socket.emit("error", "Loan exceeds available pool");
                return;
            }

            const recentBets = room.bank.last3Bets[role] || [];
            const contributions = recentBets.reduce(
                (total, bet) => total + bet,
                0
            );

            if (contributions > 0 && amount > contributions * 2) {
                socket.emit(
                    "error",
                    `Loan exceeds limit (R${contributions * 2})`
                );
                return;
            }

            room.bank.balances[role] += amount;
            room.bank.loanPool -= amount;

            console.log(`LOAN: ${role} borrowed R${amount}`);

            emitRoomState(io, rooms, roomId, broadcastGameState);
        });

        socket.on("disconnect", () => {
            console.log(
                `❌ ${socket.user.email} disconnected [${socket.id}]`
            );
            const roomId = socket.currentRoomId;
            if (!roomId) return;
            const room = getRoom(roomId);
            if (!room) return;


            let disconnectedRole = null;

            for (const role of ["player1", "player2"]) {
                if (room.players[role]?.socketId === socket.id) {
                    room.players[role].socketId = null;

                    disconnectedRole = role;
                    break;
                }
            }

            if (!disconnectedRole) return;



            if (room.currentTurn === disconnectedRole) {
                room.currentTurn = getOtherRole(disconnectedRole);
            }

            const noConnectedPlayers = ["player1", "player2"]
                .every(role => !room.players[role]?.socketId
                );

            if (noConnectedPlayers) {
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted`);
                return;
            }

            emitRoomState(io, rooms, roomId, broadcastGameState);

            io.to(roomId).emit("player-disconnected", {
                message: "Other player disconnected"
            });

            // On reconnect 
            if (room._cleanupTimer) {
                clearTimeout(room._cleanupTimer);
                room._cleanupTimer = null;

            }

            // start cleanup timer
            room._cleanupTimer = setTimeout(() => {
                const disconnectedRoleStillMissing =
                    !room.players.player1?.socketId
                        ? "player1"
                        : !room.players.player2?.socketId
                            ? "player2"
                            : null;

                if (!disconnectedRoleStillMissing) {
                    return;
                }

                const winnerRole = disconnectedRole === "player1" ? "player2" : "player1";

                if (room.pot > 0) {

                    room.bank.balances[winnerRole] += room.pot;

                    io.to(roomId).emit(
                        "game-over",
                        {
                            reason: "forfeit",
                            winner: winnerRole,
                            payout: room.pot
                        }
                    );

                    room.pot = 0;
                }
                const noConnectedPlayers = ["player1", "player2"]
                    .every(role => !room.players[role]?.socketId);

                // If still 
                if (noConnectedPlayers) {
                    deleteRoom(roomId);
                    console.log(`Room ${roomId} clean up after`);
                }
            }, 60_000);
        });
    });
};