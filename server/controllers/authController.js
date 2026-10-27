const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function isValidEmail(email) {
    return typeof email === "string" && /^\S+@\S+\.\S+$/.test(email.trim());
}

function isValidPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

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

        const user = await User.create({
            email: normalizedEmail,
            password: hashed
        });

        res.status(201).json({
            message: "User registered successfully",
            user: { id: user._id, email: user.email }
        });

    } catch (err) {
        console.error("Register error:", err.message);
        res.status(500).json({ error: "Registration failed" });
    }
};

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