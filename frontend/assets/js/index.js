(() => {
  const API = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");

  const productosGrid = document.getElementById("productosGrid");
  const ofertasGrid = document.getElementById("ofertasGrid");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const apiUrl = document.getElementById("apiUrl");

  if (apiUrl) apiUrl.textContent = API;

  let productos = [];

  // =====================
  // Utils
  // =====================
  function money(v) {
    return Number(v || 0).toLocaleString("es-ES", {
      style: "currency",
      currency: "EUR",
    });
  }

  function imgUrl(path) {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return API + path;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =====================
  // Render productos
  // =====================
  function renderProductos(list) {
    if (!list.length) {
      productosGrid.innerHTML = `
        <div class="col-12">
          <div class="card card-glass">
            <div class="card-body text-muted">No hay productos disponibles.</div>
          </div>
        </div>`;
      return;
    }

    productosGrid.innerHTML = list
      .map((p) => {
        const img = imgUrl(p.imagen_url);
        const stock = Number(p.stock ?? 0);

        return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="card card-glass h-100">
            ${
              img
                ? `<div class="ratio ratio-4x3 rounded-top overflow-hidden">
                     <img src="${img}" class="w-100 h-100 object-fit-cover" alt="${escapeHtml(
                    p.nombre
                  )}">
                   </div>`
                : `<div class="ratio ratio-4x3 d-flex align-items-center justify-content-center text-muted">
                     Sin imagen
                   </div>`
            }

            <div class="card-body d-flex flex-column">
              <h5 class="fw-bold mb-1">${escapeHtml(p.nombre)}</h5>
              <p class="text-muted small flex-grow-1">
                ${escapeHtml(p.descripcion || "")}
              </p>

              <div class="d-flex justify-content-between align-items-center mt-2">
                <div class="fw-bold">${money(p.precio)}</div>
                <span class="badge bg-light text-dark">${escapeHtml(p.categoria)}</span>
              </div>

              <div class="small mt-2 ${
                stock > 0 ? "text-muted" : "text-danger fw-semibold"
              }">
                ${stock > 0 ? `Stock: ${stock}` : "Sin stock"}
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function applyFilters() {
    let list = [...productos];

    const q = (searchInput?.value || "").toLowerCase();
    if (q) {
      list = list.filter((p) =>
        `${p.nombre} ${p.descripcion} ${p.categoria}`.toLowerCase().includes(q)
      );
    }

    const sort = sortSelect?.value;
    if (sort === "priceAsc") list.sort((a, b) => a.precio - b.precio);
    if (sort === "priceDesc") list.sort((a, b) => b.precio - a.precio);
    if (sort === "nameAsc")
      list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    renderProductos(list);
  }

  // =====================
  // Load productos
  // =====================
  async function loadProductos() {
    productosGrid.innerHTML = `
      <div class="col-12">
        <div class="card card-glass">
          <div class="card-body text-muted">Cargando productos…</div>
        </div>
      </div>`;

    try {
      const r = await fetch(`${API}/api/productos`);
      if (!r.ok) throw new Error();
      productos = await r.json();
      applyFilters();
    } catch {
      productosGrid.innerHTML = `
        <div class="col-12">
          <div class="card card-glass">
            <div class="card-body text-danger">Error cargando productos.</div>
          </div>
        </div>`;
    }
  }

  // =====================
  // Load ofertas (simple)
  // =====================
  async function loadOfertas() {
    try {
      const r = await fetch(`${API}/api/ofertas`);
      if (!r.ok) throw new Error();
      const ofertas = await r.json();

      if (!ofertas.length) {
        ofertasGrid.innerHTML = `
          <div class="col-12">
            <div class="card card-glass">
              <div class="card-body text-muted">No hay ofertas activas.</div>
            </div>
          </div>`;
        return;
      }

      ofertasGrid.innerHTML = ofertas
        .map(
          (o) => `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="card card-glass h-100">
            <div class="card-body">
              <h5 class="fw-bold">${escapeHtml(o.titulo)}</h5>
              <p class="text-muted small">${escapeHtml(o.descripcion || "")}</p>
              <span class="badge bg-danger">
                ${o.descuento_pct ? `-${o.descuento_pct}%` : "Oferta"}
              </span>
            </div>
          </div>
        </div>`
        )
        .join("");
    } catch {
      ofertasGrid.innerHTML = `
        <div class="col-12">
          <div class="card card-glass">
            <div class="card-body text-danger">Error cargando ofertas.</div>
          </div>
        </div>`;
    }
  }

  // =====================
  // Events
  // =====================
  searchInput?.addEventListener("input", applyFilters);
  sortSelect?.addEventListener("change", applyFilters);

  // Init
  loadProductos();
  loadOfertas();
})();
