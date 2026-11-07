// ─── UI Helpers ───────────────────────────────────────────────────────────────
import gameState from "./state.js";

export function addLog(message) {
  const log = document.getElementById("gameLog");
  if (!log) return;
  const entry = document.createElement("p");
  entry.textContent = message;
  log.prepend(entry);
}

export function updateDisplay() {
  const el = (id) => document.getElementById(id);
  if (!el("potDisplay")) return;

  const turnIndicator = el("turnIndicator");
  if (turnIndicator) {
    const isMyTurn = gameState.myRole && gameState.myRole === gameState.roller;
    turnIndicator.textContent = isMyTurn
      ? `🎯 YOUR turn to roll!`
      : `⏳ ${gameState.roller || "player1"}'s turn to roll`;
    turnIndicator.style.color = isMyTurn ? "#00b894" : "#636e72";
  }

  el("potDisplay").textContent = `Pot: ${gameState.pot} coins`;
  el("bankBalanceP1").textContent = `Player 1 balance: ${gameState.bank.balances.player1} coins`;
  el("bankBalanceP2").textContent = `Player 2 balance: ${gameState.bank.balances.player2} coins`;
  el("loanPool").textContent = `Loan Pool: ${gameState.bank.loanPool} Coins`;

  const pd = el("pointDisplay");
  if (pd) pd.textContent = gameState.point ? `📌 Point: ${gameState.point}` : "";
}

export function setStatus(message, cls = '') {
  const h1 = document.getElementById("statusMsg");
  if (!h1) return;
  h1.textContent = message;
  h1.className = cls;
}