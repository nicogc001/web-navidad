(() => {
    const API = window.APP_CONFIG.API_BASE_URL;
    const token = localStorage.getItem("token");
  
    if (!token) {
      window.location.href = "./login.html";
      return;
    }
  
    const form = document.getElementById("productoForm");
    const msg = document.getElementById("productoMsg");
    const grid = document.getElementById("productosAdminGrid");
    const logoutBtn = document.getElementById("logoutBtn");
  
    logoutBtn.onclick = () => {
      localStorage.removeItem("token");
      window.location.href = "./index.html";
    };
  
    // ----------------
    // Crear producto
    // ----------------
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.textContent = "Subiendo producto…";
  
      const formData = new FormData(form);
  
      try {
        const r = await fetch(`${API}/api/productos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error creando producto");
  
        msg.textContent = "Producto creado correctamente ✅";
        form.reset();
        loadProductos();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  
    // ----------------
    // Cargar productos
    // ----------------
    async function loadProductos() {
      grid.innerHTML = `<div class="card skeleton-card">Cargando…</div>`;
  
      try {
        const r = await fetch(`${API}/api/productos`);
        const productos = await r.json();
  
        if (!productos.length) {
          grid.innerHTML = `<div class="card empty-card">No hay productos</div>`;
          return;
        }
  
        grid.innerHTML = productos.map(p => `
          <div class="product-card">
            <div class="card-media"
                 style="background-image:url('${API}${p.imagen_url}')"></div>
            <div class="card-body">
              <div class="card-title">${p.nombre}</div>
              <div class="card-desc">${p.descripcion || ""}</div>
              <div class="card-meta">
                <div class="price">${Number(p.precio).toFixed(2)} €</div>
                <span class="tag">${p.categoria}</span>
              </div>
            </div>
          </div>
        `).join("");
      } catch (e) {
        grid.innerHTML = `<div class="card empty-card">Error cargando productos</div>`;
      }
    }
  
    loadProductos();
  })();
  