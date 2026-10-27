const { processRoll } = require("../services/gameService");
const { applyBankRules } = require("../services/bankService");
const User = require("../models/user");
const GameResult = require("../models/gameResult");
const { assignPlayerToRoom } = require("./socketHandler/roomHandler");
const { requestLoan: loanHandler } = require("./socketHandler/loanHandler");

const MIN_BET = 20;
const MAX_BET = 10000;
const MAX_LOAN = 500;

// Single shared rate-limits map for this process
const rateLimits = {};

// Single waiting-player slot
let waitingPlayer = null;

// ── Validation ────────────────────────────────────────────────────────────────
function isValidRoomId(roomId) {
    return (
        typeof roomId === "string" &&
        roomId.length > 0 &&
        roomId.length <= 64 &&
        /^[A-Za-z0-9_-]+$/.test(roomId)
    );
}

function isValidAmount(amount) {
    return Number.isFinite(amount) && amount >= MIN_BET && amount <= MAX_BET;
}

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

// ── Balance helpers ───────────────────────────────────────────────────────────
function debitBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) throw new Error("Invalid amount");
    if (room.bank.balances[role] < amount) throw new Error("Insufficient balance");
    room.bank.balances[role] -= amount;
}

function creditBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) throw new Error("Invalid credit amount");
    room.bank.balances[role] += amount;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
function isRateLimited(socketId, event, maxPerSecond = 1) {
    const key = `${socketId}:${event}`;
    const now = Date.now();
    if (!rateLimits[key]) rateLimits[key] = [];
    rateLimits[key] = rateLimits[key].filter(t => now - t < 1000);
    if (rateLimits[key].length >= maxPerSecond) return true;
    rateLimits[key].push(now);
    return false;
}

function cleanRateLimits(socketId) {
    Object.keys(rateLimits).forEach(key => {
        if (key.startsWith(`${socketId}:`)) delete rateLimits[key];
    });
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
function emitRoomState(io, rooms, roomId, broadcastGameState) {
    broadcastGameState(io, rooms, roomId);
}

// ── Persist balances to MongoDB after round end ───────────────────────────────
async function persistBalances(room, loansOverride) {
    try {
        const loans = loansOverride || room.bank.loansIssued || { player1: 0, player2: 0 };

        const p1Email = room.players.player1?.email;
        const p2Email = room.players.player2?.email;

        if (p1Email) {
            const p1Final = Math.max(0, room.bank.balances.player1 - loans.player1);
            await User.updateOne(
                { email: p1Email },
                { $set: { balance: p1Final } }
            );
        }

        if (p2Email) {
            const p2Final = Math.max(0, room.bank.balances.player2 - loans.player2);
            await User.updateOne(
                { email: p2Email },
                { $set: { balance: p2Final } }
            );
        }
    } catch (err) {
        console.error("Balance persist failed:", err.message);
    }
}

// ── Load balance from MongoDB when player joins ───────────────────────────────
async function loadPlayerBalance(email) {
    try {
        const user = await User.findOne({ email }).select("balance");
        return user?.balance ?? 1000;
    } catch (err) {
        console.error("Balance load failed:", err.message);
        return 1000;
    }
}

// ── Atomically deduct stake from MongoDB before match starts ─────────────────
async function deductStakeFromDB(email, amount) {
    const result = await User.findOneAndUpdate(
        { email, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true }
    );
    if (!result) {
        throw new Error(`Insufficient funds in DB for ${email}`);
    }
    return result.balance;
}

function findExistingRoomForEmail(email, rooms) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (
            room.players.player1?.email === email ||
            room.players.player2?.email === email
        ) {
            return { roomId, room };
        }
    }
    return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
