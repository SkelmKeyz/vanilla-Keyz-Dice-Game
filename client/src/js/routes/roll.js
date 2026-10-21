// ─── Dice Animation ───────────────────────────────────────────────────────────
export function animateDice(imgElement, final) {
  if (!imgElement) return;
  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    const temp = Math.floor(Math.random() * 6) + 1;
    imgElement.src = `/images/dice${temp}.png`;
    if (counter > 10) {
      clearInterval(interval);
      imgElement.src = `/images/dice${final}.png`;
    }
  }, 100);
}