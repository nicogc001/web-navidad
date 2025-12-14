(() => {
    const API = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
    const token = localStorage.getItem("token");
  
    if (!token) {
      window.location.href = "./login.html";
      return;
    }
  
    const form = document.getElementById("productoForm");
    const msg = document.getElementById("productoMsg");
    const productosGrid = document.getElementById("productosAdminGrid");
    const pedidosList = document.getElementById("pedidosAdminList");
    const logoutBtn = document.getElementById("logoutBtn");
  
    logoutBtn?.addEventListener("click", () => {
      localStorage.removeItem("token");
      window.location.href = "./index.html";
    });
  
    // =========================
    // Helpers
    // =========================
    function money(v) {
      return Number(v || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
    }
  
    function escapeHtml(str) {
      return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    function authHeaders(extra = {}) {
      return {
        Authorization: `Bearer ${token}`,
        ...extra,
      };
    }
  
    // =========================
    // Crear producto
    // =========================
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.textContent = "Subiendo producto…";
  
      const formData = new FormData(form);
  
      try {
        const r = await fetch(`${API}/api/productos`, {
          method: "POST",
          headers: authHeaders(), // NO pongas Content-Type aquí (multipart)
          body: formData,
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error creando producto");
  
        msg.textContent = "Producto creado correctamente.";
        form.reset();
        const stockInput = form.querySelector('input[name="stock"]');
        if (stockInput) stockInput.value = "0";
  
        await cargarProductos();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  
    // =========================
    // Productos: listar / stock / eliminar (soft delete)
    // =========================
    async function cargarProductos() {
      if (!productosGrid) return;
  
      productosGrid.innerHTML = `
        <div class="col-12">
          <div class="card card-glass"><div class="card-body text-muted">Cargando productos…</div></div>
        </div>`;
  
      try {
        const r = await fetch(`${API}/api/admin/productos`, { headers: authHeaders() });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error cargando productos");
  
        if (!data.length) {
          productosGrid.innerHTML = `
            <div class="col-12">
              <div class="card card-glass"><div class="card-body text-muted">No hay productos.</div></div>
            </div>`;
          return;
        }
  
        productosGrid.innerHTML = data
          .map((p) => {
            const img = p.imagen_url ? `${API}${p.imagen_url}` : "";
            const stock = Number(p.stock ?? 0);
  
            return `
            <div class="col-12 col-md-6 col-lg-4">
              <div class="card card-glass h-100 overflow-hidden">
                ${
                  img
                    ? `<div class="ratio ratio-4x3">
                         <img src="${img}" class="w-100 h-100 object-fit-cover" alt="${escapeHtml(p.nombre)}">
                       </div>`
                    : `<div class="ratio ratio-4x3 d-flex align-items-center justify-content-center text-muted">
                         Sin imagen
                       </div>`
                }
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <h5 class="fw-bold mb-1">${escapeHtml(p.nombre)}</h5>
                      <div class="text-muted small">${escapeHtml(p.categoria)}</div>
                    </div>
                    <div class="fw-bold">${money(p.precio)}</div>
                  </div>
  
                  <p class="text-muted small mt-2 mb-3">${escapeHtml(p.descripcion || "")}</p>
  
                  <div class="d-flex align-items-center gap-2">
                    <input class="form-control form-control-sm"
                           type="number" min="0" step="1"
                           value="${stock}"
                           data-stock-input="${p.id}">
                    <button class="btn btn-sm btn-outline-light" data-stock-save="${p.id}">
                      Guardar stock
                    </button>
                  </div>
  
                  <div class="d-flex gap-2 mt-3">
                    <button class="btn btn-sm btn-outline-danger" data-del="${p.id}">
                      Eliminar
                    </button>
                  </div>
  
                  <div class="text-muted small mt-2">
                    Estado: <b>${p.activo ? "Activo" : "Inactivo"}</b>
                  </div>
                </div>
              </div>
            </div>`;
          })
          .join("");
  
        // Events: eliminar
        productosGrid.querySelectorAll("[data-del]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del");
            if (!confirm("¿Eliminar (desactivar) este producto?")) return;
  
            try {
              const r = await fetch(`${API}/api/productos/${id}`, {
                method: "DELETE",
                headers: authHeaders(),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error || "Error eliminando");
              await cargarProductos();
            } catch (e) {
              alert(e.message);
            }
          });
        });
  
        // Events: guardar stock
        productosGrid.querySelectorAll("[data-stock-save]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-stock-save");
            const input = productosGrid.querySelector(`[data-stock-input="${id}"]`);
            const stock = Number(input?.value);
  
            if (!Number.isFinite(stock) || stock < 0) {
              alert("Stock inválido");
              return;
            }
  
            try {
              const r = await fetch(`${API}/api/productos/${id}/stock`, {
                method: "PATCH",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ stock }),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error || "Error guardando stock");
              await cargarProductos();
            } catch (e) {
              alert(e.message);
            }
          });
        });
      } catch (e) {
        productosGrid.innerHTML = `
          <div class="col-12">
            <div class="card card-glass"><div class="card-body text-danger">Error cargando productos.</div></div>
          </div>`;
      }
    }
  
    // =========================
    // Pedidos: listar + estado
    // =========================
    async function cambiarEstadoPedido(id, estado) {
      try {
        const r = await fetch(`${API}/api/pedidos/${id}/estado`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ estado }),
        });
  
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error actualizando pedido");
  
        await cargarPedidos();
      } catch (e) {
        alert(e.message);
      }
    }
  
    function renderPedido(p) {
      const estado = p.estado || "pendiente";
      const badge =
        estado === "entregado" ? "bg-success" :
        estado === "confirmado" ? "bg-primary" :
        estado === "cancelado" ? "bg-danger" :
        "bg-warning text-dark";
  
      const fechaRec = p.fecha_recogida ? new Date(p.fecha_recogida).toLocaleDateString("es-ES") : "Sin fecha";
      const creado = p.creado_en ? new Date(p.creado_en).toLocaleDateString("es-ES") : "";
  
      const lugar = p.lugar_recogida ? p.lugar_recogida : "Sin lugar";
  
      const lineas = Array.isArray(p.lineas) ? p.lineas : [];
      const listaLineas = lineas.length
        ? `<ul class="mb-0">
            ${lineas.map(l => `<li>${escapeHtml(l.nombre)} x${l.cantidad}</li>`).join("")}
           </ul>`
        : `<div class="text-muted">Sin líneas</div>`;
  
      return `
        <div class="card card-glass mb-3">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div>
                <div class="fw-bold fs-5">Pedido #${p.id}</div>
                <div class="text-muted">${escapeHtml(p.nombre_cliente)} · ${escapeHtml(p.telefono)}</div>
                <div class="text-muted small mt-1">
                  📅 ${fechaRec} · 📍 ${escapeHtml(lugar)} · 🕒 ${creado}
                </div>
              </div>
  
              <div class="text-end">
                <span class="badge ${badge}">${escapeHtml(estado)}</span>
                <div class="fw-bold fs-5 mt-2">${money(p.total)}</div>
              </div>
            </div>
  
            <hr class="border-white-10 my-3"/>
  
            <div class="fw-semibold mb-1">Productos</div>
            ${listaLineas}
  
            ${p.observaciones ? `<div class="text-muted small mt-2"><b>Obs:</b> ${escapeHtml(p.observaciones)}</div>` : ""}
  
            <div class="d-flex flex-wrap gap-2 mt-3">
              <button class="btn btn-sm btn-outline-light" data-ped-confirm="${p.id}">Confirmar</button>
              <button class="btn btn-sm btn-outline-light" data-ped-entregar="${p.id}">Entregado</button>
              <button class="btn btn-sm btn-outline-danger" data-ped-cancel="${p.id}">Cancelar</button>
            </div>
          </div>
        </div>
      `;
    }
  
    async function cargarPedidos() {
      if (!pedidosList) return;
  
      pedidosList.innerHTML = `
        <div class="card card-glass"><div class="card-body text-muted">Cargando pedidos…</div></div>`;
  
      try {
        const r = await fetch(`${API}/api/admin/pedidos`, { headers: authHeaders() });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error cargando pedidos");
  
        if (!data.length) {
          pedidosList.innerHTML = `
            <div class="card card-glass"><div class="card-body text-muted">No hay pedidos.</div></div>`;
          return;
        }
  
        pedidosList.innerHTML = data.map(renderPedido).join("");
  
        pedidosList.querySelectorAll("[data-ped-confirm]").forEach((btn) => {
          btn.onclick = () => cambiarEstadoPedido(btn.dataset.pedConfirm, "confirmado");
        });
        pedidosList.querySelectorAll("[data-ped-entregar]").forEach((btn) => {
          btn.onclick = () => cambiarEstadoPedido(btn.dataset.pedEntregar, "entregado");
        });
        pedidosList.querySelectorAll("[data-ped-cancel]").forEach((btn) => {
          btn.onclick = () => cambiarEstadoPedido(btn.dataset.pedCancel, "cancelado");
        });
      } catch (e) {
        pedidosList.innerHTML = `
          <div class="card card-glass"><div class="card-body text-danger">Error cargando pedidos.</div></div>`;
      }
    }
  
    // =========================
    // Init
    // =========================
    cargarProductos();
    cargarPedidos();
  })();
  