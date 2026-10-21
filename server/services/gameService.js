const bothBet = room.bank.last3Bets.player1.length > 0 &&
    room.bank.last3Bets.player2.length > 0;

if (!bothBet) {
    socket.emit("error", " Both players must place a bet before rolling");
    return;
}

function processRoll(room) {
    console.log("ROLL ALLOWED");
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    const sum = d1 + d2;
    const roller = room.currentTurn;

    let message = null;
    let roundOver = false;
    let winnerRole = null;

    if (room.isFirstRoll) {
        if (sum === 7 || sum === 11) {
            message = `🎉 ${roller} rolled a natural ${sum}! Straight win!`;
            roundOver = true;
            winnerRole = roller;
        } else if (sum === 2 || sum === 3 || sum === 12) {
            message = `💀 ${roller} crapped out with ${sum}!`;
            roundOver = true;
            winnerRole = roller === "player1" ? "player2" : "player1";
        } else {
            room.point = sum;
            room.isFirstRoll = false;
            message = `📌 Point set to ${sum}`;
        }
    } else {
        if (sum === room.point) {
            message = `🏆 ${roller} hit the point (${sum})! Wins the round!`;
            roundOver = true;
            winnerRole = roller;
        } else if (sum === 7) {
            message = `💀 Seven-out! ${roller} loses!`;
            roundOver = true;
            winnerRole = roller === "player1" ? "player2" : "player1";
        }
    }

    const nextTurn =
        roller === "player1"
            ? "player2"
            : "player1";

    room.currentTurn = nextTurn;

    if (roundOver) {
        room.isFirstRoll = true;
        room.point = null;
    }

    return {
        d1,
        d2,
        sum,
        roller,
        nextTurn,
        message,
        roundOver,
        winnerRole
    };
}

module.exports = {
    processRoll
};