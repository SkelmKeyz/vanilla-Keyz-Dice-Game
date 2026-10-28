const rooms = {};

function getRoom(roomId) {
    return rooms[roomId];
}

function createRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            players: {
                player1: {
                    socketId: null,
                    email: null
                },
                player2: {
                    socketId: null,
                    email: null
                }
            },

            currentTurn: "player1",
            isFirstRoll: true,
            point: null,
            pot: 0,
            stake: 0,
            player1Stake: 0,
            player2Stake: 0,

            roundContributions: {
                player1: 0,
                player2: 0
            },

            bank: {
                loanPool: 500,

                balances: {
                    player1: 1000,
                    player2: 1000
                },

                bets: [],

                winStreak: {
                    player1: 0,
                    player2: 0
                },

                totalWins: {
                    player1: 0,
                    player2: 0
                },

                specialLossStreak: {
                    player1: 0,
                    player2: 0
                },

                last3Bets: {
                    player1: [],
                    player2: []
                }
            }
        };
    }

    return rooms[roomId];
}

function deleteRoom(roomId) {
    delete rooms[roomId];
}

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
        room.stake = stakeAmount;
        room.player1Stake = stakeAmount;
        room.player2Stake = 0;
        room.pot = stakeAmount;
        room.currentTurn = "player1";
        room.isFirstRoll = true;
        room.point = null;
    } else {
        room.player2Stake = stakeAmount;
        room.pot += stakeAmount;
    }
}

// Single export block for all room functions
module.exports = {
    rooms,
    createRoom,
    getRoom,
    deleteRoom,
    assignPlayerToRoom
};