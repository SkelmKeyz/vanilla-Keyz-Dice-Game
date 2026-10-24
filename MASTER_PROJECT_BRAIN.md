# Keyz Dice Game — Master Project Brain

**Purpose:** durable technical reference for future engineers and AI systems. This describes the implementation present in this repository, not an idealized product design. Where the code does not establish intent, the document labels the conclusion as an inference or an open question.

**Evidence boundary:** first-party source, HTML, CSS, configuration, manifests, README, and available assets were traced. Lockfiles and generated/vendor/binary artifacts were treated as dependency/build/assets metadata rather than application logic. Secret values are intentionally excluded. The README contains only the project title. No product specification or declared roadmap was found.

## 1. Executive summary

### What it is

Keyz Dice Game is a browser-based, two-player, turn-based dice game with virtual balances, a shared pot, a virtual loan pool, and room-based multiplayer. The user-facing page labels money in South African rand (`R`), but the implementation uses plain numeric values and does not connect to payment rails; these are game credits, not evidence of real-money gambling or financial settlement.

The frontend is a vanilla JavaScript multi-page Vite application. An Express server provides registration, login, and OTP HTTP endpoints and hosts Socket.IO for live rooms. MongoDB/Mongoose stores account records. Game state is held in server process memory.

### Users and problem solved

The implemented user types are people who register/log in and then play as one of two seats in a shared game room. A player can create a room by opening the game page without a `room` query parameter and share its generated URL; another authenticated player can join that room. The product solves the narrow interaction problem of coordinating a simple shared dice game and its virtual wagers over a browser connection.

There are no administrator, moderation, payments, persistent leaderboard, or customer-support workflows represented in the active code.

### Maturity and deployment status

**Maturity assessment: prototype / early MVP.** The main happy path is represented end-to-end in source, but OTP is not enforced as account verification, game data is ephemeral, dormant modules coexist with the active implementation, and automated test coverage/deployment automation are not present. The server's npm `test` script is a placeholder that exits with an error. The current workspace context reports the last `node server.js` attempt exited with code 1; the captured context does not establish the cause. Startup has hard guards for required environment values.

**Deployment readiness: not demonstrated for production.** The app has a Vite build path and a Node server, but no production deployment manifest, CI/CD pipeline, operational runbook, health/readiness probes beyond `/`, persistent game-state store, multi-instance Socket.IO adapter, or verified production environment was found. Client and server defaults also need to be aligned before a local end-to-end run: the client `.env` points at `http://localhost:5000`, while the backend defaults to port `3000` unless `PORT` overrides it. The current local environment's secret values are not reproduced here.

### Architecture style

A small, modular monolith at runtime: one Node process hosts Express REST and Socket.IO on the same HTTP server; MongoDB is used for user accounts; in-memory room objects are the authority for game state. The browser is a separate Vite-built static application. Communication is a mix of HTTP (account/OTP) and authenticated WebSocket events (game rooms).

### Objectives

- **Business objective (inferred):** provide a lightweight social two-player dice experience with simple virtual wagers and a bank/loan mechanic.
- **Technical objective (evidenced by implementation):** authenticate users, match them by room URL, enforce turns and game/bank rules server-side, and broadcast live state to both players.
- **Future objective:** no declared roadmap exists in the repository. The plausible next objective is to make the implemented game reliable and deployable: align configuration, enforce account verification if intended, persist or explicitly bound game sessions, test business rules, and define the intended currency/credit and product rules. These are recommendations/inferences, not existing commitments.

### Explain like I am 12

It is a website where two signed-in people join the same room and take turns rolling two dice. Each starts with pretend game money. Their starting bets go into a shared pot, and the winner gets that pot. A server decides the dice and keeps the shared score so both browsers see the same game. The accounts are saved in a database, but the actual game room disappears if the server forgets its in-memory data.

## 2. End-to-end user flow

### A. First-time account creation

1. User opens the auth page, `client/index.html`; `client/src/authscreen.js` toggles between the login and signup panels.
2. Signup submits email and password as JSON to `POST /api/auth/register` using the `VITE_API_URL` base URL. Server validation normalizes email, checks email shape and password length, hashes the password with bcrypt, and stores a `User` document in MongoDB.
3. The browser then requests `POST /api/otp/send-otp` for that email. The server generates a six-digit code, stores it in process memory for five minutes, and emails it through Nodemailer/Gmail configuration.
4. The user may enter the OTP and press Verify; `POST /api/otp/verify-otp` validates and consumes the code. Success only returns a verification response; it does not update the account's `isVerified` field or gate login. The signup UI does not wait for OTP verification to enable login.
5. On login, the browser posts email/password to `POST /api/auth/login`. The server compares the bcrypt hash and returns a JWT that expires after seven days. The browser stores it in `localStorage` and navigates to `client/app.html`.

