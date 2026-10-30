const User = require("../models/user");
const jwt = require("jsonwebtoken");

// ── Send OTP (Bypassed) ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
    try {
        // Since verification is disabled, just return success so frontend flows don't break
        res.json({ success: true, message: "OTP skipped (verification disabled)." });
    } catch (err) {
        console.error("OTP send error:", err.message);
        res.status(500).json({ error: "Failed to process request" });
    }
};

// ── Verify OTP (Bypassed) ────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Generate a token so the player can proceed to play immediately
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ verified: true, message: "Verification bypassed successfully", token });

    } catch (err) {
        console.error("Verify OTP error:", err.message);
        res.status(500).json({ error: "Verification failed" });
    }
};