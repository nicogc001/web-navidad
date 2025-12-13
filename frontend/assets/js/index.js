const API = window.APP_CONFIG?.API_BASE_URL;

const grid = document.getElementById("productosGrid");
const ofertasGrid = document.getElementById("ofertasGrid");
const apiUrlEl = document.getElementById("apiUrl");
if (apiUrlEl) apiUrlEl.textContent = API;

const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");

let productos = [];

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function formatEur(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return "";
  return `${num.toFixed(2)} €`;
}

function renderProductos(list) {
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = `<div class="card empty-card">No hay productos disponibles ahora mismo.</div>`;
    return;
  }

  grid.innerHTML = list.map(p => `
    <article class="card product-card">
      <div class="product-top">
        <div class="product-icon">🍰</div>
        <div class="pill">${formatEur(p.precio)}</div>
      </div>
      <div class="product-title">${escapeHtml(p.nombre)}</div>
      <div class="product-desc">${escapeHtml(p.descripcion || "Producto navideño artesanal.")}</div>
      <div class="product-footer">
        <span class="tag">${escapeHtml(p.categoria || "navidad")}</span>
        <button class="btn small-btn" data-action="whats" data-name="${escapeHtml(p.nombre)}">
          Reservar
        </button>
      </div>
    </article>
  `).join("");

  // Botón reservar por WhatsApp (por producto)
  grid.querySelectorAll('button[data-action="whats"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      openWhatsApp(`Hola, quiero reservar: ${name}. ¿Disponibilidad y fecha de recogida?`);
    });
  });
}

function applyFilters() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const sort = sortSelect?.value || "default";

  let list = [...productos];

  if (q) {
    list = list.filter(p =>
      (p.nombre || "").toLowerCase().includes(q) ||
      (p.descripcion || "").toLowerCase().includes(q)
    );
  }

  if (sort === "priceAsc") list.sort((a,b) => Number(a.precio) - Number(b.precio));
  if (sort === "priceDesc") list.sort((a,b) => Number(b.precio) - Number(a.precio));
  if (sort === "nameAsc") list.sort((a,b) => String(a.nombre).localeCompare(String(b.nombre)));

  renderProductos(list);
}

async function loadProductos() {
  try {
    const res = await fetch(`${API}/api/productos?categoria=navidad`);
    const data = await res.json();
    productos = Array.isArray(data) ? data : [];
    applyFilters();
  } catch {
    grid.innerHTML = `<div class="card empty-card">No se pudieron cargar los productos.</div>`;
  }
}

async function loadOfertas() {
  if (!ofertasGrid) return;

  try {
    const res = await fetch(`${API}/api/ofertas`);
    const ofertas = await res.json();

    if (!Array.isArray(ofertas) || !ofertas.length) {
      ofertasGrid.innerHTML = `<div class="card empty-card">No hay ofertas activas ahora mismo.</div>`;
      return;
    }

    ofertasGrid.innerHTML = ofertas.map(o => `
      <article class="card offer-card">
        <div class="offer-top">
          <div class="offer-icon">🎁</div>
          <div class="pill">${o.descuento_pct ? `${Number(o.descuento_pct).toFixed(0)}%` : "Oferta"}</div>
        </div>
        <div class="product-title">${escapeHtml(o.titulo)}</div>
        <div class="product-desc">${escapeHtml(o.descripcion || "Oferta de temporada.")}</div>
        <div class="product-footer">
          <span class="tag">Navidad</span>
          <button class="btn small-btn" data-offer="${escapeHtml(o.titulo)}">Solicitar</button>
        </div>
      </article>
    `).join("");

    ofertasGrid.querySelectorAll("button[data-offer]").forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-offer");
        openWhatsApp(`Hola, me interesa la oferta: ${title}. ¿Detalles y disponibilidad?`);
      });
    });
  } catch {
    ofertasGrid.innerHTML = `<div class="card empty-card">No se pudieron cargar las ofertas.</div>`;
  }
}

// WhatsApp (pon aquí vuestro número en formato internacional sin +)
const WHATS_NUMBER = "0034605978052"; // <-- CAMBIAR
function openWhatsApp(message) {
  const url = `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener");
}

// Botón generals
const whatsBtn = document.getElementById("whatsBtn");
if (whatsBtn) {
  whatsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openWhatsApp("Hola, quiero hacer un encargo de Navidad. ¿Disponibilidad y horarios de recogida?");
  });
}

searchInput?.addEventListener("input", applyFilters);
sortSelect?.addEventListener("change", applyFilters);

loadProductos();
loadOfertas();
