(() => {
  const API = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");

  const $productosGrid = document.getElementById("productosGrid");
  const $ofertasGrid = document.getElementById("ofertasGrid");
  const $searchInput = document.getElementById("searchInput");
  const $sortSelect = document.getElementById("sortSelect");
  const $apiUrl = document.getElementById("apiUrl");

  if ($apiUrl) $apiUrl.textContent = API || "(no configurada)";

  let productos = [];

  function money(v) {
    const n = Number(v || 0);
    return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  }

  function absImgUrl(imagen_url) {
    if (!imagen_url) return null;
    // Si ya es absoluta
    if (imagen_url.startsWith("http://") || imagen_url.startsWith("https://")) return imagen_url;
    // Ruta relativa tipo /uploads/productos/xxx.jpg
    return API + imagen_url;
  }

  function renderProductoCard(p) {
    const img = absImgUrl(p.imagen_url);
    const stock = Number(p.stock ?? 0);

    // Card estilo tienda (tipo zip) + compatible con tu CSS actual (.product-card/.card-media/.card-body...)
    return `
      <article class="product-card">
        <div class="card-media" style="${
          img
            ? `background-image:url('${img}'); background-size:cover; background-position:center;`
            : ""
        }">
          ${!img ? `<div style="height:100%;display:grid;place-items:center;color:rgba(47,38,34,.65);font-weight:800;">Sin imagen</div>` : ""}
        </div>

        <div class="card-body">
          <div class="card-title">${escapeHtml(p.nombre)}</div>
          <div class="card-desc">${escapeHtml(p.descripcion || "")}</div>

          <div class="card-meta">
            <div class="price">${money(p.precio)}</div>
            <span class="tag">${escapeHtml(p.categoria || "producto")}</span>
          </div>

          <div style="margin-top:10px; font-weight:800; font-size:12px; color: ${stock > 0 ? "rgba(47,38,34,.85)" : "rgba(160,0,0,.85)"};">
            ${stock > 0 ? `Stock: ${stock}` : "Sin stock"}
          </div>
        </div>
      </article>
    `;
  }

  // Para evitar inyección si alguien mete HTML en nombre/desc
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function applyFiltersAndRender() {
    const q = ($searchInput?.value || "").trim().toLowerCase();
    const sort = $sortSelect?.value || "default";

    let list = [...productos];

    if (q) {
      list = list.filter((p) => {
        const hay =
          `${p.nombre || ""} ${p.descripcion || ""} ${p.categoria || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (sort === "priceAsc") list.sort((a, b) => Number(a.precio) - Number(b.precio));
    if (sort === "priceDesc") list.sort((a, b) => Number(b.precio) - Number(a.precio));
    if (sort === "nameAsc") list.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

    if (!$productosGrid) return;

    if (!list.length) {
      $productosGrid.innerHTML = `<div class="card empty-card">No hay productos para mostrar.</div>`;
      return;
    }

    $productosGrid.innerHTML = list.map(renderProductoCard).join("");
  }

  async function loadProductos() {
    try {
      if (!$productosGrid) return;
      $productosGrid.innerHTML = `<div class="card skeleton-card">Cargando productos…</div>`;

      const r = await fetch(`${API}/api/productos`);
      if (!r.ok) throw new Error("No se pudieron cargar los productos");
      productos = await r.json();

      applyFiltersAndRender();
    } catch (e) {
      console.error(e);
      if ($productosGrid) {
        $productosGrid.innerHTML = `<div class="card empty-card">No se pudieron cargar los productos.</div>`;
      }
    }
  }

  async function loadOfertas() {
    try {
      if (!$ofertasGrid) return;
      $ofertasGrid.innerHTML = `<div class="card skeleton-card">Cargando ofertas…</div>`;

      const r = await fetch(`${API}/api/ofertas`);
      if (!r.ok) throw new Error("No se pudieron cargar las ofertas");
      const ofertas = await r.json();

      if (!ofertas.length) {
        $ofertasGrid.innerHTML = `<div class="card empty-card">No hay ofertas activas ahora mismo.</div>`;
        return;
      }

      // Oferta simple, luego la dejamos bonita si quieres
      $ofertasGrid.innerHTML = ofertas
        .map(
          (o) => `
          <article class="offer-card">
            <div class="card-body">
              <div class="card-title">${escapeHtml(o.titulo)}</div>
              <div class="card-desc">${escapeHtml(o.descripcion || "")}</div>
              <div class="card-meta">
                <div class="price">${o.descuento_pct ? `-${o.descuento_pct}%` : "Oferta"}</div>
                <span class="tag">Navidad</span>
              </div>
            </div>
          </article>
        `
        )
        .join("");
    } catch (e) {
      console.error(e);
      if ($ofertasGrid) {
        $ofertasGrid.innerHTML = `<div class="card empty-card">No se pudieron cargar las ofertas.</div>`;
      }
    }
  }

  // Eventos UI
  $searchInput?.addEventListener("input", applyFiltersAndRender);
  $sortSelect?.addEventListener("change", applyFiltersAndRender);

  // Init
  loadProductos();
  loadOfertas();
})();
