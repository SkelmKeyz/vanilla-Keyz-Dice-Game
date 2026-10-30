document
    .getElementById("verifyOtpBtn")
    .addEventListener("click", async () => {

        const email =
            document.getElementById("signupEmail").value;

        const otp =
            document.getElementById("otp").value;

        try {

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/otp/verify-otp`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        otp
                    })
                }
            );

            const data = await response.json();

            if (response.ok && data.verified) {
                // Optionally save token immediately or redirect to login
                if (data.token) {
                    localStorage.setItem("token", data.token);
                    window.location.href = "/app.html";
                } else {
                    window.location.href = "/index.html"; // Back to login
                }
            } else {
                alert(data.message || "Verification failed");
            }
        } catch (err) {
            console.error("Network or parsing error:", err);
        }
    });