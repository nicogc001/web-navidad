(() => {
  const API = window.APP_CONFIG?.API_BASE_URL;
  const productosGrid = document.getElementById("productosGrid");
  const ofertasGrid = document.getElementById("ofertasGrid");
  const apiUrlSpan = document.getElementById("apiUrl");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const whatsBtn = document.getElementById("whatsBtn");

  if (apiUrlSpan) apiUrlSpan.textContent = API || "(sin configurar)";

  // WhatsApp (pon aquí tu número si quieres)
  const WHATS_NUMBER = ""; // ej: "34600111222"
  function buildWhatsLink() {
    const text = encodeURIComponent("Hola! Quiero encargar un roscón/dulces. Fecha de recogida: _____. Nombre: _____. Tel: _____.");
    if (!WHATS_NUMBER) return `https://wa.me/?text=${text}`;
    return `https://wa.me/${WHATS_NUMBER}?text=${text}`;
  }
  if (whatsBtn) whatsBtn.href = buildWhatsLink();

  let productos = [];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function renderProductos(list) {
    if (!productosGrid) return;

    if (!list.length) {
      productosGrid.innerHTML = `<div class="card empty-card">No hay productos disponibles</div>`;
      return;
    }

    productosGrid.innerHTML = list.map(p => {
      const img = p.imagen_url ? `${API}${p.imagen_url}` : "";
      const stockTxt = (p.stock ?? 0) > 0 ? `Stock: ${p.stock}` : `Sin stock`;

      return `
        <div class="product-card">
          <div class="card-media" style="${img ? `background-image:url('${img}')` : ""}"></div>
          <div class="card-body">
            <div class="card-title">${esc(p.nombre)}</div>
            <div class="card-desc">${esc(p.descripcion || "")}</div>
            <div class="card-meta">
              <div class="price">${Number(p.precio).toFixed(2)} €</div>
              <span class="tag">${esc(p.categoria)}</span>
            </div>
            <div class="small muted" style="margin-top:8px">${esc(stockTxt)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function applyFilters() {
    let list = [...productos];

    const q = (searchInput?.value || "").trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        String(p.nombre || "").toLowerCase().includes(q) ||
        String(p.descripcion || "").toLowerCase().includes(q) ||
        String(p.categoria || "").toLowerCase().includes(q)
      );
    }

    const sort = sortSelect?.value || "default";
    if (sort === "priceAsc") list.sort((a,b)=>Number(a.precio)-Number(b.precio));
    if (sort === "priceDesc") list.sort((a,b)=>Number(b.precio)-Number(a.precio));
    if (sort === "nameAsc") list.sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));

    renderProductos(list);
  }

  async function loadProductos() {
    if (!productosGrid) return;
    productosGrid.innerHTML = `<div class="card skeleton-card">Cargando productos…</div>`;

    try {
      const r = await fetch(`${API}/api/productos`);
      const data = await r.json();
      productos = Array.isArray(data) ? data : [];
      applyFilters();
    } catch (e) {
      productosGrid.innerHTML = `<div class="card empty-card">Error cargando productos</div>`;
    }
  }

  async function loadOfertas() {
    if (!ofertasGrid) return;
    ofertasGrid.innerHTML = `<div class="card skeleton-card">Cargando ofertas…</div>`;

    try {
      const r = await fetch(`${API}/api/ofertas`);
      const data = await r.json();
      const ofertas = Array.isArray(data) ? data : [];

      if (!ofertas.length) {
        ofertasGrid.innerHTML = `<div class="card empty-card">No hay ofertas activas</div>`;
        return;
      }

      ofertasGrid.innerHTML = ofertas.map(o => `
        <div class="offer-card">
          <div class="card-body">
            <div class="card-title">${esc(o.titulo)}</div>
            <div class="card-desc">${esc(o.descripcion || "")}</div>
            <div class="card-meta">
              <div class="price">${o.descuento_pct ? `-${Number(o.descuento_pct).toFixed(0)}%` : "Oferta"}</div>
              <span class="tag">Navidad</span>
            </div>
          </div>
        </div>
      `).join("");

    } catch (e) {
      ofertasGrid.innerHTML = `<div class="card empty-card">Error cargando ofertas</div>`;
    }
  }

  // listeners
  searchInput?.addEventListener("input", applyFilters);
  sortSelect?.addEventListener("change", applyFilters);

  // init
  loadProductos();
  loadOfertas();
})();
