document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;

    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Signup failed");
            return;
        }


        alert("Signup sucessful! Please login, Player!");
        await sendWelcomeSMS(email);
        // Toggle view or redirect
        document.getElementById("signup-panel").style.display = "none";
        document.getElementById("login-screen").style.display = "block";
    } catch (err) {
        console.error("Signup Error:", err);
        alert("Server error during signup.");
    }
});

async function sendWelcomeSMS(email) {

    const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/otp/send-otp`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Failed to send OTP");
    }

    return data;
}
