const { processRoll } = require("../services/gameService");
const { applyBankRules, requestLoan } = require("../services/bankService");
const User = require("../models/user");

const MIN_BET = 20;
const MAX_BET = 10000;
const MAX_LOAN = 500;
const rateLimits = {};

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
    if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Invalid amount");
    }
    if (room.bank.balances[role] < amount) {
        throw new Error("Insufficient balance");
    }
    room.bank.balances[role] -= amount;
}

function creditBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Invalid credit amount");
    }
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
async function persistBalances(room) {
    try {
        const p1Email = room.players.player1?.email;
        const p2Email = room.players.player2?.email;

        if (p1Email) {
            await User.updateOne(
                { email: p1Email },
                { $set: { balance: room.bank.balances.player1 } }
            );
        }
        if (p2Email) {
            await User.updateOne(
                { email: p2Email },
                { $set: { balance: room.bank.balances.player2 } }
            );
        }
    } catch (err) {
        // Non-fatal: game continues, balance just not persisted this round
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
        return 1000; // fallback to default
    }
}

// ── Main export ───────────────────────────────────────────────────────────────
module.exports = (io, rooms, createRoom, getRoom, broadcastGameState) => {
    io.on("connection", (socket) => {
        console.log(`✅ Socket connected [${socket.id}]`);

        // ── join-room ─────────────────────────────────────────────────────────
        socket.on("join-room", async ({ roomId, stake } = {}) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            if (socket.currentRoomId && socket.currentRoomId !== roomId) {
                socket.emit("error", "You are already in another room");
                return;
            }

            const stakeAmount = Number(stake);
            if (!Number.isFinite(stakeAmount) || stakeAmount < MIN_BET) {
                socket.emit("error", `Minimum stake is R${MIN_BET}`);
                return;
            }

            const room = createRoom(roomId);
            if (!room) {
                socket.emit("error", "Could not create or find room");
                return;
            }

            let assignedRole = null;

            // ── Reconnect: player already in room ─────────────────────────────
            for (const role of ["player1", "player2"]) {
                const player = room.players[role];
                if (player?.email === socket.user.email) {
                    if (player.socketId && player.socketId !== socket.id) {
                        const prev = io.sockets.sockets.get(player.socketId);
                        if (prev) {
                            prev.leave(roomId);
                            prev.playerRole = null;
                            prev.playerRoomId = null;
                            prev.disconnect(true);
                        }
                    }
                    player.socketId = socket.id;
                    assignedRole = role;
                    break;
                }
            }

            // ── New player joining ────────────────────────────────────────────
            if (!assignedRole) {
                for (const role of ["player1", "player2"]) {
                    const player = room.players[role];
                    if (!player?.socketId) {
                        // Load persisted balance from MongoDB
                        const persistedBalance = await loadPlayerBalance(socket.user.email);

                        if (role === "player1") {
                            if (persistedBalance < stakeAmount) {
                                socket.emit("error", "Insufficient balance for stake");
                                return;
                            }
                            room.players[role] = { socketId: socket.id, email: socket.user.email };
                            room.bank.balances["player1"] = persistedBalance;
                            room.stake = stakeAmount;
                            room.player1Stake = stakeAmount;
                            room.player2Stake = 0;
                            room.bank.balances["player1"] -= stakeAmount;
                            room.pot = stakeAmount;
                        } else {
                            if (!room.stake) {
                                socket.emit("error", "Room has no stake set yet");
                                return;
                            }
                            if (stakeAmount !== room.stake) {
                                socket.emit("error", `You must match the room stake of R${room.stake}`);
                                return;
                            }
                            const p2Balance = await loadPlayerBalance(socket.user.email);
                            if (p2Balance < stakeAmount) {
                                socket.emit("error", "Insufficient balance for stake");
                                return;
                            }
                            room.players[role] = { socketId: socket.id, email: socket.user.email };
                            room.bank.balances["player2"] = p2Balance;
                            room.player2Stake = stakeAmount;
                            room.bank.balances["player2"] -= stakeAmount;
                            room.pot += stakeAmount;
                        }

                        assignedRole = role;
                        break;
                    }
                }
            }

            if (!assignedRole) {
                socket.emit("room-full", "Room is full");
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
                stake: room.stake,
                player1Stake: room.player1Stake,
                player2Stake: room.player2Stake,
                balances: room.bank.balances,
                loanPool: room.bank.loanPool,
                role: assignedRole
            });

            emitRoomState(io, rooms, roomId, broadcastGameState);
        });

        // ── roll-dice ─────────────────────────────────────────────────────────
        socket.on("roll-dice", async (payload) => {
            const roomId = payload?.roomId;

            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            if (isRateLimited(socket.id, "roll-dice", 1)) {
                socket.emit("error", "Rolling too fast — slow down!");
                return;
            }

            const room = getRoom(roomId);
            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            if (room.isProcessing) {
                socket.emit("error", "A roll is already in progress");
                return;
            }

            if (!room.player1Stake || !room.player2Stake) {
                socket.emit("error", "Both players must stake before rolling");
                return;
            }

            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "You are not authorized to roll in this room");
                return;
            }

            if (room.currentTurn !== role) {
                socket.emit("error", "It is not your turn");
                return;
            }

            room.isProcessing = true;

            try {
                const result = processRoll(room);

                io.to(roomId).emit("dice-result", {
                    d1: result.d1,
                    d2: result.d2,
                    sum: result.sum,
                    roller: role,
                    nextTurn: result.nextTurn,
                    message: result.message
                });

                if (result.roundOver && result.winnerRole) {
                    const winnerRole = result.winnerRole;
                    const loserRole = getOtherRole(winnerRole);
                    const payout = room.pot;

                    creditBalance(room, winnerRole, payout);
                    room.pot = 0;
                    room.player1Stake = 0;
                    room.player2Stake = 0;

                    // Update win tracking
                    room.bank.winStreak[winnerRole] = (room.bank.winStreak[winnerRole] || 0) + 1;
                    room.bank.winStreak[loserRole] = 0;
                    room.bank.totalWins[winnerRole] = (room.bank.totalWins[winnerRole] || 0) + 1;

                    const bankResult = applyBankRules(room, winnerRole);

                    // Persist balances to MongoDB (non-blocking)
                    persistBalances(room);

                    io.to(roomId).emit("round-winner", {
                        winner: winnerRole,
                        loser: loserRole,
                        payout,
                        balances: room.bank.balances,
                        bankMessage: bankResult.taxed ? bankResult.message : null,
                        // Remind players to stake for next round
                        nextAction: "Place your bets for the next round!"
                    });
                }

                emitRoomState(io, rooms, roomId, broadcastGameState);
            } finally {
                room.isProcessing = false;
            }
        });

        // ── place-bet ─────────────────────────────────────────────────────────
        socket.on("place-bet", ({ roomId, amount } = {}) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            if (isRateLimited(socket.id, "place-bet", 2)) {
                socket.emit("error", "Betting too fast");
                return;
            }

            const room = getRoom(roomId);
            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "You are not authorized to bet in this room");
                return;
            }

            const betAmount = Number(amount);
            if (!isValidAmount(betAmount)) {
                socket.emit("error", `Bet must be between R${MIN_BET} and R${MAX_BET}`);
                return;
            }

            try {
                debitBalance(room, role, betAmount);
            } catch (err) {
                socket.emit("error", err.message);
                return;
            }

            room.pot += betAmount;
            if (role === "player1") {
                room.player1Stake = (room.player1Stake || 0) + betAmount;
            } else {
                room.player2Stake = (room.player2Stake || 0) + betAmount;
            }

            // Track last 3 bets for bank rules
            if (!room.bank.last3Bets[role]) room.bank.last3Bets[role] = [];
            room.bank.last3Bets[role].push(betAmount);
            if (room.bank.last3Bets[role].length > 3) {
                room.bank.last3Bets[role].shift();
            }

            emitRoomState(io, rooms, roomId, broadcastGameState);
        });

        // ── request-loan ──────────────────────────────────────────────────────
        socket.on("request-loan", ({ roomId, amount } = {}) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            if (isRateLimited(socket.id, "request-loan", 1)) {
                socket.emit("error", "Too many loan requests");
                return;
            }

            const room = getRoom(roomId);
            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "Unauthorized");
                return;
            }

            const loanAmount = Number(amount);
            if (!isValidAmount(loanAmount)) {
                socket.emit("error", `Loan must be between R${MIN_BET} and R${MAX_BET}`);
                return;
            }

            if (!room.bank.loansIssued) {
                room.bank.loansIssued = { player1: 0, player2: 0 };
            }

            if ((room.bank.loansIssued[role] || 0) + loanAmount > MAX_LOAN) {
                socket.emit("error", `Loan limit of R${MAX_LOAN} reached`);
                return;
            }

            try {
                const result = requestLoan(room, role, loanAmount);
                room.bank.loansIssued[role] = (room.bank.loansIssued[role] || 0) + loanAmount;
                socket.emit("loan-granted", { message: result.message });
                emitRoomState(io, rooms, roomId, broadcastGameState);
            } catch (err) {
                socket.emit("error", err.message);
            }
        });

        // ── disconnect ────────────────────────────────────────────────────────
        socket.on("disconnect", () => {
            console.log(`❌ Socket disconnected [${socket.id}]`);

            cleanRateLimits(socket.id);

            const roomId = socket.playerRoomId;
            if (!roomId) return;

            const room = getRoom(roomId);
            if (!room) return;

            const role = socket.playerRole;
            if (role && room.players[role]?.socketId === socket.id) {
                room.players[role].socketId = null;

                io.to(roomId).emit("player-disconnected", {
                    message: `${role} disconnected. Waiting for reconnect...`,
                    role
                });
            }
        });
    });
};