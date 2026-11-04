import gameState from "./state.js";
import { addLog, updateDisplay } from "./ui.js";

// ─── Bank Rules (called after every win) ─────────────────────────────────────
export default function applyBankRules(player) {
    const last3 = gameState.bank.last3Bets[player] || [];
    const contributions = last3.reduce((a, b) => a + b, 0);
    const rake = Math.floor(contributions * gameState.bank.rakePercent);

    if (rake > 0) {
        gameState.bank.loanPool += rake;
        gameState[player].balance -= rake;
        addLog(`🏦 Bank collected $${rake} rake from ${player}`);
    }
    updateDisplay();
}

// ─── Loan ─────────────────────────────────────────────────────────────────────
socket.emit("request-loan", {
    roomId,
    amount
});