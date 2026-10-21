
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

            if (data.verified) {
                alert("✅ OTP Verified!");
            } else {
                alert("❌ Invalid OTP");
            }

        } catch (err) {
            console.error(err);
        }
    });