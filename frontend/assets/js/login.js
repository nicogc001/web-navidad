(() => {
    const API = window.APP_CONFIG?.API_BASE_URL;
  
    const form = document.getElementById("loginForm");
    const msg = document.getElementById("loginMsg");
    const btn = document.getElementById("loginBtn");
  
    if (!form) return;
  
    function setMsg(text, isError = false) {
      msg.textContent = text || "";
      msg.style.color = isError ? "var(--primary)" : "var(--muted)";
    }
  
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMsg("");
      btn.disabled = true;
      btn.textContent = "Entrando…";
  
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
  
      try {
        if (!API) throw new Error("API_BASE_URL no configurada");
  
        // Endpoint esperado (lo adaptamos a tu backend real en el siguiente paso)
        const r = await fetch(`${API}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
  
        const data = await r.json().catch(() => ({}));
  
        if (!r.ok) {
          throw new Error(data?.error || data?.message || "Credenciales incorrectas");
        }
  
        // Soporta varios formatos típicos
        const token = data?.token || data?.accessToken || data?.jwt;
  
        if (!token) {
          // Si tu backend usa cookies, esto se ajusta luego
          setMsg("Login OK, pero no llegó token. Revisa respuesta del backend.", true);
          return;
        }
  
        localStorage.setItem("token", token);
        setMsg("Acceso correcto. Redirigiendo…");
  
        // Siguiente pantalla: panel admin (lo creamos después)
        window.location.href = "./admin.html";
      } catch (err) {
        setMsg(err?.message || "Error en el login", true);
      } finally {
        btn.disabled = false;
        btn.textContent = "Entrar";
      }
    });
  })();
  