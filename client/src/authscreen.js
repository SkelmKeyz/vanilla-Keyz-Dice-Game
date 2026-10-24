const instruction = document.getElementById("instruction");
const loginScreen = document.getElementById("login-screen");
const signupPanel = document.getElementById("signup-panel");

if (instruction && loginScreen && signupPanel) {
    signupPanel.style.display = "none";
    let showingSignup = false;

    instruction.addEventListener("click", () => {
        showingSignup = !showingSignup;
        loginScreen.style.display = showingSignup ? "none" : "block";
        signupPanel.style.display = showingSignup ? "block" : "none";
    });
}