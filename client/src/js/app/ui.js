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

  el("potDisplay").textContent = `Pot: R${gameState.pot} Credits`;
  el("bankBalanceP1").textContent = `Player 1 balance: R${gameState.bank.balances.player1} Credits`;
  el("bankBalanceP2").textContent = `Player 2 balance: R${gameState.bank.balances.player2} Credits`;
  el("loanPool").textContent = `Loan Pool: R${gameState.bank.loanPool} Credits`;

  const pd = el("pointDisplay");
  if (pd) pd.textContent = gameState.point ? `📌 Point: ${gameState.point}` : "";
}

export function setStatus(message, cls = '') {
  const h1 = document.getElementById("statusMsg");
  if (!h1) return;
  h1.textContent = message;
  h1.className = cls;
}