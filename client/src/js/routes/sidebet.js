import gameState from "../app/state.js";
import { addLog, updateDisplay } from "../app/ui.js";

/**
 * Side bet resolution — called after a dice result is known.
 * NOTE: Side bet payouts are calculated server-side.
 * This module only logs the outcome for display purposes.
 */
export function placeSideBets(player, amount, sum) {
    const opponent = player === "player1" ? "player2" : "player1";

    if (gameState.isFirstRoll) {
        if (sum === 7 || sum === 11) {
            const straightWinFee = gameState.pot > 0 ? gameState.pot * 0.25 : amount;
            addLog(`[Sidebet] Straight win! R${straightWinFee} fee applies. Roller: ${gameState.roller}`);
        } else {
            addLog(`[Sidebet] No straight win on first roll. Roller: ${gameState.roller}`);
        }
    } else {
        // After point is set: no-win bet resolves
        const noWinFee = gameState.pot * 0.25; // ← fixed: declared in correct scope
        if (sum === 7) {
            addLog(`[Sidebet] Seven out! No-win bet pays. Fee: R${noWinFee}. Roller: ${gameState.roller}`);
        } else {
            addLog(`[Sidebet] No-win bet fails. Roller still in play. Roller: ${gameState.roller}`);
        }
    }

    updateDisplay();
}