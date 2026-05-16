
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
  const secRecientes = document.getElementById("sec-recientes");
  const allSec = Array.from(document.querySelectorAll("[data-section]"));

  if (catActiva === "Todos" && !q) {
    // Modo por defecto: mostrar sec-recientes + destacados, ocultar categorías
    allSec.forEach(sec => {
      const cat = sec.dataset.cat || "";
      if (cat === "Todos" || cat === "Destacados") sec.style.display = "";
      else sec.style.display = "none";
    });
    noResults.style.display = "none";
    return;
  }

  // Con búsqueda o categoría seleccionada
  if (secRecientes) secRecientes.style.display = "none";
  let visible = 0;

  allSec.forEach(sec => {
    const cat = sec.dataset.cat || "";
    if (cat === "Todos") { sec.style.display = "none"; return; }
    if (cat === "Destacados") { sec.style.display = "none"; return; }

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

  // Si hay búsqueda global, buscar también en sec-recientes
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
  document.getElementById("prodPrecioMP").innerHTML       = "Con tarjeta/MP: <s>" + fmtMV(p.precioCatalogo) + "</s>";

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
  document.getElementById("prodDesc").innerHTML = '<div class="prod-desc-loading">Cargando descripción...</div>';

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
  document.getElementById("prodOverlay").classList.add("open");
  fetchDescripcion(p.href, p.fuente);
}

function cerrarProducto() {
  document.getElementById("prodOverlay").classList.remove("open");
}

async function fetchDescripcion(href, fuente) {
  var descEl = document.getElementById("prodDesc");
  if (!href) { descEl.textContent="Sin descripción disponible."; return; }
  try {
    var proxy = "https://api.allorigins.win/get?url=" + encodeURIComponent(href);
    var res   = await fetch(proxy);
    var data  = await res.json();
    var doc   = new DOMParser().parseFromString(data.contents||"","text/html");
    var desc  = "";
    var sels  = fuente==="DAZ Importadora"
      ? [".woocommerce-product-details__short-description",".product-short-description",".entry-content"]
      : [".o_field_html","#product_long_description",".product_description"];
    for (var i=0; i<sels.length; i++) {
      var el = doc.querySelector(sels[i]);
      if (el && el.textContent.trim().length>30) { desc=el.textContent.trim(); break; }
    }
    if (!desc) {
      var ps = doc.querySelectorAll("p");
      for (var j=0; j<ps.length; j++) {
        var t = ps[j].textContent.trim();
        if (t.length>80 && t.length<2000) { desc=t; break; }
      }
    }
    descEl.textContent = desc || "Descripción no disponible.";
  } catch(e) { descEl.textContent="No se pudo cargar la descripción."; }
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

// ── Modal ¿Cómo comprar? ──────────────────────────────────────────────────────
function abrirAyuda() { document.getElementById("ayudaOverlay").classList.add("open"); }
function cerrarAyuda() { document.getElementById("ayudaOverlay").classList.remove("open"); }

// ── Tutorial automático primera vez ──────────────────────────────────────────
var TUTORIAL_KEY = "jrTutorialVisto";
var tutorialPasos = [
  {
    selector: "#catDropdown",
    titulo: "Categorías",
    desc: "Tocá acá para navegar por tipos de productos.",
    pos: "bottom"
  },
  {
    selector: ".card",
    titulo: "Tocá un producto",
    desc: "Hacé click en cualquier producto para ver el precio, descuento y detalles.",
    pos: "bottom"
  },
  {
    selector: "#cartBtn",
    titulo: "Tu carrito",
    desc: "Cuando agregues productos aparecen acá. Desde el carrito finalizás la compra.",
    pos: "bottom"
  },
  {
    selector: "#btnAyuda",
    titulo: "¿Dudas?",
    desc: "Podés volver a ver esta guía cuando quieras tocando este botón.",
    pos: "top"
  }
];

var tutorialActual = 0;

function mostrarTutorialPaso(idx) {
  var overlay = document.getElementById("tutorialOverlay");
  overlay.innerHTML = "";
  if (idx >= tutorialPasos.length) {
    overlay.classList.remove("open");
    localStorage.setItem(TUTORIAL_KEY, "1");
    return;
  }
  var paso = tutorialPasos[idx];
  var target = document.querySelector(paso.selector);
  if (!target) { mostrarTutorialPaso(idx+1); return; }

  overlay.classList.add("open");
  var rect = target.getBoundingClientRect();

  // Resaltar elemento
  var highlight = document.createElement("div");
  highlight.style.cssText = "position:fixed;border:2px solid #f59e0b;border-radius:10px;pointer-events:none;z-index:499;transition:all .3s;box-shadow:0 0 0 9999px rgba(0,0,0,.5)";
  highlight.style.top    = (rect.top - 4) + "px";
  highlight.style.left   = (rect.left - 4) + "px";
  highlight.style.width  = (rect.width + 8) + "px";
  highlight.style.height = (rect.height + 8) + "px";
  overlay.appendChild(highlight);

  // Caja de texto
  var box = document.createElement("div");
  box.className = "tutorial-box";
  var isBottom = paso.pos !== "top" && rect.top < window.innerHeight * 0.6;
  if (isBottom) {
    box.style.top  = (rect.bottom + 16) + "px";
    box.style.left = Math.min(Math.max(rect.left, 12), window.innerWidth - 280) + "px";
  } else {
    box.style.bottom = (window.innerHeight - rect.top + 16) + "px";
    box.style.left   = Math.min(Math.max(rect.left, 12), window.innerWidth - 280) + "px";
  }

  box.innerHTML =
    '<div class="tutorial-titulo">' + paso.titulo + '</div>' +
    '<div>' + paso.desc + '</div>' +
    '<div class="tutorial-nav">' +
    '<button class="t-skip" onclick="terminarTutorial()">Saltar</button>' +
    '<span class="tutorial-progreso">' + (idx+1) + ' / ' + tutorialPasos.length + '</span>' +
    '<button onclick="mostrarTutorialPaso(' + (idx+1) + ')">' + (idx+1 < tutorialPasos.length ? 'Siguiente →' : '¡Listo!') + '</button>' +
    '</div>';
  overlay.appendChild(box);
}

function terminarTutorial() {
  document.getElementById("tutorialOverlay").classList.remove("open");
  localStorage.setItem(TUTORIAL_KEY, "1");
}

// Mostrar tutorial si es la primera vez
if (!localStorage.getItem(TUTORIAL_KEY)) {
  setTimeout(function() { mostrarTutorialPaso(0); }, 2500);
}

// ── Carrusel de novedades — pausa en touch mobile ─────────────────────────────
(function() {
  var slider = document.getElementById("novSlider");
  if (!slider) return;
  // En mobile el hover no funciona — pausar con touch
  slider.addEventListener("touchstart", function() {
    slider.style.animationPlayState = "paused";
  }, {passive:true});
  slider.addEventListener("touchend", function() {
    setTimeout(function() { slider.style.animationPlayState = "running"; }, 1500);
  }, {passive:true});
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

  