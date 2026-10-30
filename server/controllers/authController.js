const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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
            return res.status(400).json({ error: "Email already registered" });
        }

        const hashed = await bcrypt.hash(password, 12);

        // Register user and set isVerified to true by default so they can play right away
        const user = await User.create({
            email: normalizedEmail,
            password: hashed,
            isVerified: true
        });

        // Automatically generate a JWT token upon registration so they are logged in instantly
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            message: "User registered successfully.",
            token,
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

        // Verification check removed — players can login and play immediately

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

// ── Verify OTP (Kept as a dummy endpoint just in case frontend still calls it) ──────────────────────────────
exports.verifyOTP = async (req, res) => {
    res.json({ message: "OTP verification is disabled. You can play right away." });
};