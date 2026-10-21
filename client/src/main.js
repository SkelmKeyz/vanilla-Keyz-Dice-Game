import gameState from "./js/app/state";
import { addLog, updateDisplay } from "./js/app/ui.js";
import { animateDice } from "./js/routes/roll.js";
import './style.css';
import { io } from "socket.io-client";

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/index.html";
}

// ── Socket init ───────────────────────────────────────────────────────────────
const socket = io(import.meta.env.VITE_API_URL, {
  auth: { token }
});

const roomId = "room-1";

socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
  socket.emit("join-room", roomId);
});

socket.on("connect_error", (err) => {
  console.error("Socket connection error:", err.message);
  addLog(`⚠️ Connection error: ${err.message}`);
});

// ── Player role ───────────────────────────────────────────────────────────────
socket.on("player-role", (role) => {
  console.log("PLAYER ROLE RECEIVED:", role, typeof role);
  gameState.myRole = role;

  console.log(
    "MY ROLE AFTER ASSIGNMENT:",
    gameState.myRole
  );

  addLog(`✅ You are ${role}`);
  updateDisplay();

  // Disable the opponent's bet button
  if (role === "player1") {
    const btn = document.querySelector("betBtnPlayer2");
    if (btn) { btn.disabled = true; btn.title = "You can only bet as Player 1"; }
  } else if (role === "player2") {
    const btn = document.querySelector("betBtnPlayer1");
    if (btn) { btn.disabled = true; btn.title = "You can only bet as Player 2"; }
  }

  const myRoleEl = document.getElementById("myRoleDisplay");
  if (myRoleEl) myRoleEl.textContent = `You are: ${role}`;
});

// ── HTML ──────────────────────────────────────────────────────────────────────
document.querySelector('#app').innerHTML = `
  <header>
    <h1 id="statusMsg">🎲 Keyz Dice Game 🎲</h1>
    <p id="turnIndicator" class="turn-indicator">⏳ Waiting for role...</p>
    <p id="myRoleDisplay" class="my-role"></p>
  </header>

  <div class="game-wrapper">

    <div class="left-panel">

      <section class="card" id="rollSection">
        <h2>Roll Dice</h2>
        <div class="dice-container">
          <img class="img1" src="/images/dice1.png" alt="Die 1">
          <img class="img2" src="/images/dice1.png" alt="Die 2">
        </div>
        <button id="rollBtn" class="btn-primary">🎲 Roll</button>
        <p id="pointDisplay" class="point-display"></p>
      </section>

      <section class="card" id="bankSection">
        <h2>🏦 Central Bank</h2>
        <p id="loanPool">Loan Pool: R500</p>
        <p id="potDisplay">Pot: R0</p>
        <div class="input-row">
          <input type="number" id="loanAmount" min="20" value="20" />
          <button class="btn-secondary" onclick="window.requestLoan('player1', +document.getElementById('loanAmount').value)">P1 Loan</button>
          <button class="btn-secondary" onclick="window.requestLoan('player2', +document.getElementById('loanAmount').value)">P2 Loan</button>
        </div>
      </section>

    </div>

    <div class="right-panel">

      <section class="card" id="betSection">
        <h2>💰 Betting House</h2>

        <div class="player-bet">
          <h3>Player 1</h3>
          <p id="bankBalanceP1">Balance: R1000</p>
          <div class="input-row">
            <input type="number" id="betAmount1" min="20" value="20" />
            <button class="btn-primary" onclick="window.placeBet('player1', +document.getElementById('betAmount1').value)">Bet</button>
          </div>
        </div>

        <div class="player-bet">
          <h3>Player 2</h3>
          <p id="bankBalanceP2">Balance: R1000</p>
          <div class="input-row">
            <input type="number" id="betAmount2" min="20" value="20" />
            <button class="btn-primary" onclick="window.placeBet('player2', +document.getElementById('betAmount2').value)">Bet</button>
          </div>
        </div>
      </section>

      <section class="card" id="logSection">
        <h2>📋 Game Log</h2>
        <div id="gameLog"></div>
      </section>

    </div>
  </div>

  <footer>🎲 Skelm Keyz — Just doing my thing! @2026 Design By Skelm Keyz 🎲</footer>
`;

// ── Roll button ───────────────────────────────────────────────────────────────
document.getElementById('rollBtn').addEventListener('click', () => {
  console.log("Roll clicked | myRole:", gameState.myRole, "| currentTurn:", gameState.roller);

  if (!gameState.myRole) {
    addLog("⏳ Still assigning your role, please wait...");
    return;
  }

  if (gameState.myRole !== gameState.roller) {
    addLog(`⛔ Not your turn. You are ${gameState.myRole}, current turn: ${gameState.roller}`);
    return;
  }

  socket.emit("roll-dice", { roomId });
});

// ── Dice result ───────────────────────────────────────────────────────────────
socket.on("dice-result", ({ d1, d2, sum, roller, nextTurn, message }) => {
  animateDice(document.querySelector(".img1"), d1);
  animateDice(document.querySelector(".img2"), d2);
  addLog(`🎲 ${roller} rolled ${d1} + ${d2} = ${sum}`);
  if (message) {
    const h1 = document.getElementById("statusMsg");
    if (h1) h1.textContent = message;
    addLog(message);
  }
  console.log(`dice-result: roller=${roller} sum=${sum} nextTurn=${nextTurn}`);
});

// ── Game state sync (single handler) ─────────────────────────────────────────
socket.on("game-state", (state) => {
  console.log(JSON.stringify(state, null, 2));

  console.log(
    "GAME STATE:",
    state
  );

  console.log(
    "ROLE FROM GAME STATE:",
    state.role
  );

  console.log(
    "ROLE BEFORE UPDATE:",
    gameState.myRole
  );

  console.log(
    "ROLE AFTER UPDATE:",
    gameState.myRole
  );

  gameState.roller = state.currentTurn;
  gameState.isFirstRoll = state.isFirstRoll;
  gameState.point = state.point;
  gameState.pot = state.pot;
  gameState.bank.balances.player1 = state.balances.player1;
  gameState.bank.balances.player2 = state.balances.player2;
  gameState.bank.loanPool = state.loanPool;

  // Only update myRole from game-state if player-role hasn't set it yet
  // (player-role is the authoritative first assignment)
  if (!gameState.myRole && state.role) {
    gameState.myRole = state.role;
  }

  updateDisplay();

  // Update my-role indicator
  const myRoleEl = document.getElementById("myRoleDisplay");
  if (myRoleEl && gameState.myRole) {
    myRoleEl.textContent = `You are: ${gameState.myRole}`;
  }
});

// ── Room full / error ─────────────────────────────────────────────────────────
socket.on("room-full", (msg) => {
  addLog(`⛔ ${msg}`);
  alert(msg);
});

socket.on("error", (msg) => {
  addLog(`⚠️ ${msg}`);
});

socket.on("player-disconnected", ({ message }) => {
  addLog(`⚠️ ${message}`);
});

// ── Betting (server-authoritative) ───────────────────────────────────────────
window.placeBet = function (player, amount) {
  amount = Number(amount);
  if (amount < 20) { addLog("⚠️ Minimum bet is R20"); return; }
  socket.emit("place-bet", { roomId, player, amount });
};

window.requestLoan = function (player, amount) {
  if (!gameState.myRole) {
    addLog("⏳ Waiting for your player role...");
    return;
  }

  if (player !== gameState.myRole) {
    addLog("⚠️ You can only request a loanfor your player");
    return;
  }

  socket.emit("request-loan", {
    roomId,
    player,
    amount: Number(amount)
  });
};