module.exports = (io, rooms, createRoom, getRoom, broadcastGameState) => {
    io.on("connection", (socket) => {
        console.log(`✅ Socket connected [${socket.id}] user: ${socket.user?.email}`);

        const existingRoom = findExistingRoomForEmail(socket.user.email, rooms);

        if (existingRoom) {
            const room = existingRoom.room;

            // the reconnect assignment block below.
            const otherRole =
                room.players.player1.email === socket.user.email ? "player2" : "player1";
            const otherPlayerSocketId = room.players[otherRole]?.socketId;
            const isOtherOnline =
                otherPlayerSocketId && io.sockets.sockets.has(otherPlayerSocketId);

            if (!isOtherOnline) {
                delete rooms[existingRoom.roomId];
                return;
            }

            // Safe to reconnect — update socket ID for the returning player
            if (room.players.player1.email === socket.user.email) {
                room.players.player1.socketId = socket.id;
                socket.playerRole = "player1";
            } else if (room.players.player2.email === socket.user.email) {
                room.players.player2.socketId = socket.id;
                socket.playerRole = "player2";
            }

            socket.playerRoomId = existingRoom.roomId;
            socket.currentRoomId = existingRoom.roomId;
            socket.join(existingRoom.roomId);

            console.log(`♻️ Reconnected ${socket.user.email}`);

            socket.emit("player-role", socket.playerRole);
            broadcastGameState(io, rooms, existingRoom.roomId);
            return;
        }

        // ── find-match ────────────────────────────────────────────────────────
        socket.on("find-match", async ({ stake = 100 } = {}) => {
            const stakeAmount = Number(stake);

            //  Enforce both MIN and MAX bet server-side.
            if (!Number.isFinite(stakeAmount) || stakeAmount < MIN_BET || stakeAmount > MAX_BET) {
                socket.emit("error", `Stake must be between R${MIN_BET} and R${MAX_BET}`);
                return;
            }

            // Prevent duplicate queue entries for the same email
            if (
                waitingPlayer &&
                waitingPlayer.socket.user.email === socket.user.email
            ) {
                socket.emit("error", "Already waiting for a match");
                return;
            }

            // First player waits
            if (!waitingPlayer) {
                waitingPlayer = { socket, stake: stakeAmount };
                console.log(`⏳ ${socket.user.email} waiting for opponent`);
                socket.emit("waiting", { message: "Waiting for opponent..." });
                return;
            }

            const p1Socket = waitingPlayer.socket;
            const p1Stake = waitingPlayer.stake;
            const p2Socket = socket;
            const p2Stake = stakeAmount;

            // economy by letting a low-risk player win a high-value pot.
            if (p1Stake !== p2Stake) {
                socket.emit(
                    "error",
                    `Stake mismatch: opponent is waiting with R${p1Stake}. Please match their stake to join.`
                );
                return;
            }

            // Clear the waiting slot 
            waitingPlayer = null;

            // Load current balances from MongoDB
            const p1Balance = await loadPlayerBalance(p1Socket.user.email);
            const p2Balance = await loadPlayerBalance(p2Socket.user.email);

            // Check both players can afford the stake
            if (p1Balance < p1Stake) {
                p1Socket.emit("error", "Insufficient balance to stake");
                return;
            }
            if (p2Balance < p2Stake) {
                p2Socket.emit("error", "Insufficient balance to stake");
                return;
            }

            // Deduct stakes from MongoDB atomically
            try {
                await deductStakeFromDB(p1Socket.user.email, p1Stake);
                await deductStakeFromDB(p2Socket.user.email, p2Stake);
            } catch (err) {
                console.error("Stake deduction failed:", err.message);
                p1Socket.emit("error", "Failed to deduct stake. Please try again.");
                p2Socket.emit("error", "Failed to deduct stake. Please try again.");
                return;
            }

            // Create room and assign players
            const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            const room = createRoom(roomId);

            // Set balances from what was in DB minus the now-committed stake
            room.bank.balances.player1 = p1Balance - p1Stake;
            room.bank.balances.player2 = p2Balance - p2Stake;

            // Initialise loan tracking
            room.bank.loansIssued = { player1: 0, player2: 0 };

            // Assign players and build pot
            assignPlayerToRoom(room, "player1", p1Socket, p1Stake);
            assignPlayerToRoom(room, "player2", p2Socket, p2Stake);

            // Join both sockets to the room channel
            p1Socket.join(roomId);
            p2Socket.join(roomId);

            // Tag both sockets with role and room
            p1Socket.playerRole = "player1";
            p1Socket.playerRoomId = roomId;
            p1Socket.currentRoomId = roomId;

            p2Socket.playerRole = "player2";
            p2Socket.playerRoomId = roomId;
            p2Socket.currentRoomId = roomId;

            console.log(`🎮 Match: ${p1Socket.user.email} vs ${p2Socket.user.email} in ${roomId}`);

            p1Socket.emit("match-found", { roomId, role: "player1" });
            p2Socket.emit("match-found", { roomId, role: "player2" });

            broadcastGameState(io, rooms, roomId);
        });

        // ── roll ──────────────────────────────────────────────────────────────
        socket.on("roll-dice", async () => {
            if (isRateLimited(socket.id, "roll")) {
                socket.emit("error", "Rolling too fast");
                return;
            }

            const roomId = socket.playerRoomId;
            if (!roomId) return;

            const room = rooms[roomId];
            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "Not authorised to roll");
                return;
            }

            if (room.currentTurn !== role) {
                socket.emit("error", "Not your turn");
                return;
            }

            let result;
            try {
                result = processRoll(room);
            } catch (err) {
                socket.emit("error", err.message);
                return;
            }

            io.to(roomId).emit("dice-result", {
                d1: result.d1,
                d2: result.d2,
                sum: result.sum,
                roller: result.roller,
                message: result.message,
                point: result.point,
                nextTurn: result.nextTurn,
                roundOver: result.roundOver,
                winnerRole: result.winnerRole
            });

            if (result.roundOver && result.winnerRole) {
                // Guard: never pay out an empty pot
                if (room.pot > 0) {
                    const payout = room.pot;
                    creditBalance(room, result.winnerRole, payout);
                    room.pot = 0;
                    room.player1Stake = 0;
                    room.player2Stake = 0;
                    room.isFirstRoll = true;
                    room.point = null;
                    room.currentTurn = getOtherRole(result.winnerRole);


                    const p1Loan = room.bank.loansIssued.player1;
                    const p2Loan = room.bank.loansIssued.player2;
                    // Reset loan tracking for the next round
                    room.bank.loansIssued = { player1: 0, player2: 0 };


                    io.to(roomId).emit("round-winner", {
                        winner: result.winnerRole,
                        payout,
                        balances: room.bank.balances
                    });

                    await persistBalances(room, { player1: p1Loan, player2: p2Loan });

                    delete rooms[roomId];
                }
            }

            broadcastGameState(io, rooms, roomId);
        });

        // ── place-bet ─────────────────────────────────────────────────────────
        socket.on("place-bet", ({ amount } = {}) => {
            if (isRateLimited(socket.id, "place-bet")) {
                socket.emit("error", "Betting too fast");
                return;
            }

            const betAmount = Number(amount);
            if (!isValidAmount(betAmount)) {
                socket.emit("error", `Bet must be between R${MIN_BET} and R${MAX_BET}`);
                return;
            }

            const roomId = socket.playerRoomId;
            if (!roomId) return;

            const room = rooms[roomId];
            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "Not authorised to bet");
                return;
            }

            try {
                debitBalance(room, role, betAmount);
                room.pot += betAmount;
                room.roundContributions = room.roundContributions || { player1: 0, player2: 0 };
                room.roundContributions[role] += betAmount;
            } catch (err) {
                socket.emit("error", err.message);
                return;
            }

            broadcastGameState(io, rooms, roomId);
        });

        // ── request-loan ──────────────────────────────────────────────────────
        socket.on("request-loan", ({ amount } = {}) => {
            if (isRateLimited(socket.id, "request-loan")) {
                socket.emit("error", "Too many loan requests");
                return;
            }

            const loanAmount = Number(amount);
            if (!Number.isFinite(loanAmount) || loanAmount <= 0 || loanAmount > MAX_LOAN) {
                socket.emit("error", `Loan must be between R1 and R${MAX_LOAN}`);
                return;
            }

            const roomId = socket.playerRoomId;
            if (!roomId) return;

            const room = rooms[roomId];
            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "Not authorised to request loan");
                return;
            }

            try {
                loanHandler(room, role, loanAmount);
            } catch (err) {
                socket.emit("error", err.message);
                return;
            }

            broadcastGameState(io, rooms, roomId);
        });

        // ── disconnect ────────────────────────────────────────────────────────
        // Clear waitingPlayer if the disconnecting 
        socket.on("disconnect", async () => {
            console.log(`❌ Socket disconnected [${socket.id}] user: ${socket.user?.email}`);

            // Clear the matchmaking queue if this player was waiting
            if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
                waitingPlayer = null;
                console.log(`🧹 Cleared waiting slot for ${socket.user.email}`);
            }

            cleanRateLimits(socket.id);

            const roomId = socket.playerRoomId;
            if (!roomId) return;

            const room = rooms[roomId];
            if (!room) return;

            // Persist current balances so a disconnect mid-round doesn't wipe progress
            await persistBalances(room);

            // Notify the other player
            const otherRole = getOtherRole(socket.playerRole);
            const otherPlayer = room.players[otherRole];
            if (otherPlayer?.socketId) {
                io.to(otherPlayer.socketId).emit(
                    "opponent-disconnected",
                    { message: "Your opponent disconnected." }
                );
            }
        });
    });
};