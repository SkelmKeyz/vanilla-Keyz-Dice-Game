# The Making of Keyz Dice Game

## A Complete Engineering Journey Through Full Stack Development, Authentication, Realtime Multiplayer Systems, MongoDB, Socket.IO, Game Design, Debugging, Refactoring and Deployment

**A source-based engineering textbook for self-taught developers, junior developers, students, maintainers, and future AI systems**

> **Scope and evidence note**  
> This book reverse engineers the repository as it exists now. It describes implemented behavior, not an aspirational specification. The source tree does not contain a reliable development diary, issue history, test reports, or design decision records. Therefore, "bugs discovered" below means defects and mismatches found by tracing the current implementation; it does not claim these were historically found and fixed during development. Likewise, debugging walkthroughs are reproducible investigations a maintainer can perform, not invented stories about past sessions. The book does not change or prescribe changes to existing project files.

---

# Contents

1. [How to read this engineering book](#1-how-to-read-this-engineering-book)
2. [The product and its actual boundaries](#2-the-product-and-its-actual-boundaries)
3. [Reconstructing the repository](#3-reconstructing-the-repository)
4. [Architecture: pages, HTTP, sockets, and data](#4-architecture-pages-http-sockets-and-data)
5. [Building the browser experience](#5-building-the-browser-experience)
6. [Authentication, passwords, tokens, and email OTP](#6-authentication-passwords-tokens-and-email-otp)
7. [Realtime multiplayer: the Socket.IO protocol](#7-realtime-multiplayer-the-socketio-protocol)
8. [Game rules as a state machine](#8-game-rules-as-a-state-machine)
9. [Balances, bets, loans, and persistence](#9-balances-bets-loans-and-persistence)
10. [Debugging by following evidence](#10-debugging-by-following-evidence)
11. [Defect register: what the code currently implies](#11-defect-register-what-the-code-currently-implies)
12. [Refactoring without losing the game](#12-refactoring-without-losing-the-game)
13. [Technology choices and alternatives](#13-technology-choices-and-alternatives)
14. [MVP boundaries versus production requirements](#14-mvp-boundaries-versus-production-requirements)
15. [Testing strategy and exercises](#15-testing-strategy-and-exercises)
16. [Deployment audit](#16-deployment-audit)
17. [Roadmap](#17-roadmap)
18. [Learning paths and references](#18-learning-paths-and-references)
19. [Glossary](#19-glossary)

---

# 1. How to read this engineering book

This is both a guided reading of one application and a practical software-engineering course. Read Chapters 2–4 first to build a system map. Then follow a single user journey through authentication, matchmaking, and a round. Keep the source open while reading. The repository map in Chapter 3 links the active files.

Three labels distinguish evidence from advice:

- **Observed:** directly represented in the checked-in code or configuration.
- **Consequence:** behavior that follows from the current control flow, but should still be reproduced in a running environment before treating it as a runtime observation.
- **Recommendation:** a proposed next step, not an existing feature or promise.

The stack labels some balances with `R`, and the README calls the project a betting game. This book uses *virtual credits* when describing the implementation. No payment processing, cash-out, financial settlement, or real-money ledger was found. Product owners must explicitly determine the legal and product implications before changing that boundary.

## The engineering method used here

Reverse engineering works best when it is systematic:

1. Find process entry points and package scripts.
2. Follow imports from those entry points. A file existing in a repository does not prove it is active.
3. Trace one request or event from browser to server and back.
4. Record the data shape at each boundary.
5. Compare names, IDs, and state transitions across modules.
6. Separate confirmed code facts from inferred behavior.
7. Reproduce important findings with logs, focused tests, or a local run.

This method is more reliable than assuming that filenames, comments, README prose, or a previous architecture note always match the running path.

---

# 2. The product and its actual boundaries

Keyz Dice Game is a browser-based, two-seat dice game. Users create accounts, log in, and connect to a Node server. The server supports a matchmaking queue and also contains a direct room-joining path. It generates dice values, tracks a turn and point, and keeps room balances, a pot, and a shared loan pool in memory. MongoDB stores account documents.

The high-level business idea appears to be a social game with wagering-like virtual credits. The active implementation is narrower than the feature list in the README: a few controls and service functions exist, but parts of the game economy are disconnected, and the active browser/server contract has mismatches that interfere with successful play.

## What is implemented

- A Vite multi-page browser project with an authentication page and a game page.
- Registration and login endpoints backed by MongoDB/Mongoose.
- Password hashing with bcryptjs and signed JWTs.
- OTP send and verify endpoints using email delivery.
- Socket.IO authentication using the same JWT.
- A process-local matchmaking queue and room map.
- Server-side dice generation using Node's cryptographic random integer API.
- An in-memory game state with turn, point, seats, pot, balances, and loan pool.
- Client rendering, game logs, dice face images, and action controls.

## What is not established as a production capability

- Persistent rooms or durable game history.
- A reliable settlement and ledger workflow.
- Mandatory email verification before login or gameplay.
- Multi-instance matchmaking or shared socket state.
- Payments, withdrawals, account funding, or actual currency settlement.
- Operational monitoring, automated backup, deployment automation, or a complete test suite.

## Explain it simply

Two signed-in browser users are meant to play a dice game together. The server is the referee: it knows whose turn it is, rolls the dice, updates the shared state, and sends that state to both players. Accounts live in MongoDB; active game rooms live in server memory. If the server restarts, active games are lost.

---

# 3. Reconstructing the repository

The workspace has two independently installed packages. This is a useful project boundary: the browser has a build tool and browser dependencies; the server has HTTP, database, security, and socket dependencies.

## Directory map

```
keyz-dice-game/
├── client/                   ← Vite browser project
│   ├── public/
│   │   └── images/           ← dice1.png … dice6.png (static assets)
│   ├── src/
│   │   ├── js/
│   │   │   ├── app/          ← shared modules: state, ui, bank, dice
│   │   │   ├── routes/       ← action modules: roll, placebet, sidebet, taxchoice
│   │   │   ├── login.js
│   │   │   ├── signup.js
│   │   │   └── verifyotp.js
│   │   ├── authscreen.js
│   │   └── main.js           ← game page entry point
│   ├── index.html            ← auth page
│   ├── app.html              ← game page
│   └── vite.config.js
│
└── server/                   ← Node/Express/Socket.IO process
    ├── config/               ← database.js, socket.js
    ├── controllers/          ← authController.js, otpController.js
    ├── middleware/           ← auth.js (HTTP), socketAuth.js (WS)
    ├── models/               ← user.js, gameResult.js
    ├── routes/               ← authRoutes.js, otpRoutes.js
    ├── services/             ← authService, bankService, emailService,
    │                            gameService, otpService, roomManager
    ├── sockets/
    │   ├── gameSocket.js     ← active socket event hub
    │   └── socketHandler/    ← modular handler files (some inactive)
    ├── utils/
    │   └── broadcastGameState.js
    └── server.js             ← process entry point
```

## The active server path

The Node process starts at `server/server.js`. It loads environment variables, creates Express and an HTTP server, configures security headers, CORS, JSON parsing, HTTP rate limits, routes, Socket.IO, and socket authentication. It imports `server/sockets/gameSocket.js` for active game events and `server/services/roomManager.js` for in-memory rooms.

### What `server.js` registers in order

```
1. helmet()                       — security headers
2. cors({ origin: CLIENT_URL })   — cross-origin requests
3. express.json()                 — body parser
4. authLimiter on /api/auth       — 20 req / 15 min
5. otpLimiter on /api/otp         — 10 req / 15 min
6. authRoutes at /api/auth        — register + login
7. otpRoutes at /api/otp          — send + verify
8. socketAuth (io.use)            — JWT check on WS upgrade
9. initializeGameSocket           — all socket events
```

**Why the order matters.** Express middleware runs in registration order. Rate limiters must be registered before the routes they protect. `helmet()` must be first because some of its headers (like `X-Content-Type-Options`) affect how browsers interpret every subsequent response.

## The active browser path

The Vite config registers two HTML entry points: `index.html` (auth page, loads `authscreen.js`) and `app.html` (game page, loads `main.js`). Vite produces two separate bundles at build time; in development, both pages are served from the same dev server.

---

# 4. Architecture: pages, HTTP, sockets, and data

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  index.html          app.html                                   │
│  authscreen.js  →→→  main.js                                    │
│  login.js            state.js   ui.js                          │
│  signup.js           roll.js    placebet.js                    │
│  verifyotp.js        sidebet.js                                │
│                                                                 │
│      ↕ fetch (HTTPS/HTTP)          ↕ Socket.IO (WSS/WS)        │
└───────────────────┬─────────────────────────┬───────────────────┘
                    │                         │
             ┌──────▼──────┐         ┌────────▼────────┐
             │  Express     │         │  Socket.IO       │
             │  /api/auth   │         │  gameSocket.js   │
             │  /api/otp    │         │                  │
             └──────┬──────┘         └────────┬─────────┘
                    │                         │
             ┌──────▼─────────────────────────▼─────────┐
             │  Services                                  │
             │  authController  gameService              │
             │  otpController   bankService              │
             │  emailService    roomManager              │
             └──────┬─────────────────────────┬──────────┘
                    │                         │
             ┌──────▼──────┐         ┌────────▼────────┐
             │  MongoDB     │         │  In-Memory Rooms │
             │  User model  │         │  (rooms Map)     │
             │  GameResult  │         │                  │
             └─────────────┘         └──────────────────┘
```

## Two transports, two contracts

**HTTP** is used for stateless operations: registering an account, logging in, requesting an OTP, verifying an OTP. Each request is complete on its own and carries its own credentials.

**WebSocket (Socket.IO)** is used for stateful, real-time game operations: finding a match, rolling dice, placing bets, receiving game state. The connection persists and is identified by the socket object on the server.

This split is a deliberate design choice. HTTP endpoints benefit from existing tooling (rate limiters, express-validator, REST clients). Game events need low latency and bi-directional push — sockets excel here.

## Data boundary: what lives where

| Data | Location | Persists across restart? |
|---|---|---|
| User account, email, password hash | MongoDB | Yes |
| User balance | MongoDB (synced at round end) | Yes |
| Active room state | Server memory (rooms Map) | No |
| JWT token | Browser (localStorage/memory) | Until expiry |
| OTP codes | Server memory / email | No |
| Dice results | Computed per-event, emitted | No |

---

# 5. Building the browser experience

## Why Vite?

Vite is a development server and build tool. For a project like this — vanilla JavaScript, no framework, a few pages — Vite provides:

- **Instant dev server start** via native ES module serving. The browser requests files as modules; Vite transforms only what is requested.
- **Hot Module Replacement (HMR):** change a JS file, the browser updates without a full page reload.
- **Production build:** Vite uses Rollup internally to bundle, tree-shake (remove unused code), and output optimized static files.
- **Environment variables:** `import.meta.env.VITE_API_URL` exposes safe client-side env vars from a `.env` file. Anything prefixed `VITE_` is included in the bundle; anything without that prefix is not.

**Alternative considered:** A plain HTML file with `<script>` tags works for a prototype. It does not give you HMR, bundling, or env variable injection. Webpack is the other major bundler option — heavier configuration, slower cold start.

## Multi-page setup

```js
// client/vite.config.js
export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                index: "index.html",   // → auth page
                app: "app.html",       // → game page
            },
        },
    },
});
```

**Observed:** Two HTML files, two entry points. This is a multi-page application (MPA) rather than a single-page application (SPA). Navigation between pages is a real browser navigation, not a client-side route change.

**Why not a SPA?** An SPA (React, Vue, or vanilla with a router) manages all navigation in JavaScript. The trade-off for a two-page app like this is overhead without benefit. A full page load on login-to-game is acceptable; the extra complexity of a router is not needed.

## Page 1: The auth page

`index.html` loads `src/authscreen.js`. Based on the file structure, `authscreen.js` orchestrates showing and hiding the login form, signup form, and OTP verification form — three logical views in a single page.

Supporting modules:
- `src/js/login.js` — handles login form submission
- `src/js/signup.js` — handles registration form submission
- `src/js/verifyotp.js` — handles OTP entry

### What `login.js` does

```js
// client/src/js/login.js (full observed content)
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auth/login`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        }
    );
    // ... stores token, redirects to app.html
});
```

**Key patterns:**

1. `e.preventDefault()` — prevents the browser's default form submission (a full page reload). This is the first thing every modern form handler does.
2. `import.meta.env.VITE_API_URL` — the server's base URL comes from the environment, not hardcoded. This is how you point the same code at `http://localhost:3000` in development and `https://api.keyz.game` in production.
3. `fetch` — the browser's built-in HTTP client. It returns a Promise; the `async/await` syntax makes it read like synchronous code.
4. `"Content-Type": "application/json"` — tells the server to parse the body as JSON. Without this header, `express.json()` middleware will not parse the body.

**Token storage:** After a successful login the token must be stored somewhere the game page can read it. The two standard options are `localStorage` (persists across tabs and browser sessions) or `sessionStorage` (clears when the tab closes). The game page then reads this token and passes it in the Socket.IO handshake.

## Page 2: The game page

`app.html` loads `src/main.js`. This is the most complex file in the client — it connects the socket, listens for game events, and wires DOM buttons to socket emissions.

### Client state module

```js
// client/src/js/app/state.js (inferred shape from usage in ui.js)
const gameState = {
    myRole: null,          // "player1" or "player2"
    roller: null,          // whose turn it is
    pot: 0,
    point: null,
    isFirstRoll: true,
    bank: {
        balances: { player1: 0, player2: 0 },
        loanPool: 0
    }
};

export default gameState;
```

**Why a shared state module?** Multiple files (`ui.js`, `sidebet.js`, `main.js`) all need to read the same game state. If each held its own copy, they would diverge. A single exported object is a simple shared store — a pattern that predates React and Redux by many years. When `main.js` writes `gameState.pot = data.pot`, every module that imported `gameState` immediately reads the new value.

### UI module

```js
// client/src/js/app/ui.js
export function updateDisplay() {
    const el = (id) => document.getElementById(id);
    if (!el("potDisplay")) return;  // guard: game page may not be loaded

    el("potDisplay").textContent = `Pot: R${gameState.pot} Credits`;
    el("bankBalanceP1").textContent = 
        `Player 1 balance: R${gameState.bank.balances.player1} Credits`;
    el("bankBalanceP2").textContent = 
        `Player 2 balance: R${gameState.bank.balances.player2} Credits`;
    el("loanPool").textContent = 
        `Loan Pool: R${gameState.bank.loanPool} Credits`;
    // ...
}
```

**Pattern:** The UI reads from `gameState` and writes to the DOM. It never writes to `gameState`. This is a one-way data flow: server event → update `gameState` → call `updateDisplay()` → DOM changes. This pattern prevents UI logic from accidentally modifying game logic.

**Guard pattern:** `if (!el("potDisplay")) return;` — if the element doesn't exist, silently exit. This protects against `updateDisplay` being called before the page has rendered, or from the wrong page.

### Dice animation

```js
// client/src/js/routes/roll.js
export function animateDice(imgElement, final) {
    if (!imgElement) return;
    let counter = 0;
    const interval = setInterval(() => {
        counter++;
        const temp = Math.floor(Math.random() * 6) + 1;
        imgElement.src = `/images/dice${temp}.png`;
        if (counter > 10) {
            clearInterval(interval);
            imgElement.src = `/images/dice${final}.png`;
        }
    }, 100);
}
```

**How it works:**
- `setInterval(fn, 100)` calls `fn` every 100 milliseconds.
- For 10 iterations it shows a random die face (the "rolling" animation).
- On iteration 11 it clears the interval and shows the actual result.
- Total animation time: ~1 second.

**Important:** The client uses `Math.random()` only for the animation. The actual dice values come from the server. This is the correct split: the animation can be client-side fake randomness because it doesn't affect the game outcome; the authoritative result is server-generated.

**Why server-side dice?** If the client rolled dice locally and sent the result to the server, a cheating user could intercept that message and replace the dice values. The server generates dice using `crypto.randomInt` (Node's cryptographically secure random), sends the result to both players simultaneously, and both clients display the same result. The client cannot lie about what it rolled.

## The stub modules

Several client modules are stubs — they exist to prevent import errors but contain no active logic:

```js
// client/src/js/app/dice.js
export function processRoll(sum) {
    console.log("processRoll (client stub) sum:", sum);
    // Server-authoritative: do nothing here.
}
```

```js
// client/src/js/routes/placebet.js
export default function placeBet(player, amount) {
    addLog(`ℹ️ placeBet called directly — use the Bet button instead`);
}
```

**Why stubs exist:** Early in development, these functions likely contained client-side game logic. As the design shifted to server-authoritative gameplay, the logic moved to the server. Rather than delete the files and break any imports that reference them, they were converted to no-ops. This is a common intermediate refactoring state. The next step is to remove the imports that reference them if nothing actually calls them.

## Exercise 5.1

Open `client/src/main.js`. List every `socket.on(eventName, handler)` call. For each one, write down:
1. What data shape the handler receives (check what properties it reads).
2. What it does with that data (does it update `gameState`? call `updateDisplay`? animate dice?).

This exercise builds the complete client event contract.

## Exercise 5.2

The dice animation uses `Math.random()` for the animation frames. Why is it acceptable to use non-cryptographic randomness here but not for the actual game dice values?

Write a two-paragraph answer explaining the difference between presentation randomness and game-state randomness.

---

# 6. Authentication, passwords, tokens, and email OTP

Authentication is the gatekeeper for the entire application. A user who cannot authenticate cannot play. This chapter traces the complete authentication flow, explaining every security decision.

## The complete auth flow

```
Browser                              Server                    MongoDB
   │                                    │                         │
   │── POST /api/auth/register ─────────►                         │
   │   { email, password }              │── User.findOne ─────────►
   │                                    │◄── null (not found) ────│
   │                                    │── bcrypt.hash(pw, 12)   │
   │                                    │── User.create ──────────►
   │◄── 201 { message, user } ──────────│◄── user document ───────│
   │                                    │                         │
   │── POST /api/auth/login ────────────►                         │
   │   { email, password }              │── User.findOne ─────────►
   │                                    │◄── user document ───────│
   │                                    │── bcrypt.compare(pw, hash)
   │                                    │── jwt.sign(payload)     │
   │◄── 200 { token } ──────────────────│                         │
   │                                    │                         │
   │   [store token in browser]         │                         │
   │                                    │                         │
   │── Socket.IO connect ───────────────►                         │
   │   handshake.auth.token = JWT        │── jwt.verify(token)    │
   │                                    │── socket.user = decoded │
   │◄── connection established ──────────│                         │
```

## The User model

```js
// server/models/user.js
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, "Invalid email format"]
    },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    balance: { type: Number, default: 1000, min: 0 }
}, { timestamps: true });
```

**Field by field:**

- `lowercase: true` — Mongoose lowercases the email before saving. This prevents `User@Example.com` and `user@example.com` from being treated as different accounts. The controller also normalizes with `.toLowerCase().trim()` before querying, which is redundant but harmless — defense in depth.
- `unique: true` — MongoDB creates a unique index on this field. Attempting to insert a duplicate email throws a MongoDB error (code 11000). The controller catches this upstream by checking for an existing user first, but the index is the last line of defense against a race condition.
- `match` — a regex validator. It runs before saving. `\S+@\S+\.\S+` is a minimal email validator: at least one non-whitespace character, an `@`, at least one non-whitespace, a `.`, at least one non-whitespace. It rejects `notanemail` but accepts `a@b.c`. For production, consider a more thorough library like `validator.js`.
- `isVerified: false` — the field exists but is not enforced. Login does not check `isVerified`. This is an incomplete feature: the groundwork is there, but the enforcement gate is missing.
- `balance: 1000, min: 0` — every new user starts with 1000 virtual credits. The `min: 0` constraint prevents negative balances at the database level. The in-memory room bank can still temporarily go negative if server-side logic does not check before debiting.
- `timestamps: true` — Mongoose automatically adds `createdAt` and `updatedAt` fields.

## Password hashing with bcrypt

```js
// From authController.js — registration
const hashed = await bcrypt.hash(password, 12);
```

```js
// From authController.js — login
const match = await bcrypt.compare(password, user.password);
```

**Why you never store a plain password:**

If your database is breached, an attacker who gets plain passwords immediately has access to those accounts — and potentially the same user's accounts on other services where they reused the password.

**What bcrypt does:**

1. Generates a random *salt* (a unique string).
2. Combines the salt with the password.
3. Runs an intentionally slow hashing function N times (where N is determined by the cost factor).
4. Stores `$2a$12$<salt><hash>` as a single string.

The cost factor `12` means 2^12 = 4096 iterations. At that factor, hashing one password takes ~300ms on a modern CPU. This is slow by design — it makes brute-force attacks expensive. At cost 10 an attacker can test ~100 passwords/second; at cost 12, ~25/second.

`bcrypt.compare(plaintext, storedHash)` extracts the salt from `storedHash`, hashes `plaintext` with the same parameters, and compares the result — it does not decrypt. You cannot get the original password back from the hash.

**Alternative: argon2.** Argon2 won the Password Hashing Competition in 2015 and is considered stronger than bcrypt because it is also memory-hard (requires significant RAM, not just CPU time). The Node package is `argon2`. For a new production project, argon2 is preferred. bcrypt is well-understood and has no known practical weaknesses at cost 12+.

## JWT: JSON Web Tokens

```js
// Signing (login success)
const token = jwt.sign(
    { userId: user._id, email: user.email },  // payload
    process.env.JWT_SECRET,                    // secret
    { expiresIn: "7d" }                        // options
);

// Verifying (middleware)
req.user = jwt.verify(token, process.env.JWT_SECRET);
```

**What a JWT is:**

A JWT is three Base64URL-encoded strings joined by dots: `header.payload.signature`.

```
eyJhbGciOiJIUzI1NiJ9          ← header: algorithm = HS256
.eyJ1c2VySWQiOiI2NjYiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ==
                                ← payload: { userId, email }
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
                                ← signature: HMAC-SHA256(header.payload, secret)
```

The payload is **not encrypted** — anyone can decode it. The signature is what makes it trustworthy: only someone with `JWT_SECRET` can produce a valid signature. The server verifies the signature on every request. If the payload has been tampered with, the signature will not match.

**The 7-day expiry:** After 7 days the token is rejected even if the signature is valid. This limits the damage if a token is stolen. The client must log in again to get a new token.

**Why JWTs instead of sessions?** Traditional server-side sessions store a session ID in a cookie; the server looks up the session in a database or in-memory store on every request. JWTs are *stateless* — the server does not need to look anything up. This scales better: any server instance can verify any token without shared session storage.

**Trade-off:** JWTs cannot be immediately invalidated. If a user's token is stolen, the attacker can use it until it expires. With session storage you can delete the session. For a game with short sessions and virtual credits only, this risk is acceptable. For a financial application, you would implement a token revocation list.

## HTTP auth middleware

```js
// server/middleware/auth.js
function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") 
        ? authHeader.split(" ")[1] 
        : null;

    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}
```

**The Bearer scheme:** `Authorization: Bearer <token>` is the standard HTTP header for token authentication. "Bearer" means "the bearer of this token is authenticated." The middleware splits on the space and takes the second part.

**`next()`:** In Express, `next()` passes control to the next middleware or route handler. If `auth` calls `next()`, the request proceeds. If it calls `res.status(401).json(...)` without calling `next()`, the request is terminated here. This is the middleware pattern.

## Socket.IO auth middleware

```js
// server/middleware/socketAuth.js
function socketAuth(socket, next) {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized: No token provided"));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        next(new Error("Unauthorized: Invalid token"));
    }
}
```

**How the client sends the token for sockets:**

```js
// In main.js (inferred from server expectation)
const socket = io("http://localhost:3000", {
    auth: { token: localStorage.getItem("token") }
});
```

The `handshake.auth` object is populated from the client's `auth` option. This happens once at connection time, not on every message — making it different from HTTP where you send the header with every request.

**`socket.user`:** Once `socketAuth` runs, every event handler on this socket can trust `socket.user.email` and `socket.user.userId`. They were verified by the JWT signature check. A malicious client cannot set these values because they come from the verified token, not from anything the client sends in the event payload.

## OTP: One-Time Passwords

The OTP flow adds a layer on top of email/password. After registration (or before certain actions) the server sends a 6-digit code to the user's email. The user must prove they received it.

```
POST /api/otp/send   → generates code, stores it, sends email
POST /api/otp/verify → checks code, marks user verified
```

**Observed services:**
- `server/services/otpService.js` — generates and stores OTP codes
- `server/services/emailService.js` — sends the email using nodemailer
- `server/mailer.js` — configures the nodemailer transporter (Gmail SMTP)

**Why OTP?** A password proves you know a secret. An OTP proves you have access to the email inbox — a second factor. This is "something you know" + "something you have." The combination makes account takeover harder: an attacker needs both the password and access to the inbox.

**The current gap:** `isVerified` exists on the User model but login does not check it. This means the OTP flow is available but not enforced. A user can register and play without verifying their email. This is a common MVP decision: implement the mechanism, enforce it later.

**nodemailer configuration:**

```js
// server/mailer.js
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
```

`EMAIL_PASS` for Gmail must be an *App Password*, not the Google account password. Gmail requires this when 2-Step Verification is enabled. Generate it at `myaccount.google.com/apppasswords`. Using the account password directly will fail with an authentication error once Google blocks "less secure app" access.

**Alternative email services:** SendGrid, Mailgun, AWS SES, Resend. These are purpose-built transactional email APIs with better deliverability, monitoring, and rate limits than direct Gmail SMTP. For production, move off Gmail SMTP.

## The duplicate route registration bug

```js
// server/routes/authRoutes.js
router.post("/register", [
    body("email").isEmail(),
    body("password").isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/)
], register);

router.post("/register", register);  // ← DUPLICATE
```

**Observed:** The `/register` route is registered twice. Express will match the first registration and call its handler. If the handler calls `next()` without sending a response, Express would fall through to the second. In the current implementation `register` always sends a response (`res.status(201).json(...)` or `res.status(400).json(...)`), so the second registration is dead code.

**Consequence:** The `express-validator` rules (`body("email").isEmail()` etc.) on the first registration are never acted on. The controller receives the request without the validator having run, because the `register` function does not call `validationResult(req)` to check for validation errors. The controller performs its own validation, so the behavior is currently correct — but the validator middleware is unused, which is misleading.

**Recommendation:** Remove the duplicate route. Either use `express-validator` results in the controller, or use the controller's own validation. Do not mix both without connecting them.

## Exercise 6.1

Trace what happens when a user submits a registration form with a password of `"abc"` (7 characters, no uppercase, no number). Which layer rejects it, and what response does the browser receive? Follow the code path exactly.

## Exercise 6.2

The JWT payload contains `{ userId, email }`. If the email in the payload goes out of sync with the email in MongoDB (because the user changed their email in a future feature), what could go wrong? How would you fix this?

## Exercise 6.3

Look up the concept of "timing attacks" on password comparison. Why does `bcrypt.compare` protect against this, but a naive string comparison `password === storedPassword` does not?

## Stack Overflow search paths for this chapter

- `"express middleware next() not called"`
- `"jwt verify vs decode difference"`
- `"bcrypt hash cost factor performance"`
- `"nodemailer gmail app password"`
- `"express-validator validationResult example"`

## Official documentation

- [jsonwebtoken npm](https://www.npmjs.com/package/jsonwebtoken)
- [bcryptjs npm](https://www.npmjs.com/package/bcryptjs)
- [Mongoose Schema Types](https://mongoosejs.com/docs/schematypes.html)
- [nodemailer Getting Started](https://nodemailer.com/about/)
- [express-validator](https://express-validator.github.io/docs/)

---

# 7. Realtime multiplayer: the Socket.IO protocol

## Why sockets instead of polling

A game requires the server to push updates to clients without being asked. With plain HTTP you would have to poll: `setInterval(() => fetch("/game-state"), 500)`. Polling is wasteful — most requests return "nothing changed." WebSockets open a persistent two-way channel. When the server has something to say, it says it immediately.

Socket.IO sits on top of WebSockets and adds:
- Automatic reconnection with exponential backoff.
- Fallback to HTTP long-polling if WebSockets are unavailable.
- Named events (`socket.emit("find-match", data)`) instead of raw binary frames.
- Rooms: named groups of sockets. `io.to(roomId).emit(...)` sends to every socket in that room.

## Connection lifecycle

```
Client                              Server
  │                                    │
  │── WS upgrade (HTTP → WS) ──────────►
  │   + auth: { token }                │── socketAuth middleware
  │                                    │   jwt.verify(token)
  │                                    │   socket.user = decoded
  │◄── connection established ──────────│
  │                                    │── io.on("connection", handler)
  │                                    │   console.log("✅ Socket connected")
  │                                    │
  │── emit("find-match", { stake }) ───►
  │                                    │── if no waitingPlayer:
  │                                    │     waitingPlayer = this socket
  │◄── emit("waiting", { message }) ───│
  │                                    │
  [Second client connects and emits find-match]
  │                                    │
  │◄── emit("player-role", "player1") ─│── assign roles
  │◄── emit("match-found", { roomId }) ─│── notify both players
  │◄── emit("game-start", { ... }) ────│── broadcast game-start to room
  │◄── emit("game-state", { ... }) ────│── broadcastGameState
```

## Matchmaking: the waiting room pattern

```js
// server/sockets/gameSocket.js (simplified)
let waitingPlayer = null;

socket.on("find-match", async ({ stake = 100 } = {}) => {
    if (!waitingPlayer) {
        waitingPlayer = { socket, stake };
        socket.emit("waiting", { message: "Waiting for opponent..." });
        return;
    }

    // A second player arrived — create the match
    const p1Socket = waitingPlayer.socket;
    waitingPlayer = null;

    const roomId = "room-" + Math.random().toString(36).slice(2, 10);
    const room = createRoom(roomId);
    // ... assign players, emit match-found to both
});
```

**`waitingPlayer` is a module-level variable.** This is the simplest possible matchmaking: one slot. Only two players can be matched at a time. If a third player emits `find-match` while two are already matched, the third becomes the new `waitingPlayer`.

**Stake enforcement:** Both players must emit the same stake amount. If they differ, both receive an error and neither is matched. This prevents a player from joining a high-stakes match they cannot afford.

**Disconnection race:** There is a check for whether the waiting player's socket is still connected before creating a match:

```js
if (!io.sockets.sockets.has(p1Socket.id)) {
    // Player 1 disconnected while waiting — player 2 becomes the new waiter
    waitingPlayer = { socket: p2Socket, stake: p2Stake };
    p2Socket.emit("waiting");
    return;
}
```

This handles the case where player 1 closes their browser while waiting.

## Rooms

```js
p1Socket.join(roomId);
p2Socket.join(roomId);

io.to(roomId).emit("game-start", { roomId, currentTurn, player1, player2 });
```

`socket.join(roomId)` adds the socket to a Socket.IO room. `io.to(roomId).emit(...)` sends to every socket in that room. This is how both players receive the same state update without the server needing to track which socket IDs to address.

**Room membership persists for the connection lifetime** unless explicitly left with `socket.leave(roomId)`. On disconnect, Socket.IO automatically removes the socket from all rooms.

## The roll event

```js
// server/sockets/gameSocket.js (inferred from gameService usage)
socket.on("roll", ({ roomId }) => {
    const room = getRoom(roomId);
    const role = getOwnedRoomSeat(socket, roomId, room);
    if (!role) return socket.emit("error", "Not your seat");
    if (room.currentTurn !== role) return socket.emit("error", "Not your turn");

    const result = processRoll(room);
    broadcastGameState(io, rooms, roomId);

    if (result.winner) {
        io.to(roomId).emit("round-winner", {
            winner: result.winner,
            payout: room.pot
        });
    }
});
```

**Authorization chain for every action:**
1. Does the room exist?
2. Does this socket own a seat in this room? (`getOwnedRoomSeat` checks socket properties AND the room's stored email against the token's email)
3. Is it this seat's turn?

Without all three checks a player could emit `roll` for the opponent's turn, or forge events for a room they are not in.

## broadcastGameState

```js
// server/utils/broadcastGameState.js
function broadcastGameState(io, rooms, roomId) {
    const room = rooms[roomId] || rooms.get?.(roomId);
    if (!room) return;
    io.to(roomId).emit("game-state", {
        pot: room.pot,
        point: room.point,
        currentTurn: room.currentTurn,
        isFirstRoll: room.isFirstRoll,
        bank: room.bank,
        players: {
            player1: { email: room.players.player1?.email },
            player2: { email: room.players.player2?.email }
        }
    });
}
```

**Single source of truth broadcast:** Rather than constructing the event payload at every call site, all game state is broadcast through one function. This means every client always receives the same shape of data, and there is one place to update if the shape changes.

**Data minimization:** Note that `socketId` is not included in the broadcast — clients do not need each other's socket IDs. Only the email is shared for display purposes. This is a privacy consideration: socket IDs are internal server identifiers.

## Reconnection

The `reconnectHandler` module handles the case where a player reconnects with a new socket after a dropped connection:

```js
// server/sockets/socketHandler/reconnectHandler.js (simplified)
function reconnectPlayer(io, socket, room, roomId) {
    for (const role of ["player1", "player2"]) {
        if (room.players[role]?.email === socket.user.email) {
            // Disconnect old socket if still connected
            const previous = io.sockets.sockets.get(room.players[role].socketId);
            if (previous) {
                previous.leave(roomId);
                previous.disconnect(true);
            }
            // Update seat with new socket ID
            room.players[role].socketId = socket.id;
            return role;
        }
    }
    return null;
}
```

**Why email is the identity key, not socket ID.** Socket IDs change on every connection. The player's verified email (from their JWT) is stable. By matching on email, the reconnection handler can find the player's seat and update it to the new socket.

## Exercise 7.1

Draw a sequence diagram for what happens when player 1 rolls the dice. Show: the browser event, the socket event emitted, the server validation steps, the `processRoll` call, the `broadcastGameState` call, and the events received by both player 1 and player 2.

## Exercise 7.2

`waitingPlayer` is a module-level variable. What happens if two server instances are running (e.g., behind a load balancer)? Player A connects to instance 1; player B connects to instance 2. Will they match? What technology would you use to fix this?

---

# 8. Game rules as a state machine

## The rules of craps (as implemented)

The dice game follows a simplified version of craps:

**First roll (come-out roll):**
- Roll 7 or 11 → roller wins immediately (natural)
- Roll 2, 3, or 12 → roller loses immediately (craps)
- Roll any other number (4, 5, 6, 8, 9, 10) → that number becomes the *point*

**Subsequent rolls (point phase):**
- Roll the point number → roller wins
- Roll 7 → roller loses (seven out)
- Any other roll → continue rolling

## State diagram

```
                    ┌─────────────────┐
                    │   WAITING       │
                    │  (no room)      │
                    └───────┬─────────┘
                            │ match-found
                            ▼
                    ┌─────────────────┐
                    │  COME-OUT       │
                    │  isFirstRoll=true│
                    │  point=null     │
                    └───────┬─────────┘
                            │ roll
                      ┌─────┴──────────────────────┐
                      │                            │
                  7 or 11                     2, 3, or 12
                      │                            │
                      ▼                            ▼
              ┌──────────────┐           ┌──────────────────┐
              │ ROLLER WINS  │           │  ROLLER LOSES    │
              │  (natural)   │           │   (craps out)    │
              └──────┬───────┘           └────────┬─────────┘
                     │                            │
                     └────────────┬───────────────┘
                                  │ new round
                                  ▼
                         ┌────────────────┐
                         │  COME-OUT      │ ← turn passes
                         │  next roller   │
                         └────────────────┘

          [if first roll is 4,5,6,8,9,10]
                         │ point is set
                         ▼
                ┌─────────────────────┐
                │   POINT PHASE       │
                │  isFirstRoll=false  │
                │  point = N          │
                └──────────┬──────────┘
                           │ roll
                   ┌───────┴────────────────┐
                   │                        │
                roll == point             roll == 7
                   │                        │
                   ▼                        ▼
          ┌──────────────┐        ┌──────────────────┐
          │ ROLLER WINS  │        │  ROLLER LOSES    │
          │ (made point) │        │  (seven out)     │
          └──────────────┘        └──────────────────┘
```

## The processRoll function

```js
// server/services/gameService.js (observed shape)
const { randomInt } = require("crypto");

function rollDice() {
    return randomInt(1, 7);  // 1 to 6 inclusive
}

function processRoll(room) {
    const die1 = rollDice();
    const die2 = rollDice();
    const sum = die1 + die2;

    let winner = null;
    let reason = null;

    if (room.isFirstRoll) {
        if (sum === 7 || sum === 11) {
            winner = room.currentTurn;
            reason = "natural";
        } else if (sum === 2 || sum === 3 || sum === 12) {
            winner = getOtherRole(room.currentTurn);
            reason = "craps";
        } else {
            room.point = sum;
            room.isFirstRoll = false;
        }
    } else {
        if (sum === room.point) {
            winner = room.currentTurn;
            reason = "point";
        } else if (sum === 7) {
            winner = getOtherRole(room.currentTurn);
            reason = "seven-out";
        }
        // any other roll: no state change, roller continues
    }

    return { die1, die2, sum, winner, reason };
}
```

**`crypto.randomInt(1, 7)`:** The Node.js `crypto` module provides cryptographically secure pseudorandom numbers. `randomInt(min, max)` returns an integer where `min <= result < max`, so `randomInt(1, 7)` gives 1, 2, 3, 4, 5, or 6 with equal probability. This is appropriate for a game where fairness matters.

**Why not `Math.random()`?** `Math.random()` uses a deterministic algorithm seeded at startup. It is fast but not suitable for security or fairness-critical applications because its output can potentially be predicted if an attacker knows the seed or observes enough output values.

## The GameResult model and the missing save

```js
// server/models/gameResult.js
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
```

**Observed:** The `GameResult` model is defined. It is not imported or called anywhere in the active `gameSocket.js` path that was reviewed. Game outcomes are not currently persisted to MongoDB.

**Consequence:** There is no history of who won, what they won, or why. Leaderboards, audit trails, and dispute resolution are impossible without this data.

**Recommendation:** After `handleWinner` credits the balance, save a `GameResult` document:

```js
// Pseudocode for what should happen after round ends
await GameResult.create({
    roomId,
    winner: winnerEmail,
    loser: loserEmail,
    payout: room.pot,
    reason: result.reason
});
```

## Exercise 8.1

The `reason` field in `gameResultsSchema` has an enum of `["natural", "point", "craps", "forfeit"]`. But `processRoll` returns `reason: "seven-out"`. If a GameResult save were added today, what would happen? How would you fix it?

## Exercise 8.2

Implement `processRoll` from scratch in a new file using only the state machine diagram above and `crypto.randomInt`. Do not look at the existing implementation until you are done. Then compare your version to the existing one. What did you do differently?

---

# 9. Balances, bets, loans, and persistence

## The bank structure

Every room has a `bank` object in memory:

```js
room.bank = {
    balances: {
        player1: 0,  // current virtual credit balance
        player2: 0
    },
    loanPool: 1000,  // shared pool for loans
    loansIssued: {
        player1: 0,
        player2: 0
    }
};
```

When a match is created, balances are loaded from MongoDB:

```js
const [bal1, bal2] = await Promise.all([
    loadPlayerBalance(p1Socket.user.email),
    loadPlayerBalance(p2Socket.user.email)
]);

room.bank.balances.player1 = bal1 - p1Stake;  // stake is deducted immediately
room.bank.balances.player2 = bal2 - p2Stake;
room.pot = p1Stake + p2Stake;
```

**The stake deduction at match time** means both players commit funds when the match starts, not when a bet is placed. The pot is fully funded before the first roll.

## Debit and credit helpers

```js
// server/sockets/socketHandler/bankHandler.js
function debitBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) throw new Error("Invalid amount");
    if (room.bank.balances[role] < amount) throw new Error("Insufficient balance");
    room.bank.balances[role] -= amount;
}

function creditBalance(room, role, amount) {
    if (typeof amount !== "number" || amount <= 0) throw new Error("Invalid credit amount");
    room.bank.balances[role] += amount;
}
```

**These functions are also defined in `gameSocket.js` directly.** This is a duplication. The `bankHandler.js` module exists as a cleaner extracted version, but `gameSocket.js` contains its own inline copies. This means changes to the logic need to be made in two places.

## The loan system

```js
// server/sockets/socketHandler/loanHandler.js
function requestLoan(room, role, amount) {
    const MAX_LOAN = 500;

    if (!room.bank.loansIssued) {
        room.bank.loansIssued = { player1: 0, player2: 0 };
    }

    if (room.bank.loansIssued[role] + amount > MAX_LOAN) {
        throw new Error(`Loan limit of R${MAX_LOAN} reached`);
    }

    if (room.bank.loanPool < amount) {
        throw new Error("Loan pool has insufficient funds");
    }

    room.bank.loanPool -= amount;
    room.bank.balances[role] += amount;
    room.bank.loansIssued[role] += amount;
}
```

**Observed:** Loans are capped at 500 per player per room. They come from the room's `loanPool`. Loans are tracked with `loansIssued` but there is no repayment mechanism — the loan total is not subtracted from the player's payout when they win.

**Design question:** If a player takes a loan and wins, should their payout be reduced by the loan amount? If not, the lender (the game itself) loses credits on every loan. This is a game economy decision that the current code leaves unresolved.

## Balance persistence

```js
// server/sockets/gameSocket.js
async function persistBalances(room) {
    const p1Email = room.players.player1?.email;
    const p2Email = room.players.player2?.email;
    if (p1Email) await User.updateOne(
        { email: p1Email }, 
        { $set: { balance: room.bank.balances.player1 } }
    );
    if (p2Email) await User.updateOne(
        { email: p2Email }, 
        { $set: { balance: room.bank.balances.player2 } }
    );
}
```

**`$set`:** A MongoDB update operator. `{ $set: { balance: 950 } }` updates only the `balance` field, leaving all other fields unchanged. Without `$set`, the entire document would be replaced.

**When is this called?** The function exists and is defined, but verifying exactly where it is called in the current event flow requires reading the full `gameSocket.js` roll handler. If it is not called after every round, balances will not be saved to MongoDB until the next call — meaning a server crash between calls loses round results.

**Race condition:** If two async operations attempt to update the same user's balance simultaneously (possible if the same player is in two rooms, though the current single-room design makes this unlikely), the last write wins. A safer approach uses MongoDB's atomic operators:

```js
// Safer: add the delta rather than setting the absolute value
await User.updateOne({ email }, { $inc: { balance: delta } });
```

## Exercise 9.1

The loan system does not repay loans from winnings. Write the pseudocode for a `settleLoans` function that should be called when a round ends. It should deduct `loansIssued[role]` from the winner's payout before crediting their balance, and return the loan amount to `loanPool`.

---

# 10. Debugging by following evidence

This chapter demonstrates how to investigate a defect systematically. The method applies to any bug in any codebase.

## A concrete investigation: "The game never starts"

**Symptom:** Both players click "Find Match" and receive "match found" — but no game controls appear.

**Step 1: Check what the client receives.**

Open browser DevTools → Network → WS tab. Find the Socket.IO connection. Look at the messages panel. Do you see `game-state` after `match-found`?

If yes → the server sent the state. The problem is in how the client handles it.
If no → the problem is server-side.

**Step 2: Assume the server sent it. Trace the client handler.**

In `main.js`, find:

```js
socket.on("game-state", (data) => {
    // What does this do?
});
```

Does it update `gameState`? Does it call `updateDisplay()`? Does it render the game controls?

**Step 3: Check the element IDs.**

`updateDisplay()` reads from `gameState` and writes to elements like `potDisplay`, `bankBalanceP1`. Do these IDs exist in `app.html`? If `app.html` uses different IDs, `document.getElementById("potDisplay")` returns `null` and the guard `if (!el("potDisplay")) return` silently exits.

**Step 4: Add a log at the entry point.**

```js
socket.on("game-state", (data) => {
    console.log("game-state received:", data);  // add this
    // ...
});
```

Reload. Does the log appear? If yes, the event is received. If no, the listener is not registered or the server is not emitting.

**Step 5: Check the server emission.**

In `broadcastGameState.js`, add:

```js
console.log("broadcasting game-state to room:", roomId, "state:", JSON.stringify(state));
```

Does this log appear in the server console after match-found?

**This is the debugging method:** add visibility at each boundary until you find where the data stops being correct or stops flowing.

## Common socket bugs

| Symptom | Likely cause |
|---|---|
| Client emits event, server never receives it | Event name mismatch (case, spelling) |
| Server emits to room, one client doesn't receive | That socket didn't join the room |
| State updates but UI doesn't change | `updateDisplay()` not called after state update |
| Socket connects then immediately disconnects | JWT verification failure in socketAuth |
| Actions work once then stop | Rate limiter blocking subsequent events |

## Reading a stack trace

```
Error: Insufficient balance
    at debitBalance (server/sockets/socketHandler/bankHandler.js:5:15)
    at Object.<anonymous> (server/sockets/gameSocket.js:187:5)
    at Socket.<anonymous> (server/sockets/gameSocket.js:140:9)
```

Read bottom to top: the socket event handler at line 140 called something at line 187 which called `debitBalance` at line 5 in bankHandler.js where the error was thrown. Go to `gameSocket.js` line 140 first to understand what event triggered it, then line 187 to see what the debit was attempting.

---

# 11. Defect register: what the code currently implies

These defects are identified by tracing the source code. Each should be reproduced in a running environment before being treated as confirmed runtime behavior.

| ID | Location | Description | Severity |
|---|---|---|---|
| D-01 | `authRoutes.js` | `/register` route registered twice; validator middleware result never checked | Low |
| D-02 | `user.js` model | `isVerified` field exists but login does not check it | Medium |
| D-03 | `gameSocket.js` | `debitBalance` / `creditBalance` duplicated from `bankHandler.js` | Low |
| D-04 | `gameHandler..js` | File uses path `/services/gameService` (absolute, no `..`); will fail to load on POSIX systems | High |
| D-05 | `gameSocket.js` | `GameResult` model imported nowhere; round outcomes not persisted | Medium |
| D-06 | Loan system | No repayment on win; loanPool drains without recovery | Medium |
| D-07 | `reconnectHandler..js` | Filename has double dot; may not be required correctly on case-sensitive filesystems | High |
| D-08 | `persistBalances` | Call site not confirmed in event handler; balances may not save after every round | High |
| D-09 | `sidebet.js` | Sidebet calculations are client-side display only; no server enforcement | Low |

**D-04 and D-07 are the highest severity.** Filenames with double dots (`gameHandler..js`, `reconnectHandler..js`) are unusual. If `require("./gameHandler..js")` is used, Node will load the file. If the import uses `require("./gameHandler")` (without the double dot), Node will not find it. These files may be inactive dead code, or they may be failing silently. Verify by searching for their import paths in `gameSocket.js`.

---

# 12. Refactoring without losing the game

Refactoring means changing code structure without changing observable behavior. The risk in a real-time game is that refactoring an event handler changes timing, event names, or state shapes — breaking the client-server contract.

## The refactoring checklist

Before touching any file:

1. **Identify all callers.** Search the entire repository for the function name. Changing a function used in three places requires updating three places.
2. **Write the test first, or at minimum write down the expected behavior.** What should happen before and after? If you cannot state this, you cannot verify the refactor worked.
3. **Make one change at a time.** Do not rename a function and move it to a different file in the same commit.
4. **Verify the event contract hasn't changed.** The client listens for specific event names with specific data shapes. If the server changes `"game-state"` to `"gameState"`, the client breaks silently.

## Removing the duplicate bank helpers

**Target:** `debitBalance` and `creditBalance` are defined in both `gameSocket.js` and `bankHandler.js`.

**Safe refactor steps:**
1. Confirm `bankHandler.js` is not currently imported by `gameSocket.js`.
2. Add `const { debitBalance, creditBalance } = require("./socketHandler/bankHandler");` to `gameSocket.js`.
3. Delete the local definitions in `gameSocket.js`.
4. Test by running the server and placing a bet.
5. If it works, the refactor is complete. If not, revert step 2-3 and investigate.

## Connecting the GameResult save

This is an additive change, not a refactor. It adds behavior without removing any.

```js
// After winner is determined in the roll handler:
const GameResult = require("../models/gameResult");

try {
    await GameResult.create({
        roomId,
        winner: room.players[winnerRole].email,
        loser: room.players[loserRole].email,
        payout: room.pot,
        reason: result.reason
    });
} catch (err) {
    console.error("GameResult save failed:", err.message);
    // Non-fatal: game continues even if history save fails
}
```

Note the try/catch with a non-fatal error: history saving should never crash a game in progress.

---

# 13. Technology choices and alternatives

| Component | Chosen | Alternative | Why chosen |
|---|---|---|---|
| Runtime | Node.js | Deno, Bun | Largest ecosystem, most Stack Overflow answers, most deployment targets |
| HTTP framework | Express | Fastify, Koa, Hono | Most tutorials, most middleware, most hiring familiarity |
| Database | MongoDB / Mongoose | PostgreSQL + Prisma | Flexible schema suits early-stage game objects; no JOIN needed for user lookup |
| Password hashing | bcryptjs | argon2, scrypt | Well-understood, zero native dependencies (bcryptjs is pure JS) |
| JWT | jsonwebtoken | jose, passport-jwt | Simple API, direct control over signing and verification |
| Realtime | Socket.IO | ws (raw WebSocket), Ably, Pusher | Built-in rooms, reconnection, fallback; managed service adds cost and external dependency |
| Build tool | Vite | Webpack, Parcel, esbuild | Fast dev server, zero config for vanilla JS, good docs |
| Email | nodemailer + Gmail | SendGrid, Mailgun, Resend | Zero cost for low volume; Gmail SMTP is immediate for development |
| Security headers | helmet | Manual headers | Single line, maintained by the community, covers OWASP top headers |

---

# 14. MVP boundaries versus production requirements

## What MVP means in practice

An MVP (Minimum Viable Product) is the smallest version of a product that delivers the core value to real users. For this game: two players can find each other, play a round, and their balance changes.

## The current state

The implemented system is closer to an MVP than a production system. Specifically:

| Feature | MVP? | Production requirement |
|---|---|---|
| Two players can match | ✓ | Scales to thousands of concurrent matches (requires distributed matchmaking) |
| JWT auth | ✓ | Token refresh, revocation, 2FA enforcement |
| Balance tracks in-game | ✓ | Auditable ledger, double-entry bookkeeping |
| Email OTP exists | ✓ | Enforced before gameplay; rate-limited per account |
| Game history model exists | ✗ (not saved) | Every round persisted, queryable, exportable |
| Error handling | Partial | Structured error codes, monitoring, alerting |
| Tests | None | Unit tests for game logic, integration tests for auth, load tests for matchmaking |
| Deployment | Manual | CI/CD pipeline, health checks, rolling deploys, rollback |

## The production gap

The largest gaps are:
1. Game results not persisted (D-05).
2. Balance sync not confirmed (D-08).
3. Email verification not enforced (D-02).
4. No test suite.
5. No deployment automation.

None of these prevent a local demo. All of them matter for a public launch.

---

# 15. Testing strategy and exercises

## Unit testing game logic

The most valuable test in this codebase is a unit test for `processRoll`. It is a pure function (given a room state, it returns a result) and covers the core game rules.

```js
// test/gameService.test.js (to be created)
const { processRoll } = require("../server/services/gameService");

describe("processRoll", () => {
    it("returns natural win on first roll sum 7", () => {
        const room = { isFirstRoll: true, point: null, currentTurn: "player1" };
        // Mock crypto.randomInt to return specific values
        // result.winner should be "player1", reason "natural"
    });

    it("sets point on first roll sum 4", () => {
        const room = { isFirstRoll: true, point: null, currentTurn: "player1" };
        // Mock to return die values summing to 4
        // room.point should be 4, room.isFirstRoll should be false
    });

    it("returns seven-out loss in point phase", () => {
        const room = { isFirstRoll: false, point: 6, currentTurn: "player1" };
        // Mock to return sum 7
        // result.winner should be "player2"
    });
});
```

**Testing framework:** Jest is the most common choice for Node.js unit tests. Install with `npm install --save-dev jest`.

## Integration testing auth routes

```js
// test/auth.test.js
const request = require("supertest");
const app = require("../server/server");

describe("POST /api/auth/register", () => {
    it("rejects short password", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: "a@b.com", password: "short" });
        expect(res.status).toBe(400);
    });
});
```

**supertest** sends HTTP requests directly to an Express app without starting a real server. Install with `npm install --save-dev supertest`.

## Load testing matchmaking

Use `artillery` or `k6` to simulate N players connecting and emitting `find-match`. Measure: time to match, memory growth per room, behavior at 100 concurrent connections.

---

# 16. Deployment audit

## What must be true before deploying

**Environment variables — both packages:**

Server `.env` must contain:
```
MONGO_URI=
JWT_SECRET=          # minimum 32 random characters
CLIENT_URL=          # exact origin of the browser app, e.g. https://game.example.com
PORT=
EMAIL_USER=
EMAIL_PASS=          # Gmail App Password, not account password
```

Client `.env` must contain:
```
VITE_API_URL=        # server URL, e.g. https://api.example.com
```

**`server.js` fails fast** if `MONGO_URI`, `JWT_SECRET`, or `CLIENT_URL` are missing. This is correct behavior — a misconfigured server should not start.

## CORS

CORS is configured with `origin: process.env.CLIENT_URL`. This must match the exact origin (protocol + domain + port) of the browser app. A mismatch causes the browser to reject all cross-origin requests with a CORS error, which is silent in the server logs but visible in the browser console.

**Common mistake:** Setting `CLIENT_URL=https://game.example.com/` (trailing slash). The browser origin does not include a trailing slash. The exact string must match.

## Socket.IO and proxies

If the Node server runs behind nginx or a similar reverse proxy, WebSocket upgrade headers must be forwarded:

```nginx
location /socket.io/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Without these, Socket.IO falls back to HTTP long-polling, which works but is less efficient.

## Process management

Do not run Node with `node server.js` in production. Use a process manager:

- **PM2:** `pm2 start server.js --name keyz-server`. Restarts on crash, logs to file, can run as a system service.
- **systemd:** A Linux service unit file that starts the Node process at boot.

## MongoDB

Use MongoDB Atlas (managed cloud service) rather than a self-hosted instance for initial deployment. Atlas handles backups, replication, and uptime. The free tier (M0) supports up to 512MB and is sufficient for an MVP.

## Static files

The Vite client builds to a `dist/` directory. Serve this with nginx, Caddy, or a static host (Netlify, Vercel, Cloudflare Pages). Do not serve static files from the Node server in production.

---

# 17. Roadmap

Ordered by impact and prerequisite dependencies.

## Immediate (before any public users)

1. **Fix D-04 and D-07** — verify the double-dot filenames and their require paths. Either rename the files or confirm they are intentionally unused dead code.
2. **Confirm and test `persistBalances` call site** — add a log at the call site and verify it fires after every round.
3. **Wire GameResult.create** after round completion.
4. **Enforce `isVerified` in login** — or remove the field if verification will not be implemented.

## Short term (first cohort of users)

5. Unit tests for `processRoll` covering all branches.
6. Integration tests for register and login.
7. Remove duplicate `debitBalance`/`creditBalance` from `gameSocket.js`.
8. Remove duplicate `/register` route.
9. Move from Gmail SMTP to a transactional email service.
10. Add structured logging (Winston or Pino) — replace `console.log` with levelled log entries.

## Medium term (growing user base)

11. Distributed matchmaking — replace the in-memory `waitingPlayer` with a Redis-backed queue so multiple server instances can match players.
12. Loan repayment on win.
13. Game history page — query `GameResult` by player email.
14. Leaderboard.
15. Account balance history.

## Long term (scale and features)

16. Spectator mode — add sockets that join the room without a seat.
17. Tournaments — bracket management, scheduled start times.
18. Mobile-responsive UI.
19. Accessibility audit (WCAG 2.1 AA).
20. Full CI/CD pipeline with automated tests on every pull request.

---

# 18. Learning paths and references

## Foundational reading

Before diving deep into this codebase, a self-taught developer should be comfortable with:

1. **JavaScript fundamentals:** variables, functions, arrays, objects, callbacks, Promises, async/await.
   - Free: [javascript.info](https://javascript.info) — the best free JS reference
   - Free: [The Odin Project](https://www.theodinproject.com) — project-based full stack curriculum

2. **Node.js and npm:** how `require` works, what `package.json` does, how to install packages.
   - Official: [nodejs.org/en/learn](https://nodejs.org/en/learn)

3. **HTTP:** what a request and response are, status codes, headers, methods (GET, POST).
   - Free: [MDN HTTP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP)

## Topic-specific resources

| Topic | Resource |
|---|---|
| Express.js | [expressjs.com/en/guide](https://expressjs.com/en/guide/routing.html) |
| Socket.IO | [socket.io/docs/v4](https://socket.io/docs/v4/) |
| MongoDB / Mongoose | [mongoosejs.com/docs](https://mongoosejs.com/docs/guide.html) |
| JWT | [jwt.io introduction](https://jwt.io/introduction) |
| bcrypt | [Auth0: hashing passwords](https://auth0.com/blog/hashing-in-action-understanding-bcrypt/) |
| Vite | [vitejs.dev/guide](https://vitejs.dev/guide/) |
| WebSockets | [MDN WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) |
| Craps rules | [Wizard of Odds: Craps](https://wizardofodds.com/games/craps/) |
| Jest testing | [jestjs.io/docs/getting-started](https://jestjs.io/docs/getting-started) |
| supertest | [github.com/ladjs/supertest](https://github.com/ladjs/supertest) |
| PM2 | [pm2.io/docs](https://pm2.io/docs/runtime/guide/installation/) |

## YouTube learning paths

Search these terms on YouTube for free video courses:

- `"Node.js and Express REST API tutorial 2024"`
- `"Socket.IO multiplayer game tutorial"`
- `"MongoDB Mongoose tutorial beginners"`
- `"JWT authentication Node.js Express"`
- `"Vite tutorial vanilla JavaScript"`
- `"bcrypt password hashing Node.js"`

## Stack Overflow search patterns for this project

- `socket.io emit to room all clients`
- `express middleware order matters`
- `mongoose findOne vs find`
- `jwt.verify throws invalid signature`
- `crypto randomInt node.js`
- `vite multi page app config`
- `socket.io handshake auth token`
- `nodemailer gmail app password`

---

# 19. Glossary

**bcrypt** — A password hashing algorithm that is intentionally slow to make brute-force attacks expensive. The cost factor controls how slow.

**CORS (Cross-Origin Resource Sharing)** — A browser security mechanism that prevents a web page from making requests to a different domain unless the server explicitly allows it.

**Come-out roll** — The first roll in a craps round, before a point is set.

**Craps (outcome)** — Rolling 2, 3, or 12 on the come-out roll, resulting in the roller losing.

**Defect** — A mismatch between what code does and what it should do.

**Event emitter** — An object that can register listeners for named events and trigger those listeners by name.

**Express** — A minimal Node.js HTTP framework that manages routes and middleware.

**Helmet** — An Express middleware collection that sets security-related HTTP headers.

**HMR (Hot Module Replacement)** — A Vite/webpack feature that updates changed modules in the browser without a full page reload.

**In-memory** — Data stored in the running process's RAM, not in a database. Lost when the process restarts.

**JWT (JSON Web Token)** — A signed token containing a payload. The server can verify authenticity using the signature without storing session state.

**Middleware** — A function in Express or Socket.IO that runs between request arrival and the route handler. Can modify the request, send a response, or call `next()` to continue.

**MPA (Multi-Page Application)** — A web app where navigating between pages causes a full browser page load. Contrast with SPA.

**Natural** — Rolling 7 or 11 on the come-out roll, resulting in the roller winning immediately.

**Nodemailer** — A Node.js library for sending email via SMTP or other transport.

**OTP (One-Time Password)** — A short code valid for a single use and limited time, typically sent by email or SMS.

**Point** — A number (4, 5, 6, 8, 9, or 10) set on the come-out roll. The roller must roll it again before rolling 7 to win.

**Pot** — The combined stakes of both players in a round. Awarded to the winner.

**Rate limiting** — Restricting how many requests a client can make in a time window, to prevent abuse.

**Room** — A named group of Socket.IO sockets. Used here to group two players in a match.

**Salt** — A random value mixed with a password before hashing to ensure two identical passwords produce different hashes.

**Seven out** — Rolling 7 in the point phase, causing the roller to lose.

**Socket.IO** — A library providing real-time, event-based communication over WebSockets with fallbacks.

**SPA (Single-Page Application)** — A web app that handles all navigation in JavaScript without full page reloads.

**Stake** — The amount of virtual credits each player commits at match start.

**Stub** — A module that exists but contains no active logic, preserved to avoid breaking imports.

**Vite** — A fast browser build tool and development server using native ES modules.

**Virtual credits** — A unit of in-game value with no cash or monetary equivalent in this implementation.

**WebSocket** — A protocol providing a persistent, full-duplex communication channel between browser and server over a single TCP connection.

---

*End of The Making of Keyz Dice Game — v1.0*

*This document should be updated whenever the source code changes materially. The most valuable sections to keep current are the defect register (Chapter 11), the deployment audit (Chapter 16), and the roadmap (Chapter 17).*