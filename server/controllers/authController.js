const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendOTPEmail } = require("../services/emailService");

function isValidEmail(email) {
    return typeof email === "string" && /^\S+@\S+\.\S+$/.test(email.trim());
}

function isValidPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

// ── Register ──────────────────────────
exports.register = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "Valid email is required" });
    }

    if (!password || !isValidPassword(password)) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });

        if (existing) {
            if (existing.isVerified) {
                return res.status(400).json({ error: "Email already registered" });
                // Optional: If user exists but isn't verified, you could resend a new OTP here
            }

            // Optional: If user exists but isn't verified, regenerate OTP and resend
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            existing.otp = otp;
            existing.otpExpires = Date.now() + 5 * 60 * 1000;
            await existing.save();

            await sendOTPEmail(normalizedEmail, otp);
            return res.json({ message: "Verification code resent. Please check your inbox." });
        }

        const hashed = await bcrypt.hash(password, 12);

        // Generate a 6-digit OTP and set 5-minute expiration
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + 5 * 60 * 1000;

        const user = await User.create({
            email: normalizedEmail,
            password: hashed,
            otp,
            otpExpires,
            isVerified: false
        });

        // Send the OTP email
        await sendOTPEmail(normalizedEmail, otp);

        res.status(201).json({
            message: "User registered successfully. Please check your email for the OTP.",
            user: { id: user._id, email: user.email }
        });

    } catch (err) {
        console.error("Register error:", err.message);
        res.status(500).json({ error: "Registration failed" });
    }
};

// ── Login ──────────────────────────────────────
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "Valid email is required" });
    }

    if (!password) {
        return res.status(400).json({ error: "Password is required" });
    }

    try {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Enforce email verification before allowing gameplay
        if (!user.isVerified) {
            return res.status(403).json({
                error: "Email not verified. Please check your inbox for the OTP."
            });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ token });

    } catch (err) {
        console.error("Login error:", err.message);
        res.status(500).json({ error: "Login failed" });
    }
};

// ── Verify OTP ───────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: "Email and OTP are required" });
    }

    try {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ error: "Email is already verified" });
        }

        if (user.otp !== otp || Date.now() > user.otpExpires) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ message: "Email verified successfully", token });

    } catch (err) {
        console.error("Verify OTP error:", err.message);
        res.status(500).json({ error: "Verification failed" });
    }
};