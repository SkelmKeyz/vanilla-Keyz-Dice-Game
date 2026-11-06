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

function creditBalance(room, winnerRole, payout) {

    if (
        typeof payout !== "number" ||
        payout <= 0
    ) {
        throw new Error(
            `Invalid credit amount: ${payout}`
        );
    }

    room.bank.balances[winnerRole] += payout;

    console.log("Winner:", winnerRole);
    console.log("Pot:", room.pot);
    console.log("Payout:", payout);
};


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
async function persistBalances(room) {
    try {
        const p1Email = room.players.player1?.email;
        const p2Email = room.players.player2?.email;

        if (p1Email) {
            await User.updateOne(
                { email: p1Email },
                {
                    $set: {
                        balance: Math.max(
                            0,
                            room.bank.balances.player1
                        )
                    }
                }
            );
        }

        if (p2Email) {
            await User.updateOne(
                { email: p2Email },
                {
                    $set: {
                        balance: Math.max(
                            0,
                            room.bank.balances.player2
                        )
                    }
                }
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
        { returnDocument: "after" }
    );

    if (!result) {
        throw new Error(`Insufficient funds in DB for ${email}`);
    }

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
                // socketId to match roleHelpers.js
                room.players.player1.socketId = socket.id;
                socket.playerRole = "player1";
            } else if (room.players.player2?.email === socket.user.email) {
                // socketId to match roleHelpers.js
                room.players.player2.socketId = socket.id;
                socket.playerRole = "player2";
            }

            socket.playerRoomId = roomId;
            socket.currentRoomId = roomId;
            socket.join(roomId);

            console.log(`♻️ Reconnected ${socket.user.email} to room ${roomId}`);
            console.log(
                "RECONNECTED",
                socket.id,
                socket.user?.email
            );
            socket.emit("player-role", {
                role: socket.playerRole,
                roomId
            });

            broadcastGameState(io, rooms, roomId);
        }

        if (
            socket.playerRoomId &&
            !existingRoom
        ) {

            socket.emit(
                "session-expired",
                {
                    message:
                        "Game session expired. Please find a new match."
                }
            );

        }

        // ── find-match ────────────────────────────────────────────────────────
        socket.on("find-match", async ({ stake = 100 } = {}) => {

            console.log("=================================");
            console.log("FIND MATCH");
            console.log("EMAIL:", socket.user.email);
            console.log("STAKE:", stake);
            console.log(
                "WAITING PLAYER:",
                waitingPlayer?.socket?.user?.email
            );
            console.log("=================================");


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
                console.log(
                    "NO PLAYER WAITING - STORING",
                    socket.user.email
                );
                waitingPlayer = { socket, stake: stakeAmount };
                console.log(`⏳ ${socket.user.email} waiting for opponent`);
                socket.emit("waiting", { message: "Waiting for opponent..." });
                return;
            }
            console.log(
                "MATCH ATTEMPT",
                waitingPlayer.socket.user.email,
                "VS",
                socket.user.email
            );

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

            console.log(
                "LOADING BALANCES..."
            );

            try {
                const p1Balance = await loadPlayerBalance(p1Socket.user.email);
                const p2Balance = await loadPlayerBalance(p2Socket.user.email);
                console.log(
                    "P1:",
                    p1Socket.user.email,
                    p1Balance
                );

                console.log(
                    "P2:",
                    p2Socket.user.email,
                    p2Balance
                );

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

                console.log("P1 BALANCE:", p1Balance);
                console.log("P2 BALANCE:", p2Balance);

                // Deduct stakes atomically from DB
                await deductStakeFromDB(p1Socket.user.email, p1Stake);
                console.log(
                    "P1 DEDUCTED"
                );
                await deductStakeFromDB(p2Socket.user.email, p2Stake);
                console.log(
                    "P2 DEDUCTED"
                );
                console.log("CREATING ROOM...");
                console.log(
                    "DEDUCTING STAKES..."
                );

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

                console.log("MATCH CREATED");

                p1Socket.emit("match-found", { roomId, role: "player1" });
                p2Socket.emit("match-found", { roomId, role: "player2" });

                p1Socket.emit("player-role", {
                    role: "player1",
                    roomId
                });
                p2Socket.emit("player-role", {
                    role: "player2",
                    roomId
                });

                broadcastGameState(io, rooms, roomId);

                console.log(
                    "FIND MATCH:",
                    socket.user.email,
                    "stake:",
                    stake
                );

            } catch (err) {
                console.error(
                    "MATCH ERROR:"
                );
                console.error(err);
                p1Socket.emit("error", "Match creation failed: " + err.message);
                socket.emit("error", "Match creation failed: " + err.message);
            }
        });

        // ── roll-dice ─────────────────────────────────────────────────────────
        socket.on("roll-dice", async ({ roomId } = {}) => {
            // Gate 1: Rate limit
            if (isRateLimited(socket.id, "roll-dice")) {
                socket.emit("error", "Too fast — one roll per second");
                return;
            }

            // Gate 2: Room ID format
            if (!isValidRoomId(roomId)) {
                socket.emit("error", "Invalid room ID");
                return;
            }

            const room = getRoom(roomId);
            if (!room) {
                socket.emit("error", "Room not found");
                return;
            }

            // Gate 3: Seat ownership (triple-check: roomId, role, email, socketId)
            const role = getOwnedRoomSeat(socket, roomId, room);
            if (!role) {
                socket.emit("error", "Not authorised to roll");
                return;
            }

            // Gate 4: Turn enforcement ← THIS WAS MISSING
            if (room.currentTurn !== role) {
                socket.emit("error", "Not your turn to roll");
                return;
            }
            // Gate 5: Both players present
            if (!room.players.player1?.email || !room.players.player2?.email) {
                socket.emit("error", "Not your turn to roll");
                return;
            }

            try {
                // Step 1: Generate dice result (mutates room.point, room.isFirstRoll, room.currentTurn)
                const result = processRoll(room);

                if (!result.roundOver) {
                    // Mid-round — just broadcast updated state
                    broadcastGameState(io, rooms, roomId);
                    io.to(roomId).emit("dice-result", {
                        d1: result.d1,
                        d2: result.d2,
                        sum: result.sum,
                        roller: result.roller,
                        message: result.message,
                        point: result.point
                    });
                    return;
                }

                // ── Round is over ────────────────────────────────────────────────────
                const winnerRole = result.winnerRole;
                const loserRole = winnerRole === "player1" ? "player2" : "player1";
                const payout = room.pot;

                // Step 2 & 3: Apply streak/tax rules BEFORE paying winner
                //   Pass the stake as the bet amount for last3Bets tracking

                // Update stats
                if (!room.bank.lossStreak) {
                    room.bank.lossStreak = {
                        player1: 0,
                        player2: 0
                    };
                }

                room.bank.totalWins[winnerRole]++;
                room.bank.winStreak[winnerRole]++;
                room.bank.winStreak[loserRole] = 0;

                room.bank.lossStreak[loserRole]++;
                room.bank.lossStreak[winnerRole] = 0;

                const taxResult = applyBankRules(room, winnerRole);
                console.log("TAX RESULT:", taxResult);

                if (taxResult.taxed) {
                    console.log("BANK EVENT:", taxResult.message);
                    io.to(roomId).emit(
                        "bank-tax",
                        {
                            player: winnerRole,
                            message: taxResult.message,
                            balances: room.bank.balances,
                            loanPool: room.bank.loanPool
                        }
                    );
                }

                // Step 4: Pay winner
                if (payout > 0) {
                    creditBalance(room, winnerRole, payout);
                }
                room.pot = 0;
                room.player1Stake = 0;
                room.player2Stake = 0;

                // Step 5: Handle roller transfer from tax/buyback
                if (taxResult.rollerTransfer) {
                    room.currentTurn = loserRole;
                } else {
                    // Loss streak check — 3 consecutive losses transfers roller
                    const lossStreak = room.bank.lossStreak[loserRole] || 0;
                    if (lossStreak >= 3) {
                        room.currentTurn = loserRole;
                        room.bank.lossStreak[loserRole] = 0;
                        io.to(roomId).emit("roller-transfer", {
                            reason: "3-loss-streak",
                            newRoller: loserRole
                        });
                    }
                    // else: current winner (roller) keeps rolling — currentTurn stays
                    // Note: processRoll already set currentTurn; we override here for buyback/streak logic
                }

                // Reset round state
                room.isFirstRoll = true;
                room.point = null;

                // Step 6: Persist balances to MongoDB
                await persistBalances(room, room.bank.loansIssued);

                // Step 7: Save game result record
                try {
                    await GameResult.create({
                        roomId,
                        winner: room.players[winnerRole].email,
                        loser: room.players[loserRole].email,
                        payout,
                        reason: result.reason || "point"
                    });
                } catch (dbErr) {
                    console.error("GameResult save failed:", dbErr.message);
                    // Non-fatal — game continues
                }

                io.to(roomId).emit("round-winner", {
                    winner: winnerRole,
                    payout,
                    balances: room.bank.balances
                });

                // Step 8: Broadcast everything
                broadcastGameState(io, rooms, roomId);
                io.to(roomId).emit("dice-result", {
                    d1: result.d1,
                    d2: result.d2,
                    sum: result.sum,
                    roller: result.roller,
                    message: result.message,
                    point: result.point,
                    roundOver: true,
                    payout,
                    taxMessage: taxResult.message
                });
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
            if (!room) {
                socket.emit(
                    "error",
                    "Room not found"
                );
                return;
            }

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

                if (!room.bank.last3Bets[role]) {
                    room.bank.last3Bets[role] = [];
                }

                room.bank.last3Bets[role].push(betAmount);

                if (room.bank.last3Bets[role].length > 3) {
                    room.bank.last3Bets[role].shift();
                }

                console.log(
                    "last3Bets:",
                    room.bank.last3Bets
                );

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
            if (!room) {
                socket.emit(
                    "error",
                    "Room not found"
                );
                return;
            }
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

            if (
                waitingPlayer &&
                waitingPlayer.socket.id === socket.id
            ) {

                waitingPlayer = null;
            }

            const roomId = socket.playerRoomId;

            if (roomId && rooms[roomId]) {

                const room = rooms[roomId];

                if (
                    room.players.player1?.socketId === socket.id
                ) {
                    room.players.player1.socketId = null;
                }

                if (
                    room.players.player2?.socketId === socket.id
                ) {
                    room.players.player2.socketId = null;
                }

                io.to(roomId).emit(
                    "player-disconnected",
                    {
                        message:
                            `${socket.user.email} disconnected`
                    }
                );

                setTimeout(() => {

                    const room = rooms[roomId];

                    if (!room) return;

                    const p1Connected =
                        room.players.player1?.socketId;

                    const p2Connected =
                        room.players.player2?.socketId;

                    if (!p1Connected && !p2Connected) {

                        delete rooms[roomId];

                        console.log(
                            `🗑️ Room deleted: ${roomId}`
                        );
                    }

                }, 60000);
            }

            cleanRateLimits(socket.id);
        });
    });
};