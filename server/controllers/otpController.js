const { createOTP, verifyOTP } = require("../services/otpService");
const { sendOTPEmail } = require("../services/emailService");
const User = require("../models/user");

// ── Send OTP ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== "string" || !email.includes("@")) {
            return res.status(400).json({ error: "Valid email is required" });
        }

        const otp = createOTP(email.toLowerCase().trim());
        await sendOTPEmail(email.toLowerCase().trim(), otp);

        res.json({ success: true });
    } catch (err) {
        console.error("OTP send error:", err.message);
        res.status(500).json({ error: "Failed to send OTP" });
    }
};

// ── Verify OTP ────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ verified: false, error: "Email and OTP are required" });
    }

    try {
        verifyOTP(email.toLowerCase().trim(), otp);

        // Mark account as verified in MongoDB
        await User.updateOne(
            { email: email.toLowerCase().trim() },
            { $set: { isVerified: true } }
        );

        res.json({ verified: true });
    } catch (err) {
        res.status(400).json({ verified: false, error: err.message });
    }
};