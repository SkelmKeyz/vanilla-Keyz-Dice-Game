// ─── GameState Constructor ────────────────────────────────────────────────────
function GameState(isFirstRoll, point, roller, pot, bank, players, settle) {
  this.isFirstRoll = isFirstRoll;
  this.point = point;
  this.roller = roller;     // "player1" or "player2" — whose turn it is
  this.myRole = null;       // "player1" or "player2" — who THIS client is
  this.pot = pot;
  this.bank = bank;
  this.players = players;
  this.settle = settle;
}

GameState.prototype.reset = function () {
  this.isFirstRoll = true;
  this.point = null;
  this.roller = "player1";
  this.pot = 0;
  this.settle = true;
  this.bank.bets = [];
};

// ─── Initial Instance ─────────────────────────────────────────────────────────
const gameState = new GameState(
  true,
  null,
  "player1",  // default — will be overwritten by game-state event
  0,
  {
    loanPool: 500,
    balances: { player1: 1000, player2: 1000 },
    bets: [],
    winStreak: { player1: 0, player2: 0 },
    totalWins: { player1: 0, player2: 0 },
    specialLossStreak: { player1: 0, player2: 0 },
    last3Bets: { player1: [], player2: [] }
  },
  ["player1", "player2"],
  true
);

export default gameState;