const nodemailer = require("nodemailer");

//console.log("MAILER FILE LOADED");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }

});

transporter.verify((error, success) => {
    if (error) {
        //console.log("VERIFY ERROR:", error);
    } else {
        //console.log("SMTP READY");
    }
});

//console.log("TRANSPORTER:", transporter);
//console.log("SENDMAIL:", typeof transporter.sendMail);

module.exports = transporter;