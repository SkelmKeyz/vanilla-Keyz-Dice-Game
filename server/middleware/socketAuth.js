const jwt = require("jsonwebtoken")
// ── Socket Auth Middleware ────────────────────────────────────────────────────
function socketAuth(socket, next) {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error("Unautorized"));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch {
        next(new Error("Unauthorized"));
    }
};

module.exports = socketAuth;