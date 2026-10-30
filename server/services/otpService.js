const User = require("../models/user");
const { sendOTPEmail } = require("./emailService");

async function createOTP(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
        throw new Error("User not found");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes expiration
    await user.save();

    await sendOTPEmail(normalizedEmail, otp);
    return otp;
}

async function verifyOTP(email, otp) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
        throw new Error("User not found");
    }

    if (user.isVerified) {
        throw new Error("Email is already verified");
    }

    if (!user.otp || Date.now() > user.otpExpires) {
        throw new Error("OTP expired or not found");
    }

    if (user.otp !== otp) {
        throw new Error("Invalid OTP");
    }

    // Mark as verified and clear temporary OTP fields
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return true;
}

module.exports = {
    createOTP,
    verifyOTP
};