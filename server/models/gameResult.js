const mongoose = require("mongoose");

const gameResultsSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    winner: { type: String, required: true },
    loser: { type: String, required: true },
    payout: { type: Number, required: true },
    reason: {
        type: String,
        enum: ["natural", "point", "craps", "forfeit"],
        required: true
    },
    completedAt: { type: Date, default: Date.now }
});

gameResultsSchema.index({ roomId: 1 });
gameResultsSchema.index({ winner: 1 });

module.exports = mongoose.model("GameResult", gameResultsSchema);