### B. Create or join a room

1. `client/src/main.js` checks for the local JWT and redirects to the auth page if absent. It reads `?room=...`; if missing, it generates a room ID and updates the URL. A copy-link button copies the current URL.
2. The browser opens a Socket.IO connection to `VITE_API_URL`, passing the JWT in handshake auth. Socket middleware verifies the token. On connect, the client emits `join-room` with the room ID and a fixed default stake of `100`.
3. The server validates the room ID and stake, then gets or creates a process-local room. The first available seat is `player1`, the next is `player2`. Seats are tied to the JWT email. A second player must match the first player's stake. Each new room starts with virtual balances of R1000 per seat and a shared loan pool of R500.
4. The server debits the seat's initial stake and adds it to the pot. It emits the player's role and room state. When both seats have connected, the server broadcasts `game-start`. Rolls are rejected until both player stakes are present.
5. Rejoining with the same email recovers the existing seat in that still-live server process. The new socket replaces and disconnects the old socket for that seat.

### C. Play and settle rounds

1. The browser renders dice, turn, point, pot, balances, loan pool, bet controls, and a game log. The server's `game-state` event is copied into browser display state.
2. The player whose seat matches the server's current turn clicks Roll. The client emits `roll-dice`; the server checks room membership/seat ownership, both stakes, current turn, per-socket rate limit, and a per-room processing lock.
3. Server-side `crypto.randomInt(1, 7)` chooses each die. First-roll and point-phase rules are applied (see Section 3). The server broadcasts `dice-result`; for a completed round it credits the winner with the pot, clears pot/stake totals, updates win counts, applies eligible bank tax, emits `round-winner`, then broadcasts the updated `game-state`.
4. Players can place additional bets through `place-bet`; the server debits their room balance and increases the pot/stake total. The server retains each player's most recent three additional bet amounts for tax and loan calculations. Initial room stakes are not included in this history.
5. Players can request loans from the shared pool using `request-loan`. On success the server credits the player's room balance, debits the pool, and sends a confirmation plus updated state.
6. A disconnect clears the socket ID but reserves the seat and game state for reconnection. The other player is notified. No timeout-based seat release or room expiry is implemented.

## 3. Business rules and game mechanics

### Room economy

- Money is represented as numeric game credits and displayed with `R`; no payment provider or real-money ledger exists.
- New room defaults: R1000 balance per role and R500 shared loan pool. These values reset for each newly created room and are not derived from MongoDB `User.balance`.
- The first player chooses the initial stake (at least R20); the second must match exactly. The active browser currently always sends R100.
- Initial stakes and subsequent bets are deducted from each role's room balance and added to the shared pot. Additional bets are accepted from R20 through R10,000 by the active server handler, subject to available balance.
- At round completion, the winner gets the whole pot. The pot and both round stake totals then become zero. The next round is started by the winning role.

### Dice rules (craps-inspired)

- Two independent cryptographic random integers in `[1, 6]` are summed.
- On the first roll: 7 or 11 is an immediate win for the roller; 2, 3, or 12 is an immediate loss for the roller; any other total becomes the point and the turn passes to the other player.
- After a point is set: matching the point wins for the roller; 7 loses for the roller; any other total leaves the point active and passes the turn.
- After a round ends, point and first-roll state reset, and the winner starts the following round.

### Bank, taxes, and loans

- A player's win streak increments after a win and the loser's streak resets. Total wins increment for the winner.
- At three consecutive wins, the server charges a tax of 30% of the largest of that player's last three tracked additional bets, capped at their remaining balance; the amount is added to the loan pool and the streak resets.
- At each fifth total win, a separate tax is three times the largest tracked bet, capped at balance. The streak-tax branch returns first, so a simultaneous streak-tax condition prevents the total-win tax from being checked on that win. With no tracked bets, maximum bet is zero and the resulting tax is zero.
- Loans draw from the shared pool. The active socket handler limits cumulative loans to R500 per role per room. The bank service rejects an amount above available pool and, if tracked bet contributions are nonzero, above twice the sum of the last three tracked additional bets. If contributions are zero, that contribution-based limit is not applied. No repayment workflow exists.
- Server-side event rate limits: roll and loan requests are at most one per socket per second; place-bet is at most two per socket per second. These are in-memory limits.

## 4. System architecture and source map

### Runtime topology

```text
Browser (Vite static pages)
  ├─ HTTP JSON ──> Express: /api/auth/*, /api/otp/*
  └─ Socket.IO ──> authenticated room/game events
                         │
Node server process ──────┼── MongoDB/Mongoose: user accounts
                         └── in-memory rooms: balances, pot, turns, loans, seats
```

