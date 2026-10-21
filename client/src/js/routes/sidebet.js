import gameState from "../app/state.js";
// Assuming addLog and updateDisplay are defined in your main script or a separate UI utility module
import { addLog, updateDisplay } from "../app/ui.js";
// Side-bets
export function placeSideBets(player, amount, sum) {
    let straightWinFee = gameState.pot > 0 ? gameState.pot * 0.25 : amount;

    if (gameState.isFirstRoll && (sum === 7 || sum === 11)) {
        let noWinFee = gameState.pot * 0.25;
        let opponent = player === "player1" ? "player2" : "player1";
        addLog(`[Sidebet] No-win fee R${noWinFee} - awaiting server sync`);


        addLog("Straight win side bet pays! Roller: " + gameState.roller);
    } else {
        addLog("No straight win! Roller: " + gameState.roller);
    }


    if (!gameState.isFirstRoll) {
        addLog(`[Sidebet] No-win fee R${noWinFee} - awaiting server sync`);

        let opponent = player === "player1" ? "player2" : "player1";

        addLog("No Win bet pays! Roller: " + gameState.roller);
    } else {
        addLog("No Win bet fails. Roller still in play.");
    }
    updateDisplay();
}