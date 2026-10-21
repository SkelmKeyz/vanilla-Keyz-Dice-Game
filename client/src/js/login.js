document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        console.log(
            `${import.meta.env.VITE_API_URL}/api/auth/login`
        );


        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {

            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Login failed");
            return;
        }

        localStorage.setItem("token", data.token);
        alert("Login successful!");
        window.location.href = "./app.html";
    } catch (err) {
        console.error("Login Error:", err);
        alert("Server error during login");
    }
});

