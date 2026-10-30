const nodemailer = require("nodemailer");

console.log("MAILER FILE LOADED");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }

});

// Active verification to catch authentication failures on startup
transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP VERIFY ERROR: Gmail connection failed. Check your EMAIL_USER and App Password.", error);
    } else {
        console.log("SMTP READY: Server is successfully connected to Gmail.");
    }
});

console.log("TRANSPORTER:", transporter);
console.log("SENDMAIL:", typeof transporter.sendMail);

module.exports = transporter;