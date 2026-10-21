// placebet.js — kept for import compatibility but betting now goes through
// main.js → socket.emit("place-bet").  Local state mutation removed.
import { addLog } from "../app/ui.js";

export default function placeBet(player, amount) {
  // Intentionally empty — window.placeBet in main.js handles this via socket.
  // This file is preserved so existing imports don't break.
  addLog(`ℹ️ placeBet called directly — use the Bet button instead`);
}