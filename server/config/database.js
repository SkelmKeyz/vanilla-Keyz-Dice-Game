const mongoose = require("mongoose");

async function connectDB() {

    try {

        await mongoose.connect(
            process.env.MONGO_URI
        );

        console.log(
            "✅ MongoDB connected"
        );
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

console.log("DEBUG URI CHECK:", JSON.stringify(process.env.MONGO_URI));

module.exports = connectDB;