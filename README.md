🎲 Vanilla Keyz Dice Game
A realtime multiplayer dice betting game built with Vanilla JavaScript, Node.js, Express, MongoDB, and Socket.IO.

Vanilla Keyz Dice Game combines casino-inspired betting mechanics, a central banking system, player loans, and realtime multiplayer gameplay into a competitive online experience.

🚀 Live Demo
Frontend
https://vanilla-keyz-dice-game.vercel.app

Backend API
https://keyzdicegame.onrender.com

📸 Screenshots
Coming Soon

Login Screen
Multiplayer Matchmaking
Betting House
Central Bank
Dice Rolling
Game Log
Winner Screen
✨ Features
🎲 Realtime Multiplayer
Automatic matchmaking
Player role assignment
Room management
Live game synchronization
💰 Betting System
Minimum bet enforcement
Shared pot system
Automatic payout calculation
Realtime bet updates
🏦 Central Bank
Loan pool
Player loans
Balance tracking
Database persistence
🔄 Reconnection Support
Automatic reconnect detection
Room restoration
Player role restoration
Session recovery after refresh
📊 Banking Mechanics
Win tracking
Loss tracking
Win streaks
Loss streaks
Tax system
Buyback system
🔐 Security
JWT Authentication
Protected Socket.IO events
Room ownership validation
Rate limiting
Server-side game validation
🧩 Gameplay Flow
1. Find Match
Players enter matchmaking and are paired with an opponent.

2. Join Room
Both players are assigned:

player1
player2
and placed into a private game room.

3. Place Bets
Players contribute to the pot before rolling.

4. Roll Dice
The active roller throws the dice.

5. Win Conditions
The game evaluates dice outcomes and determines the winner.

6. Payout
The winner receives the pot and balances are updated.

7. Bank Events
Special banking rules may trigger:

Tax events
Buybacks
Loss streak transfers
Loan interactions
🛠 Tech Stack
Frontend
Vanilla JavaScript (ES6+)
HTML5
CSS3
Socket.IO Client
Vite
Backend
Node.js
Express.js
Socket.IO
JWT Authentication
MongoDB
Mongoose
Database
MongoDB Atlas
Deployment
Frontend
Vercel
Backend
Render
📂 Project Structure
vanilla-Keyz-Dice-Game
│
├── client/
│   ├── src/
│   ├── public/
│   └── index.html
│
├── server/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── sockets/
│   └── server.js
│
└── README.md
🔑 Environment Variables
Client (.env)
VITE_API_URL=https://keyzdicegame.onrender.com
Server (.env)
MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

PORT=10000

CLIENT_URL=https://vanilla-keyz-dice-game.vercel.app
🧪 Run Locally
Clone Repository
git clone https://github.com/SkelmKeyz/vanilla-Keyz-Dice-Game.git
cd vanilla-Keyz-Dice-Game
Install Client
cd client

npm install

npm run dev
Install Server
cd server

npm install

node server.js
📈 Current Features
✅ User Registration

✅ User Login

✅ JWT Authentication

✅ MongoDB Persistence

✅ Matchmaking

✅ Multiplayer Rooms

✅ Betting System

✅ Dice Rolling

✅ Pot Management

✅ Central Bank

✅ Loan Requests

✅ Realtime Socket.IO Updates

✅ Reconnection Support

✅ Room Recovery

✅ Role Recovery

✅ Responsive Interface

🛣 Roadmap
Beta v0.3
Match History
Global Leaderboards
Player Statistics
Achievement System
Sound Effects
Animated Rewards
Spectator Mode
Tournament Rooms
Version 1.0
Production-ready Economy
Friend Invites
Ranked Matches
Seasonal Events
Full Mobile Optimization
👨‍💻 Author
Skelm Keyz
Second-born project showcasing advanced Vanilla JavaScript development through realtime multiplayer gameplay.

GitHub: https://github.com/SkelmKeyz

📜 License
MIT License

Copyright (c) 2026 Skelm Keyz

🎲 Vanilla Keyz Dice Game Beta v0.2
Built with Vanilla JavaScript. Powered by Socket.IO. Backed by MongoDB.

"Just doing my thing." 🚀