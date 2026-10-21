import gameState from "./state.js";
import { addLog, updateDisplay } from "./ui.js";

// ─── Bank Rules (called after every win) ─────────────────────────────────────
export default function applyBankRules(player) {
    const last3 = gameState.bank.last3Bets[player] || [];
    const maxBet = last3.length > 0 ? Math.max(...last3) : 0;

    // 3-win streak tax
    if (gameState.bank.winStreak[player] === 3) {
        const fee = Math.min(maxBet * 0.3, gameState.bank.balances[player]);
        gameState.bank.loanPool += fee;
        gameState.bank.balances[player] -= fee;
        gameState.bank.winStreak[player] = 0;
        addLog(`🏦 Streak Tax applied to ${player} (-R${fee.toFixed(2)})`);
    }

    // 5 total wins tax
    if (gameState.bank.totalWins[player] === 5) {
        const fee = Math.min(maxBet * 3, gameState.bank.balances[player]);
        gameState.bank.loanPool += fee;
        gameState.bank.balances[player] -= fee;
        gameState.bank.totalWins[player] = 0;
        addLog(`🏦 Wins-5 Tax applied to ${player} (-R${fee.toFixed(2)})`);
    }

    updateDisplay();
}

// ─── Loan ─────────────────────────────────────────────────────────────────────
export function requestLoan(player, amount) {
    const loanAmount = Number(amount);
    const last3 = gameState.bank.last3Bets[player] || [];
    const contributions = last3.reduce((a, b) => a + b, 0);

    if (loanAmount > gameState.bank.loanPool) {
        addLog("⚠️ Loan exceeds available pool");
        return;
    }

    if (contributions > 0 && loanAmount > contributions * 2) {
        addLog(`⚠️ Loan exceeds your borrowing limit (R${contributions * 2})`);
        return;
    }

    gameState.bank.balances[player] += loanAmount;
    gameState.bank.loanPool -= loanAmount;
    addLog(`💳 ${player} borrowed R${loanAmount}`);
    updateDisplay();
}