(() => {
  const API = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  const WA = (window.APP_CONFIG?.WHATSAPP_PHONE || "").replace(/\D/g, ""); // solo números

  const productosGrid = document.getElementById("productosGrid");
  const ofertasGrid = document.getElementById("ofertasGrid");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const apiUrl = document.getElementById("apiUrl");
  const whatsBtn = document.getElementById("whatsBtn");

  // Carrito UI
  const cartCount = document.getElementById("cartCount");
  const cartItems = document.getElementById("cartItems");
  const cartTotal = document.getElementById("cartTotal");
  const cartMsg = document.getElementById("cartMsg");
  const clearCartBtn = document.getElementById("clearCartBtn");
  const checkoutBtn = document.getElementById("checkoutBtn");

  // Modal datos pedido
  const pedidoModalEl = document.getElementById("pedidoModal");
  const pmNombre = document.getElementById("pmNombre");
  const pmTelefono = document.getElementById("pmTelefono");
  const pmFecha = document.getElementById("pmFecha");
  const pmObs = document.getElementById("pmObs");
  const pmMsg = document.getElementById("pmMsg");
  const pmConfirm = document.getElementById("pmConfirm");

  if (apiUrl) apiUrl.textContent = API;

  let productos = [];
  let toastTimeout;
  let toastEl;

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
  function ensureToastEl() {
    if (toastEl) return toastEl;
    if (typeof document === "undefined" || !document.body) return null;
    toastEl = document.createElement("div");
    toastEl.className = "toast-cart";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(msg) {
    const el = ensureToastEl();
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.classList.remove("show");
    }, 4200);
  }

  function buildWhatsappMessage({ pedidoId, lineas = [], total, fecha, nombre, telefono, observaciones }) {
    const lineasTxt = lineas
      .map((l) => `- ${l.nombre} x${l.cantidad} (${money(l.precioUnitario)})`)
      .join("\n");

    const pedidoLine = pedidoId ? ` (Pedido #${pedidoId})` : " (Pedido desde la web)";

    return (
      `Hola, quiero hacer un encargo${pedidoLine}:\n\n` +
      `${lineasTxt}\n\n` +
      `Total estimado: ${money(total)}\n` +
      `Fecha de recogida: ${fecha || "-"}\n` +
      `Nombre: ${nombre}\n` +
      `Teléfono: ${telefono}\n` +
      `Observaciones: ${observaciones?.trim() || "-"}`
    );
  }

  // =====================
  // Carrito (localStorage)
  // =====================
  const CART_KEY = "webnavidad_cart_v1";
  const CUSTOMER_KEY = "webnavidad_customer_v1";

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function readCustomer() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || {};
    } catch {
      return {};
    }
  }

  function writeCustomer(obj) {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(obj));
  }

  let cart = readCart();

  function cartQty() {
    return cart.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
  }

  function cartSum() {
    return cart.reduce((acc, it) => acc + Number(it.precio || 0) * Number(it.cantidad || 0), 0);
  }

  function updateCartBadge() {
    if (cartCount) cartCount.textContent = cartQty();
  }

  function addToCart(p) {
    const stock = Number(p.stock ?? 0);
    if (stock <= 0) {
      showToast("Sin stock, contáctanos para encargarlo");
      return;
    }

    const found = cart.find((it) => it.productoId === p.id);
    if (found) {
      // Evitar superar stock (en cliente)
      if (found.cantidad + 1 > stock) {
        showToast("Has alcanzado el stock disponible, contacta con nosotros para encargar más o ver disponibilidad.");
        return;
      }
      found.cantidad += 1;
    } else {
      cart.push({
        productoId: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        cantidad: 1,
      });
    }

    writeCart(cart);
    renderCart();
    showToast("Producto añadido al carrito");
  }

  function setQty(productoId, qty) {
    qty = Number(qty);
    const p = productos.find((x) => x.id === productoId);
    const stock = Number(p?.stock ?? 0);

    if (!Number.isInteger(qty) || qty <= 0) {
      cart = cart.filter((it) => it.productoId !== productoId);
    } else {
      if (stock > 0) qty = Math.min(qty, stock);
      const it = cart.find((x) => x.productoId === productoId);
      if (it) it.cantidad = qty;
    }

    writeCart(cart);
    renderCart();
  }

  function clearCart() {
    cart = [];
    writeCart(cart);
    renderCart();
  }

  function renderCart() {
    updateCartBadge();

    if (!cartItems || !cartTotal) return; // si aún no has metido el offcanvas, no rompe

    if (!cart.length) {
      cartItems.innerHTML = `<div class="text-muted">Tu carrito está vacío.</div>`;
      cartTotal.textContent = money(0);
      if (cartMsg) cartMsg.textContent = "";
      return;
    }

    cartItems.innerHTML = cart
      .map((it) => {
        return `
        <div class="d-flex justify-content-between align-items-center gap-2 border rounded p-2 border-white-10">
          <div class="me-auto">
            <div class="fw-semibold">${escapeHtml(it.nombre)}</div>
            <div class="text-muted small">${money(it.precio)} / ud</div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-light" data-dec="${it.productoId}">-</button>
            <input class="form-control form-control-sm text-center" style="width:64px"
              value="${it.cantidad}" data-qty="${it.productoId}" />
            <button class="btn btn-sm btn-outline-light" data-inc="${it.productoId}">+</button>
          </div>
        </div>
      `;
      })
      .join("");

    cartTotal.textContent = money(cartSum());
    if (cartMsg) cartMsg.textContent = "";

    cartItems.querySelectorAll("[data-dec]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = Number(b.getAttribute("data-dec"));
        const it = cart.find((x) => x.productoId === id);
        setQty(id, (it?.cantidad || 1) - 1);
      });
    });

    cartItems.querySelectorAll("[data-inc]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = Number(b.getAttribute("data-inc"));
        const it = cart.find((x) => x.productoId === id);
        setQty(id, (it?.cantidad || 0) + 1);
      });
    });

    cartItems.querySelectorAll("[data-qty]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = Number(inp.getAttribute("data-qty"));
        setQty(id, Number(inp.value));
      });
    });
  }

  clearCartBtn?.addEventListener("click", clearCart);

  // =====================
  // Render productos (con botón Añadir)
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
        const disabled = stock <= 0 ? "disabled" : "";

        return `
        <div class="col-6 col-md-4 col-lg-3">
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

              <div class="d-grid gap-2 mt-3">
                <button class="btn btn-primary" ${disabled} data-add="${p.id}">
                  ${stock > 0 ? "Añadir al carrito" : "No disponible"}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    // eventos "añadir"
    productosGrid.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-add"));
        const p = productos.find((x) => x.id === id);
        if (p) addToCart(p);
      });
    });

    updateCartBadge();
  }

  function applyFilters() {
    let list = [...productos];

    const q = (searchInput?.value || "").toLowerCase().trim();
    if (q) {
      list = list.filter((p) =>
        `${p.nombre} ${p.descripcion} ${p.categoria}`.toLowerCase().includes(q)
      );
    }

    const sort = sortSelect?.value;
    if (sort === "priceAsc") list.sort((a, b) => Number(a.precio) - Number(b.precio));
    if (sort === "priceDesc") list.sort((a, b) => Number(b.precio) - Number(a.precio));
    if (sort === "nameAsc") list.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

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
      renderCart(); // por si ya había carrito guardado
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
  // Checkout -> Modal -> crear pedido en BD -> WhatsApp
  // =====================
  checkoutBtn?.addEventListener("click", () => {
    if (!cart.length) {
      if (cartMsg) cartMsg.textContent = "Añade productos al carrito primero.";
      return;
    }
    if (!WA) {
      if (cartMsg) cartMsg.textContent = "Configura WHATSAPP_PHONE en config.js.";
      return;
    }
    if (!pedidoModalEl || !pmConfirm) {
      if (cartMsg) cartMsg.textContent = "Falta el modal de pedido en el HTML.";
      return;
    }

    const cust = readCustomer();
    if (pmNombre) pmNombre.value = cust.nombre || "";
    if (pmTelefono) pmTelefono.value = cust.telefono || "";
    if (pmFecha) pmFecha.value = cust.fechaRecogida || "";
    if (pmObs) pmObs.value = cust.observaciones || "";
    if (pmMsg) pmMsg.textContent = "";

    const modal = bootstrap.Modal.getOrCreateInstance(pedidoModalEl);
    modal.show();
  });

  pmConfirm?.addEventListener("click", async () => {
    if (!pmNombre || !pmTelefono) return;

    const nombreCliente = pmNombre.value.trim();
    const telefono = pmTelefono.value.trim();

    if (!nombreCliente || !telefono) {
      if (pmMsg) pmMsg.textContent = "Nombre y teléfono son obligatorios.";
      return;
    }

    // guardar datos para autocompletar luego
    writeCustomer({
      nombre: nombreCliente,
      telefono,
      fechaRecogida: pmFecha?.value || "",
      observaciones: pmObs?.value || "",
    });

    if (pmMsg) pmMsg.textContent = "Creando pedido…";

    try {
      const payload = {
        nombreCliente,
        telefono,
        fechaRecogida: pmFecha?.value || null,
        observaciones: pmObs?.value || null,
        items: cart.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })),
      };

      const r = await fetch(`${API}/api/pedidos/publico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo crear el pedido");

      const msg = buildWhatsappMessage({
        pedidoId: data.pedidoId,
        lineas: data.lineas || [],
        total: data.total,
        fecha: pmFecha?.value || "-",
        nombre: nombreCliente,
        telefono,
        observaciones: pmObs?.value || "",
      });

      clearCart();
      if (pmMsg) pmMsg.textContent = "Abriendo WhatsApp…";

      const modal = bootstrap.Modal.getOrCreateInstance(pedidoModalEl);
      modal.hide();

      abrirWhatsApp(WA, msg);
    } catch (e) {
      if (pmMsg) pmMsg.textContent = e.message || "No se pudo crear el pedido. Te atendemos por WhatsApp.";

      const fallbackMsg = buildWhatsappMessage({
        lineas: cart.map((it) => ({
          nombre: it.nombre,
          cantidad: it.cantidad,
          precioUnitario: it.precio,
        })),
        total: cartSum(),
        fecha: pmFecha?.value || "-",
        nombre: nombreCliente,
        telefono,
        observaciones: pmObs?.value || "",
      });

      abrirWhatsApp(WA, fallbackMsg);
    }
  });

  // =====================
  // Events
  // =====================
  searchInput?.addEventListener("input", applyFilters);
  sortSelect?.addEventListener("change", applyFilters);
  whatsBtn?.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!WA) return;
    abrirWhatsApp(WA, "Hola, me gustaría hacer un encargo de Navidad ✨");
  });

  // Init
  updateCartBadge();
  renderCart();
  loadProductos();
  loadOfertas();
})();

// =====================
// WhatsApp helper
// =====================
function abrirWhatsApp(numero, mensaje) {
  const phone = String(numero || "").replace(/\D/g, "");
  if (!phone) return;

  const text = encodeURIComponent(mensaje || "");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");

  // Fallback web (si no hay app o iOS bloquea)
  const webUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${text}`;

  if (!isIOS) {
    // En no-iOS suele funcionar bien wa.me
    window.location.assign(`https://wa.me/${phone}?text=${text}`);
    return;
  }

  // Intento de abrir la app
  const appUrl = `whatsapp://send?phone=${phone}&text=${text}`;

  // Intentar abrir la app en la misma pestaña
  window.location.href = appUrl;

  // Si no abre la app, caer a la web
  setTimeout(() => {
    window.location.assign(webUrl);
  }, 800);
}

