const jwt = require("jsonwebtoken");
const User = require("../models/user");

async function socketAuth(socket, next) {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        return next(new Error("Unauthorized: No token provided"));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId);
        if (!user || !user.isVerified) {
            return next(new Error("Unauthorized: User not found or not verified"));
        }

        // Fixed: was user_Id (ReferenceError), now correctly user._id
        socket.user = { userId: user._id, email: user.email };
        next();
    } catch (err) {
        next(new Error("Unauthorized: Invalid token"));
    }
}

module.exports = socketAuth;