const { createOTP, verifyOTP } = require("../services/otpService");
const { sendOTPEmail } = require("../services/emailService");
const User = require("../models/user");
const jwt = require("jsonwebtoken");

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
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: "Email and OTP are required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ error: "Email is already verified" });
        }

        // Check if OTP matches and hasn't expired
        if (user.otp !== otp || Date.now() > user.otpExpires) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // Mark user as verified and clear OTP fields
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Generate JWT token immediately upon successful verification so they can start playing
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ verified: true, message: "Email verified successfully", token });

    } catch (err) {
        console.error("Verify OTP error:", err.message);
        res.status(500).json({ error: "Verification failed" });
    }
};