const { randomInt } = require("crypto");

function processRoll(room) {
    if (!room || !room.currentTurn) {
        throw new Error("Invalid room data");
    }

    const d1 = randomInt(1, 7);
    const d2 = randomInt(1, 7);

    const sum = d1 + d2;
    const roller = room.currentTurn;

    let message = null;
    let nextTurn = null;
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
            nextTurn = roller === "player1" ? "player2" : "player1";
            room.currentTurn = nextTurn;
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
        } else {
            message = `${roller} rolled ${sum}. Point remains ${room.point}`;
            nextTurn = roller === "player1" ? "player2" : "player1";
            room.currentTurn = nextTurn;
        }

        if (roundOver) {
            room.isFirstRoll = true;
            room.point = null;
            room.currentTurn = winnerRole;
        }
    }

    return {
        d1,
        d2,
        sum,
        roller,
        nextTurn: roundOver ? null : room.currentTurn,
        point: room.point,
        message,
        roundOver,
        winnerRole
    };
}

module.exports = { processRoll };