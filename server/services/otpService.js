const otpStore = {};

function createOTP(email) {

    const otp =
        Math.floor(
            100000 +
            Math.random() * 900000
        ).toString();

    otpStore[email] = {
        otp,
        expiresAt:
            Date.now() + 5 * 60 * 1000
    };

    return otp;
}

function verifyOTP(email, otp) {

    const stored = otpStore[email];

    if (!stored) {
        throw new Error("OTP not found");
    }

    if (
        Date.now() >
        stored.expiresAt
    ) {

        delete otpStore[email];

        throw new Error(
            "OTP expired"
        );
    }

    if (
        stored.otp !== otp
    ) {

        throw new Error(
            "Invalid OTP"
        );
    }

    delete otpStore[email];

    return true;
}

module.exports = {
    createOTP,
    verifyOTP
};