- **Client:** two Vite HTML inputs. `client/index.html` is login/signup; `client/app.html` hosts the game. Main game UI and event binding live in `client/src/main.js`; vanilla modules and CSS are used rather than a UI framework.
- **HTTP API:** Express, JSON body parsing, Helmet, CORS restricted to configured `CLIENT_URL`, and separate process-local rate limiters for auth and OTP routes.
- **Realtime:** Socket.IO shares the server HTTP listener. Socket JWT authentication precedes the game handler. The browser sends events and renders server broadcasts; dice outcomes and room state are server-authoritative.
- **Persistence:** Mongoose connects to MongoDB for user records. `User.balance` exists but is not used by active gameplay. Game room state, bets, bank values, and results are not persisted.

### Active server files

- Startup and route/socket composition: [server/server.js](server/server.js).
- DB connection: [server/config/database.js](server/config/database.js).
- HTTP routes/controllers: [server/routes/authRoutes.js](server/routes/authRoutes.js), [server/controllers/authController.js](server/controllers/authController.js), [server/routes/otpRoutes.js](server/routes/otpRoutes.js), [server/controllers/otpController.js](server/controllers/otpController.js).
- Schemas: [server/models/user.js](server/models/user.js). [server/models/gameResult.js](server/models/gameResult.js) is not part of the active runtime path; no active result writes were traced.
- Socket authentication: [server/middleware/socketAuth.js](server/middleware/socketAuth.js). REST bearer middleware exists at [server/middleware/auth.js](server/middleware/auth.js) but no active protected REST route uses it.
- Active room/game runtime: [server/services/roomManager.js](server/services/roomManager.js), [server/services/gameService.js](server/services/gameService.js), [server/services/bankService.js](server/services/bankService.js), [server/sockets/gameSocket.js](server/sockets/gameSocket.js), and [server/utils/broadcastGameState.js](server/utils/broadcastGameState.js).
- OTP/email support: [server/services/otpService.js](server/services/otpService.js), [server/services/emailService.js](server/services/emailService.js), and [server/mailer.js](server/mailer.js). [server/twilio.js](server/twilio.js) constructs a Twilio client but is not used by the active OTP flow.

### Active client files

- Build/page configuration and manifests: [client/vite.config.js](client/vite.config.js), [client/package.json](client/package.json), [server/package.json](server/package.json).
- Entry pages and auth UI: [client/index.html](client/index.html), [client/app.html](client/app.html), [client/src/authscreen.js](client/src/authscreen.js), [client/src/js/login.js](client/src/js/login.js), [client/src/js/signup.js](client/src/js/signup.js), [client/src/js/verifyotp.js](client/src/js/verifyotp.js).
- Game orchestration: [client/src/main.js](client/src/main.js), [client/src/js/app/state.js](client/src/js/app/state.js), [client/src/js/app/ui.js](client/src/js/app/ui.js), [client/src/js/routes/roll.js](client/src/js/routes/roll.js), [client/src/style.css](client/src/style.css), [client/src/login.css](client/src/login.css).
- [client/src/js/app/bank.js](client/src/js/app/bank.js) and [client/src/js/routes/sidebet.js](client/src/js/routes/sidebet.js) contain rule helpers/descriptions but are not imported into the active `main.js` flow. [client/src/js/app/dice.js](client/src/js/app/dice.js) and [client/src/js/routes/placebet.js](client/src/js/routes/placebet.js) are stubs; [client/src/js/routes/taxchoice.js](client/src/js/routes/taxchoice.js) is empty.
- Public dice images provide the six die faces under `client/public/images/`; other included image/SVG assets are largely starter/unused assets. The image assets are presentation resources, not rule logic.

### Active socket contract

| Event | Direction | Role |
|---|---|---|
| `join-room` | Client → server | Request seat in `roomId`, with `stake`. |
| `player-role` | Server → joining client | Assigned `player1` or `player2`. |
| `game-start` | Server → room | Both seats are connected; includes email identities and current turn. |
| `game-state` | Server → client/room | Authoritative turn, phase, point, pot, stakes, balances, loan pool, and optional role. |
| `roll-dice` | Client → server | Request a roll in `roomId`; server determines result. |
| `dice-result` | Server → room | Dice faces, sum, roller, next turn and message. |
| `round-winner` | Server → room | Winner/loser, payout, balances, optional tax message. |
| `place-bet` | Client → server | Request to debit/add bet amount. |
| `request-loan` | Client → server | Request amount from shared pool. |
| `loan-granted` | Server → requester | Successful-loan message. |
| `player-disconnected` | Server → room | Indicates a seat is waiting to reconnect. |
| `room-full`, `error` | Server → client | Join or action errors. |

## 5. Decisions, constraints, and known implementation boundaries

