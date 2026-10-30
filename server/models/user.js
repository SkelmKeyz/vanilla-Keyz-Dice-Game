const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, "Invalid email format"]
    },
    password: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    balance: {
        type: Number,
        default: 1000,
        min: 0
    },

    // otp database
    otp: {
        type: String,
        default: null
    },
    otpExpires: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);