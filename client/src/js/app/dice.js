// dice.js — server now handles all dice logic.
// This file is kept to avoid import errors if referenced elsewhere.
// processRoll is a no-op; all roll results come via socket "dice-result".

export function processRoll(sum) {
  // Server-authoritative: do nothing here.
  console.log("processRoll (client stub) sum:", sum);
}