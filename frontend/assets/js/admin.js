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
  
        msg.textContent = "Producto creado correctamente.";
        form.reset();
        // poner stock por defecto otra vez
        const stockInput = form.querySelector('input[name="stock"]');
        if (stockInput) stockInput.value = "0";
        loadProductos();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  
    async function deleteProducto(id) {
      if (!confirm("¿Eliminar este producto?")) return;
  
      try {
        const r = await fetch(`${API}/api/productos/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error eliminando");
  
        loadProductos();
      } catch (e) {
        alert(e.message);
      }
    }
  
    async function loadProductos() {
      grid.innerHTML = `<div class="card skeleton-card">Cargando…</div>`;
  
      try {
        // si implementaste /api/admin/productos, úsalo:
        const url = `${API}/api/admin/productos`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  
        // fallback: si no existe el endpoint admin, usa el público
        let productos;
        if (r.ok) {
          productos = await r.json();
        } else {
          const r2 = await fetch(`${API}/api/productos`);
          productos = await r2.json();
        }
  
        if (!productos.length) {
          grid.innerHTML = `<div class="card empty-card">No hay productos</div>`;
          return;
        }
  
        grid.innerHTML = productos.map(p => `
          <div class="product-card">
            <div class="card-media" style="background-image:url('${p.imagen_url ? `${API}${p.imagen_url}` : ""}')"></div>
            <div class="card-body">
              <div class="card-title">${p.nombre}</div>
              <div class="card-desc">${p.descripcion || ""}</div>
  
              <div class="card-meta">
                <div class="price">${Number(p.precio).toFixed(2)} €</div>
                <span class="tag">${p.categoria}</span>
              </div>
  
              <div class="small muted" style="margin-top:8px">
                Stock: <b>${Number(p.stock ?? 0)}</b>
              </div>
  
              <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap">
                <button class="btn" type="button" data-del="${p.id}">Eliminar</button>
              </div>
            </div>
          </div>
        `).join("");
  
        grid.querySelectorAll("[data-del]").forEach(btn => {
          btn.addEventListener("click", () => deleteProducto(btn.getAttribute("data-del")));
        });
  
      } catch (e) {
        grid.innerHTML = `<div class="card empty-card">Error cargando productos</div>`;
      }
    }
  
    loadProductos();
  })();
  