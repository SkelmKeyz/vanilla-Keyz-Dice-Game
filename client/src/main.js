import gameState from "./js/app/state";
import { addLog, updateDisplay, setStatus } from "./js/app/ui.js";
import { animateDice } from "./js/routes/roll.js";
import './style.css';
import { io } from "socket.io-client";

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/index.html";
}

// ── Room ID from URL or generate new one ──────────────────────────────────────
const params = new URLSearchParams(window.location.search);
let roomId = params.get("room");
if (!roomId) {
  roomId = "room-" + Math.random().toString(36).substr(2, 8);
  history.replaceState({}, "", `?room=${roomId}`);
}

const DEFAULT_STAKE = 100;

// ── Socket init ───────────────────────────────────────────────────────────────
const socket = io(import.meta.env.VITE_API_URL, {
  auth: { token }
});

socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
  socket.emit("join-room", { roomId, stake: DEFAULT_STAKE });
});

socket.on("connect_error", (err) => {
  console.error("Socket connection error:", err.message);
  addLog(`⚠️ Connection error: ${err.message}`);
});

// ── HTML ──────────────────────────────────────────────────────────────────────
document.querySelector('#app').innerHTML = `
  <header>
    <h1 id="statusMsg">🎲 Keyz Dice Game 🎲</h1>
    <p id="turnIndicator" class="turn-indicator">⏳ Waiting for role...</p>
    <p id="myRoleDisplay" class="my-role"></p>
    <p class="room-info">
      Room: <strong>${roomId}</strong>
      <button id="copyRoomBtn" class="btn-copy">📋 Copy Link</button>
    </p>
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
          <input type="number" id="loanAmount" min="20" max="500" value="20" />
          <button class="btn-secondary" id="loanBtnP1">P1 Loan</button>
          <button class="btn-secondary" id="loanBtnP2">P2 Loan</button>
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
            <button class="btn-primary" id="betBtnPlayer1">Bet</button>
          </div>
        </div>

        <div class="player-bet">
          <h3>Player 2</h3>
          <p id="bankBalanceP2">Balance: R1000</p>
          <div class="input-row">
            <input type="number" id="betAmount2" min="20" value="20" />
            <button class="btn-primary" id="betBtnPlayer2">Bet</button>
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

// ── Copy room link ────────────────────────────────────────────────────────────
document.getElementById('copyRoomBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href)
    .then(() => addLog("📋 Room link copied!"))
    .catch(() => addLog("⚠️ Could not copy link"));
});

// ── Player role ───────────────────────────────────────────────────────────────
socket.on("player-role", (role) => {
  gameState.myRole = role;
  addLog(`✅ You are ${role}`);
  updateDisplay();

  if (role === "player1") {
    const btn = document.querySelector("#betBtnPlayer2");
    if (btn) { btn.disabled = true; btn.title = "You can only bet as Player 1"; }
    const loanBtn = document.querySelector("#loanBtnP2");
    if (loanBtn) { loanBtn.disabled = true; }
  } else if (role === "player2") {
    const btn = document.querySelector("#betBtnPlayer1");
    if (btn) { btn.disabled = true; btn.title = "You can only bet as Player 2"; }
    const loanBtn = document.querySelector("#loanBtnP1");
    if (loanBtn) { loanBtn.disabled = true; }
  }

  const myRoleEl = document.getElementById("myRoleDisplay");
  if (myRoleEl) myRoleEl.textContent = `You are: ${role}`;
});

// ── Roll button ───────────────────────────────────────────────────────────────
document.getElementById('rollBtn').addEventListener('click', () => {
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

// ── Bet buttons ───────────────────────────────────────────────────────────────
document.getElementById('betBtnPlayer1').addEventListener('click', () => {
  const amount = Number(document.getElementById('betAmount1').value);
  placeBetAction('player1', amount);
});

document.getElementById('betBtnPlayer2').addEventListener('click', () => {
  const amount = Number(document.getElementById('betAmount2').value);
  placeBetAction('player2', amount);
});

// ── Loan buttons ──────────────────────────────────────────────────────────────
document.getElementById('loanBtnP1').addEventListener('click', () => {
  requestLoanAction('player1', Number(document.getElementById('loanAmount').value));
});

document.getElementById('loanBtnP2').addEventListener('click', () => {
  requestLoanAction('player2', Number(document.getElementById('loanAmount').value));
});

// ── Dice result ───────────────────────────────────────────────────────────────
socket.on("dice-result", ({ d1, d2, sum, roller, nextTurn, message }) => {
  animateDice(document.querySelector(".img1"), d1);
  animateDice(document.querySelector(".img2"), d2);
  addLog(`🎲 ${roller} rolled ${d1} + ${d2} = ${sum}`);
  if (message) {
    setStatus(message);
    addLog(message);
  }
});

// ── Round winner ──────────────────────────────────────────────────────────────
socket.on("round-winner", ({ winner, loser, payout, balances, bankMessage, nextAction }) => {
  const isMyWin = winner === gameState.myRole;
  const resultMsg = isMyWin
    ? `🏆 You won R${payout}!`
    : `💀 You lost. ${winner} wins R${payout}.`;

  setStatus(resultMsg);
  addLog(resultMsg);

  if (bankMessage) {
    addLog(bankMessage);
  }

  if (nextAction) {
    addLog(`💡 ${nextAction}`);
  }

  if (balances) {
    gameState.bank.balances.player1 = balances.player1;
    gameState.bank.balances.player2 = balances.player2;
    updateDisplay();
  }
});

// ── Loan granted ──────────────────────────────────────────────────────────────
socket.on("loan-granted", ({ message }) => {
  addLog(`💳 ${message}`);
});

// ── Game state sync ───────────────────────────────────────────────────────────
socket.on("game-state", (state) => {
  gameState.roller = state.currentTurn;
  gameState.isFirstRoll = state.isFirstRoll;
  gameState.point = state.point;
  gameState.pot = state.pot;
  gameState.bank.balances.player1 = state.balances.player1;
  gameState.bank.balances.player2 = state.balances.player2;
  gameState.bank.loanPool = state.loanPool;

  if (!gameState.myRole && state.role) {
    gameState.myRole = state.role;
  }

  updateDisplay();

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

// ── Betting ───────────────────────────────────────────────────────────────────
function placeBetAction(player, amount) {
  amount = Number(amount);
  if (isNaN(amount) || amount < 20) {
    addLog("⚠️ Minimum bet is R20");
    return;
  }
  if (!gameState.myRole) {
    addLog("⏳ Waiting for your player role...");
    return;
  }
  if (player !== gameState.myRole) {
    addLog("⚠️ You can only bet for your own player");
    return;
  }
  socket.emit("place-bet", { roomId, amount });
}

window.placeBet = placeBetAction;

// ── Loans ─────────────────────────────────────────────────────────────────────
function requestLoanAction(player, amount) {
  if (!gameState.myRole) {
    addLog("⏳ Waiting for your player role...");
    return;
  }
  if (player !== gameState.myRole) {
    addLog("⚠️ You can only request a loan for your own player");
    return;
  }
  amount = Number(amount);
  if (isNaN(amount) || amount < 20) {
    addLog("⚠️ Minimum loan is R20");
    return;
  }
  socket.emit("request-loan", { roomId, amount });
}

window.requestLoan = requestLoanAction;