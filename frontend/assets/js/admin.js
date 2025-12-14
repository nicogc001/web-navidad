(() => {
    const API = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
    const token = localStorage.getItem("token");
  
    if (!token) {
      window.location.href = "./login.html";
      return;
    }
  
    const form = document.getElementById("productoForm");
    const msg = document.getElementById("productoMsg");
    const grid = document.getElementById("productosAdminGrid");
    const pedidosGrid = document.getElementById("pedidosAdminGrid");
    const logoutBtn = document.getElementById("logoutBtn");
  
    logoutBtn.onclick = () => {
      localStorage.removeItem("token");
      window.location.href = "./index.html";
    };
  
    function authHeaders(extra = {}) {
      return { Authorization: `Bearer ${token}`, ...extra };
    }
  
    function escapeHtml(str) {
      return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    function money(v) {
      return Number(v || 0).toLocaleString("es-ES", {
        style: "currency",
        currency: "EUR",
      });
    }
  
    function imgUrl(path) {
      if (!path) return "";
      if (path.startsWith("http")) return path;
      return API + path;
    }
  
    // =======================
    // Crear producto
    // =======================
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.textContent = "Subiendo producto…";
  
      const formData = new FormData(form);
  
      try {
        const r = await fetch(`${API}/api/productos`, {
          method: "POST",
          headers: authHeaders(),
          body: formData,
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error creando producto");
  
        msg.textContent = "Producto creado correctamente.";
        form.reset();
        const stockInput = form.querySelector('input[name="stock"]');
        if (stockInput) stockInput.value = "0";
  
        loadProductos();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  
    // =======================
    // Eliminar producto (soft delete)
    // =======================
    async function deleteProducto(id) {
      if (!confirm("¿Eliminar este producto? (Se ocultará en la web)")) return;
  
      try {
        const r = await fetch(`${API}/api/productos/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error eliminando");
  
        loadProductos();
      } catch (e) {
        alert(e.message);
      }
    }
  
    // =======================
    // Actualizar stock
    // =======================
    async function updateStock(id, newStock) {
      try {
        const r = await fetch(`${API}/api/productos/${id}/stock`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ stock: Number(newStock) }),
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error actualizando stock");
  
        loadProductos();
      } catch (e) {
        alert(e.message);
      }
    }
  
    // =======================
    // Cargar productos (admin)
    // =======================
    async function loadProductos() {
      grid.innerHTML = `<div class="card skeleton-card">Cargando…</div>`;
  
      try {
        const r = await fetch(`${API}/api/admin/productos`, {
          headers: authHeaders(),
        });
        const productos = await r.json();
  
        if (!r.ok)
          throw new Error(productos?.error || "Error cargando productos");
  
        if (!productos.length) {
          grid.innerHTML = `<div class="card empty-card">No hay productos</div>`;
          return;
        }
  
        grid.innerHTML = productos
          .map((p) => {
            const img = p.imagen_url ? imgUrl(p.imagen_url) : "";
            const activo = p.activo !== false;
  
            return `
              <div class="product-card">
                <div class="card-media" style="${
                  img ? `background-image:url('${img}')` : ""
                }; background-size:cover; background-position:center;"></div>
                <div class="card-body">
                  <div class="card-title">${escapeHtml(p.nombre)}</div>
                  <div class="card-desc">${escapeHtml(p.descripcion || "")}</div>
    
                  <div class="card-meta">
                    <div class="price">${money(p.precio)}</div>
                    <span class="tag">${escapeHtml(p.categoria)}</span>
                  </div>
    
                  <div class="small muted" style="margin-top:8px">
                    Estado: <b>${activo ? "Activo" : "Inactivo"}</b>
                  </div>
    
                  <div class="small muted" style="margin-top:6px">
                    Stock:
                    <input type="number" min="0" step="1" value="${Number(
                      p.stock ?? 0
                    )}"
                      class="form-control form-control-sm d-inline-block" style="width:110px"
                      data-stock="${p.id}" />
                    <button class="btn btn-sm" type="button" data-save-stock="${
                      p.id
                    }">Guardar</button>
                  </div>
    
                  <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap">
                    <button class="btn" type="button" data-del="${
                      p.id
                    }">Eliminar</button>
                  </div>
                </div>
              </div>`;
          })
          .join("");
  
        grid.querySelectorAll("[data-del]").forEach((btn) => {
          btn.addEventListener("click", () =>
            deleteProducto(btn.getAttribute("data-del"))
          );
        });
  
        grid.querySelectorAll("[data-save-stock]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-save-stock");
            const input = grid.querySelector(`[data-stock="${id}"]`);
            updateStock(id, input.value);
          });
        });
      } catch (e) {
        grid.innerHTML = `<div class="card empty-card">Error cargando productos</div>`;
      }
    }
  
    // =======================
    // Pedidos (admin)
    // =======================
    function estadoBadge(estado) {
      if (estado === "pendiente")
        return `<span class="badge text-bg-warning">Pendiente</span>`;
      if (estado === "confirmado")
        return `<span class="badge text-bg-primary">Confirmado</span>`;
      if (estado === "entregado")
        return `<span class="badge text-bg-success">Entregado</span>`;
      return `<span class="badge text-bg-secondary">${escapeHtml(estado)}</span>`;
    }
  
    function fmtDate(d) {
      if (!d) return "";
      // Render devuelve ISO, Postgres devuelve fecha/ts: lo mostramos tal cual si no parsea
      try {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return String(d);
        return dt.toLocaleDateString("es-ES");
      } catch {
        return String(d);
      }
    }
  
    async function patchEstadoPedido(id, estado) {
      try {
        const r = await fetch(`${API}/api/pedidos/${id}/estado`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ estado }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error cambiando estado");
        loadPedidos();
      } catch (e) {
        alert(e.message);
      }
    }
  
    async function loadPedidos() {
      if (!pedidosGrid) return;
  
      pedidosGrid.innerHTML = `<div class="card muted small">Cargando pedidos…</div>`;
  
      try {
        const r = await fetch(`${API}/api/admin/pedidos`, {
          headers: authHeaders(),
        });
        const pedidos = await r.json();
        if (!r.ok) throw new Error(pedidos?.error || "Error cargando pedidos");
  
        if (!pedidos.length) {
          pedidosGrid.innerHTML = `<div class="card card-glass"><div class="card-body text-muted">No hay pedidos todavía.</div></div>`;
          return;
        }
  
        pedidosGrid.innerHTML = pedidos
          .map((p) => {
            const items = Array.isArray(p.items) ? p.items : [];
            const itemsHtml = items
              .map(
                (it) =>
                  `<li class="small text-muted">
                      ${escapeHtml(it.producto_nombre)} x${Number(
                    it.cantidad
                  )} — ${money(Number(it.precio_unitario) * Number(it.cantidad))}
                    </li>`
              )
              .join("");
  
            return `
              <div class="card card-glass">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <div class="fw-bold">Pedido #${p.id}</div>
                      <div class="small text-muted">
                        ${escapeHtml(p.nombre_cliente)} · ${escapeHtml(
              p.telefono
            )}
                      </div>
                      <div class="small text-muted">
                      📅 ${
                        p.fecha_recogida ? fmtDate(p.fecha_recogida) : "Sin fecha"
                      } ·
                      📍 ${
                        p.lugar_recogida
                          ? escapeHtml(p.lugar_recogida)
                          : "Sin lugar"
                      } ·
                      🕒 ${p.creado_en ? fmtDate(p.creado_en) : ""}
                      </div>
                    </div>
                    <div class="text-end">
                      ${estadoBadge(p.estado)}
                      <div class="fw-bold mt-2">${money(p.total)}</div>
                    </div>
                  </div>
    
                  ${
                    p.observaciones
                      ? `<div class="mt-2 small text-muted">📝 ${escapeHtml(
                          p.observaciones
                        )}</div>`
                      : ""
                  }
    
                  <hr class="border-white-10 my-3" />
    
                  <div class="small fw-semibold mb-1">Productos</div>
                  <ul class="mb-0 ps-3">
                    ${itemsHtml || `<li class="small text-muted">Sin líneas</li>`}
                  </ul>
    
                  <div class="d-flex flex-wrap gap-2 mt-3">
                    <button class="btn btn-sm btn-warning"
                          onclick="cambiarEstadoPedido(<?= id ?>, 'confirmado')">
                  Confirmar
                  </button>
  
                  <button class="btn btn-sm btn-success"
                          onclick="cambiarEstadoPedido(<?= id ?>, 'entregado')">
                  Entregado
                  </button>
  
                  </div>
                </div>
              </div>`;
          })
          .join("");
  
        grid.querySelectorAll("[data-confirm]").forEach((btn) => {
          btn.onclick = () =>
            cambiarEstadoPedido(btn.dataset.confirm, "confirmado");
        });
  
        grid.querySelectorAll("[data-entregar]").forEach((btn) => {
          btn.onclick = () =>
            cambiarEstadoPedido(btn.dataset.entregar, "entregado");
        });
      } catch (e) {
        pedidosGrid.innerHTML = `<div class="card card-glass"><div class="card-body text-danger">Error cargando pedidos.</div></div>`;
      }
    }
    async function cambiarEstadoPedido(id, estado) {
      try {
        const r = await fetch(`${API}/api/pedidos/${id}/estado`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ estado }),
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error actualizando pedido");
  
        cargarPedidos(); // recargar lista tras cambiar estado
      } catch (e) {
        alert(e.message);
      }
    }
  
    // Init
    loadProductos();
    loadPedidos();
  })();
  