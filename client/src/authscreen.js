const instruction = document.getElementById("instruction");
const loginScreen = document.getElementById("login-screen");
const signupPanel = document.getElementById("signup-panel");

if (instruction && loginScreen && signupPanel) {
    signupPanel.style.display = "none";
    let showingSignup = false;

    instruction.addEventListener("click", () => {
        alert("Toggle clicked");
        loginScreen.style.display =
            loginScreen.style.display === "none"
                ? "block"
                : "none";

        signupPanel.style.display =
            signupPanel.style.display === "none"
                ? "block"
                : "none";
        //showingSignup = !showingSignup;
        //loginScreen.style.display = showingSignup ? "none" : "block";
        //signupPanel.style.display = showingSignup ? "block" : "none";
    });
}