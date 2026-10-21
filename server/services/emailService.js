const transporter =
    require("../mailer");

async function sendOTPEmail(
    email,
    otp
) {

    await transporter.sendMail({
        from:
            process.env.EMAIL_USER,

        to: email,

        subject:
            "Keyz Dice Game OTP",

        html: `
            <h2>🎲 Keyz Dice Game</h2>
            <p>Your code:</p>
            <h1>${otp}</h1>
            <p>Expires in 5 minutes.</p>
        `
    });
}

module.exports = {
    sendOTPEmail
};