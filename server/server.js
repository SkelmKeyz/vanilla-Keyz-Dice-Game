require("dns").setDefaultResultOrder("ipv4first");
require("dotenv").config();


// Dependencies
const express = require("express");
const cors = require("cors");
const http = require("http");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

// Services
const otpRoutes = require("./routes/otpRoutes");
const authRoutes = require("./routes/authRoutes");
const socketAuth = require("./middleware/socketAuth");
const { rooms, getRoom, createRoom } = require("./services/roomManager");
const initializeGameSocket = require("./sockets/gameSocket");
const broadcastGameState = require("./utils/broadcastGameState");
const connectDB = require("./config/database");



// ── Env guard — fail fast if critical config is missing ───────────────────────
if (!process.env.MONGO_URI) {
    console.error("FATAL: MONGO_URI is missing from .env");
    process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("FATAL: JWT_SECRET must be at least 32 characters");
    process.exit(1);
}
if (!process.env.CLIENT_URL) {
    console.error("FATAL: CLIENT_URL is missing from .env");
    process.exit(1);
}

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 10000;

// Trust Render's reverse proxy
app.set('trust proxy', 1);

// ── 1. Security headers (must be first) ──────────────────────────────────────
app.use(helmet());

// ── 2. CORS ───────────────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}));

// ── 3. Body parser ────────────────────────────────────────────────────────────
app.use(express.json());

// ── 4. Rate limiters (must be before routes) ─────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "Too many requests. Please try again in 15 minutes." }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many OTP requests. Please try again in 15 minutes." }
});

app.use("/api/auth", authLimiter);
app.use("/api/otp", otpLimiter);

// ── 5. Routes ─────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Server is running!"));
app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);

// ── 6. Socket.IO ──────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"]
    }
});

io.use(socketAuth);
initializeGameSocket(io, rooms, createRoom, getRoom, broadcastGameState);

// ── 7. Connect DB and start server ────────────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();
        httpServer.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`✅ MONGO connected, ready for game`);
        });
    } catch (err) {
        console.error("❌ Failed to start:", err.message);
        process.exit(1);
    }
};

startServer();