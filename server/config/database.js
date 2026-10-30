const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI is missing in Render Environment');
        }
        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ MongoDB Error:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;