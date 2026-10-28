const { processRoll } = require("../services/gameService");
const { applyBankRules } = require("../services/bankService");
const User = require("../models/user");
const GameResult = require("../models/gameResult");
const { assignPlayerToRoom } = require("../services/roomManager");
const { requestLoan: loanHandler } = require("./socketHandler/loanHandler");
const { getOwnedRoomSeat, getOtherRole } = require("./socketHandler/roleHelpers");

const MIN_BET = 20;
const MAX_BET = 10000;

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
const rateLimits = {};

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

// ── Persist balances to MongoDB after round end ───────────────────────────────
async function persistBalances(room, loansOverride) {
    try {
        const loans = loansOverride || room.bank.loansIssued || { player1: 0, player2: 0 };
        const p1Email = room.players.player1?.email;
        const p2Email = room.players.player2?.email;

        if (p1Email) {
            const p1Final = Math.max(0, room.bank.balances.player1 - loans.player1);
            await User.updateOne({ email: p1Email }, { $set: { balance: p1Final } });
        }
        if (p2Email) {
            const p2Final = Math.max(0, room.bank.balances.player2 - loans.player2);
            await User.updateOne({ email: p2Email }, { $set: { balance: p2Final } });
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
    if (!result) throw new Error(`Insufficient funds in DB for ${email}`);
    return result.balance;
}

// ── Find existing room for a returning email ──────────────────────────────────
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
    // Single waitingPlayer slot — not shadowed
    let waitingPlayer = null;
    const MIN_BET = 20;

    io.on("connection", (socket) => {
        console.log(`✅ Socket connected [${socket.id}] user: ${socket.user?.email}`);

        // ── Reconnection path ─────────────────────────────────────────────────
        const existingRoom = findExistingRoomForEmail(socket.user.email, rooms);

        if (existingRoom) {
            const { roomId, room } = existingRoom;

            if (room.players.player1?.email === socket.user.email) {
                // Fixed: was sockectId (typo) — now socketId to match roleHelpers.js
                room.players.player1.socketId = socket.id;
                socket.playerRole = "player1";
            } else if (room.players.player2?.email === socket.user.email) {
                // Fixed: was sockectId (typo) — now socketId to match roleHelpers.js
                room.players.player2.socketId = socket.id;
                socket.playerRole = "player2";
            }

            socket.playerRoomId = roomId;
            socket.currentRoomId = roomId;
            socket.join(roomId);

            console.log(`♻️ Reconnected ${socket.user.email} to room ${roomId}`);
            socket.emit("player-role", socket.playerRole);
            broadcastGameState(io, rooms, roomId);
            return;
        }

        // ── find-match ────────────────────────────────────────────────────────
        socket.on("find-match", async ({ stake = 100 } = {}) => {
            const stakeAmount = Number(stake);

            if (!Number.isFinite(stakeAmount) || stakeAmount < MIN_BET || stakeAmount > MAX_BET) {
                socket.emit("error", `Stake must be between R${MIN_BET} and R${MAX_BET}`);
                return;
            }

            if (waitingPlayer && waitingPlayer.socket.user.email === socket.user.email) {
                socket.emit("error", "Already waiting for a match");
                return;
            }

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

            if (p1Stake !== p2Stake) {
                socket.emit(
                    "error",
                    `Stake mismatch: opponent is waiting with R${p1Stake}. Please match their stake to join.`
                );
                return;
            }

            waitingPlayer = null;

            try {
                const p1Balance = await loadPlayerBalance(p1Socket.user.email);
                const p2Balance = await loadPlayerBalance(p2Socket.user.email);

                if (p1Balance < p1Stake) {
                    p1Socket.emit("error", "Insufficient balance for this stake");
                    p2Socket.emit("error", "Opponent has insufficient balance. Match cancelled.");
                    return;
                }
                if (p2Balance < p2Stake) {
                    p2Socket.emit("error", "Insufficient balance for this stake");
                    p1Socket.emit("error", "Opponent has insufficient balance. Match cancelled.");
                    return;
                }

                // Deduct stakes atomically from DB
                await deductStakeFromDB(p1Socket.user.email, p1Stake);
                await deductStakeFromDB(p2Socket.user.email, p2Stake);

                const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                const room = createRoom(roomId);

                // Assign players with correct socketId spelling
                assignPlayerToRoom(room, "player1", p1Socket, p1Stake);
                assignPlayerToRoom(room, "player2", p2Socket, p2Stake);

                // Load actual balances from DB into room
                room.bank.balances.player1 = p1Balance - p1Stake;
                room.bank.balances.player2 = p2Balance - p2Stake;

                // Set socket properties for both players
                p1Socket.playerRole = "player1";
                p1Socket.playerRoomId = roomId;
                p1Socket.currentRoomId = roomId;
                p1Socket.join(roomId);

                p2Socket.playerRole = "player2";
                p2Socket.playerRoomId = roomId;
                p2Socket.currentRoomId = roomId;
                p2Socket.join(roomId);

                console.log(`🎮 Match created: ${roomId} | ${p1Socket.user.email} vs ${p2Socket.user.email}`);

                p1Socket.emit("match-found", { roomId, role: "player1" });
                p2Socket.emit("match-found", { roomId, role: "player2" });

                broadcastGameState(io, rooms, roomId);

            } catch (err) {
                console.error("Match creation error:", err.message);
                p1Socket.emit("error", "Match creation failed: " + err.message);
                socket.emit("error", "Match creation failed: " + err.message);
            }
        });

        // ── roll-dice ─────────────────────────────────────────────────────────
        socket.on("roll-dice", ({ roomId } = {}) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }
            if (isRateLimited(socket.id, "roll-dice")) {
                socket.emit("error", "Rolling too fast — slow down");
                return;
            }

            const room = getRoom(roomId);
            const role = getOwnedRoomSeat(socket, roomId, room);

            if (!role) {
                socket.emit("error", "Not authorised to roll");
                return;
            }

            if (room.currentTurn !== role) {
                socket.emit("error", "Not your turn to roll");
                return;
            }

            try {
                const result = processRoll(room);

                io.to(roomId).emit("dice-result", {
                    d1: result.d1,
                    d2: result.d2,
                    sum: result.sum,
                    roller: result.roller,
                    message: result.message,
                    point: result.point,
                    isFirstRoll: room.isFirstRoll
                });

                if (result.roundOver) {
                    const winnerRole = result.winnerRole;
                    const payout = room.pot;

                    creditBalance(room, winnerRole, payout);
                    room.pot = 0;
                    room.player1Stake = 0;
                    room.player2Stake = 0;
                    room.isFirstRoll = true;
                    room.point = null;
                    room.currentTurn = getOtherRole(winnerRole);

                    io.to(roomId).emit("round-winner", {
                        winner: winnerRole,
                        payout,
                        balances: room.bank.balances
                    });

                    persistBalances(room).catch(err =>
                        console.error("Persist error:", err.message)
                    );
                }

                broadcastGameState(io, rooms, roomId);

            } catch (err) {
                console.error("Roll error:", err.message);
                socket.emit("error", "Roll failed: " + err.message);
            }
        });

        // ── place-bet ─────────────────────────────────────────────────────────
        socket.on("place-bet", ({ roomId, amount, player } = {}) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }
            if (isRateLimited(socket.id, "place-bet")) {
                socket.emit("error", "Betting too fast — slow down");
                return;
            }

            const room = getRoom(roomId);
            const role = getOwnedRoomSeat(socket, roomId, room);

            if (!role) {
                socket.emit("error", "Not authorised to bet");
                return;
            }

            // Player can only bet for themselves
            if (player && player !== role) {
                socket.emit("error", "You can only bet for your own player");
                return;
            }

            const betAmount = Number(amount);
            if (!isValidAmount(betAmount)) {
                socket.emit("error", `Bet must be between R${MIN_BET} and R${MAX_BET}`);
                return;
            }

            try {
                debitBalance(room, role, betAmount);
                room.pot += betAmount;
                room.roundContributions[role] = (room.roundContributions[role] || 0) + betAmount;

                io.to(roomId).emit("bet-placed", {
                    player: role,
                    amount: betAmount,
                    pot: room.pot,
                    balances: room.bank.balances
                });

                broadcastGameState(io, rooms, roomId);

            } catch (err) {
                socket.emit("error", err.message);
            }
        });

        // ── request-loan ──────────────────────────────────────────────────────
        socket.on("request-loan", ({ roomId, amount } = {}) => {
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            const room = getRoom(roomId);
            const role = getOwnedRoomSeat(socket, roomId, room);

            if (!role) {
                socket.emit("error", "Not authorised to request a loan");
                return;
            }

            const loanAmount = Number(amount);
            if (!Number.isFinite(loanAmount) || loanAmount <= 0 || loanAmount > 500) {
                socket.emit("error", "Loan amount must be between R1 and R500");
                return;
            }

            try {
                loanHandler(room, role, loanAmount);

                io.to(roomId).emit("loan-granted", {
                    player: role,
                    amount: loanAmount,
                    balances: room.bank.balances,
                    loanPool: room.bank.loanPool
                });

                broadcastGameState(io, rooms, roomId);

            } catch (err) {
                socket.emit("error", err.message);
            }
        });

        // ── disconnect ────────────────────────────────────────────────────────
        socket.on("disconnect", () => {
            console.log(`❌ Socket disconnected [${socket.id}] user: ${socket.user?.email}`);

            // Remove from waiting queue if they were waiting
            if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
                waitingPlayer = null;
                console.log(`🗑️ Removed ${socket.user?.email} from waiting queue`);
            }

            cleanRateLimits(socket.id);
        });
    });
};