These are architectural facts and operational constraints, not a code-review checklist.

- **Server-authoritative random/game decisions:** die faces and shared game state are generated/updated on the server; the browser does not decide game outcomes.
- **Account identity:** JWT claims include user ID and email; live seat ownership is checked against the email and socket identity. The account DB balance is separate from game credits.
- **Ephemeral rooms:** all room state lives in a module-level object. Restarting the process loses rooms, balances, bets, loans, reservations, and reconnect state. Multiple server instances would not share rooms or process-local limits.
- **OTP scope:** OTP map and expirations are process-local; restart loses them and separate instances cannot verify one another's codes. Verification is not an account activation gate.
- **Two-seat model:** only `player1` and `player2` are implemented. Room IDs have server-side character/length validation. There is no observer/spectator model.
- **Current active path differs from unused modules:** `server/server.js` imports `server/sockets/gameSocket.js`; the separate `server/config/socket.js` and `server/sockets/socketHandler/` implementation family is not wired in. Some dormant handler names contain doubled periods, and their imports must not be assumed to be runtime paths. The same distinction applies to dormant client route/rule helpers.
- **Persistence gap:** a `GameResult` model file appears intended for result storage, but the active roll path does not write it. Its schema also contains lowercase `string` type references rather than the normal Mongoose `String`; because it is not imported by active startup, it does not currently determine normal server startup behavior.
- **Observability/operations:** root `/` responds with a basic liveness string. No structured metrics, tracing, persistent audit log, game history, database migration process, or automated backup policy is represented.
- **Configuration:** server requires `MONGO_URI`, `JWT_SECRET`, and `CLIENT_URL`; port defaults to 3000. Email delivery additionally needs valid SMTP/Gmail credentials. The Vite client uses `VITE_API_URL`; the observed local value is port 5000, not the backend's default 3000. CORS must match the browser origin.
- **Dependencies and commands:** client scripts are `dev`, `build`, `preview`; server has no dedicated `start` script, its package `main` names `index.js` though the actual entry is `server.js`, and its `test` script intentionally reports no tests and exits nonzero. See [client/package.json](client/package.json) and [server/package.json](server/package.json).
- **Secret handling:** environment configuration exists locally and contains credentials. Do not copy secret values into this document, logs, prompts, or source control. Keep deployment secrets in a secret manager/environment configuration and rotate any values that have been exposed outside trusted local storage.

## 6. Product/engineering direction

No formal roadmap, acceptance criteria, or product specification was found. Treat the following as decisions to make, not assumed product requirements:

1. Decide whether this is strictly a free virtual-credit social game. If so, state that clearly in product UX and define credit reset/room lifecycle. If not, payments, compliance, ledger integrity, age/location rules, and responsible-play requirements are a separate major product and legal design.
2. Decide whether email verification is required. If yes, make verification authoritative and persistent, and do not allow normal login/socket access before it is complete.
3. Define room lifecycle and recovery: expiry, disconnect grace period, what happens to unfinished pots, host/owner behavior, and whether room state/history must survive restart.
4. Consolidate around one socket implementation and write a protocol/rules specification shared by client/server.
5. Add tests for game outcomes, turn transitions, stake accounting, tax precedence, loans, reconnects, validation, and simultaneous events; add a reliable server start command and environment example with placeholders only.
6. Align local and deployment API origins, document Node/MongoDB versions, use TLS and managed secret storage, and add deployment/health/readiness/monitoring procedures before production.

## 7. Open questions for product owners

- Is R-denominated display intended to represent only fictional credits? Is South Africa the intended audience/locale?
- Should OTP verification be mandatory, and should codes be rate-limited per email as well as per IP/process?
- Are additional bets allowed at any point during a round or only before a roll? Current server accepts them whenever the authenticated player has a room seat.
- Should a player be able to loan before contributing bets? Current contribution cap is omitted when the player has no tracked contributions.
- Should tax use initial stakes, additional bets, or another basis? Current calculation only sees the last three additional bets.
- Should loans be repaid, and should there be a maximum per player across rounds rather than per room lifetime?
- What should happen after a server restart, prolonged disconnect, room abandonment, or exhausted balance/pool?

## 8. Repository entrypoints and verification

- Client development/build: run npm scripts from `client/`; Vite has separate auth and app HTML build inputs.
- Server runtime entry: `server/server.js` (despite the package `main` value); provide required environment variables and a reachable MongoDB before expecting normal service.
- Existing verification: no meaningful automated test suite is defined. A passing build or test run was not asserted while producing this architecture document. The workspace reports a previous server invocation exiting with code 1, without its diagnostic output, so startup remains unverified here.
- Root [README.md](README.md) contains only the repository title and is not a setup guide.
