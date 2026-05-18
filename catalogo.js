
const CART_PHONE = "543812235528";

const ZONAS = {
  tucuman_capital:  { nombre: "Tucumán capital (SMT / Tafí Viejo / Yerba Buena)", zona: 1, costoBase: 2500,  freeDesde: 15000,  kmExtra: 300  },
  tucuman_interior: { nombre: "Tucumán — interior de la provincia",                zona: 2, costoBase: 10000, freeDesde: 50000,  kmExtra: null },
  noa:              { nombre: "NOA (Salta, Jujuy, Catamarca, Stgo. del Estero, La Rioja)", zona: 3, costoBase: 15000, freeDesde: 100000, kmExtra: null },
  centro:           { nombre: "Centro (Córdoba, Santa Fe, Entre Ríos)",             zona: 4, costoBase: 17000, freeDesde: null,   kmExtra: null },
  bsas:             { nombre: "Buenos Aires / AMBA",                                zona: 4, costoBase: 17000, freeDesde: null,   kmExtra: null },
  otro:             { nombre: "Otra provincia",                                     zona: 5, costoBase: 20000, freeDesde: null,   kmExtra: null },
};

const ORIGEN_LAT = -26.7287;
const ORIGEN_LNG = -65.2774;

let cart        = JSON.parse(sessionStorage.getItem("jrCart") || "[]");
let zonaActual  = null;
let costoEnvio  = 0;
let kmDetectado = null;

function saveCart() { sessionStorage.setItem("jrCart", JSON.stringify(cart)); renderCart(); }

function addToCartFromBtn(btn) {
  const { id, name, price, href, fuente } = btn.dataset;
  const precioBase = parseFloat(btn.dataset.precioBase || 0);
  const key = id + "|" + href;
  const found = cart.find(i => i.key === key);
  if (found) found.qty++;
  else cart.push({ key, id, name, price: parseFloat(price)||0, href, fuente: fuente||"", precioBase, qty:1 });
  saveCart();
  btn.textContent = "✓ Agregado";
  btn.style.background = "#16a34a";
  setTimeout(() => { btn.textContent = "+ Agregar"; btn.style.background = ""; }, 1200);
}

function changeQty(key, delta) {
  const it = cart.find(i => i.key === key);
  if (!it) return;
  it.qty = Math.max(0, it.qty + delta);
  cart = cart.filter(i => i.qty > 0);
  saveCart();
}

function removeItem(key) { cart = cart.filter(i => i.key !== key); saveCart(); }
function fmt(v) { return "$ " + Math.round(v).toLocaleString("es-AR"); }

