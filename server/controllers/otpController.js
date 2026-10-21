const transporter = require("../mailer");

const otpStore = {};
// ── Send OTP ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Keyz Dice Game OTP",
            html: `<h2>🎲 Keyz Dice Game</h2><p>Your code: <h1>${otp}</h1></p><p>Expires in 5 minutes.</p>`
        });
        res.json({ success: true });
    } catch (err) {
        console.error("EMAIL ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// ── Verify OTP ────────────────────────────────────────────────────────────────
exports.verifyOTP = (req, res) => {
    const { email, otp } = req.body;
    const stored = otpStore[email];
    if (!stored) return res.status(400).json({ verified: false, error: "OTP not found" });
    if (Date.now() > stored.expiresAt) {
        delete otpStore[email];
        return res.status(400).json({ verified: false, error: "OTP expired" });
    }
    if (stored.otp === otp) {
        delete otpStore[email];
        return res.json({ verified: true });
    }
    return res.status(400).json({ verified: false, error: "Invalid OTP" });
};