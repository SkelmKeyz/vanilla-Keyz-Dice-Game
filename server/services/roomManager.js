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

module.exports = {
    rooms,
    createRoom,
    getRoom,
    deleteRoom
};