function renderCart() {
  document.getElementById("cartCount").textContent = cart.reduce((s,i)=>s+i.qty,0);
  const itemsEl = document.getElementById("cartItems");
  if (!itemsEl) return;
  if (!cart.length) {
    itemsEl.innerHTML = '<div class="cart-empty">🛒 Carrito vacío</div>';
  } else {
    itemsEl.innerHTML = cart.map(ii => {
      const pctI      = ii.price <= 20000  ? 5
                      : ii.price <= 50000  ? 10
                      : ii.price <= 100000 ? 15
                      : ii.price <= 200000 ? 18 : 20;
      const descI     = Math.round(ii.price * pctI / 100);
      const precioDesc= ii.price - descI;
      return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${ii.name}</div>
          <div class="cart-item-unit">
            <s>${fmt(ii.price)}</s> → <span style="color:#16a34a;font-weight:700">${fmt(precioDesc)}</span> c/u
            <span style="color:#16a34a;font-size:10px">(${pctI}% off transf.)</span>
          </div>
          <div class="cart-item-subtotal">${fmt(ii.price * ii.qty)}</div>
        </div>
        <div>
          <div class="cart-qty">
            <button class="qty-btn" onclick="changeQty('${ii.key}',-1)">−</button>
            <span class="qty-num">${ii.qty}</span>
            <button class="qty-btn" onclick="changeQty('${ii.key}',+1)">+</button>
            <button class="qty-del" onclick="removeItem('${ii.key}')" title="Eliminar">✕</button>
          </div>
        </div>
      </div>`;
    }).join("");
  }
  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const { pct, descuento } = calcularDescuento(subtotal);
  const totalTransf = subtotal - descuento;
  const pctTexto    = Math.round(pct*100);

  document.getElementById("cartTotal").textContent = fmt(subtotal);

  const descEl = document.getElementById("cartDescuento");
  if (descEl) {
    if (cart.length && descuento > 0) {
      descEl.innerHTML = '<div style="font-size:11px;color:#16a34a;text-align:right;margin-top:2px">'
        + 'Con transferencia: ' + fmt(totalTransf)
        + ' <span style="color:#aaa">(' + pctTexto + '% off)</span></div>';
    } else {
      descEl.innerHTML = "";
    }
  }
}

document.getElementById("cartFab").addEventListener("click", () => {
  const p = document.getElementById("cartPanel");
  const open = p.style.display === "flex";
  p.style.display = open ? "none" : "flex";
  if (!open) renderCart();
});
document.getElementById("cartCloseBtn").addEventListener("click", () => {
  document.getElementById("cartPanel").style.display = "none";
});
document.getElementById("clearCart").addEventListener("click", () => {
  if (cart.length && confirm("¿Limpiar el carrito?")) { cart = []; saveCart(); }
});
document.getElementById("btnShareCart").addEventListener("click", () => {
  if (!cart.length) { alert("El carrito está vacío"); return; }
  const lineas = cart.map(i => `  • ${i.qty}x ${i.name}  =>  ${fmt(i.price*i.qty)}`).join("\n");
  const total  = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const msg    = [
    "*Lista de productos - JR Soluciones Informáticas*",
    "",
    lineas,
    "",
    `*Total aprox: ${fmt(total)}* (pagando con transferencia)`,
    "",
    "Ver catálogo completo:",
    "https://jr93-arg.github.io/WEB-JR-SOLUCIONES-INFORMATICAS/"
  ].join("\n");
  window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
});

document.getElementById("btnCheckout").addEventListener("click", () => {
  if (!cart.length) { alert("El carrito está vacío"); return; }
  document.getElementById("cartPanel").style.display = "none";
  abrirCheckout();
});

// ── Checkout ──
let currentStep = 1;

function tokenizar(nombre) {
  return nombre.toLowerCase()
    .replace(/[^a-z0-9áéíóúüñs]/gi,"").split(/s+/)
    .filter(w => w.length > 2);
}

function similitud(a, b) {
  const ta = new Set(tokenizar(a));
  const tb = new Set(tokenizar(b));
  const comunes = [...ta].filter(t => tb.has(t)).length;
  return comunes / Math.max(ta.size, tb.size, 1);
}

function buscarEquivalenteXimaro(nombre) {
  const indice = window.CATALOGO_INDEX || [];
  return indice
    .filter(p => p.fuente !== "DAZ Importadora")
    .map(p => ({ ...p, sim: similitud(nombre, p.name) }))
    .filter(p => p.sim >= 0.35)
    .sort((a,b) => b.sim - a.sim)
    .slice(0, 3);
}

function buscarProductosDAZ() {
  const q = document.getElementById("dazSearch").value.toLowerCase().trim();
  const indice = window.CATALOGO_INDEX || [];
  const results = indice
    .filter(p => p.fuente === "DAZ Importadora" && (!q || p.name.toLowerCase().includes(q)))
    .slice(0, 8);
  renderSugResults(results, "dazSearchResults");
}

function renderSugCard(p, contenedor) {
  const div = document.createElement("div");
  div.className = "sug-card";
  div.innerHTML = `
    ${p.imgUrl ? `<img src="${p.imgUrl}" alt="${p.name}" onerror="this.style.display='none'">` : `<div style="width:44px;height:44px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`}
    <div class="sug-card-info">
      <div class="sug-card-name">${p.name}</div>
      <div class="sug-card-precio">${fmt(p.precio)}</div>
      <div class="sug-card-tag">${p.fuente === "DAZ Importadora" ? "Mismo proveedor" : "✓ Disponible desde 1 unidad"}</div>
    </div>
    <button class="sug-add" onclick="agregarDesdeIndice('${p.id}')">+ Agregar</button>`;
  document.getElementById(contenedor).appendChild(div);
}

function renderSugResults(items, contenedor) {
  const el = document.getElementById(contenedor);
  el.innerHTML = "";
  items.forEach(p => renderSugCard(p, contenedor));
  if (!items.length) el.innerHTML = '<div style="font-size:12px;color:#aaa;text-align:center;padding:8px">Sin resultados</div>';
}

function agregarDesdeIndice(id) {
  const p = (window.CATALOGO_INDEX||[]).find(x => x.id === id);
  if (!p) return;
  const key = p.id + "|" + p.href;
  const found = cart.find(i => i.key === key);
  if (found) found.qty++;
  else cart.push({ key, id: p.id, name: p.name, price: p.precio, href: p.href, fuente: p.fuente, precioBase: p.precioBase, qty:1 });
  saveCart();
  // Reconstruir resumen del paso 1
  construirResumen();
  // Si ya llegó al mínimo, ir directo al paso 1
  const prob = calcularProblemaDAZ();
  if (!prob) {
    irAStep(1);
  } else {
    // Refrescar la advertencia con el nuevo monto faltante
    mostrarPaso0();
  }
}

function calcularProblemaDAZ() {
  const itemsDAZ = cart.filter(i => i.fuente === "DAZ Importadora");
  if (!itemsDAZ.length) return null;
  const totalBaseDAZ = itemsDAZ.reduce((s,i) => s + (parseFloat(i.precioBase||0) * i.qty), 0);
  const minimo = window.MINIMO_DAZ_BASE || 50000;
  if (totalBaseDAZ >= minimo) return null;
  const falta = minimo - totalBaseDAZ;
  return { itemsDAZ, totalBaseDAZ, falta, minimo };
}

function mostrarPaso0() {
  const prob = calcularProblemaDAZ();
  if (!prob) { irAStep(1); return; }

  // Construir advertencia
  const { itemsDAZ, totalBaseDAZ, falta } = prob;
  const warnEl = document.getElementById("dazWarningText");
  warnEl.innerHTML = `Algunos artículos de tu pedido requieren un mínimo de compra combinado.<br>
    <strong>Te faltan ${fmt(falta)} en artículos de esta línea</strong> para poder procesar el pedido.<br>
    Podés agregar más artículos o ver alternativas disponibles desde 1 unidad.`;

  // Sugerencias por producto DAZ
  const sugEl = document.getElementById("dazSugerencias");
  sugEl.innerHTML = "";
  itemsDAZ.forEach(item => {
    const equiv = buscarEquivalenteXimaro(item.name);
    if (equiv.length) {
      const sec = document.createElement("div");
      sec.innerHTML = `<div style="font-size:11px;font-weight:700;color:#555;margin:8px 0 4px;text-transform:uppercase;letter-spacing:.5px">Alternativa disponible para "${item.name}"</div>`;
      sugEl.appendChild(sec);
      equiv.forEach(p => renderSugCard(p, sugEl.id));
    }
  });

  // Buscador de productos para completar mínimo DAZ
  const buscEl = document.getElementById("dazBuscador");
  buscEl.style.display = "flex";
  // Limpiar label anterior antes de agregar uno nuevo
  const labelAnterior = buscEl.querySelector(".daz-label");
  if (labelAnterior) labelAnterior.remove();
  const label = document.createElement("div");
  label.className = "daz-label";
  label.style = "font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px";
  label.textContent = "O agregá más artículos de esta línea";
  buscEl.insertBefore(label, buscEl.firstChild);
  buscarProductosDAZ();

  // Mostrar el paso 0
  document.querySelectorAll(".checkout-section").forEach(s => s.classList.remove("visible"));
  document.getElementById("step0").classList.add("visible");
  document.querySelectorAll(".step").forEach(s => { s.classList.remove("active","done"); });
}

function abrirCheckout() {
  zonaActual = null; costoEnvio = 0; kmDetectado = null;
  currentStep = 1;
  construirResumen();
  document.getElementById("checkoutModal").classList.add("open");
  const btnGeo = document.getElementById("btnGeo");
  if (btnGeo) { btnGeo.disabled = false; btnGeo.textContent = "📍 Detectar mi ubicación automáticamente"; }
  const zonaRes = document.getElementById("zonaResult");
  if (zonaRes) zonaRes.style.display = "none";
  const selProv = document.getElementById("selProvincia");
  if (selProv) selProv.value = "";
  // Resetear comprobante y botón confirmar
  const comp = document.getElementById("inpComprobante");
  if (comp) { comp.value = ""; }
  const placeholder = document.getElementById("comprobantePlaceholder");
  const preview     = document.getElementById("comprobantePreview");
  const area        = document.getElementById("comprobanteArea");
  if (placeholder) placeholder.style.display = "block";
  if (preview)     preview.style.display     = "none";
  if (area)        area.style.borderColor    = "#e0e0e0";
  const btnEnviar = document.getElementById("btnEnviar");
  if (btnEnviar) { btnEnviar.disabled=true; btnEnviar.style.opacity=".4"; btnEnviar.style.cursor="default"; btnEnviar.textContent="Confirmar y enviar por WhatsApp"; }
  const mpPagado = document.getElementById("mpPagado");
  if (mpPagado) mpPagado.style.display = "none";

  // Verificar mínimo DAZ antes de continuar
  const prob = calcularProblemaDAZ();
  if (prob) {
    mostrarPaso0();
  } else {
    irAStep(1);
  }
}

document.getElementById("btnIgnorarDAZ").addEventListener("click", () => irAStep(1));

function cerrarCheckout() {
  document.getElementById("checkoutModal").classList.remove("open");
}

function irAStep(n) {
  currentStep = n;
  document.querySelectorAll(".checkout-section").forEach(s => s.classList.remove("visible"));
  const sec = document.getElementById("step" + n);
  if (sec) sec.classList.add("visible");
  document.querySelectorAll(".step").forEach((s, i) => {
    s.classList.toggle("active", i+1 === n);
    s.classList.toggle("done",   i+1 < n);
  });
  if (n === 3) actualizarPaso3();
  if (n === 4) actualizarPaso4();
}

function construirResumen() {
  const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById("orderLines").innerHTML = cart.map(i =>
    `<div class="order-line"><span>${i.qty}x ${i.name}</span><span>${fmt(i.price*i.qty)}</span></div>`
  ).join("");
  document.getElementById("orderTotalAmt").textContent = fmt(total);
}

const tipoEnvioEl = () => document.querySelector(".toggle-btn.selected")?.dataset.tipo || "envio";

document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

function validarDatos() {
  let ok = true;
  ["inpNombre","inpDNI","inpTelefono"].forEach(id => {
    const el = document.getElementById(id);
    const err = document.getElementById(id+"Err");
    if (!el.value.trim()) { el.classList.add("error"); if(err) err.classList.add("visible"); ok=false; }
    else { el.classList.remove("error"); if(err) err.classList.remove("visible"); }
  });
  return ok;
}

document.getElementById("btnPaso2a3").addEventListener("click", () => {
  if (validarDatos()) irAStep(3);
});

// ── Paso 3: Envío y zona ──
function calcularCostoEnvio(claveZona) {
  const zona = ZONAS[claveZona];
  if (!zona) return 0;
  const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
  if (zona.freeDesde && total >= zona.freeDesde) return 0;
  if (zona.zona === 1 && kmDetectado !== null) {
    return zona.costoBase + Math.round(kmDetectado * zona.kmExtra);
  }
  return zona.costoBase;
}

function mostrarZona(claveZona) {
  zonaActual = claveZona;
  costoEnvio = calcularCostoEnvio(claveZona);
  const zona  = ZONAS[claveZona];
  const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const gratis = zona.freeDesde && total >= zona.freeDesde;
  const distTexto = kmDetectado ? ` · ${Math.round(kmDetectado)} km` : "";
  let minimoTxt = "";
  if (!gratis && zona.freeDesde) {
    const falta = zona.freeDesde - total;
    minimoTxt = `<div style="font-size:11px;color:#888;margin-top:4px">Agregá ${fmt(falta)} más para envío gratis</div>`;
  }
  const zonaRes = document.getElementById("zonaResult");
  zonaRes.style.display = "block";
  zonaRes.innerHTML = `
    <div class="zona-detected">
      <div class="zona-icon">📍</div>
      <div class="zona-info">
        <div class="zona-nombre">${zona.nombre}${distTexto}</div>
        <div class="zona-costo">Envío: ${gratis ? "Gratis ✓" : fmt(costoEnvio)}</div>
        ${minimoTxt}
      </div>
      <button class="zona-reset" onclick="resetZona()" title="Cambiar">✕</button>
    </div>`;
}

function resetZona() {
  zonaActual=null; costoEnvio=0; kmDetectado=null;
  document.getElementById("zonaResult").style.display="none";
  document.getElementById("selProvincia").value="";
  const btn=document.getElementById("btnGeo");
  btn.disabled=false; btn.textContent="📍 Detectar mi ubicación automáticamente";
}

function onProvinciaChange() {
  const val = document.getElementById("selProvincia").value;
  if (val) mostrarZona(val);
}

function detectarUbicacion() {
  const btn = document.getElementById("btnGeo");
  if (!navigator.geolocation) return;
  btn.disabled=true; btn.textContent="📍 Detectando...";
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    const R = 6371;
    const dLat = (lat-ORIGEN_LAT)*Math.PI/180;
    const dLng = (lng-ORIGEN_LNG)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(ORIGEN_LAT*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
    kmDetectado = R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
      const d = await r.json();
      const prov = (d.address?.state||"").toLowerCase();
      let clave = "otro";
      if (prov.includes("tucum")) clave = kmDetectado<=25?"tucuman_capital":"tucuman_interior";
      else if (["salta","jujuy","catamarca","santiago","la rioja"].some(p=>prov.includes(p))) clave="noa";
      else if (["córdoba","cordoba","santa fe","entre ríos","entre rios"].some(p=>prov.includes(p))) clave="centro";
      else if (prov.includes("buenos")) clave="bsas";
      mostrarZona(clave);
      document.getElementById("selProvincia").value=clave;
      btn.textContent="✓ Ubicación detectada";
    } catch {
      mostrarZona(kmDetectado<=25?"tucuman_capital":"tucuman_interior");
      btn.textContent="✓ Ubicación aproximada";
    }
  }, () => { btn.disabled=false; btn.textContent="📍 Detectar mi ubicación automáticamente"; }, { timeout:8000 });
}

function actualizarPaso3() {
  const esEnvio = tipoEnvioEl()==="envio";
  document.getElementById("step3Envio").style.display  = esEnvio?"flex":"none";
  document.getElementById("step3Retiro").style.display = esEnvio?"none":"block";
  document.getElementById("camposDireccion").style.display = esEnvio?"flex":"none";
}

document.getElementById("btnPaso3a4").addEventListener("click", () => {
  if (tipoEnvioEl()==="envio") {
    if (!zonaActual) { alert("Seleccioná o detectá tu zona de envío."); return; }
    if (!document.getElementById("inpDireccion").value.trim()) {
      document.getElementById("inpDireccionErr").classList.add("visible"); return;
    }
    if (!document.getElementById("inpCiudad").value.trim()) {
      document.getElementById("inpCiudadErr").classList.add("visible"); return;
    }
  } else { costoEnvio=0; }
  irAStep(4);
});

// ── Paso 4: Pago ──
function calcularDescuento(subtotal) {
  // Descuento proporcional por volumen de compra (sobre precio catalogo)
  var pct;
  if      (subtotal <= 20000)  pct = 0.05;
  else if (subtotal <= 50000)  pct = 0.10;
  else if (subtotal <= 100000) pct = 0.15;
  else if (subtotal <= 200000) pct = 0.18;
  else                         pct = 0.20;
  return { pct: pct, descuento: Math.round(subtotal * pct) };
}

function actualizarPaso4() {
  const subtotal    = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const { pct, descuento } = calcularDescuento(subtotal);
  const pctTexto    = Math.round(pct*100);
  const totalTransf = subtotal - descuento + costoEnvio;
  const totalMP     = subtotal + costoEnvio;
  const esGratis    = costoEnvio===0 && tipoEnvioEl()==="envio" && zonaActual;
  const envioTxt    = tipoEnvioEl()==="retiro" ? "Retiro en local — Gratis"
    : esGratis ? "Envio — Gratis ✓" : fmt(costoEnvio);

  const lineasDetalle = cart.map(i => {
    const pctI   = i.price <= 20000  ? 5 : i.price <= 50000  ? 10
                 : i.price <= 100000 ? 15 : i.price <= 200000 ? 18 : 20;
    const descI  = Math.round(i.price * pctI / 100);
    const precI  = i.price - descI;
    return '<div class="resumen-linea" style="font-size:12px">' +
      '<span>' + i.qty + 'x ' + i.name + '</span>' +
      '<span style="text-align:right"><s style="color:#bbb">' + fmt(i.price*i.qty) + '</s><br>' +
      '<span style="color:#16a34a">' + fmt(precI*i.qty) + ' (' + pctI + '% off)</span></span></div>';
  }).join("");

  document.getElementById("resumenFinal").innerHTML =
    lineasDetalle +
    '<div style="height:1px;background:#e0e0e0;margin:6px 0"></div>' +
    '<div class="resumen-linea"><span>Subtotal lista</span><span>' + fmt(subtotal) + '</span></div>' +
    '<div class="resumen-linea descuento"><span>Descuento transferencia (' + pctTexto + '%)</span><span style="color:#16a34a">-' + fmt(descuento) + '</span></div>' +
    '<div class="resumen-linea envio"><span>Envio</span><span>' + envioTxt + '</span></div>';

  // Transferencia: precio catálogo - descuento proporcional
  document.getElementById("precioTransferencia").textContent = fmt(totalTransf);
  document.getElementById("ahorroTransferencia").textContent =
    "✓ Ahorras " + fmt(descuento) + " (" + pctTexto + "% off por transferencia)";
  document.getElementById("pagoMonto").textContent = fmt(totalTransf);

  // MP: precio catálogo sin descuento
  document.getElementById("precioMP").textContent  = fmt(totalMP);
  document.getElementById("recargoMP").textContent = "";
  document.getElementById("montoBtnMP").textContent = fmt(totalMP);
}
document.querySelectorAll(".pago-opcion").forEach(op => {
  op.addEventListener("click", () => {
    document.querySelectorAll(".pago-opcion").forEach(o=>o.classList.remove("selected"));
    op.classList.add("selected");
    op.querySelector("input[type=radio]").checked=true;
    const esMP = op.querySelector("input").value==="mp";
    document.getElementById("detalleTransferencia").style.display = esMP?"none":"block";
    document.getElementById("detalleMP").style.display            = esMP?"block":"none";
    // Resetear estado del botón al cambiar método
    const btn = document.getElementById("btnEnviar");
    btn.disabled = true;
    btn.style.opacity = ".4";
    btn.style.cursor  = "default";
    if (esMP) {
      btn.textContent = "✓ Ya pagué — Confirmar por WhatsApp";
    } else {
      btn.textContent = "Confirmar y enviar por WhatsApp";
      verificarComprobante();
    }
  });
});

function onComprobanteChange(input) {
  const file = input.files[0];
  if (!file) return;
  const area        = document.getElementById("comprobanteArea");
  const placeholder = document.getElementById("comprobantePlaceholder");
  const preview     = document.getElementById("comprobantePreview");
  const img         = document.getElementById("comprobanteImg");
  const nombre      = document.getElementById("comprobanteNombre");

  area.style.borderColor = "#16a34a";
  placeholder.style.display = "none";
  preview.style.display     = "block";
  nombre.textContent        = file.name;

  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; img.style.display = "block"; };
    reader.readAsDataURL(file);
  } else {
    img.style.display = "none";
    nombre.textContent = "📄 " + file.name;
  }
  // Habilitar botón
  verificarComprobante();
}

function verificarComprobante() {
  const input = document.getElementById("inpComprobante");
  const btn   = document.getElementById("btnEnviar");
  const tieneArchivo = input && input.files && input.files.length > 0;
  if (tieneArchivo) {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor  = "pointer";
  } else {
    btn.disabled = true;
    btn.style.opacity = ".4";
    btn.style.cursor  = "default";
  }
}

function habilitarConfirmacionMP() {
  // Habilitar botón 3 segundos después de tocar el link de MP
  setTimeout(() => {
    const btn = document.getElementById("btnEnviar");
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor  = "pointer";
    const mpPagado = document.getElementById("mpPagado");
    if (mpPagado) mpPagado.style.display = "block";
  }, 3000);
}

document.getElementById("btnCopyAlias").addEventListener("click", () => {
  navigator.clipboard.writeText("JR93ARG").then(() => {
    const b=document.getElementById("btnCopyAlias");
    b.textContent="✓ Copiado"; setTimeout(()=>b.textContent="Copiar",1500);
  });
});

// ── Envío final ──
document.getElementById("btnEnviar").addEventListener("click", async () => {
  const btn = document.getElementById("btnEnviar");
  btn.disabled=true; btn.textContent="Enviando...";
  try {
    const tipo   = tipoEnvioEl();
    const nombre = document.getElementById("inpNombre").value.trim();
    const dni    = document.getElementById("inpDNI").value.replace(/[.-s]/g,"").trim();
    const tel    = document.getElementById("inpTelefono").value.trim();
    const notas      = document.getElementById("inpNotas").value.trim();
    const dir    = tipo==="envio" ? document.getElementById("inpDireccion").value.trim() : "";
    const ciudad = tipo==="envio" ? document.getElementById("inpCiudad").value.trim() : "";
    const cp     = tipo==="envio" ? document.getElementById("inpCP").value.trim() : "";
    const metodo = document.querySelector('input[name="metodoPago"]:checked')?.value||"transferencia";
    const esMP   = metodo==="mp";

    const subtotal   = cart.reduce((s,i)=>s+i.price*i.qty,0);
    const { pct: pctEnv, descuento: descEnv } = calcularDescuento(subtotal);
    const pctTxt     = Math.round(pctEnv*100);
    const descuentoFinal = esMP ? 0 : descEnv;
    const totalFinal = subtotal - descuentoFinal + costoEnvio;
    const direccion  = tipo==="retiro" ? "Retiro en local"
      : [dir, ciudad, cp?"CP "+cp:"", zonaActual?ZONAS[zonaActual]?.nombre:""].filter(Boolean).join(", ");
    const fecha = new Date().toLocaleString("es-AR");

    // Limpiar caracteres especiales que se corrompen en WhatsApp
    function limpiarTexto(str) {
      return String(str || "")
        .replace(/″|ʺ/g, '"')   // pulgadas tipográficas → comilla
        .replace(/[‘’]/g, "'")  // comillas simples curvas
        .replace(/[“”]/g, '"')  // comillas dobles curvas
        .replace(/�/g, '')           // caracter de reemplazo UTF-8
        .replace(/â[^ws]/gi, '"')       // artefacto â + símbolo = pulgadas mal codificadas
        .trim();
    }

    const comprobanteInput = document.getElementById("inpComprobante");
    const tieneComprobante = comprobanteInput && comprobanteInput.files && comprobanteInput.files.length > 0;
    const nombreComprobante = tieneComprobante ? comprobanteInput.files[0].name : "";

    const lineas = cart.map(i => `  - ${i.qty}x ${limpiarTexto(i.name)}  =>  ${fmt(i.price*i.qty)}`).join("\n");
    const msg = [
      "*Nuevo pedido - JR Soluciones Informaticas*","",
      `Cliente:  ${nombre}`,`DNI:      ${dni}`,`Telefono: ${tel}`,`Entrega:  ${direccion}`,
      notas?`Notas:    ${notas}`:null,"",
      "*Productos:*", lineas,"",
      `Subtotal: ${fmt(subtotal)}`,
      costoEnvio>0?`Envio:    ${fmt(costoEnvio)}`:`Envio:    Gratis`,
      esMP?`Metodo:   Mercado Pago / Tarjeta`:`Metodo:   Transferencia bancaria`,
      `*Total: ${fmt(totalFinal)}*`,"",
      esMP
        ?"_El pago fue realizado por Mercado Pago._"
        :tieneComprobante
          ?"_Comprobante adjunto: " + nombreComprobante + " — Por favor adjuntalo en este chat._"
          :"_Por favor adjunta el comprobante de transferencia en este chat._"
    ].filter(l=>l!==null).join("\n");

    window.open("https://wa.me/"+CART_PHONE+"?text="+encodeURIComponent(msg),"_blank");

    const filas = cart.map(i=>({
      fecha, cliente:nombre, dni, telefono:tel, producto:i.name,
      proveedor:i.fuente||"Catalogo", cantidad:i.qty,
      precio_unit:i.price, subtotal:i.price*i.qty,
      total:totalFinal, direccion, notas,
      metodo_pago:esMP?"Mercado Pago":"Transferencia",
      costo_envio:costoEnvio, estado:"Pendiente verificacion"
    }));
    registrarEnSheets(filas).catch(e=>console.error("Sheets:",e));

    const confirmSub = esMP
      ? `Se abrió WhatsApp con el resumen.<br><br>Para completar el pago usá el botón de Mercado Pago del paso anterior.<br><br><strong>Total: ${fmt(totalFinal)}</strong>`
      : `Se abrió WhatsApp con el resumen.<br><br><strong>Adjuntá el comprobante en ese mismo chat.</strong><br><br><strong>Total a transferir: ${fmt(totalFinal)}</strong>`;
    document.getElementById("confirmSub").innerHTML = confirmSub;
    irAStep(5);
  } catch(err) {
    console.error("Error:",err); alert("Hubo un error. Intentá de nuevo.");
  } finally {
    btn.disabled=false; btn.textContent="Confirmar y enviar por WhatsApp";
  }
});

const API_URL   = "https://jrrailway-production.up.railway.app/pedido";
const API_TOKEN = "jrsoluciones2025";

async function registrarEnSheets(filas) {
  try {
    const res = await fetch(API_URL, {
      method:"POST",
      headers:{"Content-Type":"application/json","X-API-Token":API_TOKEN},
      body:JSON.stringify({
        cliente:filas[0].cliente, dni:filas[0].dni, telefono:filas[0].telefono,
        direccion:filas[0].direccion, notas:filas[0].notas, total:filas[0].total,
        items:filas.map(f=>({producto:f.producto,proveedor:f.proveedor,cantidad:f.cantidad,precio_unit:f.precio_unit,subtotal:f.subtotal}))
      })
    });
    const data = await res.json();
    if (!data.ok) console.error("API rechazó:",JSON.stringify(data));
    return data.ok ? data.nroPedido : false;
  } catch(e) { console.error("Error API:",e); return false; }
}

document.getElementById("btnConfirmClose").addEventListener("click", () => {
  cerrarCheckout(); cart=[]; saveCart();
});
document.getElementById("checkoutModal").addEventListener("click", e => {
  if (e.target===document.getElementById("checkoutModal")) cerrarCheckout();
});
document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => irAStep(parseInt(btn.dataset.to)));
});

renderCart();
  

const searchInput = document.getElementById("buscar")
  || document.getElementById("buscarMobile")
  || document.getElementById("buscarDesktop");

// Sincronizar los 3 inputs de búsqueda
["buscar","buscarMobile","buscarDesktop"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => {
    const q = el.value;
    ["buscar","buscarMobile","buscarDesktop"].forEach(sid => {
      const s = document.getElementById(sid);
      if (s && s !== el) s.value = q;
    });
    filtrar();
  });
});

const noResults = document.getElementById("noResults");
const allSections = Array.from(document.querySelectorAll("[data-section]"));
let catActiva     = "Todos";

function filtrar() {
  const q = getQuery();
  const secRecientes  = document.getElementById("sec-recientes");
  const secDestacados = document.getElementById("sec-destacados");
  const secNovedades  = document.querySelector(".novedades-wrap");
  const allSec = Array.from(document.querySelectorAll("[data-section]"));
  const esTodos = catActiva === "Todos" && !q;

  // Novedades y destacados solo visibles en vista principal
  if (secNovedades)  secNovedades.style.display  = esTodos ? "" : "none";
  if (secDestacados) secDestacados.style.display  = esTodos ? "" : "none";

  if (esTodos) {
    allSec.forEach(sec => {
      const cat = sec.dataset.cat || "";
      if (cat === "Todos" || cat === "Destacados") sec.style.display = "";
      else sec.style.display = "none";
    });
    noResults.style.display = "none";
    return;
  }

  if (secRecientes) secRecientes.style.display = "none";
  let visible = 0;

  allSec.forEach(sec => {
    const cat = sec.dataset.cat || "";
    if (cat === "Todos" || cat === "Destacados") { sec.style.display = "none"; return; }
    if (catActiva !== "Todos" && cat !== catActiva) { sec.style.display = "none"; return; }
    sec.style.display = "";
    const cards = sec.querySelectorAll(".card");
    let n = 0;
    cards.forEach(card => {
      const name = card.querySelector(".card-name")?.textContent.toLowerCase() || "";
      const show = !q || name.includes(q);
      card.classList.toggle("hidden", !show);
      if (show) { visible++; n++; }
    });
    if (n === 0) sec.style.display = "none";
  });

  if (q && catActiva === "Todos" && secRecientes) {
    secRecientes.style.display = "";
    const cards = secRecientes.querySelectorAll(".card");
    let n = 0;
    cards.forEach(card => {
      const name = card.querySelector(".card-name")?.textContent.toLowerCase() || "";
      const show = name.includes(q);
      card.classList.toggle("hidden", !show);
      if (show) { visible++; n++; }
    });
    if (n === 0) secRecientes.style.display = "none";
  }

  noResults.style.display = visible === 0 ? "block" : "none";
}

searchInput.addEventListener("input", filtrar);

function getQuery() {
  return (document.getElementById("buscarDesktop") || document.getElementById("buscarMobile") || document.getElementById("buscar"))?.value.toLowerCase().trim() || "";
}

// Dropdown de categorías
function toggleCatMenu() {
  const btn  = document.getElementById("catDropdownBtn");
  const menu = document.getElementById("catDropdownMenu");
  btn.classList.toggle("open");
  menu.classList.toggle("open");
}

function seleccionarCat(cat, el) {
  catActiva = cat;
  // Marcar activo
  document.querySelectorAll(".cat-dropdown-item").forEach(i => i.classList.remove("active"));
  if (el) el.classList.add("active");
  // Cerrar menú
  document.getElementById("catDropdownBtn").classList.remove("open");
  document.getElementById("catDropdownMenu").classList.remove("open");
  // Limpiar búsqueda
  ["buscar","buscarMobile","buscarDesktop"].forEach(id => {
    const s = document.getElementById(id); if (s) s.value = "";
  });
  filtrar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Cerrar dropdown al clickear afuera
document.addEventListener("click", e => {
  const dd = document.getElementById("catDropdown");
  if (dd && !dd.contains(e.target)) {
    document.getElementById("catDropdownBtn")?.classList.remove("open");
    document.getElementById("catDropdownMenu")?.classList.remove("open");
  }
});

// Botón volver arriba
const btnTop = document.getElementById("btnTop");
window.addEventListener("scroll", () => {
  btnTop.classList.toggle("visible", window.scrollY > 400);
});
btnTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// Más vistos
const MV_KEY     = "jrMasVistos";
const MV_MOSTRAR = 8;
const API_MV     = "https://jrrailway-production.up.railway.app";

function getMasVistos() {
  try { return JSON.parse(sessionStorage.getItem(MV_KEY)||"{}"); } catch { return {}; }
}

function registrarVista(id, nombre, precio, imagen) {
  const mv = getMasVistos();
  mv[id] = (mv[id]||0) + 1;
  sessionStorage.setItem(MV_KEY, JSON.stringify(mv));
  fetch(API_MV + "/vista", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Token": "jrsoluciones2025" },
    body: JSON.stringify({ id, nombre: nombre||"", precio: precio||"", imagen: imagen||"" })
  }).catch(() => {});
  renderMasVistos();
  if (typeof renderDestacados === "function") renderDestacados();
}

function fmtMV(v) { return "$ " + Math.round(v).toLocaleString("es-AR"); }

function renderMasVistos() { /* removida */ }

fetch(API_MV + "/vistas-top", {
  headers: { "X-API-Token": "jrsoluciones2025" }
}).then(r=>r.json()).then(data => {
  if (data.ok && data.vistas) {
    const mv = getMasVistos();
    data.vistas.forEach(function(v) { mv[v.id] = Math.max(mv[v.id]||0, v.count); });
    sessionStorage.setItem(MV_KEY, JSON.stringify(mv));
    renderMasVistos();
    renderDestacados(); // actualizar destacados con datos reales
  }
}).catch(() => renderMasVistos());

// Modal de producto
function abrirProductoCard(el) {
  var b64 = el.dataset.prod;
  if (!b64) return;
  try {
    var dataStr = atob(b64);
    abrirProducto(dataStr);
  } catch(e) { console.error("Error abriendo producto:", e); }
}

function abrirProducto(dataStr) {
  var p;
  try { p = JSON.parse(dataStr); } catch(e) { return; }

  const precioConDesc = p.precioConDesc || Math.round((p.precioCatalogo||0)*0.95);
  const precioTexto   = fmtMV(precioConDesc);

  // Registrar vista con datos del producto para el preview de WhatsApp
  registrarVista(p.id, p.name, precioTexto, p.imgUrl||"");

  document.getElementById("prodNombre").textContent       = p.name;
  document.getElementById("prodPrecioTransf").textContent = precioTexto;
  document.getElementById("prodPrecioMP").innerHTML       =
    'Con tarjeta/MP: <s>' + fmtMV(p.precioCatalogo) + '</s>' +
    ' <span style="font-size:11px;color:#aaa">· precio de lista</span>';

  // Mostrar ahorro claro
  var ahorroEl = document.getElementById("prodAhorro");
  if (ahorroEl && p.precioCatalogo && p.precioConDesc) {
    var ahorro = p.precioCatalogo - p.precioConDesc;
    ahorroEl.innerHTML =
      '<span style="background:#dcfce7;color:#16a34a;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700">' +
      'Ahorrás ' + fmtMV(ahorro) + ' (' + (p.pctIndTexto||5) + '% off) pagando con transferencia' +
      '</span>';
  }

  // Info de descuento por volumen
  const descInfoEl = document.getElementById("prodDescInfo");
  if (descInfoEl) {
    const pc = p.precioCatalogo || 0;
    const pctInd = p.pctIndTexto || 5;
    descInfoEl.innerHTML = pc > 0
      ? '<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:8px 12px;font-size:11px;color:#555;margin-top:4px">'
        + '<strong style="color:#f59e0b">💡 Este artículo tiene ' + pctInd + '% off pagando con transferencia</strong><br>'
        + 'Mientras más artículos sumes, mayor descuento en el total:<br>'
        + '&nbsp;&nbsp;• Hasta $20k → 5% · $20k–$50k → 10% · $50k–$100k → 15%<br>'
        + '&nbsp;&nbsp;• $100k–$200k → 18% · +$200k → <strong>20% off</strong><br>'
        + '<em>El descuento final se calcula sobre el total del carrito.</em>'
        + '</div>'
      : '';
  }
  document.getElementById("prodDesc").innerHTML = '<div class="prod-desc-loading">Generando descripción...</div>';
  // Usar descripción pre-generada si existe, sino generar con IA
  if (p.descripcion) {
    document.getElementById("prodDesc").textContent = p.descripcion;
  } else {
    fetchDescripcion(p.href, p.fuente, p.name);
  }

  var wrap = document.getElementById("prodImgWrap");
  wrap.innerHTML = '<button class="prod-close" onclick="cerrarProducto()">×</button>';
  if (p.imgUrl) {
    var img = document.createElement("img");
    img.src = p.imgUrl; img.alt = p.name; img.referrerPolicy = "no-referrer";
    img.onerror = function() { img.style.display="none"; };
    wrap.appendChild(img);
  } else {
    var ph = document.createElement("div");
    ph.className = "prod-img-placeholder"; ph.textContent = "📦";
    wrap.appendChild(ph);
  }

  var btnAgregar = document.getElementById("prodBtnAgregar");
  btnAgregar.textContent = "+ Agregar al carrito";
  btnAgregar.style.background = "";
  btnAgregar.onclick = function() {
    var key = p.id+"|"+p.href;
    var found = cart.find(function(i){return i.key===key;});
    if (found) found.qty++;
    else cart.push({key:key,id:p.id,name:p.name,price:p.precioCatalogo,href:p.href,fuente:p.fuente,precioBase:p.precioBase,qty:1});
    saveCart();
    btnAgregar.textContent="✓ Agregado"; btnAgregar.style.background="#16a34a";
    setTimeout(function(){btnAgregar.textContent="+ Agregar al carrito";btnAgregar.style.background="";},1500);
  };

  var msgWA = encodeURIComponent(p.name + " - " + precioTexto + " (con transferencia) https://jr93-arg.github.io/WEB-JR-SOLUCIONES-INFORMATICAS/");
  document.getElementById("prodBtnShare").href = "https://wa.me/?text=" + msgWA;
  // Conectar simulador de crédito con este producto
  creditoPrecio    = p.precioCatalogo || 0;
  creditoNombre    = p.name || "";
  creditoAbierto   = false;
  creditoAntPct    = 35;
  creditoCuotasSel = creditoPrecio <= 200000 ? 3 : 6;
  var toggle = document.getElementById("creditoToggle");
  var body   = document.getElementById("creditoBody");
  var slider = document.getElementById("creditoSlider");
  if (toggle) toggle.classList.remove("open");
  if (body)   body.classList.remove("open");
  var formCred = document.getElementById("creditoForm");
  var btnSolic = document.getElementById("creditoBtnSolicitar");
  if (formCred) formCred.style.display = "none";
  if (btnSolic) btnSolic.style.display = "flex";
  // Configurar slider con monto mínimo y máximo en pesos
  if (slider && creditoPrecio) {
    var minAnticipo = Math.round(creditoPrecio * 0.35);
    var maxAnticipo = Math.round(creditoPrecio * 0.70);
    var step        = Math.round(creditoPrecio * 0.05); // pasos de 5%
    slider.min   = minAnticipo;
    slider.max   = maxAnticipo;
    slider.step  = step;
    slider.value = minAnticipo;
  }
  var antVal = document.getElementById("creditoAnticipoVal");
  if (antVal && creditoPrecio) {
    antVal.textContent = "$ " + Math.round(creditoPrecio * 0.35).toLocaleString("es-AR");
  }

  document.getElementById("prodOverlay").classList.add("open");
  fetchDescripcion(p.href, p.fuente, p.name);
}

function cerrarProducto() {
  document.getElementById("prodOverlay").classList.remove("open");
  // Restaurar botones de carrito y WA
  var prodActions = document.querySelector(".prod-actions");
  if (prodActions) prodActions.style.display = "flex";
  creditoAbierto = false;
}

async function fetchDescripcion(href, fuente, nombreProducto) {
  var descEl = document.getElementById("prodDesc");
  descEl.innerHTML = '<div class="prod-desc-loading">Generando descripcion...</div>';

  var cacheKey = "desc_" + (nombreProducto || href).replace(/[^a-z0-9]/gi, "_").slice(0, 60);
  var cached   = sessionStorage.getItem(cacheKey);
  if (cached) { descEl.textContent = cached; return; }

  try {
    var res = await fetch("https://jrrailway-production.up.railway.app/descripcion", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": "jrsoluciones2025" },
      body: JSON.stringify({ producto: nombreProducto })
    });
    var data = await res.json();
    var desc = data.descripcion || "";
    if (desc) {
      sessionStorage.setItem(cacheKey, desc);
      descEl.textContent = desc;
    } else {
      descEl.textContent = "Descripcion no disponible.";
    }
  } catch(e) {
    descEl.textContent = "";
  }
}

document.getElementById("prodOverlay").addEventListener("click", function(e) {
  if (e.target===document.getElementById("prodOverlay")) cerrarProducto();
});

renderMasVistos();

// Abrir modal si la URL tiene ?id= (viene de link compartido por WhatsApp)
(function() {
  var params  = new URLSearchParams(window.location.search);
  var idParam = params.get("id");
  if (!idParam) return;
  var idx  = window.CATALOGO_INDEX || [];
  var prod = idx.find(function(p) { return p.id === idParam; });
  if (!prod) return;
  setTimeout(function() {
    var dataStr = JSON.stringify({
      id: prod.id, name: prod.name, href: prod.href,
      imgUrl: prod.imgUrl, precioCatalogo: prod.precio,
      precioConDesc: prod.precioMin5, pctIndTexto: 5,
      fuente: prod.fuente, precioBase: prod.precioBase
    });
    abrirProducto(dataStr);
    window.history.replaceState({}, "", window.location.pathname);
  }, 800);
})();

// ── Destacados dinámicos ──────────────────────────────────────────────────────
function renderDestacados() {
  var grid = document.getElementById("gridDestacados");
  if (!grid) return;

  var idx = window.CATALOGO_INDEX || [];
  if (!idx.length) return;

  var mv = {};
  try { mv = JSON.parse(sessionStorage.getItem("jrMasVistos")||"{}"); } catch(e){}

  // Score: vistas × 3 + precio normalizado
  var maxPrecio = Math.max.apply(null, idx.map(function(p){ return p.precio||0; }));
  var scored = idx
    .filter(function(p){ return p.precio > 0; })
    .map(function(p) {
      var vistas    = mv[p.id] || 0;
      var pctPrecio = maxPrecio > 0 ? (p.precio / maxPrecio) : 0;
      return { p: p, score: vistas * 3 + pctPrecio * 2 };
    })
    .sort(function(a,b){ return b.score - a.score; })
    .slice(0, 8)
    .map(function(x){ return x.p; });

  // Si no hay suficientes vistas, fallback a los más caros
  if (scored.every(function(p){ return (mv[p.id]||0) === 0; })) {
    scored = idx
      .filter(function(p){ return p.precio > 0; })
      .sort(function(a,b){ return b.precio - a.precio; })
      .slice(0, 8);
  }

  // Renderizar cards
  grid.innerHTML = scored.map(function(p) {
    var precioCatalogo = p.precio;
    var pctInd = precioCatalogo <= 20000  ? 5
               : precioCatalogo <= 50000  ? 10
               : precioCatalogo <= 100000 ? 15
               : precioCatalogo <= 200000 ? 18 : 20;
    var precioConDesc = Math.round(precioCatalogo * (1 - pctInd/100));
    var b64 = btoa(unescape(encodeURIComponent(JSON.stringify({
      id: p.id, name: p.name, href: p.href, imgUrl: p.imgUrl,
      precioCatalogo: precioCatalogo, precioConDesc: precioConDesc,
      pctIndTexto: pctInd, fuente: p.fuente, precioBase: p.precioBase
    }))));
    var vistas = mv[p.id] || 0;
    var badgeVistas = vistas >= 5
      ? '<span class="badge-vistas">' + vistas + ' vistas</span>' : '';
    return '<div class="card" data-prod="' + b64 + '" onclick="abrirProductoCard(this)" style="cursor:pointer">'
      + '<div class="card-img">'
      + (p.imgUrl ? '<img src="' + p.imgUrl + '" alt="' + p.name + '" loading="lazy" referrerpolicy="no-referrer">' : '<div class="no-img">📦</div>')
      + badgeVistas
      + '</div>'
      + '<div class="card-body">'
      + '<p class="card-name">' + p.name + '</p>'
      + '<p class="card-price-mp"><s>' + fmtMV(precioCatalogo) + '</s></p>'
      + '<p class="card-price">' + fmtMV(precioConDesc) + '</p>'
      + '<p class="card-price-label">' + pctInd + '% off · transferencia</p>'
      + '<div class="card-actions" onclick="event.stopPropagation()">'
      + '<button class="add-btn" onclick="addToCartFromBtn(this)"'
      + ' data-id="' + p.id + '" data-name="' + p.name + '" data-price="' + precioCatalogo + '"'
      + ' data-href="' + p.href + '" data-fuente="' + p.fuente + '" data-precio-base="' + p.precioBase + '">+ Agregar</button>'
      + '</div></div></div>';
  }).join("");
}

// Renderizar al cargar y cada vez que cambia el ranking de vistas
renderDestacados();
// Re-renderizar cuando lleguen datos de Railway
setTimeout(renderDestacados, 2000);

// ── Simulador de crédito ──────────────────────────────────────────────────────
var creditoAbierto   = false;
var creditoCuotasSel = 6;
var creditoAntPct    = 35;
var creditoPrecio    = 0;
var creditoNombre    = "";

function toggleCredito() {
  creditoAbierto = !creditoAbierto;
  document.getElementById("creditoToggle").classList.toggle("open", creditoAbierto);
  document.getElementById("creditoBody").classList.toggle("open", creditoAbierto);
  // Ocultar/mostrar botones de carrito y WA
  var prodActions = document.querySelector(".prod-actions");
  if (prodActions) prodActions.style.display = creditoAbierto ? "none" : "flex";
  if (creditoAbierto) renderCredito();
}

function onAnticipoChange(val) {
  var monto = parseInt(val);
  creditoAntPct = Math.round(monto / creditoPrecio * 100);
  document.getElementById("creditoAnticipoVal").textContent = "$ " + monto.toLocaleString("es-AR");
  renderCredito();
}

function calcCredito(precio, pct, cuotas) {
  var anticipo = Math.round(precio * pct / 100);
  // Si tenemos el monto exacto del slider lo usamos
  var slider = document.getElementById("creditoSlider");
  if (slider && parseInt(slider.value) > 0) {
    anticipo = parseInt(slider.value);
  }
  var saldo  = precio - anticipo;
  var i      = 0.10;
  var cuota  = Math.round(saldo * i / (1 - Math.pow(1+i, -cuotas)));
  var total  = anticipo + cuota * cuotas;
  return { anticipo, saldo, intTotal: Math.round(cuota * cuotas - saldo), cuota, total: Math.round(total), cuotas };
}

function fmtC(n) { return "$ " + Math.round(n).toLocaleString("es-AR"); }
function metC(l,v) { return '<div><div class="credito-metrica-label">'+l+'</div><div class="credito-metrica-valor">'+v+'</div></div>'; }

function renderCredito() {
  if (!creditoAbierto || !creditoPrecio) return;
  var maxC = creditoPrecio <= 200000 ? 3 : 6;
  if (creditoCuotasSel > maxC) creditoCuotasSel = maxC;

  // Cuotas
  var cuotasEl = document.getElementById("creditoCuotas");
  cuotasEl.innerHTML = "";
  [3,6].forEach(function(n) {
    if (n > maxC) return;
    var r   = calcCredito(creditoPrecio, creditoAntPct, n);
    var sel = n === creditoCuotasSel;
    var btn = document.createElement("div");
    btn.className = "credito-cuota-btn" + (sel?" active":"");
    btn.innerHTML = '<div class="credito-cuota-monto">'+fmtC(r.cuota)+'</div><div class="credito-cuota-label">'+n+' cuotas</div>';
    btn.onclick = function() { creditoCuotasSel = n; renderCredito(); };
    cuotasEl.appendChild(btn);
  });

  // Resumen — claro y sin redundancia
  var r = calcCredito(creditoPrecio, creditoAntPct, creditoCuotasSel);
  document.getElementById("creditoResumen").innerHTML =
    '<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:12px;padding:14px;text-align:center;margin-bottom:8px">' +
      '<div style="font-size:12px;color:#854F0B;margin-bottom:2px;font-weight:600">Pagás hoy (anticipo ' + creditoAntPct + '%)</div>' +
      '<div style="font-size:28px;font-weight:800;color:#111">' + fmtC(r.anticipo) + '</div>' +
    '</div>' +
    '<div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:12px;padding:14px;text-align:center;margin-bottom:8px">' +
      '<div style="font-size:12px;color:#166534;margin-bottom:2px;font-weight:600">Tu cuota mensual</div>' +
      '<div style="font-size:28px;font-weight:800;color:#16a34a">' + fmtC(r.cuota) + '</div>' +
      '<div style="font-size:11px;color:#888">x ' + creditoCuotasSel + ' cuotas · 6% interés mensual sobre saldo</div>' +
    '</div>' +
    '<div style="background:#f9f9f9;border-radius:10px;padding:10px;text-align:center">' +
      '<div style="font-size:11px;color:#888;margin-bottom:2px">Total a pagar</div>' +
      '<div style="font-size:18px;font-weight:800;color:#111">' + fmtC(r.total) + '</div>' +
      '<div style="font-size:10px;color:#aaa">anticipo + ' + creditoCuotasSel + ' cuotas</div>' +
    '</div>';

  // Cuadro de cuotas
  var saldo = r.saldo; var rows = "";
  for (var i=1; i<=r.cuotas; i++) {
    var intMes  = Math.round(saldo * 0.06);
    var capital = i===r.cuotas ? saldo : r.cuota - intMes;
    saldo = Math.max(0, Math.round(saldo - capital));
    var cuotaR  = capital + intMes;
    rows += "<tr><td>"+i+"</td><td>"+fmtC(cuotaR)+"</td><td>"+fmtC(intMes)+"</td><td>"+fmtC(saldo)+"</td></tr>";
  }
  document.getElementById("creditoCuadro").innerHTML =
    "<table><thead><tr><th>N°</th><th>Importe</th><th>Interés</th><th>Saldo</th></tr></thead><tbody>"+rows+"</tbody></table>";

  // Botón WA con formulario completo
  document.getElementById("creditoBtnWA").onclick = function() {
    var nombre    = (document.getElementById("cfNombre")?.value   || "").trim();
    var dni       = (document.getElementById("cfDni")?.value      || "").trim();
    var tel       = (document.getElementById("cfTel")?.value      || "").trim();
    var domicilio = (document.getElementById("cfDomicilio")?.value || "").trim();
    var barrio    = (document.getElementById("cfBarrio")?.value    || "").trim();
    var trabajo   = (document.getElementById("cfTrabajo")?.value   || "").trim();

    if (!nombre || !dni || !tel || !domicilio || !barrio || !trabajo) {
      alert("Por favor completá todos los campos antes de enviar.");
      return;
    }

    var r   = calcCredito(creditoPrecio, creditoAntPct, creditoCuotasSel);

    // Guardar en Sheets via Railway
    fetch("https://jrrailway-production.up.railway.app/solicitud-credito", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": "jrsoluciones2025" },
      body: JSON.stringify({
        nombre: nombre, dni: dni, telefono: tel,
        domicilio: domicilio, barrio: barrio, trabajo: trabajo,
        producto: creditoNombre, precio_lista: creditoPrecio,
        anticipo: r.anticipo, cuotas: creditoCuotasSel,
        cuota_mensual: r.cuota, total: r.total
      })
    }).catch(function(){});

    var msg = encodeURIComponent(
      "SOLICITUD DE FINANCIACION - JR Soluciones" +
      " | Producto: " + creditoNombre +
      " | Precio lista: " + fmtC(creditoPrecio) +
      " | Anticipo: " + fmtC(r.anticipo) +
      " | " + creditoCuotasSel + " cuotas de " + fmtC(r.cuota) +
      " | Total: " + fmtC(r.total) +
      " || DATOS: Nombre: " + nombre +
      " | DNI: " + dni +
      " | Tel: " + tel +
      " | Domicilio: " + domicilio + " - " + barrio +
      " | Trabajo: " + trabajo +
      " || Adjunto fotos de DNI frente y dorso, boleta de servicio y comprobante de ingresos."
    );
    window.open("https://wa.me/543812235528?text=" + msg, "_blank");
  };
}

function mostrarFormCredito() {
  var form     = document.getElementById("creditoForm");
  var btnSolic = document.getElementById("creditoBtnSolicitar");
  if (form)     form.style.display     = "block";
  if (btnSolic) btnSolic.style.display = "none";
  // Limpiar campos
  ["cfNombre","cfDni","cfTel","cfDomicilio","cfBarrio","cfTrabajo"].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// ── Modal ¿Cómo comprar? ──────────────────────────────────────────────────────
var AYUDA_KEY = "jrAyudaVista";

function abrirAyuda() {
  var overlay = document.getElementById("ayudaOverlay");
  overlay.classList.add("open");
  // Resetear checkbox al abrir manualmente
  var chk = document.getElementById("chkNoMostrar");
  if (chk) chk.checked = false;
}

function cerrarAyuda() {
  document.getElementById("ayudaOverlay").classList.remove("open");
  var chk = document.getElementById("chkNoMostrar");
  if (chk && chk.checked) {
    localStorage.setItem(AYUDA_KEY, "1");
  }
}

// Mostrar automáticamente la primera vez
if (!localStorage.getItem(AYUDA_KEY)) {
  setTimeout(abrirAyuda, 1500);
}

// ── Carrusel de novedades ─────────────────────────────────────────────────────
(function() {
  var slider = document.getElementById("novSlider");
  var outer  = slider ? slider.parentElement : null;
  if (!slider || !outer) return;

  var touchStartX = 0;
  var touchStartAnim = 0;
  var isDragging = false;

  // Obtener posición actual de la animación
  function getAnimX() {
    var style = window.getComputedStyle(slider);
    var mat   = new WebKitCSSMatrix(style.transform);
    return mat.m41 || 0;
  }

  // Pausar animación
  function pausar() { slider.style.animationPlayState = "paused"; }
  function reanudar() {
    setTimeout(function() { slider.style.animationPlayState = "running"; }, 800);
  }

  // Touch en mobile
  outer.addEventListener("touchstart", function(e) {
    touchStartX = e.touches[0].clientX;
    pausar();
  }, { passive: true });

  outer.addEventListener("touchend", function(e) {
    var dx = touchStartX - e.changedTouches[0].clientX;
    // Swipe fuerte → saltar a la siguiente sección del carrusel
    if (Math.abs(dx) > 30) {
      var currentX = getAnimX();
      // Ajustar la animación según dirección del swipe
      slider.style.transform = "translateX(" + (currentX - (dx > 0 ? 172 : -172)) + "px)";
    }
    reanudar();
  }, { passive: true });

  // Mouse hover pausa
  outer.addEventListener("mouseenter", pausar);
  outer.addEventListener("mouseleave", reanudar);

  // Drag con mouse
  outer.addEventListener("mousedown", function(e) {
    isDragging = true; touchStartX = e.clientX; pausar();
  });
  window.addEventListener("mouseup", function(e) {
    if (!isDragging) return; isDragging = false; reanudar();
  });
})();

// ── Social proof ──────────────────────────────────────────────────────────────
var API_SP   = "https://jrrailway-production.up.railway.app";
var NOMBRES  = ["Rodrigo","Valentina","Lucas","Camila","Martin","Sofia","Agustin","Lucia","Santiago","Florencia","Tomas","Julieta","Mateo","Micaela","Facundo"];
var CIUDADES = ["Tucuman","Salta","Cordoba","Buenos Aires","Mendoza","Rosario","La Plata","Jujuy","Catamarca","Santiago del Estero"];

async function registrarVisitaPagina() {
  try {
    var res  = await fetch(API_SP + "/visita-pagina", { method: "POST" });
    var data = await res.json();
    if (data.ok) actualizarStats(data.total, data.activos);
  } catch(e) {
    // Fallback: intentar solo leer stats sin registrar visita
    try {
      var res2  = await fetch(API_SP + "/stats-pagina");
      var data2 = await res2.json();
      if (data2.ok) actualizarStats(data2.total, data2.activos);
    } catch(e2) {
      // Si todo falla, ocultar el contador
      var elV = document.getElementById("statVisitas");
      if (elV) elV.closest(".stat-item").style.display = "none";
    }
  }
}

function actualizarStats(total, activos) {
  var elV = document.getElementById("statVisitas");
  if (elV) elV.textContent = total.toLocaleString("es-AR");
  var elO = document.getElementById("statOnline");
  if (elO) {
    var base = Math.max(1, activos);
    var mult = base === 1 ? Math.floor(Math.random()*3)+2
             : base === 2 ? Math.floor(Math.random()*3)+4
             : base === 3 ? Math.floor(Math.random()*3)+5
             : Math.floor(base * 1.8 + Math.random()*3);
    elO.textContent = mult;
  }
}

function pingPeriodico() {
  var elO = document.getElementById("statOnline");
  if (elO) {
    var actual = parseInt(elO.textContent) || 2;
    elO.textContent = Math.max(1, actual + Math.floor(Math.random()*3)-1);
  }
  setTimeout(pingPeriodico, 30000);
}
registrarVisitaPagina();
setTimeout(pingPeriodico, 30000);

// ── Ultima compra ─────────────────────────────────────────────────────────────
var PRODUCTOS_MUESTRA = (window.CATALOGO_INDEX || []).filter(function(p){ return p.precio > 0; }).slice(0,50);

function mostrarUltimaCompra() {
  if (!PRODUCTOS_MUESTRA.length) return;
  var prod   = PRODUCTOS_MUESTRA[Math.floor(Math.random()*PRODUCTOS_MUESTRA.length)];
  var nombre = NOMBRES[Math.floor(Math.random()*NOMBRES.length)];
  var ciudad = CIUDADES[Math.floor(Math.random()*CIUDADES.length)];
  var mins   = Math.floor(Math.random()*55)+2;
  var nprod  = prod.name.length > 35 ? prod.name.slice(0,33)+"..." : prod.name;
  var el = document.getElementById("ultimaCompra");
  if (!el) return;
  document.getElementById("ucTitulo").textContent = nombre + " de " + ciudad + " compro:";
  document.getElementById("ucSub").textContent    = nprod + " - hace " + mins + " min";
  el.style.display = "block";
  setTimeout(function(){ el.style.display="none"; }, 5000);
}

setTimeout(function() {
  mostrarUltimaCompra();
  function sched() {
    setTimeout(function(){ mostrarUltimaCompra(); sched(); }, (Math.floor(Math.random()*45)+45)*1000);
  }
  sched();
}, 8000);

// ── Badges sociales en cards ──────────────────────────────────────────────────
function agregarBadgesSociales() {
  var mv = {};
  try { mv = JSON.parse(sessionStorage.getItem("jrMasVistos")||"{}"); } catch(e){}
  document.querySelectorAll(".card[data-prod]").forEach(function(card) {
    try {
      var p = JSON.parse(atob(card.dataset.prod));
      var vistas = mv[p.id] || 0;
      var wrap = card.querySelector(".card-img");
      if (!wrap) return;
      if (vistas >= 5 && !wrap.querySelector(".badge-vistas")) {
        var bv = document.createElement("span");
        bv.className = "badge-vistas";
        bv.textContent = vistas + " vistas";
        wrap.appendChild(bv);
      }
    } catch(e){}
  });
}
setTimeout(agregarBadgesSociales, 2000);

  