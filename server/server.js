require("dns").setDefaultResultOrder("ipv4first");
require("dotenv").config();

// Core packages
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");

const { Server } = require("socket.io");

// Routes
const otpRoutes = require("./routes/otpRoutes");
const authRoutes = require("./routes/authRoutes");

// Middleware
const socketAuth = require("./middleware/socketAuth");

// Services
const { rooms, getRoom, createRoom, deleteRooms } = require("./services/roomManager");
const initializeGameSocket = require("./sockets/gameSocket");

// Utils
const broadcastGameState = require("./utils/broadcastGameState");

// DataBase
const connectDB =
    require("./config/database");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Server is running!"));

if (!process.env.MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is missing from your .env file.");
    process.exit(1);
}

app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
io.use(socketAuth);

initializeGameSocket(
    io,
    rooms,
    createRoom,
    getRoom,
    broadcastGameState
);

// ── DB + Server Start ─────────────────────────────────────────────────────────
connectDB();
httpServer.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`)
})

