/**
 * Generador de Catalogo JR Soluciones Informaticas
 * ─────────────────────────────────────────────────
 * Trae productos de Ximaro + DAZ Importadora, aplica markup y genera
 * un ÚNICO archivo HTML autocontenido (sin dependencias externas).
 *
 * USO:
 *   node generar.js          → markup 50% (por defecto)
 *   node generar.js 30       → markup 30%
 *   node generar.js 75       → markup 75%
 *
 * REQUISITOS:
 *   npm install puppeteer
 */

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");

// ── Configuración ──────────────────────────────────────────────────────────────
const MARKUP           = parseFloat(process.argv[2] ?? 50) / 100;
const LIMITE_PRODUCTOS = 2000;
const TIMEOUT_NAV = 120000; // 2 minutos
const REINTENTOS  = 3;
const CART_PHONE       = "543812235528"; // +54 381 223 5528
const OUT_DIR          = path.join(require("os").homedir(), "Documents", "WEB-JR-SOLUCIONES-INFORMATICAS");
const OUT_HTML         = path.join(OUT_DIR, "index.html");
const OUT_PDF          = path.join(OUT_DIR, "catalogo-jr-soluciones-informaticas.pdf");

// ───────────────────────────────────────────────────────────────────────────────

function log(msg)   { process.stdout.write(`\r${msg}`.padEnd(80)); }
function logln(msg) { console.log(`\n${msg}`); }

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

function parsePrecioAR(text) {
  const raw     = String(text || "");
  const match   = raw.match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?/);
  const cleaned = String(match ? match[0] : "").replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const value = parseFloat(cleaned.replace(/\./g, "").replace(/,/g, "."));
  return isFinite(value) ? value : null;
}

function formatPrecio(value) {
  return "$ " + Math.round(value).toLocaleString("es-AR");
}

function slugToTitle(slug) {
  return String(slug || "")
    .replace(/-\d+$/, "")
    .split(/[-_]/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function obtenerPuppeteer() {
  for (const pkg of ["puppeteer", "puppeteer-core"]) {
    try { return require(pkg); } catch {}
  }
  throw new Error("Puppeteer no instalado. Corré: npm install puppeteer");
}

function detectarChrome() {
  const fs = require("fs");
  const candidatos = [
    // Chrome estándar
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Chrome por usuario (cualquier usuario)
    ...["Admin","nuevo","Usuario","user","PC"].map(u =>
      `C:\\Users\\${u}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
    ),
    // Edge como fallback
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Descarga texto (para recuperar precios faltantes) ─────────────────────────
function descargarTexto(url, base = "https://ximaro.com.ar") {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    let abs;
    try { abs = new URL(url, base).href; } catch { return resolve(null); }
    const client = abs.startsWith("https") ? https : http;
    client.get(abs, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      if ([301, 302].includes(res.statusCode)) {
        const loc = res.headers.location;
        return resolve(loc ? descargarTexto(new URL(loc, abs).href) : null);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => { try { resolve(Buffer.concat(chunks).toString("utf8")); } catch { resolve(null); } });
      res.on("error", () => resolve(null));
    }).on("error", () => resolve(null));
  });
}

// Limpia caracteres especiales de los nombres de productos
function limpiarNombre(str) {
  let s = String(str || "");
  // Corregir doble-encoding: latin1 interpretado como UTF-8
  // Ejemplo: "½" guardado como latin1 se lee como "Â½" en UTF-8
  try {
    if (/[ÂÃ]/.test(s)) {
      const buf = Buffer.from(s, "latin1");
      const decoded = buf.toString("utf8");
      if (!/[ÂÃ\uFFFD]/.test(decoded) && decoded.length > 0) s = decoded;
    }
  } catch(e) {}
  return s
    .replace(/Â½/g, "½").replace(/Â¼/g, "¼").replace(/Â¾/g, "¾")
    .replace(/Â°/g, "°").replace(/Â·/g, "·")
    .replace(/Ã±/g, "ñ").replace(/Ã\u0091/g, "Ñ")
    .replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó").replace(/Ãº/g, "ú")
    .replace(/\u2033|\u02BA/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\uFFFD/g, "")
    .replace(/â[^a-zA-Z0-9\s]/g, '"')
    .replace(/Â[^\s]/g, "").replace(/Ã[^\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extraerPrecioDesdeHtml(html) {
  if (!html) return null;
  const pats = [
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /<span[^>]*class=["'][^"']*oe_currency_value[^"']*["'][^>]*>([^<]+)<\/span>/i,
    /<span[^>]*class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>([^<]+)<\/span>/i,
    /\$\s*[\d.]+(?:,\d{1,2})?/,
  ];
  for (const p of pats) {
    const m = html.match(p);
    const v = parsePrecioAR(m ? m[1] || m[0] : "");
    if (v && v > 0) return v;
  }
  return null;
}

async function completarPreciosFaltantes(productos) {
  const faltantes = productos.map((p, i) => ({ p, i })).filter(({ p }) => !(p.list_price > 0));
  if (!faltantes.length) return 0;
  let rec = 0;
  for (let i = 0; i < faltantes.length; i += CONCURRENCIA) {
    const lote = faltantes.slice(i, i + CONCURRENCIA);
    log(`Completando precios ${i + 1}-${Math.min(i + CONCURRENCIA, faltantes.length)} / ${faltantes.length}...`);
    const precios = await Promise.all(lote.map(({ p }) => descargarTexto(p.href, p.siteUrl).then(extraerPrecioDesdeHtml)));
    precios.forEach((price, idx) => { if (price > 0) { lote[idx].p.list_price = price; rec++; } });
  }
  return rec;
}

// ── Clasificar categoría por palabras clave del nombre ────────────────────────
function clasificarCategoria(nombre) {
  const n = String(nombre || "").toLowerCase();
  if (/celular|smartphone|iphone|samsung|xiaomi|motorola|redmi|galaxy|android/.test(n)) return "Celulares";
  if (/notebook|laptop|computadora|pc |desktop|monitor|teclado|mouse|impresora|scanner|webcam|auricular|headset|parlante|speaker|hub|router|switch|cable usb|cable hdmi|cable tipo|pendrive|disco|ssd|ram|memoria/.test(n)) return "Computacion";
  if (/smart tv|television|tv |smart watch|smartwatch|reloj|camara|foto|video|drone|gopro|proyector|home theater|blu-ray|dvd/.test(n)) return "Electronica";
  if (/heladera|lavarrop|lavavajill|microonda|hornito|horno|cafetera|licuadora|batidora|tostadora|plancha|freidora|aspiradora|ventilador|aire acondicionado|calefactor/.test(n)) return "Electrodomesticos";
  if (/bicicleta|bici |scooter|patineta|casco|rodado/.test(n)) return "Bicicletas";
  if (/herramienta|taladro|sierra|atornillador|lijadora|compresor|soldador/.test(n)) return "Herramientas";
  if (/perfume|crema|shampoo|maquillaje|cosmetic|cuidado personal|afeitador|depilador/.test(n)) return "Salud y Belleza";
  if (/juguete|muñeca|lego|puzzle|juego de mesa|peluche/.test(n)) return "Juguetes";
  if (/mochila|bolso|valija|cartera|billetera|cinturon/.test(n)) return "Accesorios";
  if (/silla|mesa|escritorio|estante|organizador|cama|colchon|almohada|sabana/.test(n)) return "Hogar";
  if (/vaso|taza|mate|termo|stanley|botella|tupperware|fuente|olla|sarten/.test(n)) return "Cocina";
  if (/cargador|bateria|power bank|cable|adaptador|funda|protector|soporte/.test(n)) return "Accesorios Tecnologia";
  return "General";
}

// ── Scraping Ximaro desde /shop (todos los productos, más nuevos primero) ──────
async function fetchProductosXimaro() {
  const puppeteer = obtenerPuppeteer();
  const chromePath = detectarChrome();
  if (chromePath) logln("  [Chrome] " + chromePath);
  const browser   = await puppeteer.launch({
    headless: "new",
    executablePath: chromePath || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--disable-gpu", "--no-first-run", "--no-zygote"]
  });
  const productos  = [];
  const vistos     = new Set();

  try {
    for (let pag = 1; pag <= 100 && productos.length < LIMITE_PRODUCTOS; pag++) {
      const page = await browser.newPage();
      try {
        const url = pag === 1
          ? "https://ximaro.com.ar/shop"
          : `https://ximaro.com.ar/shop/page/${pag}`;

        log(`Ximaro — página ${pag} (${productos.length} productos)...`);
        await gotoConReintentos(page, url, { waitUntil: "networkidle2" });

        const extraidos = await page.$$eval(".oe_product, .o_wsale_product_grid_wrapper", cards => {
          const clean = v => String(v || "").replace(/\s+/g, " ").trim();
          const byHref = new Map();
          for (const card of cards) {
            const anchor = Array.from(card.querySelectorAll('a[href*="/shop/"]'))
              .find(a => { try { return /\/shop\/[^/]+-\d+$/.test(new URL(a.getAttribute("href") || "", location.origin).pathname); } catch { return false; } });
            if (!anchor) continue;
            const href  = new URL(anchor.getAttribute("href") || "", location.origin).href;
            const name  = clean(card.querySelector(".o_wsale_products_item_title, .product_name, h6, h5, h4")?.textContent)
                       || clean(anchor.getAttribute("title"))
                       || clean(card.querySelector("img")?.getAttribute("alt"));
            if (!name || ["Tienda online", "Ver todo"].includes(name)) continue;

            // Intentar extraer categoría del breadcrumb o clases
            const catEl = card.querySelector(".o_wsale_product_grid_category, [class*='category'], .product_category");
            const cat   = clean(catEl?.textContent) || "";

            const priceNodes = card.querySelectorAll('[itemprop="price"], .oe_currency_value, .product_price, .oe_price, .text-nowrap');
            const priceCandidates = [...priceNodes].flatMap(n => [clean(n.textContent), n.getAttribute("content")].filter(Boolean));
            const regexPrices = (clean(card.textContent).match(/\$\s*[\d.]+(?:,\d{1,2})?|\d+[\d.,]*/g) || []);
            const priceText = [...priceCandidates, ...regexPrices].find(Boolean) || "";

            const img    = card.querySelector("img");
            const imgSrc = img ? (() => { try { const s = img.getAttribute("src") || img.getAttribute("data-src") || ""; return s ? new URL(s, location.origin).href : ""; } catch { return ""; } })() : "";

            const prev = byHref.get(href);
            if (!prev) { byHref.set(href, { href, name, priceText, imgSrc, cat }); continue; }
            byHref.set(href, {
              href,
              name: prev.name.length >= name.length ? prev.name : name,
              priceText: /\d/.test(prev.priceText) ? prev.priceText : priceText,
              imgSrc: prev.imgSrc || imgSrc,
              cat: prev.cat || cat,
            });
          }
          return Array.from(byHref.values());
        });

        if (!extraidos.length) break;
        const nuevos = extraidos.filter(item => !vistos.has(item.href) && vistos.add(item.href));
        if (!nuevos.length) break;

        for (const item of nuevos) {
          const idMatch = item.href.match(/-(\d+)$/);
          const pos   = productos.length;
          const stock = pos < 100 ? "alto" : pos < 300 ? "medio" : "bajo";
          const categoria = item.cat || clasificarCategoria(item.name);

          productos.push({
            id: idMatch ? parseInt(idMatch[1], 10) : null,
            href: item.href,
            name: limpiarNombre(item.name),
            list_price: parsePrecioAR(item.priceText) ?? 0,
            imgUrl: item.imgSrc || null,
            categoria,
            fuente: "Ximaro",
            stock,
            siteUrl: "https://ximaro.com.ar",
          });
          if (productos.length >= LIMITE_PRODUCTOS) break;
        }
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }

  if (!productos.length) throw new Error("No se encontraron productos en Ximaro.");
  return productos;
}

// ── Scraping DAZ Importadora con Puppeteer ────────────────────────────────────
async function fetchProductosDaz() {
  const puppeteer = obtenerPuppeteer();
  const chromePath = detectarChrome();
  if (chromePath) logln("  [Chrome] " + chromePath);
  const browser   = await puppeteer.launch({
    headless: "new",
    executablePath: chromePath || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--disable-gpu", "--no-first-run", "--no-zygote"]
  });
  const productos  = [];
  const vistos     = new Set();
  let paginasVacias = 0;

  try {
    for (let pag = 1; pag <= 50 && productos.length < LIMITE_PRODUCTOS; pag++) {
      const page = await browser.newPage();
      try {
        const url = pag === 1
          ? "https://dazimportadora.com.ar/productos/"
          : `https://dazimportadora.com.ar/productos/page/${pag}/`;

        log(`DAZ — página ${pag} (${productos.length} productos)...`);

        try {
          await gotoConReintentos(page, url, { waitUntil: "domcontentloaded" });
        } catch(e) {
          logln(`⚠ DAZ página ${pag} falló tras ${REINTENTOS} intentos: ${e.message}`);
          if (pag === 1) throw new Error("No se pudo cargar DAZ: " + e.message);
          break;
        }

        const extraidos = await page.$$eval(".wd-product.product-grid-item", cards => {
          const clean = v => String(v || "").replace(/\s+/g, " ").trim();
          const byHref = new Map();
          for (const card of cards) {
            const anchor = card.querySelector('a[href*="/producto/"]');
            if (!anchor) continue;
            let href;
            try { href = new URL(anchor.getAttribute("href") || "", location.origin).href; }
            catch { continue; }
            const name  = clean(card.querySelector(".wd-entities-title a, .wd-entities-title, h3 a, h3")?.textContent)
                       || clean(anchor.getAttribute("aria-label"))
                       || clean(card.querySelector("img")?.getAttribute("alt"));
            if (!name) continue;

            const priceNodes = card.querySelectorAll(".price, .woocommerce-Price-amount, .amount");
            const priceCandidates = [...priceNodes].flatMap(n => [clean(n.textContent), n.getAttribute("content")].filter(Boolean));
            const regexPrices = (clean(card.textContent).match(/\$\s*[\d.]+(?:,\d{1,2})?/g) || []);
            const priceText = [...priceCandidates, ...regexPrices].find(Boolean) || "";

            const img    = card.querySelector("img");
            const imgSrc = img ? (() => { try { const s = img.getAttribute("src") || img.getAttribute("data-src") || ""; return s ? new URL(s, location.origin).href : ""; } catch { return ""; } })() : "";
            const cat    = clean(card.querySelector(".wd-product-cats a")?.textContent) || "";

            const stockEl   = card.querySelector(".wd-label, .product-label, .stock, [class*='stock'], [class*='label']");
            const stockText = clean(stockEl?.textContent || "").toUpperCase();
            let stockBadge  = "";
            if (stockText.includes("AGOTADO") || stockText.includes("OUT OF STOCK")) stockBadge = "agotado";
            else if (stockText.includes("BAJO STOCK") || stockText.includes("LOW STOCK")) stockBadge = "bajo";
            else if (stockText.includes("EN STOCK") || stockText.includes("IN STOCK")) stockBadge = "alto";
            if (!stockBadge && card.classList.contains("outofstock")) stockBadge = "agotado";
            if (!stockBadge && card.classList.contains("instock")) stockBadge = "alto";

            const prev = byHref.get(href);
            if (!prev) { byHref.set(href, { href, name, priceText, imgSrc, cat, stockBadge }); continue; }
            byHref.set(href, {
              href,
              name: prev.name.length >= name.length ? prev.name : name,
              priceText: /\d/.test(prev.priceText) ? prev.priceText : priceText,
              imgSrc: prev.imgSrc || imgSrc,
              cat: prev.cat || cat,
              stockBadge: prev.stockBadge || stockBadge,
            });
          }
          return Array.from(byHref.values());
        });

        if (!extraidos.length) {
          paginasVacias++;
          // Tolerar hasta 2 páginas vacías consecutivas antes de cortar
          if (paginasVacias >= 2) break;
          continue;
        }
        paginasVacias = 0;

        const nuevos = extraidos.filter(item => !vistos.has(item.href) && vistos.add(item.href));
        if (!nuevos.length) break;

        for (const item of nuevos) {
          // Extraer ID del slug de la URL de forma más robusta
          const slugMatch = item.href.match(/\/producto\/([^/]+)\/?$/);
          const slug      = slugMatch ? slugMatch[1] : "";
          const idMatch   = slug.match(/-(\d+)$/);
          const id        = idMatch ? parseInt(idMatch[1], 10) : null;

          const precio = parsePrecioAR(item.priceText) ?? 0;
          // Saltar productos sin precio o precio 0
          if (precio <= 0) continue;

          const catDaz      = item.cat && item.cat.length > 2 ? item.cat : "";
          const catClasif   = clasificarCategoria(item.name);
          const categoria   = catClasif !== "General" ? catClasif : (catDaz || "General");

          productos.push({
            id,
            href:       item.href,
            name:       limpiarNombre(item.name),
            list_price: precio,
            imgUrl:     item.imgSrc || null,
            categoria,
            fuente:     "DAZ Importadora",
            stock:      item.stockBadge || "alto",
            siteUrl:    "https://dazimportadora.com.ar",
          });
          if (productos.length >= LIMITE_PRODUCTOS) break;
        }
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }

  if (!productos.length) throw new Error("No se encontraron productos en DAZ.");
  logln(`✓ ${productos.length} productos de DAZ`);
  return productos;
}


// ── Navegación con reintentos ──────────────────────────────────────────────────
async function gotoConReintentos(page, url, opts = {}) {
  const opciones = { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAV, ...opts };
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      await page.goto(url, opciones);
      return true;
    } catch(e) {
      if (intento === REINTENTOS) throw e;
      logln(`  ⟳ Reintentando ${url} (intento ${intento+1}/${REINTENTOS})...`);
      await new Promise(r => setTimeout(r, 3000 * intento));
    }
  }
}

// ── Agrupar por categoría, nuevos primero ────────────────────────────────────
function agrupar(productos) {
  const grupos = {};
  // Asignar índice de orden global por fuente (0 = más nuevo)
  const contFuente = {};
  for (const p of productos) {
    if (!contFuente[p.fuente]) contFuente[p.fuente] = 0;
    p._orden = contFuente[p.fuente]++;
  }
  for (const p of productos) {
    const key = `${p.fuente}|||${p.categoria || "General"}`;
    if (!grupos[key]) grupos[key] = { fuente: p.fuente, categoria: p.categoria || "General", items: [] };
    grupos[key].items.push(p);
  }
  // Ordenar cada grupo: menor _orden primero (más nuevos arriba)
  for (const g of Object.values(grupos)) {
    g.items.sort((a, b) => (a._orden || 0) - (b._orden || 0));
  }
  return grupos;
}

// Top N más nuevos de cada fuente para "Novedades"
function getNovedades(productos, n = 8) {
  const porFuente = {};
  for (const p of productos) {
    if (!porFuente[p.fuente]) porFuente[p.fuente] = [];
    porFuente[p.fuente].push(p);
  }
  // Tomar los primeros N de cada fuente (ya vienen ordenados por scraping)
  return Object.values(porFuente)
    .flatMap(arr => arr.slice(0, Math.ceil(n / Object.keys(porFuente).length)))
    .filter(p => p.list_price > 0)
    .slice(0, n);
}

// Destacados: mix de nuevos + precio alto (no siempre los mismos)
function getDestacados(grupos, n = 8) {
  const todos = Object.values(grupos).flatMap(g => g.items).filter(p => p.list_price > 0);
  // Mitad por precio, mitad por novedad
  const porPrecio   = [...todos].sort((a,b) => b.list_price - a.list_price).slice(0, Math.ceil(n/2));
  const porNovedad  = [...todos].sort((a,b) => (a._orden||0) - (b._orden||0)).slice(0, Math.ceil(n/2));
  // Mezclar sin duplicados
  const vistos = new Set();
  const result = [];
  for (const p of [...porNovedad, ...porPrecio]) {
    const k = String(p.id || p.href);
    if (!vistos.has(k)) { vistos.add(k); result.push(p); }
    if (result.length >= n) break;
  }
  return result;
}

// ── CSS del catálogo ──────────────────────────────────────────────────────────
// ── Escribir catalogo.css ─────────────────────────────────────────────────────
function escribirCSS() {
  const css = `
/* ============================================================
   JR Soluciones Informáticas — Catálogo Web
  https://www.jrshop.com.ar/
   ============================================================ */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #f0f0f0; color: #111; }

/* ── Header ── */
header {
  background: #111; color: #fff;
  position: sticky; top: 0; z-index: 100;
  box-shadow: 0 2px 12px rgba(0,0,0,.5);
}
.header-top {
  padding: 10px 20px;
  max-width: 1400px; margin: 0 auto;
  display: flex; align-items: center; gap: 16px;
}
.logo { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.logo-box {
  width: 36px; height: 36px; background: #16a34a; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0;
}
.logo-text { font-size: 14px; font-weight: 700; color: #fff; line-height: 1.2; }
.logo-sub  { font-size: 10px; color: #555; }
.logo img  { height: 44px; width: auto; display: block; filter: drop-shadow(0 2px 6px rgba(0,0,0,.5)); flex-shrink: 0; }

/* Info del negocio (solo desktop) */
.header-info { display: none; flex-direction: column; gap: 3px; }
@media (min-width: 768px) { .header-info { display: flex; } }
.header-slogan { font-size: 12px; font-weight: 600; color: #888; }
.header-contacto { font-size: 11px; color: #555; display: flex; gap: 12px; flex-wrap: wrap; }
.header-contacto a { color: #555; text-decoration: none; }
.header-contacto a:hover { color: #16a34a; }

/* Búsqueda en header */
.header-search { flex: 1; max-width: 380px; display: none; }
@media (min-width: 768px) { .header-search { display: block; } }
.header-search input {
  width: 100%; padding: 8px 14px 8px 36px; border-radius: 8px; border: 1px solid #222;
  font-size: 13px; background: #1a1a1a; color: #fff; outline: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: 10px center;
}
.header-search input::placeholder { color: #444; }
.header-search input:focus { border-color: #16a34a; background-color: #111; }

/* Stats + carrito */
.header-stats { display: flex; align-items: center; gap: 12px; font-size: 11px; color: #555; margin-left: auto; flex-shrink: 0; }
.stat-item { display: flex; align-items: center; gap: 4px; }
.stat-dot { width: 6px; height: 6px; border-radius: 50%; background: #16a34a; display: inline-block; animation: pulse 2s infinite; }
.stat-num { font-weight: 700; color: #888; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

/* ── Banner rotativo ── */
.promo-banner {
  background: #0d0d0d; border-top: 1px solid #1a1a1a;
  overflow: hidden; height: 30px; display: flex; align-items: center;
}
.promo-track { display: flex; gap: 60px; white-space: nowrap; animation: scrollPromo 35s linear infinite; }
.promo-track:hover { animation-play-state: paused; }
.promo-item { font-size: 11px; color: #555; flex-shrink: 0; }
.promo-item strong { color: #888; }
@keyframes scrollPromo { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }

/* ── Barra inferior: categorías + búsqueda mobile ── */
.header-bar {
  background: #0d0d0d; padding: 0 20px; border-top: 1px solid #1a1a1a;
  display: flex; align-items: center; gap: 8px;
}

/* Dropdown de categorías */
.cat-dropdown { position: relative; flex-shrink: 0; }
.cat-dropdown-btn {
  background: #f59e0b; color: #111; border: none;
  padding: 7px 14px; border-radius: 7px; cursor: pointer;
  font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 6px;
  transition: background .15s; white-space: nowrap; margin: 6px 0;
}
.cat-dropdown-btn:hover { background: #fbbf24; }
.cat-dropdown-btn .arrow { font-size: 9px; transition: transform .2s; }
.cat-dropdown-btn.open .arrow { transform: rotate(180deg); }
.cat-dropdown-menu {
  display: none; position: absolute; top: calc(100% + 4px); left: 0;
  background: #111; border: 1px solid #222; border-radius: 12px;
  min-width: 220px; z-index: 500; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.6);
}
.cat-dropdown-menu.open { display: block; }
.cat-dropdown-item {
  padding: 9px 14px; font-size: 12px; color: #888; cursor: pointer;
  transition: background .1s, color .1s; border-bottom: 1px solid #1a1a1a;
  display: flex; align-items: center; gap: 10px;
}
.cat-dropdown-item:last-child { border-bottom: none; }
.cat-dropdown-item:hover { background: #1a1a1a; color: #fff; }
.cat-dropdown-item.active { background: #1a1a1a; color: #16a34a; }
.cat-dropdown-item .cat-icon { font-size: 14px; width: 20px; text-align: center; }

/* Búsqueda mobile */
.search-mobile { flex: 1; display: block; }
@media (min-width: 768px) { .search-mobile { display: none; } }
.search-mobile input {
  width: 100%; padding: 7px 14px; border-radius: 7px; border: 1px solid #222;
  font-size: 13px; background: #1a1a1a; color: #fff; outline: none;
}

/* ── Main ── */
main { max-width: 1400px; margin: 0 auto; padding: 20px 16px 100px; }

/* ── Barra de búsqueda (fallback, oculta en desktop) ── */

/* ── Main ── */
main { max-width: 1400px; margin: 0 auto; padding: 20px 16px 100px; }

/* ── Categoría ── */
.cat-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 1px; color: #444;
  border-left: 3px solid #16a34a; padding-left: 10px; margin: 24px 0 10px;
}
.cat-title span { font-weight: 400; color: #333; font-size: 11px; text-transform: none; letter-spacing: 0; }

/* ── Grid ── */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 10px; }

/* ── Tarjeta ── */
.card {
  background: #111; border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column;
  transition: border-color .15s;
  border: 1px solid #1a1a1a;
}
.card:hover { border-color: #2a2a2a; }
.card.hidden { display: none; }
.card-img {
  aspect-ratio: 1; overflow: hidden; background: #1a1a1a;
  display: flex; align-items: center; justify-content: center;
  position: relative; padding: 8px;
}
.card-img img { width: 100%; height: 100%; object-fit: contain; }
.no-img { font-size: 30px; color: #333; }
.badge-nuevo {
  position: absolute; top: 7px; left: 7px;
  background: #f59e0b; color: #000;
  font-size: 9px; font-weight: 800; letter-spacing: .4px;
  padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
}
.badge-minimo {
  position: absolute; top: 7px; right: 7px;
  background: rgba(0,0,0,.7); color: #f59e0b;
  font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
}
.sug-card {
  display: flex; align-items: center; gap: 10px;
  background: #1a1a1a; border: 1px solid #222; border-radius: 10px; padding: 10px;
  transition: border-color .15s;
}
.sug-card:hover { border-color: #333; }
.sug-card img { width: 44px; height: 44px; object-fit: contain; border-radius: 6px; background: #111; }
.sug-card-info { flex: 1; min-width: 0; }
.sug-card-name { font-size: 12px; font-weight: 600; color: #ccc; line-height: 1.3; }
.sug-card-precio { font-size: 13px; font-weight: 700; color: #16a34a; margin-top: 2px; }
.sug-card-tag { font-size: 10px; color: #555; }
.sug-add { background: #16a34a; color: #fff; border: none; padding: 6px 12px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
.card-actions { display: flex; gap: 6px; margin-top: 8px; }
.buy-btn {
  flex: 1; background: #fff; color: #111; border: none;
  padding: 9px 10px; border-radius: 9px; cursor: pointer;
  font-size: 12px; font-weight: 700; transition: background .15s;
}
.buy-btn:hover { background: #16a34a; color: #fff; }
.add-btn {
  background: #1e1e1e; color: #555; border: 1px solid #2a2a2a;
  padding: 9px 11px; border-radius: 9px; cursor: pointer;
  font-size: 13px; transition: background .15s;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.add-btn:hover { background: #2a2a2a; color: #fff; }
.card-body { padding: 10px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
.card-name {
  font-size: 11px; font-weight: 500; color: #aaa; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-price-mp { font-size: 10px; color: #333; margin-bottom: -2px; }
.card-price-mp s { text-decoration: line-through; color: #333; }
.card-price { font-size: 17px; font-weight: 800; color: #fff; }
.card-price-label { font-size: 10px; color: #16a34a; font-weight: 600; margin-top: -4px; }
.card-badge-desc { display:inline-block; font-size:9px; font-weight:700; color:#16a34a; background:#16a34a15; border:1px solid #16a34a30; border-radius:4px; padding:1px 6px; margin:2px 0 2px; }
.card-cuotas { display:block; font-size:10px; color:#3b82f6; font-weight:600; margin:1px 0; }
.card-cuotas::before { content:""; }
.card-unidades { display:block; font-size:10px; color:#ef4444; font-weight:700; margin:1px 0; }

/* ── Sort dropdown ── */
.sort-dropdown { position: relative; }
.sort-btn {
  background: transparent; color: #555; border: 1px solid #222;
  border-radius: 7px; padding: 6px 12px; font-size: 12px;
  cursor: pointer; display: flex; align-items: center; gap: 5px;
  white-space: nowrap; margin: 6px 0;
}
.sort-btn:hover { color: #fff; border-color: #333; }
.sort-menu {
  display: none; position: absolute; top: calc(100% + 4px); left: 0;
  background: #111; border: 1px solid #222; border-radius: 10px;
  min-width: 160px; z-index: 200; overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.sort-menu.open { display: block; }
.sort-item {
  padding: 9px 14px; font-size: 12px; color: #666; cursor: pointer;
  transition: background .12s; border-bottom: 1px solid #1a1a1a;
}
.sort-item:last-child { border-bottom: none; }
.sort-item:hover { background: #1a1a1a; color: #fff; }
.sort-item.active { color: #16a34a; font-weight: 600; }
.badge-mundial { position:absolute; top:7px; left:7px; background:#f59e0b; color:#000; font-size:9px; font-weight:800; padding:2px 7px; border-radius:4px; z-index:2; }
/* ── Navegación por categorías ── */
.cat-nav {
  background: #1a1a1a; padding: 8px 20px;
  overflow-x: auto; white-space: nowrap;
  scrollbar-width: none; -ms-overflow-style: none;
  display: flex; gap: 6px; align-items: center;
}
.cat-nav::-webkit-scrollbar { display: none; }
.cat-pill {
  display: inline-block; padding: 5px 14px; border-radius: 999px;
  font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
  background: #2a2a2a; color: #aaa; border: 1px solid #333; transition: all .15s;
}
.cat-pill:hover { background: #333; color: #fff; }
.cat-pill.active { background: #f59e0b; color: #111; border-color: #f59e0b; }

/* ── Sección destacados ── */
/* ── Carrusel de novedades ── */
.novedades-wrap {
  background: linear-gradient(135deg, #0f2015 0%, #1a1a2e 100%);
  padding: 16px 0 16px 20px; margin-bottom: 12px; border-radius: 16px; overflow: hidden;
}
.novedades-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-right: 20px; }
.novedades-titulo { color: #f59e0b; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
.novedades-nav { display: flex; gap: 6px; }
.nov-btn {
  background: rgba(255,255,255,.1); border: none; color: #fff;
  width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 18px;
  display: flex; align-items: center; justify-content: center; transition: background .15s;
  -webkit-tap-highlight-color: transparent;
}
.nov-btn:active { background: rgba(255,255,255,.3); }
.novedades-slider-outer {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, black 85%, transparent);
  mask-image: linear-gradient(to right, black 85%, transparent);
}
.novedades-slider {
  display: flex; gap: 12px;
  width: max-content;
  animation: novScroll 50s linear infinite;
  touch-action: pan-y;
}
.novedades-slider:hover { animation-play-state: paused; }
.novedades-slider .card { flex: 0 0 155px; min-width: 155px; }
@keyframes novScroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@media (max-width: 480px) {
  .novedades-wrap { padding: 14px 0 14px 16px; }
  .novedades-slider .card { flex: 0 0 140px; min-width: 140px; }
}

.destacados-wrap {
  background: #003087;
  padding: 0; margin-bottom: 8px;
  border-radius: 16px; overflow: hidden;
  position: relative;
}
.destacados-wrap::before {
  content: "";
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    90deg,
    rgba(255,255,255,.03) 0px, rgba(255,255,255,.03) 20%,
    transparent 20%, transparent 40%
  );
  pointer-events: none;
}
.destacados-header {
  background: #75AADB;
  padding: 10px 16px 9px;
  display: flex; align-items: center; justify-content: space-between;
}
.destacados-titulo {
  color: #003087; font-size: 12px; font-weight: 800;
  letter-spacing: .5px; text-transform: uppercase;
  display: flex; align-items: center; gap: 6px;
}
.destacados-titulo .dest-stars { color: #F7B731; font-size: 12px; letter-spacing: 2px; }
.destacados-sub { color: #003087; font-size: 10px; opacity: .7; }
.destacados-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
  gap: 10px; padding: 14px;
}
.destacados-grid .card { box-shadow: 0 4px 16px rgba(0,0,0,.3); }

/* ── Sin resultados ── */
.no-results { text-align: center; color: #aaa; padding: 40px; font-size: 14px; display: none; }

/* ── Botón flotante carrito ── */
#cartFab {
  position: fixed; right: 18px; bottom: 18px; z-index: 200;
  background: #111; color: #fff; border: none; border-radius: 999px;
  padding: 14px 20px; cursor: pointer; font-size: 15px; font-weight: 700;
  box-shadow: 0 4px 20px rgba(0,0,0,.35);
  display: flex; align-items: center; gap: 8px;
  transition: transform .15s, background .15s;
}
#cartFab:hover { background: #222; transform: scale(1.04); }
#cartFab .fab-icon { font-size: 18px; }
#cartCount {
  background: #f59e0b; color: #111; font-size: 11px; font-weight: 800;
  border-radius: 999px; padding: 1px 7px; min-width: 20px; text-align: center;
}

/* ── Panel del carrito ── */
#cartPanel {
  position: fixed; right: 18px; bottom: 80px;
  width: 370px; max-width: calc(100vw - 20px);
  background: #fff; border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
  z-index: 201; display: none; flex-direction: column; overflow: hidden;
  animation: slideUp .2s ease;
}
@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
.cart-header { background: #111; color: #fff; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; }
.cart-header h3 { font-size: 15px; font-weight: 700; }
.cart-close { background: none; border: none; color: #aaa; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px; }
.cart-close:hover { color: #fff; }
#cartItems { max-height: 340px; overflow-y: auto; padding: 12px 16px; }
.cart-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.cart-item:last-child { border-bottom: none; }
.cart-item-info { flex: 1; min-width: 0; }
.cart-item-name { font-size: 12px; font-weight: 600; color: #222; line-height: 1.3; word-break: break-word; }
.cart-item-unit { font-size: 11px; color: #999; margin-top: 2px; }
.cart-item-subtotal { font-size: 13px; font-weight: 700; color: #16a34a; margin-top: 3px; }
.cart-qty { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-top: 2px; }
.qty-btn {
  width: 26px; height: 26px; border-radius: 50%; border: 1px solid #e0e0e0;
  background: #f5f5f5; cursor: pointer; font-size: 16px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; color: #444; transition: background .1s;
}
.qty-btn:hover { background: #e0e0e0; }
.qty-num { font-size: 13px; font-weight: 700; min-width: 18px; text-align: center; }
.qty-del { font-size: 13px; color: #e44; cursor: pointer; padding: 2px 4px; background: none; border: none; }
.qty-del:hover { color: #c00; }
.cart-empty { text-align: center; color: #aaa; padding: 32px 16px; font-size: 14px; }
.cart-footer { padding: 12px 16px; border-top: 1px solid #f0f0f0; background: #fafafa; }
.cart-total-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.cart-total-label { font-size: 13px; color: #666; }
#cartTotal { font-size: 20px; font-weight: 800; color: #16a34a; }
.cart-actions { display: flex; gap: 8px; }
#btnCheckout {
  flex: 1; background: #111; color: #fff; border: none;
  padding: 11px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; gap: 6px; transition: background .15s;
}
#btnCheckout:hover { background: #333; }
#clearCart { background: #f0f0f0; color: #666; border: none; padding: 11px 14px; border-radius: 10px; cursor: pointer; font-size: 13px; transition: background .15s; }
#clearCart:hover { background: #e0e0e0; }

/* ── Footer ── */
footer { text-align: center; font-size: 12px; color: #aaa; padding: 24px; }

/* ── Modal checkout ── */
.modal-overlay { display: none; position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,.6); backdrop-filter: blur(3px); align-items: center; justify-content: center; padding: 16px; }
.modal-overlay.open { display: flex; }
.modal { background: #fff; border-radius: 20px; width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,.35); animation: popIn .2s ease; }
@keyframes popIn { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:scale(1); } }
.modal-header { background: #111; color: #fff; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-radius: 20px 20px 0 0; position: sticky; top: 0; z-index: 1; }
.modal-header h3 { font-size: 15px; font-weight: 700; }
.modal-close { background: none; border: none; color: #aaa; font-size: 24px; cursor: pointer; line-height: 1; padding: 0 4px; }
.modal-close:hover { color: #fff; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
.steps { display: flex; align-items: center; gap: 0; margin-bottom: 4px; }
.step { flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: #bbb; padding: 6px 4px; border-bottom: 3px solid #eee; transition: color .2s, border-color .2s; }
.step.active { color: #111; border-color: #f59e0b; }
.step.done { color: #16a34a; border-color: #16a34a; }
.checkout-section { display: none; flex-direction: column; gap: 16px; }
.checkout-section.visible { display: flex; }
.order-summary { background: #f9f9f9; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.order-summary-title { font-size: 12px; font-weight: 700; color: #555; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .5px; }
.order-line { display: flex; justify-content: space-between; font-size: 13px; color: #333; }
.order-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: #111; border-top: 1px solid #e0e0e0; padding-top: 8px; margin-top: 4px; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-label { font-size: 12px; font-weight: 600; color: #444; }
.form-input, .form-select, .form-textarea { border: 1.5px solid #e0e0e0; border-radius: 10px; padding: 10px 13px; font-size: 14px; color: #111; background: #fff; outline: none; transition: border-color .15s; font-family: inherit; }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #f59e0b; }
.form-input.error, .form-select.error { border-color: #e44; }
.form-error { font-size: 11px; color: #e44; display: none; }
.form-error.visible { display: block; }
.form-textarea { resize: vertical; min-height: 70px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.delivery-toggle { display: flex; gap: 8px; }
.toggle-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1.5px solid #e0e0e0; background: #fff; cursor: pointer; font-size: 13px; font-weight: 600; color: #666; transition: all .15s; text-align: center; }
.toggle-btn.selected { border-color: #f59e0b; background: #fffbeb; color: #111; }
.bank-card { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 20px; color: #fff; }
.bank-card-title { font-size: 11px; color: #aaa; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
.bank-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.bank-label { font-size: 11px; color: #aaa; }
.bank-value { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
.copy-btn { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #fff; border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer; transition: background .15s; }
.copy-btn:hover { background: rgba(255,255,255,.2); }
.total-destacado { background: #f59e0b; color: #111; border-radius: 10px; padding: 12px 16px; text-align: center; margin-top: 4px; }
.total-destacado .label { font-size: 11px; font-weight: 600; }
.total-destacado .monto { font-size: 24px; font-weight: 800; }
.btn-next { background: #111; color: #fff; border: none; padding: 13px; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700; width: 100%; transition: background .15s; }
.btn-next:hover { background: #333; }
.btn-next:disabled { background: #ccc; cursor: default; }
.btn-back { background: transparent; color: #666; border: none; padding: 8px; cursor: pointer; font-size: 13px; text-align: center; width: 100%; }
.btn-back:hover { color: #111; }
.confirm-box { text-align: center; padding: 20px 10px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.confirm-icon { font-size: 56px; }
.confirm-title { font-size: 20px; font-weight: 800; color: #111; }
.confirm-sub { font-size: 14px; color: #666; line-height: 1.5; }
.confirm-wa { background: #25D366; color: #fff; border: none; padding: 13px 24px; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .15s; }
.confirm-wa:hover { background: #1ebe5d; }

/* ── Simulador de crédito en modal ── */
.credito-toggle {
  width: 100%; background: #fffbeb; border: 1px solid #f59e0b;
  border-radius: 10px; padding: 11px 14px;
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; font-size: 13px; font-weight: 700; color: #854F0B;
  margin-top: 8px; transition: background .15s;
}
.credito-toggle:hover { background: #fef3c7; }
.credito-toggle .arrow { transition: transform .2s; }
.credito-toggle.open .arrow { transform: rotate(180deg); }
.credito-body {
  display: none; border: 1px solid #f0e0b0; border-top: none;
  border-radius: 0 0 10px 10px; padding: 14px; background: #fff;
  margin-top: -6px;
}
.credito-body.open { display: block; }
.credito-nota { font-size: 11px; color: #aaa; margin-bottom: 10px; line-height: 1.5; }
.credito-anticipo-wrap { margin-bottom: 12px; }
.credito-anticipo-label { font-size: 12px; color: #555; margin-bottom: 4px; display: flex; justify-content: space-between; }
.credito-anticipo-label span { font-weight: 700; color: #111; }
.credito-cuotas { display: flex; gap: 8px; margin-bottom: 12px; }
.credito-cuota-btn {
  flex: 1; border: 1px solid #ddd; border-radius: 10px;
  padding: 10px 6px; background: #fff; cursor: pointer;
  font-size: 12px; text-align: center; transition: all .15s;
  -webkit-tap-highlight-color: transparent;
}
.credito-cuota-btn.active { border: 2px solid #f59e0b; background: #fffbeb; }
.credito-cuota-monto { font-size: 15px; font-weight: 800; color: #111; }
.credito-cuota-label { font-size: 11px; color: #888; margin-top: 2px; }
.credito-resumen {
  background: #f9f9f9; border-radius: 10px; padding: 10px 12px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;
}
.credito-metrica-label { font-size: 10px; color: #888; }
.credito-metrica-valor { font-size: 13px; font-weight: 700; color: #111; }
.credito-cuadro { font-size: 11px; margin-bottom: 10px; overflow-x: auto; }
.credito-cuadro table { width: 100%; border-collapse: collapse; }
.credito-cuadro th { color: #aaa; padding: 3px 6px; text-align: right; font-weight: 500; }
.credito-cuadro th:first-child { text-align: left; }
.credito-cuadro td { padding: 4px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
.credito-cuadro td:first-child { text-align: left; color: #888; }
.credito-wa {
  width: 100%; background: #25D366; color: #fff; border: none;
  padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  -webkit-tap-highlight-color: transparent;
}
#btnAyuda {
  position: fixed; right: 18px; bottom: 80px; z-index: 198;
  background: #f59e0b; color: #111; border: none;
  border-radius: 999px; padding: 10px 16px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,.3);
  display: flex; align-items: center; gap: 6px;
  transition: background .15s, transform .15s;
}
#btnAyuda:hover { background: #fbbf24; transform: scale(1.04); }

.ayuda-overlay {
  display: none; position: fixed; inset: 0; z-index: 450;
  background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
  align-items: center; justify-content: center; padding: 16px;
}
.ayuda-overlay.open { display: flex; }
.ayuda-modal {
  background: #fff; border-radius: 20px;
  width: 100%; max-width: 480px; max-height: 90vh;
  overflow-y: auto; padding: 24px;
  box-shadow: 0 24px 60px rgba(0,0,0,.35);
  animation: popIn .2s ease;
}
.ayuda-modal h2 {
  font-size: 18px; font-weight: 800; color: #111;
  margin: 0 0 20px; text-align: center;
}
.ayuda-pasos { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.ayuda-paso {
  display: flex; align-items: flex-start; gap: 14px;
  background: #f9f9f9; border-radius: 12px; padding: 14px;
}
.ayuda-num {
  width: 32px; height: 32px; border-radius: 50%;
  background: #111; color: #fff; font-weight: 800; font-size: 14px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ayuda-paso-txt { flex: 1; }
.ayuda-paso-titulo { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 2px; }
.ayuda-paso-desc  { font-size: 12px; color: #666; line-height: 1.5; }
.ayuda-desc-box {
  background: #fffbeb; border: 1px solid #f59e0b;
  border-radius: 10px; padding: 12px; font-size: 12px;
  color: #555; line-height: 1.6; margin-bottom: 16px;
}
.ayuda-close-btn {
  width: 100%; background: #111; color: #fff; border: none;
  padding: 14px; border-radius: 12px; font-size: 15px;
  font-weight: 700; cursor: pointer; transition: background .15s;
}
.ayuda-close-btn:hover { background: #333; }


#ultimaCompra {
  position: fixed; bottom: 90px; left: 18px; z-index: 199;
  background: #fff; border-radius: 12px; padding: 12px 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,.15);
  max-width: 280px; display: none;
  animation: slideInLeft .4s ease;
  border-left: 4px solid #16a34a;
}
@keyframes slideInLeft { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
.uc-title { font-size: 12px; font-weight: 700; color: #111; }
.uc-sub   { font-size: 11px; color: #888; margin-top: 2px; }
.uc-close { position: absolute; top: 6px; right: 8px; background: none; border: none; color: #ccc; cursor: pointer; font-size: 16px; }

/* ── Badge stock bajo en card ── */
.badge-stock-alto  { position:absolute;bottom:8px;left:8px;background:rgba(22,163,74,.85);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;backdrop-filter:blur(4px); }
.badge-stock-medio { position:absolute;bottom:8px;left:8px;background:rgba(245,158,11,.9);color:#111;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;backdrop-filter:blur(4px); }
.badge-stock-bajo  { position:absolute;bottom:8px;left:8px;background:rgba(228,68,68,.9);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;backdrop-filter:blur(4px); }
.badge-stock-agotado { position:absolute;bottom:8px;left:8px;background:rgba(80,80,80,.9);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;backdrop-filter:blur(4px); }

/* ── Badge vistas en card ── */
.badge-vistas {
  position: absolute; bottom: 8px; right: 8px;
  background: rgba(0,0,0,.55); color: #fff;
  font-size: 9px; padding: 2px 6px; border-radius: 4px;
  backdrop-filter: blur(4px);
}
.prod-overlay {
  display: none; position: fixed; inset: 0; z-index: 400;
  background: rgba(0,0,0,.82); backdrop-filter: blur(4px);
  align-items: center; justify-content: center; padding: 16px;
}
.prod-overlay.open { display: flex; }
.prod-modal {
  background: #111; border-radius: 20px; width: 100%; max-width: 480px;
  max-height: 92vh; overflow-y: auto; overflow-x: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,.7);
  animation: popIn .2s ease; display: flex; flex-direction: column;
}
@media (max-width: 480px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .prod-modal {
    border-radius: 20px 20px 0 0; max-height: 93vh;
    animation: slideUp .25s ease;
  }
  @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
}
.prod-img-wrap {
  width: 100%; aspect-ratio: 1; background: #1a1a1a;
  display: flex; align-items: center; justify-content: center;
  border-radius: 20px 20px 0 0; overflow: hidden; flex-shrink: 0;
  position: relative;
}
.prod-img-wrap img { width: 100%; height: 100%; object-fit: contain; padding: 20px; }
.prod-img-placeholder { font-size: 56px; color: #333; }
.prod-close {
  position: absolute; top: 12px; right: 12px;
  background: rgba(0,0,0,.6); color: #fff; border: none;
  width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
  font-size: 18px; display: flex; align-items: center; justify-content: center;
}
.prod-close:hover { background: rgba(0,0,0,.9); }
.prod-body { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.prod-nombre { font-size: 16px; font-weight: 700; color: #fff; line-height: 1.35; }
.prod-precios { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.prod-precio-transf { font-size: 28px; font-weight: 800; color: #fff; }
.prod-precio-mp { font-size: 12px; color: #444; background: #1a1a1a; padding: 3px 8px; border-radius: 6px; }
.prod-precio-mp s { text-decoration: line-through; color: #444; }
.prod-precio-label { font-size: 11px; color: #16a34a; font-weight: 600; }
.prod-desc {
  font-size: 13px; color: #666; line-height: 1.6;
  max-height: 100px; overflow-y: auto;
  border-top: 1px solid #1a1a1a; padding-top: 10px;
}
.prod-desc-loading { color: #444; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.prod-desc-loading::before { content: ""; width: 14px; height: 14px; border: 2px solid #333; border-top-color: #16a34a; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.prod-actions { display: flex; gap: 8px; margin-top: 8px; padding-top: 14px; padding-bottom: 8px; border-top: 1px solid #1a1a1a; }
.prod-add { flex: 1; background: #fff; color: #111; border: none; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700; transition: background .15s; }
.prod-add:hover { background: #16a34a; color: #fff; }
.prod-share { background: #1a1a1a; color: #555; border: 1px solid #222; padding: 14px 16px; border-radius: 12px; cursor: pointer; font-size: 16px; transition: background .15s; text-decoration: none; display: flex; align-items: center; }
.prod-share:hover { background: #25D366; color: #fff; border-color: #25D366; }

/* ── Botón volver arriba ── */
#btnTop {
  position: fixed; left: 18px; bottom: 18px; z-index: 200;
  background: #111; color: #fff; border: none; border-radius: 999px;
  width: 44px; height: 44px; cursor: pointer; font-size: 18px;
  box-shadow: 0 4px 16px rgba(0,0,0,.3);
  display: none; align-items: center; justify-content: center;
  transition: background .15s, opacity .2s;
}
#btnTop:hover { background: #333; }
#btnTop.visible { display: flex; }

/* ── Sticky nav al hacer scroll ── */
.sticky-nav {
  position: sticky; top: 0; z-index: 99;
  background: #1a1a1a; padding: 8px 20px;
  overflow-x: auto; white-space: nowrap;
  scrollbar-width: none; display: flex; gap: 6px; align-items: center;
}
.sticky-search {
  position: sticky; top: 0; z-index: 98;
  background: #1a1a1a; padding: 8px 20px;
}
.sticky-search input {
  width: 100%; max-width: 520px; display: block; margin: 0 auto;
  padding: 9px 16px; border-radius: 8px; border: none;
  font-size: 14px; background: #2a2a2a; color: #fff; outline: none;
}
.sticky-search input::placeholder { color: #555; }

/* ── Sección más vistos ── */
.masvistos-wrap {
  background: linear-gradient(135deg, #1a1a2e 0%, #0f2015 100%);
  padding: 20px; margin-bottom: 8px;
}
.masvistos-titulo {
  color: #f59e0b; font-size: 11px; font-weight: 800;
  letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.masvistos-titulo::after { content: ""; flex: 1; height: 1px; background: rgba(245,158,11,.3); }
.geo-btn {
  width: 100%; padding: 11px; border-radius: 10px;
  border: 1.5px dashed #f59e0b; background: #fffbeb; color: #111;
  font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background .15s;
}
.geo-btn:hover { background: #fef3c7; }
.geo-btn:disabled { opacity: .5; cursor: default; }
.zona-detected {
  background: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 10px;
  padding: 12px 14px; display: flex; align-items: center; gap: 10px;
}
.zona-detected .zona-icon { font-size: 20px; }
.zona-detected .zona-info { flex: 1; }
.zona-detected .zona-nombre { font-size: 13px; font-weight: 700; color: #16a34a; }
.zona-detected .zona-costo { font-size: 12px; color: #555; margin-top: 2px; }
.zona-detected .zona-reset { background: none; border: none; color: #aaa; cursor: pointer; font-size: 18px; }
.envio-costo-box {
  background: #f9f9f9; border-radius: 10px; padding: 12px 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.envio-costo-label { font-size: 13px; color: #555; }
.envio-costo-valor { font-size: 16px; font-weight: 800; color: #16a34a; }
.envio-costo-valor.pago { color: #e44; }
.envio-free-badge {
  background: #16a34a; color: #fff; font-size: 10px; font-weight: 700;
  padding: 2px 8px; border-radius: 4px; margin-left: 8px;
}

/* ── Pago — métodos ── */
.pago-opciones { display: flex; flex-direction: column; gap: 10px; }
.pago-opcion {
  border: 1.5px solid #e0e0e0; border-radius: 12px; padding: 14px;
  cursor: pointer; transition: all .15s; display: flex; align-items: flex-start; gap: 12px;
}
.pago-opcion:hover { border-color: #f59e0b; background: #fffbeb; }
.pago-opcion.selected { border-color: #f59e0b; background: #fffbeb; }
.pago-opcion input[type=radio] { margin-top: 3px; accent-color: #f59e0b; flex-shrink: 0; }
.pago-opcion-body { flex: 1; }
.pago-opcion-title { font-size: 14px; font-weight: 700; color: #111; }
.pago-opcion-desc { font-size: 12px; color: #666; margin-top: 3px; line-height: 1.4; }
.pago-opcion-precio {
  font-size: 18px; font-weight: 800; color: #16a34a;
  margin-top: 6px;
}
.pago-opcion-ahorro {
  font-size: 11px; color: #16a34a; font-weight: 600;
  background: #f0fdf4; padding: 2px 8px; border-radius: 4px;
  display: inline-block; margin-top: 4px;
}
.pago-opcion-recargo {
  font-size: 11px; color: #888; margin-top: 4px;
}
.btn-mp {
  background: #009ee3; color: #fff; border: none;
  padding: 13px; border-radius: 12px; cursor: pointer;
  font-size: 15px; font-weight: 700; width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background .15s; text-decoration: none;
}
.btn-mp:hover { background: #0080c0; }
.resumen-final {
  background: #f9f9f9; border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.resumen-linea { display: flex; justify-content: space-between; font-size: 13px; color: #555; }
.resumen-linea.descuento { color: #16a34a; font-weight: 600; }
.resumen-linea.envio { color: #555; }
.resumen-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; color: #111; border-top: 1px solid #e0e0e0; padding-top: 10px; margin-top: 4px; }

/* ── Print ── */
@media print {
  header, .search-bar, #cartFab, #cartPanel, .modal-overlay { display: none !important; }
  .card-actions .add-btn { display: none; }
  main { padding-bottom: 0; }
}

/* ── Mobile ── */
@media (max-width: 480px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 8px; }
  #cartPanel { right: 8px; bottom: 78px; width: calc(100vw - 16px); }
  .form-row { grid-template-columns: 1fr; }
}
`;
  fs.writeFileSync(path.join(path.dirname(OUT_HTML), "catalogo.css"), css, "utf8");
}

// ── Escribir catalogo.js ──────────────────────────────────────────────────────
function escribirJS(phone) {
  const js = getCartJS(phone) + "\n" + getSearchJS();
  fs.writeFileSync(path.join(path.dirname(OUT_HTML), "catalogo.js"), js, "utf8");
}

// ── JS del carrito + checkout ─────────────────────────────────────────────────
function getCartJS(phone) {
  return `
const CART_PHONE = "${phone}";

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
let compraDirectaActiva = false;
let carritoAnteriorCompraDirecta = [];
let pedidoConfirmado = false;

function saveCart() { sessionStorage.setItem("jrCart", JSON.stringify(cart)); renderCart(); }

function comprarAhora(btn) {
  carritoAnteriorCompraDirecta = cart.map(function(item) {
    return Object.assign({}, item);
  });

  compraDirectaActiva = true;
  pedidoConfirmado = false;

  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const price = Number(btn.dataset.price) || 0;
  const href = btn.dataset.href;
  const fuente = btn.dataset.fuente || "";
  const precioBase = Number(btn.dataset.precioBase) || 0;
  const key = id + "|" + href;

  cart = [{
    key: key,
    id: id,
    name: name,
    price: price,
    href: href,
    fuente: fuente,
    precioBase: precioBase,
    qty: 1
  }];

  saveCart();

  const panel = document.getElementById("cartPanel");

  if (panel) {
    panel.style.display = "none";
  }

  abrirCheckout();
}

function addToCartFromBtn(btn) {
  const { id, name, price, href, fuente } = btn.dataset;
  const precioBase = parseFloat(btn.dataset.precioBase || 0);
  const key = id + "|" + href;

  const found = cart.find(i => i.key === key);

  if (found) {
    found.qty++;
  } else {
    cart.push({
      key,
      id,
      name,
      price: parseFloat(price) || 0,
      href,
      fuente: fuente || "",
      precioBase,
      qty: 1
    });
  }

  saveCart();

  const textoOriginal = btn.dataset.textoOriginal || btn.innerHTML;
  btn.dataset.textoOriginal = textoOriginal;

  btn.innerHTML = "✓";
  btn.style.background = "#16a34a";
  btn.style.color = "#fff";

  setTimeout(function() {
    btn.innerHTML = textoOriginal;
    btn.style.background = "";
    btn.style.color = "";
  }, 1200);
}



function changeQty(key, delta) {
  const it = cart.find(i => i.key === key);
  if (!it) return;
  it.qty = Math.max(0, it.qty + delta);
  cart = cart.filter(i => i.qty > 0);
  saveCart();
}

function removeItem(key) { cart = cart.filter(i => i.key !== key); saveCart(); }
function limpiarTextoCliente(str) {
  return String(str || "")
    .replace(/Â½/g, "½").replace(/Â¼/g, "¼").replace(/Â¾/g, "¾")
    .replace(/Â°/g, "°").replace(/Â·/g, "·").replace(/Âº/g, "º")
    .replace(/Ã±/g, "ñ").replace(/Ã\u0091/g, "Ñ")
    .replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó").replace(/Ãº/g, "ú")
    .replace(/Ã\u0081/g, "Á").replace(/Ã\u0089/g, "É")
    .replace(/Ã\u008D/g, "Í").replace(/Ã\u0093/g, "Ó").replace(/Ã\u009A/g, "Ú")
    .replace(/Â[^\s\w]/g, "").replace(/Ã[^\s\w]/g, "")
    .replace(/\s+/g, " ").trim();
}

function fmt(v) { return "$ " + Math.round(v).toLocaleString("es-AR"); }

function obtenerPrecioUnitario(item) {
  return Number(
    item.precio_unitario ??
    item.precio_unit ??
    item.precio ??
    0
  ) || 0;
}

function obtenerSubtotalItem(item) {
  const subtotalGuardado = Number(
    item.subtotal ??
    item.total_item ??
    0
  ) || 0;

  if (subtotalGuardado > 0) {
    return subtotalGuardado;
  }

  const precio = obtenerPrecioUnitario(item);
  const cantidad = Number(item.cantidad) || 1;

  return precio * cantidad;
}

function obtenerTotalPedido(data) {
  const totalGuardado = Number(
    data.total ??
    data.monto_total ??
    data.total_pedido ??
    0
  ) || 0;

  if (totalGuardado > 0) {
    return totalGuardado;
  }

  const subtotalProductos = (data.items || []).reduce(function(acumulado, item) {
    return acumulado + obtenerSubtotalItem(item);
  }, 0);

  const costoEnvio = Number(data.costo_envio || 0) || 0;

  return subtotalProductos + costoEnvio;
}

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
      return \`
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">\${ii.name}</div>
          <div class="cart-item-unit">
            <s>\${fmt(ii.price)}</s> → <span style="color:#16a34a;font-weight:700">\${fmt(precioDesc)}</span> c/u
            <span style="color:#16a34a;font-size:10px">(\${pctI}% off transf.)</span>
          </div>
          <div class="cart-item-subtotal">\${fmt(ii.price * ii.qty)}</div>
        </div>
        <div>
          <div class="cart-qty">
            <button class="qty-btn" onclick="changeQty('\${ii.key}',-1)">−</button>
            <span class="qty-num">\${ii.qty}</span>
            <button class="qty-btn" onclick="changeQty('\${ii.key}',+1)">+</button>
            <button class="qty-del" onclick="removeItem('\${ii.key}')" title="Eliminar">✕</button>
          </div>
        </div>
      </div>\`;
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
  const lineas = cart.map(i => \`  • \${i.qty}x \${i.name}  =>  \${fmt(i.price*i.qty)}\`).join("\\n");
  const total  = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const msg    = [
    "*Lista de productos - JR Soluciones Informáticas*",
    "",
    lineas,
    "",
    \`*Total aprox: \${fmt(total)}* (pagando con transferencia)\`,
    "",
    "Ver catálogo completo:",
    "https://www.jrshop.com.ar/"
  ].join("\\n");
  window.open("https://wa.me/543812235528?text="+encodeURIComponent(msg),"_blank");
});

document.getElementById("btnCheckout").addEventListener("click", () => {
  if (!cart.length) {
    alert("El carrito está vacío");
    return;
  }

  // Este proceso viene desde el carrito normal.
  compraDirectaActiva = false;
  carritoAnteriorCompraDirecta = null;
  pedidoConfirmado = false;

  document.getElementById("cartPanel").style.display = "none";
  abrirCheckout();
});

// ── Checkout ──
let currentStep = 1;

function tokenizar(nombre) {
  return nombre.toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ\s]/gi,"").split(/\s+/)
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
  div.innerHTML = \`
    \${p.imgUrl ? \`<img src="\${p.imgUrl}" alt="\${p.name}" onerror="this.style.display='none'">\` : \`<div style="width:44px;height:44px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>\`}
    <div class="sug-card-info">
      <div class="sug-card-name">\${p.name}</div>
      <div class="sug-card-precio">\${fmt(p.precio)}</div>
      <div class="sug-card-tag">\${p.fuente === "DAZ Importadora" ? "Mismo proveedor" : "✓ Disponible desde 1 unidad"}</div>
    </div>
    <button class="sug-add" onclick="agregarDesdeIndice('\${p.id}')">+ Agregar</button>\`;
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
  warnEl.innerHTML = \`Algunos artículos de tu pedido requieren un mínimo de compra combinado.<br>
    <strong>Te faltan \${fmt(falta)} en artículos de esta línea</strong> para poder procesar el pedido.<br>
    Podés agregar más artículos o ver alternativas disponibles desde 1 unidad.\`;

  // Sugerencias por producto DAZ
  const sugEl = document.getElementById("dazSugerencias");
  sugEl.innerHTML = "";
  itemsDAZ.forEach(item => {
    const equiv = buscarEquivalenteXimaro(item.name);
    if (equiv.length) {
      const sec = document.createElement("div");
      sec.innerHTML = \`<div style="font-size:11px;font-weight:700;color:#555;margin:8px 0 4px;text-transform:uppercase;letter-spacing:.5px">Alternativa disponible para "\${item.name}"</div>\`;
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
  if (btnEnviar) { btnEnviar.disabled=true; btnEnviar.style.opacity=".4"; btnEnviar.style.cursor="default"; btnEnviar.textContent="Confirmar pedido"; }
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

  if (compraDirectaActiva && !pedidoConfirmado) {
    cart = carritoAnteriorCompraDirecta.map(function(item) {
      return Object.assign({}, item);
    });

    saveCart();
  }

  compraDirectaActiva = false;
  carritoAnteriorCompraDirecta = [];
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
    \`<div class="order-line"><span>\${i.qty}x \${i.name}</span><span>\${fmt(i.price*i.qty)}</span></div>\`
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
  const distTexto = kmDetectado ? \` · \${Math.round(kmDetectado)} km\` : "";
  let minimoTxt = "";
  if (!gratis && zona.freeDesde) {
    const falta = zona.freeDesde - total;
    minimoTxt = \`<div style="font-size:11px;color:#888;margin-top:4px">Agregá \${fmt(falta)} más para envío gratis</div>\`;
  }
  const zonaRes = document.getElementById("zonaResult");
  zonaRes.style.display = "block";
  zonaRes.innerHTML = \`
    <div class="zona-detected">
      <div class="zona-icon">📍</div>
      <div class="zona-info">
        <div class="zona-nombre">\${zona.nombre}\${distTexto}</div>
        <div class="zona-costo">Envío: \${gratis ? "Gratis ✓" : fmt(costoEnvio)}</div>
        \${minimoTxt}
      </div>
      <button class="zona-reset" onclick="resetZona()" title="Cambiar">✕</button>
    </div>\`;
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
      const r = await fetch(\`https://nominatim.openstreetmap.org/reverse?lat=\${lat}&lon=\${lng}&format=json\`);
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
      '<span style="text-align:right"><s style=\"color:#bbb\">' + fmt(i.price*i.qty) + '</s><br>' +
      '<span style=\"color:#16a34a\">' + fmt(precI*i.qty) + ' (' + pctI + '% off)</span></span></div>';
  }).join("");

  document.getElementById("resumenFinal").innerHTML =
    lineasDetalle +
    '<div style="height:1px;background:#e0e0e0;margin:6px 0"></div>' +
    '<div class="resumen-linea"><span>Subtotal lista</span><span>' + fmt(subtotal) + '</span></div>' +
    '<div class="resumen-linea descuento"><span>Descuento transferencia (' + pctTexto + '%)</span><span style=\"color:#16a34a\">-' + fmt(descuento) + '</span></div>' +
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
      btn.textContent = "Confirmar pedido";
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
    const dni    = document.getElementById("inpDNI").value.replace(/[\.\-\s]/g,"").trim();
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
        .replace(/\u2033|\u02BA/g, '"')   // pulgadas tipográficas → comilla
        .replace(/[\u2018\u2019]/g, "'")  // comillas simples curvas
        .replace(/[\u201C\u201D]/g, '"')  // comillas dobles curvas
        .replace(/\uFFFD/g, '')           // caracter de reemplazo UTF-8
        .replace(/â[^\w\s]/gi, '"')       // artefacto â + símbolo = pulgadas mal codificadas
        .trim();
    }

    const comprobanteInput = document.getElementById("inpComprobante");
    const tieneComprobante = comprobanteInput && comprobanteInput.files && comprobanteInput.files.length > 0;
    const nombreComprobante = tieneComprobante ? comprobanteInput.files[0].name : "";

    const lineas = cart.map(i => \`  - \${i.qty}x \${limpiarTexto(i.name)}  =>  \${fmt(i.price*i.qty)}\`).join("\\n");
    const msg = [
      "*Nuevo pedido - JR Soluciones Informaticas*","",
      \`Cliente:  \${nombre}\`,\`DNI:      \${dni}\`,\`Telefono: \${tel}\`,\`Entrega:  \${direccion}\`,
      notas?\`Notas:    \${notas}\`:null,"",
      "*Productos:*", lineas,"",
      \`Subtotal: \${fmt(subtotal)}\`,
      costoEnvio>0?\`Envio:    \${fmt(costoEnvio)}\`:\`Envio:    Gratis\`,
      esMP?\`Metodo:   Mercado Pago / Tarjeta\`:\`Metodo:   Transferencia bancaria\`,
      \`*Total: \${fmt(totalFinal)}*\`,"",
      esMP
        ?"_El pago fue realizado por Mercado Pago._"
        :tieneComprobante
          ?"_Comprobante adjunto: " + nombreComprobante + " — Por favor adjuntalo en este chat._"
          :"_Por favor adjunta el comprobante de transferencia en este chat._"
    ].filter(l=>l!==null).join("\\n");

    window.open("https://wa.me/"+CART_PHONE+"?text="+encodeURIComponent(msg),"_blank");

    const filas = cart.map(i=>({
      fecha, cliente:nombre, dni, telefono:tel, producto:i.name,
      proveedor:i.fuente||"Catalogo", cantidad:i.qty,
      precio_unit:i.price, subtotal:i.price*i.qty,
      total:totalFinal, direccion, notas,
      metodo_pago:esMP?"Mercado Pago":"Transferencia",
      costo_envio:costoEnvio, estado:"Pendiente verificacion"
    }));
    registrarEnSheets(filas).then(function(nroPedido) {
      var linkTracking = nroPedido
        ? "https://www.jrshop.com.ar/seguimiento.html?pedido=" + nroPedido
        : null;
      var subHTML = esMP
        ? "Tu pedido fue registrado.<br>Total a pagar: <strong>" + fmt(totalFinal) + "</strong>"
        : "Tu pedido fue registrado.<br>Total a transferir: <strong>" + fmt(totalFinal) + "</strong>";
      document.getElementById("confirmSub").innerHTML = subHTML;

      if (linkTracking) {
        var linkEl = document.getElementById("confirmTracking");
        if (linkEl) {
          linkEl.style.display = "";
          linkEl.querySelector(".tracking-nro").textContent = nroPedido;
          linkEl.querySelector(".tracking-link").href = linkTracking;
          linkEl.querySelector(".tracking-link").textContent = linkTracking;
          linkEl.querySelector(".tracking-copy").onclick = function() {
            navigator.clipboard.writeText(linkTracking).then(function(){
              linkEl.querySelector(".tracking-copy").textContent = "Copiado!";
              setTimeout(function(){ linkEl.querySelector(".tracking-copy").textContent = "Copiar link"; }, 2000);
            });
          };
          linkEl.querySelector(".tracking-wa").onclick = function() {
            var msgWA = encodeURIComponent(
            "Hola " + nombre.split(" ")[0] + "! Tu pedido " + nroPedido + " fue registrado en JR Soluciones Informaticas.\\n\\n" +
            "Segui el estado de tu compra en:\\n" + linkTracking + "\\n\\n" +
            "Total: " + fmt(totalFinal) + "\\n" +
            "Nos contactaremos para coordinar pago y entrega."
          );
          window.open("https://wa.me/" + tel.replace(/\\D/g,"") + "?text=" + msgWA, "_blank");
          };
        }
      }
    }).catch(function(e){ console.error("Sheets:", e); });
    pedidoConfirmado = true;
    irAStep(5);
  } catch(err) {
    console.error("Error:",err); alert("Hubo un error. Intentá de nuevo.");
  } finally {
    btn.disabled=false; btn.textContent="Confirmar pedido";
  }
});

const API_URL   = "https://jrrailway-production.up.railway.app/pedido";
const API_TOKEN = "jrsoluciones2025";

async function registrarEnSheets(filas) {
  try {
    if (!Array.isArray(filas) || filas.length === 0) {
      console.error("No hay datos para registrar");
      return false;
    }

    const totalPedido = Number(filas[0].total) || 0;
    const costoEnvioPedido = Number(filas[0].costo_envio) || 0;

    const payload = {
      cliente: filas[0].cliente,
      dni: filas[0].dni,
      telefono: filas[0].telefono,
      direccion: filas[0].direccion,
      notas: filas[0].notas,

      total: totalPedido,
      monto_total: totalPedido,
      total_pedido: totalPedido,

      costo_envio: costoEnvioPedido,
      metodo_pago: filas[0].metodo_pago || "",

      items: filas.map(function(f) {
        const precio = Number(f.precio_unit) || 0;
        const cantidad = Number(f.cantidad) || 1;
        const subtotalItem = Number(f.subtotal) || precio * cantidad;

        return {
          producto: f.producto,
          proveedor: f.proveedor,
          cantidad: cantidad,

          precio_unit: precio,
          precio_unitario: precio,
          precio: precio,

          subtotal: subtotalItem,
          total_item: subtotalItem
        };
      })
    };

    console.log("Pedido enviado:", payload);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Token": API_TOKEN
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    console.log("Respuesta del servidor:", data);

    if (!data.ok) {
      console.error("API rechazó:", JSON.stringify(data));
      return false;
    }

    return data.nroPedido || false;

  } catch (e) {
    console.error("Error API:", e);
    return false;
  }
}



document.getElementById("btnConfirmClose").addEventListener("click", () => {
  pedidoConfirmado = true;

  document.getElementById("checkoutModal").classList.remove("open");

  cart = [];
  saveCart();

  compraDirectaActiva = false;
  carritoAnteriorCompraDirecta = null;
  pedidoConfirmado = false;
});
document.getElementById("checkoutModal").addEventListener("click", e => {
  if (e.target===document.getElementById("checkoutModal")) cerrarCheckout();
});
document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => irAStep(parseInt(btn.dataset.to)));
});

renderCart();
  `;
}



function getSearchJS() {
  return `
const searchInput = document.getElementById("buscarMobile")
  || document.getElementById("buscarDesktop");

// Sincronizar los 2 inputs de búsqueda (desktop y mobile)
["buscarMobile","buscarDesktop"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => {
    const q = el.value;
    ["buscarMobile","buscarDesktop"].forEach(sid => {
      const s = document.getElementById(sid);
      if (s && s !== el) s.value = q;
    });
    filtrar();
  });
});

const noResults = document.getElementById("noResults");
const allSections = Array.from(document.querySelectorAll("[data-section]"));
let catActiva     = "Todos";

function filtrarPorTermino(termino) {
  catActiva = "Todos";
  document.querySelectorAll(".cat-pill").forEach(function(p){ p.classList.remove("active"); });
  ["buscarDesktop","buscarMobile"].forEach(function(id){
    var inp = document.getElementById(id);
    if (inp) inp.value = termino;
  });
  filtrar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

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

  if (esTodos && _sortActual === "novedad") {
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

  // Función para ordenar las cards dentro de un grid
  function sortGrid(grid) {
    const cards = Array.from(grid.querySelectorAll(".card:not(.hidden)"));
    if (_sortActual === "novedad" || cards.length < 2) return;
    cards.sort(function(a, b) {
      const getPrice = function(c) {
        const txt = c.querySelector(".card-price")?.textContent || "0";
        return parseFloat(txt.replace(/[^0-9.]/g,"")) || 0;
      };
      const getNombre = function(c) {
        return c.querySelector(".card-name")?.textContent || "";
      };
      if (_sortActual === "precio-asc")  return getPrice(a) - getPrice(b);
      if (_sortActual === "precio-desc") return getPrice(b) - getPrice(a);
      if (_sortActual === "nombre")      return getNombre(a).localeCompare(getNombre(b));
      return 0;
    });
    cards.forEach(function(c){ grid.appendChild(c); });
  }

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
    if (n === 0) { sec.style.display = "none"; return; }
    sortGrid(sec.querySelector(".grid"));
  });

  if ((q || _sortActual !== "novedad") && catActiva === "Todos" && secRecientes) {
    secRecientes.style.display = "";
    const cards = secRecientes.querySelectorAll(".card");
    let n = 0;
    cards.forEach(card => {
      const name = card.querySelector(".card-name")?.textContent.toLowerCase() || "";
      const show = !q || name.includes(q);
      card.classList.toggle("hidden", !show);
      if (show) { visible++; n++; }
    });
    if (n === 0) secRecientes.style.display = "none";
    else sortGrid(secRecientes.querySelector(".grid"));
  }

  noResults.style.display = visible === 0 ? "block" : "none";
}

if (searchInput) searchInput.addEventListener("input", filtrar);

function getQuery() {
  return (document.getElementById("buscarDesktop") || document.getElementById("buscarMobile"))?.value.toLowerCase().trim() || "";
}

// Dropdown de categorías
var _sortActual = "novedad";

function toggleSortMenu() {
  var m = document.getElementById("sortMenu");
  if (m) m.classList.toggle("open");
  // Cerrar cat menu si está abierto
  var cm = document.getElementById("catDropdownMenu");
  if (cm) cm.classList.remove("open");
}

function ordenarPor(tipo, el) {
  _sortActual = tipo;
  document.querySelectorAll(".sort-item").forEach(function(i){ i.classList.remove("active"); });
  if (el) el.classList.add("active");
  document.getElementById("sortMenu").classList.remove("open");
  filtrar();
}

// Cerrar sort menu al hacer click fuera
document.addEventListener("click", function(e) {
  var sd = document.getElementById("sortDropdown");
  if (sd && !sd.contains(e.target)) {
    var m = document.getElementById("sortMenu");
    if (m) m.classList.remove("open");
  }
});

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

  document.getElementById("prodNombre").textContent = limpiarTextoCliente(p.name);
  document.getElementById("prodPrecioTransf").textContent = precioTexto;
  document.getElementById("prodPrecioMP").innerHTML       =
    'Sin descuento (tarjeta / Mercado Pago): <strong>' + fmtMV(p.precioCatalogo) + '</strong>';

  // Mostrar ahorro claro
  var ahorroEl = document.getElementById("prodAhorro");
  if (ahorroEl && p.precioCatalogo && p.precioConDesc) {
    var ahorro = p.precioCatalogo - p.precioConDesc;
    ahorroEl.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#166534;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:700">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + 'Ahorrás ' + fmtMV(ahorro) + ' (' + (p.pctIndTexto||5) + '% off) con transferencia'
      + '</span>';
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

// ── Destacados dinámicos — Mundial 2026 ──────────────────────────────────────
var PALABRAS_MUNDIAL = ["tv", "smart tv", "television", "televisor", "parlante", "speaker", "proyector", "tv box", "android box", "bandera", "gorro", "camiseta", "auricular", "soundbar"];

function esProductoMundial(nombre) {
  var n = nombre.toLowerCase();
  return PALABRAS_MUNDIAL.some(function(w) { return n.indexOf(w) >= 0; });
}

function renderDestacados() {
  var grid = document.getElementById("gridDestacados");
  if (!grid) return;

  var idx = window.CATALOGO_INDEX || [];
  if (!idx.length) return;

  var mv = {};
  try { mv = JSON.parse(sessionStorage.getItem("jrMasVistos")||"{}"); } catch(e){}

  var maxPrecio = Math.max.apply(null, idx.map(function(p){ return p.precio||0; }));

  // Primero productos mundialeros con más vistas o precio alto
  var mundiales = idx
    .filter(function(p){ return p.precio > 0 && esProductoMundial(p.name); })
    .map(function(p) {
      var vistas = mv[p.id] || 0;
      var pctP   = maxPrecio > 0 ? (p.precio / maxPrecio) : 0;
      return { p: p, score: vistas * 3 + pctP * 2 + 10 }; // bonus por ser mundialero
    })
    .sort(function(a,b){ return b.score - a.score; })
    .slice(0, 6)
    .map(function(x){ return x.p; });

  // Completar con los más vistos generales si hay menos de 8
  var resto = idx
    .filter(function(p){
      return p.precio > 0 && !esProductoMundial(p.name) &&
             !mundiales.find(function(m){ return m.id === p.id; });
    })
    .map(function(p) {
      var vistas = mv[p.id] || 0;
      var pctP   = maxPrecio > 0 ? (p.precio / maxPrecio) : 0;
      return { p: p, score: vistas * 3 + pctP * 2 };
    })
    .sort(function(a,b){ return b.score - a.score; })
    .slice(0, 8 - mundiales.length)
    .map(function(x){ return x.p; });

  // Si no hay nada mundialero, fallback a los más caros
  var scored = mundiales.concat(resto);
  if (!scored.length) {
    scored = idx
      .filter(function(p){ return p.precio > 0; })
      .sort(function(a,b){ return b.precio - a.precio; })
      .slice(0, 8);
  }

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
    var esMundial = esProductoMundial(p.name);
    var badge = esMundial
      ? '<span class="badge-mundial">⚽ Mundial</span>'
      : (vistas >= 5 ? '<span class="badge-vistas">' + vistas + ' vistas</span>' : '');
    return '<div class="card" data-prod="' + b64 + '" onclick="abrirProductoCard(this)" style="cursor:pointer">'
      + '<div class="card-img">'
      + (p.imgUrl ? '<img src="' + p.imgUrl + '" alt="' + p.name + '" loading="lazy" referrerpolicy="no-referrer">' : '<div class="no-img">📦</div>')
      + badge
      + '</div>'
      + '<div class="card-body">'
      + '<p class="card-name">' + limpiarTextoCliente(p.name) + '</p>'
      + '<p class="card-price-mp"><s>' + fmtMV(precioCatalogo) + '</s></p>'
      + '<p class="card-price">' + fmtMV(precioConDesc) + '</p>'
      + '<span class="card-badge-desc">' + pctInd + '% off con transferencia</span>'
      + '<div class="card-actions" onclick="event.stopPropagation()">'

+ '<button class="buy-btn" onclick="comprarAhora(this)"'
+ ' data-id="' + p.id + '"'
+ ' data-name="' + p.name + '"'
+ ' data-price="' + precioCatalogo + '"'
+ ' data-href="' + p.href + '"'
+ ' data-fuente="' + p.fuente + '"'
+ ' data-precio-base="' + p.precioBase + '">'
+ 'Comprar'
+ '</button>'

+ '<button class="add-btn" onclick="addToCartFromBtn(this)"'
+ ' data-id="' + p.id + '"'
+ ' data-name="' + p.name + '"'
+ ' data-price="' + precioCatalogo + '"'
+ ' data-href="' + p.href + '"'
+ ' data-fuente="' + p.fuente + '"'
+ ' data-precio-base="' + p.precioBase + '"'
+ ' title="Agregar al carrito">'

+ '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">'
+ '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>'
+ '</svg>'

+ '</button>'
+ '</div>'
+ '</div>'
+ '</div>';
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

  `;
}


function generarHTML(grupos, markupPct, logoB64, descripciones = {}) {
  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const total = Object.values(grupos).reduce((s, g) => s + g.items.length, 0);

  const fuentesSecciones = {};
  for (const [, g] of Object.entries(grupos)) {
    if (!fuentesSecciones[g.fuente]) fuentesSecciones[g.fuente] = [];
    fuentesSecciones[g.fuente].push(g);
  }

  // Constante mínimo DAZ (precio sin markup, lo que pagamos nosotros)
  const MINIMO_DAZ = 50000;

  // Índice de todos los productos para búsqueda de equivalentes en el cliente
  const todosProductos = Object.values(grupos).flatMap(g => g.items);
  const indiceProductos = todosProductos.map(p => ({
    id:         String(p.id ?? p.href),
    name:       p.name,
    fuente:     p.fuente,
    precio:     Math.round(p.list_price * (1 + MARKUP)),        // precio catálogo completo
    precioMin5: Math.round(p.list_price * (1 + MARKUP) * 0.95), // con 5% de descuento
    precioBase: p.list_price,
    imgUrl:     p.imgUrl || "",
    href:       p.href || "",
    stock:      p.stock || "alto",
  }));

  // Helper card
  function makeCard(p) {
    const precioCatalogo = Math.round(p.list_price * (1 + MARKUP));
    // Descuento individual según precio del producto
    const pctInd = precioCatalogo <= 20000  ? 0.05
                 : precioCatalogo <= 50000  ? 0.10
                 : precioCatalogo <= 100000 ? 0.15
                 : precioCatalogo <= 200000 ? 0.18
                 : 0.20;
    const precioConDesc  = Math.round(precioCatalogo * (1 - pctInd));
    const pctIndTexto    = Math.round(pctInd * 100);
    const esDaz          = p.fuente === "DAZ Importadora";
    const faltaDAZ       = esDaz ? Math.max(0, MINIMO_DAZ - p.list_price) : 0;
    const cantMinima     = esDaz && p.list_price > 0 ? Math.ceil(MINIMO_DAZ / p.list_price) : 0;

    const img = p.imgUrl
      ? `<img src="${escapeHtml(p.imgUrl)}" alt="${escapeHtml(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="no-img" style="display:none">📦</div>`
      : `<div class="no-img">📦</div>`;
    const safeId     = escapeHtml(String(p.id ?? p.href));
    const safeName   = escapeHtml(p.name);
    const safeHref   = escapeHtml(p.href || "#");
    const safeFuente = escapeHtml(p.fuente || "");
    const esNuevo    = (p._orden !== undefined && p._orden < 15);

    const stockMap  = {
      alto:    { cls: "badge-stock-alto",    txt: "En stock" },
      medio:   { cls: "badge-stock-medio",   txt: "Stock medio" },
      bajo:    { cls: "badge-stock-bajo",    txt: "Bajo stock" },
      agotado: { cls: "badge-stock-agotado", txt: "Agotado" },
    };
    const stockInfo  = stockMap[p.stock || "alto"] || stockMap.alto;
    const badgeStock = `<span class="${stockInfo.cls}">${stockInfo.txt}</span>`;
    const badgeMinimo = esDaz && faltaDAZ > 0
      ? `<span class="badge-minimo" title="Este articulo solo es válido para compra combinada">Art. compra combinada</span>`
      : "";

    // Unidades restantes (solo si bajo o hay número)
    const unidades = p.stock_qty > 0 && p.stock_qty <= 10
      ? `<span class="card-unidades">⚡ Quedan ${p.stock_qty} unidades</span>` : "";

    // Cuotas en card
    const cuota6 = Math.round(precioConDesc / 6);
    const cuotaInfo = precioConDesc >= 50000
      ? `<span class="card-cuotas">6 cuotas de ${formatPrecio(cuota6)}</span>` : "";

    const prodKey     = String(p.id ?? p.href);
    const descripcion = descripciones[prodKey] || "";
    const prodDataB64 = Buffer.from(JSON.stringify({
      id: String(p.id ?? p.href), name: p.name,
      href: p.href||"", imgUrl: p.imgUrl||"",
      precioCatalogo, precioConDesc, pctIndTexto,
      fuente: p.fuente||"", precioBase: p.list_price,
      descripcion
    })).toString("base64");

    return `<div class="card" data-prod="${prodDataB64}" onclick="abrirProductoCard(this)" style="cursor:pointer">
        <div class="card-img">
          ${img}
          ${esNuevo ? `<span class="badge-nuevo">Nuevo</span>` : ""}
          ${badgeStock}
          ${badgeMinimo}
        </div>
        <div class="card-body">
          <p class="card-name">${safeName}</p>
          <p class="card-price-mp"><s>${formatPrecio(precioCatalogo)}</s></p>
          <p class="card-price">${formatPrecio(precioConDesc)}</p>
          <span class="card-badge-desc">${pctIndTexto}% off con transferencia</span>
          ${cuotaInfo}
          ${unidades}
          <div class="card-actions" onclick="event.stopPropagation()">

        <button class="buy-btn"
          onclick="comprarAhora(this)"
          data-id="${safeId}"
          data-name="${safeName}"
          data-price="${precioCatalogo}"
          data-href="${safeHref}"
          data-fuente="${safeFuente}"
          data-precio-base="${p.list_price}">
          Comprar
        </button>

        <button class="add-btn"
          onclick="addToCartFromBtn(this)"
          data-id="${safeId}"
          data-name="${safeName}"
          data-price="${precioCatalogo}"
          data-href="${safeHref}"
          data-fuente="${safeFuente}"
          data-precio-base="${p.list_price}"
          title="Agregar al carrito">

          <svg width="16" height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>
          </svg>

        </button>

      </div>
        </div>
      </div>`;
  }

  // Novedades para el carrusel: primeros 20 de cada fuente mezclados por _orden
  // Rotan cada 4 días usando la fecha como semilla
  const diasDesdeEpoca = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const semillaDia     = Math.floor(diasDesdeEpoca / 4); // cambia cada 4 días
  const todosParaCarrusel = Object.values(grupos)
    .flatMap(g => g.items)
    .filter(p => p.list_price > 0 && p._orden < 30)
    .sort((a, b) => (a._orden || 0) - (b._orden || 0));
  // Rotar offset cada 4 días
  const offsetCarrusel = (semillaDia * 7) % Math.max(todosParaCarrusel.length, 1);
  const novedadesCarrusel = [
    ...todosParaCarrusel.slice(offsetCarrusel),
    ...todosParaCarrusel.slice(0, offsetCarrusel)
  ].slice(0, 20);

  const carruselHTML = novedadesCarrusel.length >= 3 ? `
    <div class="novedades-wrap">
      <div class="novedades-header">
        <div class="novedades-titulo">🆕 Novedades</div>
      </div>
      <div class="novedades-slider-outer">
        <div class="novedades-slider" id="novSlider">
          ${novedadesCarrusel.map(makeCard).join("")}
          ${novedadesCarrusel.map(makeCard).join("")}
        </div>
      </div>
    </div>` : "";

  // Destacados: top 8 por precio
  const destacados = Object.values(grupos)
    .flatMap(g => g.items).filter(p => p.list_price > 0)
    .sort((a, b) => b.list_price - a.list_price).slice(0, 8);
  const destacadosHTML = `
    <div class="destacados-wrap" id="sec-destacados" data-section data-cat="Destacados">
      <div class="destacados-header">
        <div class="destacados-titulo">
          <span class="dest-stars">★★★</span>
          Destacados Mundial 2026
          <span class="dest-stars">★★★</span>
        </div>
        <span class="destacados-sub">Los más buscados</span>
      </div>
      <div class="destacados-grid" id="gridDestacados">
        <div style="color:#aaa;font-size:13px;padding:20px">Cargando...</div>
      </div>
    </div>`;

  // Nav pills
  // Nav pills — sin Novedades ni Más vistos como secciones separadas
  const todasCats = ["Todos", "Destacados",
    ...Object.values(fuentesSecciones)
      .flatMap(s => s.map(g => g.categoria))
      .filter((v, i, a) => a.indexOf(v) === i)
  ];
  const navHTML = todasCats.map((cat, i) =>
    `<span class="cat-pill${i === 0 ? " active" : ""}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</span>`
  ).join("");

  // Todos los productos mezclados y ordenados por novedad (_orden asc)
  const todosOrdenados = Object.values(grupos)
    .flatMap(g => g.items)
    .filter(p => p.list_price > 0)
    .sort((a, b) => (a._orden || 0) - (b._orden || 0));

  const recientesHTML = `
    <section data-section data-cat="Todos" id="sec-recientes">
      <h2 class="cat-title">Todos los productos <span>(${todosOrdenados.length})</span></h2>
      <div class="grid">${todosOrdenados.map(makeCard).join("")}</div>
    </section>`;

  // Secciones por categoría (para el filtro de nav)
  const seccionesHTML = Object.entries(fuentesSecciones).map(([, secciones]) =>
    `<div class="fuente-bloque">${secciones.map(({ categoria, items }) => `
      <section data-section data-cat="${escapeHtml(categoria)}" style="display:none">
        <h2 class="cat-title">${escapeHtml(categoria)} <span>(${items.length})</span></h2>
        <div class="grid">${items.map(makeCard).join("")}</div>
      </section>`).join("")}</div>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- ── SEO principal ── -->
  <title>JR Soluciones Informáticas — Catálogo de Productos | Tecnología y Electrónica Argentina</title>
  <meta name="description" content="Catálogo online de JR Soluciones Informáticas. Tecnología, computación, celulares, auriculares, cables y accesorios con envío a todo el país. Comprá fácil y pagá por transferencia.">
  <meta name="keywords" content="tecnologia, informatica, computacion, celulares, auriculares, cables, accesorios, electronica, Argentina, comprar online, JR Soluciones">
  <meta name="author" content="JR Soluciones Informáticas">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://www.jrshop.com.ar/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="JR Soluciones Informáticas">
  <meta property="og:title" content="JR Soluciones Informáticas — Catálogo Online">
  <meta property="og:description" content="${total} productos de tecnología, computación y electrónica. Envío a todo el país. Pagá por transferencia.">
  <meta property="og:url" content="https://www.jrshop.com.ar/">
  <meta property="og:locale" content="es_AR">
  <meta property="og:image" content="https://www.jrshop.com.ar/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:alt" content="JR Soluciones Informáticas">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="JR Soluciones Informáticas — Catálogo Online">
  <meta name="twitter:description" content="${total} productos de tecnología y electrónica. Enviamos a todo el país.">
  <meta name="twitter:image" content="https://www.jrshop.com.ar/og-image.jpg">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Store","name":"JR Soluciones Informáticas","url":"https://www.jrshop.com.ar/","description":"Tienda online de tecnología, computación y electrónica con envío a todo el país.","telephone":"+543812235528","priceRange":"$$","currenciesAccepted":"ARS","paymentAccepted":"Transferencia bancaria","areaServed":"Argentina","address":{"@type":"PostalAddress","addressCountry":"AR","addressRegion":"Tucumán"},"contactPoint":{"@type":"ContactPoint","telephone":"+543812235528","contactType":"sales","availableLanguage":"Spanish"}}
  </script>
  <link rel="preconnect" href="https://ximaro.com.ar">
  <link rel="preconnect" href="https://dazimportadora.com.ar">
  <link rel="dns-prefetch" href="https://jrrailway-production.up.railway.app">
  <link rel="stylesheet" href="catalogo.css">
</head>
<body>

<!-- Índice de productos para búsqueda de equivalentes (usado por catalogo.js) -->
<script>
window.CATALOGO_INDEX = JSON.parse(atob("${Buffer.from(JSON.stringify(indiceProductos)).toString("base64")}"));
window.MINIMO_DAZ_BASE = ${MINIMO_DAZ};
</script>

<header>
  <div class="header-top">
    <div class="logo">${logoB64 ? `<img src="data:image/png;base64,${logoB64}" alt="JR Soluciones Informaticas">` : `<div class="logo-box">JR</div><div><div class="logo-text">JR Soluciones</div><div class="logo-sub">Informaticas</div></div>`}</div>
    <div class="header-info">
      <div class="header-slogan">Tecnología y electrónica para todo el país</div>
      <div class="header-contacto">
        <a href="https://wa.me/543812235528">📱 381 223-5528</a>
        <span>📍 Tucumán, Argentina</span>
        <span>🚚 Envíos a todo el país</span>
        <span>⚡ Disponibilidad en 24hs</span>
      </div>
    </div>
    <div class="header-search">
      <input type="text" id="buscarDesktop" placeholder="🔍 Buscar productos..." autocomplete="off">
    </div>
    <div class="header-stats">
      <div class="stat-item">
        <span class="stat-dot"></span>
        <span id="statOnline" class="stat-num">—</span>
        <span>online</span>
      </div>
      <div class="stat-item">
        👁 <span id="statVisitas" class="stat-num">...</span>
        <span>visitas</span>
      </div>
    </div>
  </div>

  <!-- Banner rotativo -->
  <div class="promo-banner">
    <div class="promo-track" id="promoTrack">
      <span class="promo-item">🚚 <strong>Envío gratis</strong> en SMT, Tafí Viejo y Yerba Buena en compras +$15.000</span>
      <span class="promo-item">💳 <strong>25% OFF</strong> pagando con transferencia bancaria</span>
      <span class="promo-item">⚡ Disponibilidad en <strong>24 a 48hs</strong> confirmado el pago</span>
      <span class="promo-item">📦 <strong>${total} productos</strong> disponibles — actualizado ${fecha}</span>
      <span class="promo-item">📍 Retiro en local · <strong>Tucumán</strong></span>
      <span class="promo-item">🔒 Pago seguro por <strong>Mercado Pago</strong> o transferencia</span>
      <!-- Duplicado para loop continuo -->
      <span class="promo-item">🚚 <strong>Envío gratis</strong> en SMT, Tafí Viejo y Yerba Buena en compras +$15.000</span>
      <span class="promo-item">💳 <strong>25% OFF</strong> pagando con transferencia bancaria</span>
      <span class="promo-item">⚡ Disponibilidad en <strong>24 a 48hs</strong> confirmado el pago</span>
      <span class="promo-item">📦 <strong>${total} productos</strong> disponibles — actualizado ${fecha}</span>
      <span class="promo-item">📍 Retiro en local · <strong>Tucumán</strong></span>
      <span class="promo-item">🔒 Pago seguro por <strong>Mercado Pago</strong> o transferencia</span>
    </div>
  </div>

  <!-- Barra con dropdown de categorías -->
  <div class="header-bar">
    <div class="cat-dropdown" id="catDropdown">
      <button class="cat-dropdown-btn" id="catDropdownBtn" onclick="toggleCatMenu()">
        ☰ Categorías <span class="arrow">▼</span>
      </button>
      <div class="cat-dropdown-menu" id="catDropdownMenu">
        ${todasCats.map(cat => {
          const iconos = {
            "Todos": "🏠", "Destacados": "⭐", "Celulares": "📱",
            "Computacion": "💻", "Electronica": "📺", "Electrodomesticos": "🏠",
            "Accesorios Tecnologia": "🔌", "Hogar": "🛋️", "Cocina": "🍳",
            "Herramientas": "🔧", "Bicicletas": "🚲", "Juguetes": "🎮",
            "Salud y Belleza": "💄", "Accesorios": "👜", "General": "📦",
          };
          const icon = iconos[cat] || "📦";
          return `<div class="cat-dropdown-item${cat === "Todos" ? " active" : ""}" data-cat="${escapeHtml(cat)}" onclick="seleccionarCat('${escapeHtml(cat)}', this)">
            <span class="cat-icon">${icon}</span>${escapeHtml(cat)}
          </div>`;
        }).join("")}
      </div>
    </div>
    <!-- Ordenar -->
    <div class="sort-dropdown" id="sortDropdown">
      <button class="sort-btn" onclick="toggleSortMenu()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
        Ordenar <span class="arrow">▼</span>
      </button>
      <div class="sort-menu" id="sortMenu">
        <div class="sort-item active" data-sort="novedad" onclick="ordenarPor('novedad',this)">⚡ Novedades</div>
        <div class="sort-item" data-sort="precio-asc" onclick="ordenarPor('precio-asc',this)">💲 Menor precio</div>
        <div class="sort-item" data-sort="precio-desc" onclick="ordenarPor('precio-desc',this)">💰 Mayor precio</div>
        <div class="sort-item" data-sort="nombre" onclick="ordenarPor('nombre',this)">🔤 A → Z</div>
      </div>
    </div>
    <!-- Búsqueda mobile -->
    <div class="search-mobile">
      <input type="text" id="buscarMobile" placeholder="🔍 Buscar..." autocomplete="off">
    </div>
  </div>
</header>

<!-- ── Botón ¿Cómo comprar? ── -->
<button id="btnAyuda" onclick="abrirAyuda()">❓ ¿Cómo comprar?</button>

<!-- ── Modal ayuda ── -->
<div class="ayuda-overlay" id="ayudaOverlay" onclick="if(event.target===this)cerrarAyuda()">
  <div class="ayuda-modal">
    <h2>¿Cómo comprar?</h2>
    <div class="ayuda-pasos">
      <div class="ayuda-paso">
        <div class="ayuda-num">1</div>
        <div class="ayuda-paso-txt">
          <div class="ayuda-paso-titulo">🔍 Buscá o navegá por categorías</div>
          <div class="ayuda-paso-desc">Usá el buscador o el botón "☰ Categorías" para encontrar lo que necesitás.</div>
        </div>
      </div>
      <div class="ayuda-paso">
        <div class="ayuda-num">2</div>
        <div class="ayuda-paso-txt">
          <div class="ayuda-paso-titulo">🛒 Agregá al carrito</div>
          <div class="ayuda-paso-desc">Tocá el producto para ver detalles y precio, luego "+ Agregar al carrito".</div>
        </div>
      </div>
      <div class="ayuda-paso">
        <div class="ayuda-num">3</div>
        <div class="ayuda-paso-txt">
          <div class="ayuda-paso-titulo">👤 Completá tus datos</div>
          <div class="ayuda-paso-desc">Nombre, DNI, teléfono y dirección de entrega o elegí retiro en local.</div>
        </div>
      </div>
      <div class="ayuda-paso">
        <div class="ayuda-num">4</div>
        <div class="ayuda-paso-txt">
          <div class="ayuda-paso-titulo">💳 Elegí cómo pagar</div>
          <div class="ayuda-paso-desc">Transferencia bancaria con descuento del 5–20%, o Mercado Pago / tarjeta al precio de lista.</div>
        </div>
      </div>
      <div class="ayuda-paso">
        <div class="ayuda-num">5</div>
        <div class="ayuda-paso-txt">
          <div class="ayuda-paso-titulo">📲 Confirmá por WhatsApp</div>
          <div class="ayuda-paso-desc">Se abre WhatsApp con el resumen del pedido. Envialo y coordinamos el envío o la entrega.</div>
        </div>
      </div>
    </div>
    <div class="ayuda-desc-box">
      💡 <strong>Descuentos por transferencia:</strong><br>
      Hasta $20k → 5% · $20k–$50k → 10% · $50k–$100k → 15% · $100k–$200k → 18% · +$200k → 20% off
    </div>
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;cursor:pointer;font-size:13px;color:#888">
      <input type="checkbox" id="chkNoMostrar" style="width:18px;height:18px;cursor:pointer;accent-color:#f59e0b">
      No volver a mostrar este mensaje
    </label>
    <button class="ayuda-close-btn" onclick="cerrarAyuda()">¡Entendido, voy a comprar!</button>
  </div>
</div>


<!-- Notificación última compra -->
<div id="ultimaCompra">
  <button class="uc-close" onclick="this.parentElement.style.display='none'">×</button>
  <div class="uc-title" id="ucTitulo"></div>
  <div class="uc-sub" id="ucSub"></div>
</div>

<main>
  ${carruselHTML}
  ${destacadosHTML}
  ${recientesHTML}
  ${seccionesHTML}
  <p class="no-results" id="noResults">No se encontraron productos.</p>
</main>

<!-- ── Carrito flotante ── -->
<button id="cartFab">
  <span class="fab-icon">🛒</span>
  Mi pedido
  <span id="cartCount">0</span>
</button>

<div id="cartPanel">
  <div class="cart-header">
    <h3>🛒 Mi pedido</h3>
    <button class="cart-close" id="cartCloseBtn" title="Cerrar">×</button>
  </div>
  <div id="cartItems"></div>
  <div class="cart-footer">
    <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:8px 10px;font-size:10px;color:#555;margin-bottom:10px;line-height:1.6">
      <strong style="color:#f59e0b">💡 Descuento por transferencia:</strong><br>
      Hasta $20k → 5% · $20k–$50k → 10% · $50k–$100k → 15% · $100k–$200k → 18% · +$200k → <strong>20% off</strong>
    </div>
    <div class="cart-total-row">
      <span class="cart-total-label">Total</span>
      <span id="cartTotal">$ 0</span>
    </div>
    <div id="cartDescuento"></div>
    <div class="cart-actions">
      <button id="btnCheckout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Confirmar pedido
      </button>
      <button id="btnShareCart" title="Compartir lista por WhatsApp" style="background:#25D366;color:#fff;border:none;padding:11px 13px;border-radius:10px;cursor:pointer;font-size:14px;transition:background .15s;" onmouseenter="this.style.background='#1ebe5d'" onmouseleave="this.style.background='#25D366'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </button>
      <button id="clearCart">Limpiar</button>
    </div>
  </div>
</div>

<!-- ── Modal checkout ── -->
<div class="modal-overlay" id="checkoutModal">
  <div class="modal">
    <div class="modal-header">
      <h3>Finalizar pedido</h3>
      <button class="modal-close" onclick="cerrarCheckout()">×</button>
    </div>
    <div class="modal-body">

      <div class="steps">
        <div class="step active" data-s="1">1. Pedido</div>
        <div class="step" data-s="2">2. Datos</div>
        <div class="step" data-s="3">3. Envío</div>
        <div class="step" data-s="4">4. Pago</div>
      </div>

      <!-- PASO 0: Validación mínimo (se muestra solo si aplica) -->
      <div class="checkout-section" id="step0">
        <div style="text-align:center;padding:8px 0 4px">
          <div style="font-size:32px">⚠️</div>
          <div style="font-size:15px;font-weight:800;color:#111;margin:8px 0 4px">Revisá tu pedido</div>
          <div style="font-size:13px;color:#666;line-height:1.5" id="dazWarningText"></div>
        </div>
        <div id="dazSugerencias"></div>
        <div id="dazBuscador" style="display:none;flex-direction:column;gap:10px">
          <input type="text" class="form-input" id="dazSearch" placeholder="Buscar productos para agregar..." oninput="buscarProductosDAZ()">
          <div id="dazSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto"></div>
        </div>
        <button class="btn-next" id="btnIgnorarDAZ" style="background:#f59e0b;color:#111">Continuar de todas formas →</button>
        <button class="btn-back" onclick="cerrarCheckout()">← Volver al catálogo</button>
      </div>

      <!-- PASO 1 -->
      <div class="checkout-section visible" id="step1">
        <div class="order-summary">
          <div class="order-summary-title">Tu pedido</div>
          <div id="orderLines"></div>
          <div class="order-total"><span>Subtotal</span><span id="orderTotalAmt"></span></div>
        </div>
        <button class="btn-next" onclick="irAStep(2)">Continuar →</button>
      </div>

      <!-- PASO 2 -->
      <div class="checkout-section" id="step2">
        <div class="form-group">
          <label class="form-label">Tipo de entrega</label>
          <div class="delivery-toggle">
            <button class="toggle-btn selected" data-tipo="envio">📦 Envío a domicilio</button>
            <button class="toggle-btn" data-tipo="retiro">🏪 Retiro en local</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nombre completo *</label>
            <input class="form-input" id="inpNombre" placeholder="Juan Pérez" type="text">
            <span class="form-error" id="inpNombreErr">Campo requerido</span>
          </div>
          <div class="form-group">
            <label class="form-label">DNI *</label>
            <input class="form-input" id="inpDNI" placeholder="32123456" type="text" maxlength="10" inputmode="numeric">
            <span class="form-error" id="inpDNIErr">Ingresá tu DNI</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono / WhatsApp *</label>
          <input class="form-input" id="inpTelefono" placeholder="381 XXX XXXX" type="tel">
          <span class="form-error" id="inpTelefonoErr">Campo requerido</span>
        </div>
        <div class="form-group">
          <label class="form-label">Notas adicionales</label>
          <textarea class="form-textarea" id="inpNotas" placeholder="Horario, referencias, etc."></textarea>
        </div>
        <button class="btn-next" id="btnPaso2a3">Continuar →</button>
        <button class="btn-back" data-to="1">← Volver</button>
      </div>

      <!-- PASO 3 -->
      <div class="checkout-section" id="step3">
        <div id="step3Envio" style="display:flex;flex-direction:column;gap:14px">
          <div id="geoSection">
            <button class="geo-btn" id="btnGeo" onclick="detectarUbicacion()">
              📍 Detectar mi ubicación automáticamente
            </button>
          </div>
          <div style="text-align:center;font-size:12px;color:#aaa">— o elegí manualmente —</div>
          <div id="zonaManual" style="display:flex;flex-direction:column;gap:10px">
            <div class="form-group">
              <label class="form-label">Provincia / Zona *</label>
              <select class="form-select" id="selProvincia" onchange="onProvinciaChange()">
                <option value="">— Seleccioná tu zona —</option>
                <option value="tucuman_capital">Tucumán capital (SMT, Tafí Viejo, Yerba Buena)</option>
                <option value="tucuman_interior">Tucumán — resto de la provincia</option>
                <option value="noa">NOA (Salta, Jujuy, Catamarca, Stgo. del Estero, La Rioja)</option>
                <option value="centro">Centro (Córdoba, Santa Fe, Entre Ríos)</option>
                <option value="bsas">Buenos Aires / AMBA</option>
                <option value="otro">Otra provincia</option>
              </select>
            </div>
          </div>
          <div id="zonaResult" style="display:none"></div>
          <div id="camposDireccion" style="display:flex;flex-direction:column;gap:10px">
            <div class="form-group">
              <label class="form-label">Dirección *</label>
              <input class="form-input" id="inpDireccion" placeholder="Calle 123, Piso 2" type="text">
              <span class="form-error" id="inpDireccionErr">Campo requerido</span>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Ciudad *</label>
                <input class="form-input" id="inpCiudad" placeholder="Tucumán" type="text">
                <span class="form-error" id="inpCiudadErr">Campo requerido</span>
              </div>
              <div class="form-group">
                <label class="form-label">CP</label>
                <input class="form-input" id="inpCP" placeholder="4000" type="text">
              </div>
            </div>
          </div>
        </div>
        <div id="step3Retiro" style="display:none">
          <div class="envio-costo-box">
            <span class="envio-costo-label">🏪 Retiro en local — sin cargo</span>
            <span class="envio-costo-valor">GRATIS <span class="envio-free-badge">✓</span></span>
          </div>
        </div>
        <button class="btn-next" id="btnPaso3a4">Continuar →</button>
        <button class="btn-back" data-to="2">← Volver</button>
      </div>

      <!-- PASO 4 -->
      <div class="checkout-section" id="step4">
        <div class="resumen-final" id="resumenFinal"></div>
        <div class="pago-opciones">
          <label class="pago-opcion selected" id="opcionTransferencia">
            <input type="radio" name="metodoPago" value="transferencia" checked>
            <div class="pago-opcion-body">
              <div class="pago-opcion-title">🏦 Transferencia bancaria</div>
              <div class="pago-opcion-desc">Alias: <strong>JR93ARG</strong> · José Rodrigo Salvador Martínez</div>
              <div class="pago-opcion-precio" id="precioTransferencia"></div>
              <div class="pago-opcion-ahorro" id="ahorroTransferencia"></div>
            </div>
          </label>
          <label class="pago-opcion" id="opcionMP">
            <input type="radio" name="metodoPago" value="mp">
            <div class="pago-opcion-body">
              <div class="pago-opcion-title">💳 Mercado Pago / Tarjeta</div>
              <div class="pago-opcion-desc">Pagá con cualquier medio digital. Precio de lista sin descuento adicional.</div>
              <div class="pago-opcion-precio" id="precioMP"></div>
              <div class="pago-opcion-recargo" id="recargoMP"></div>
            </div>
          </label>
        </div>
        <div id="detalleTransferencia">
          <div class="bank-card">
            <div class="bank-card-title">Datos para transferencia</div>
            <div class="bank-row">
              <div><div class="bank-label">Alias</div><div class="bank-value">JR93ARG</div></div>
              <button class="copy-btn" id="btnCopyAlias">Copiar</button>
            </div>
            <div class="bank-row">
              <div><div class="bank-label">Titular</div><div class="bank-value" style="font-size:13px">José Rodrigo Salvador Martínez</div></div>
            </div>
            <div class="total-destacado">
              <div class="label">Monto exacto a transferir</div>
              <div class="monto" id="pagoMonto"></div>
            </div>
          </div>
          <!-- Comprobante de transferencia -->
          <div class="form-group" style="margin-top:12px">
            <label class="form-label">Adjuntá el comprobante de transferencia *</label>
            <div id="comprobanteArea" style="border:2px dashed #e0e0e0;border-radius:10px;padding:16px;text-align:center;cursor:pointer;transition:border-color .2s" onclick="document.getElementById('inpComprobante').click()">
              <div id="comprobantePlaceholder">
                <div style="font-size:28px">📎</div>
                <div style="font-size:13px;color:#888;margin-top:4px">Tocá para adjuntar la captura</div>
                <div style="font-size:11px;color:#bbb;margin-top:2px">JPG, PNG o PDF</div>
              </div>
              <div id="comprobantePreview" style="display:none">
                <img id="comprobanteImg" style="max-width:100%;max-height:180px;border-radius:8px;object-fit:contain">
                <div id="comprobanteNombre" style="font-size:11px;color:#555;margin-top:6px"></div>
                <div style="font-size:11px;color:#16a34a;margin-top:4px">✓ Comprobante adjunto</div>
              </div>
            </div>
            <input type="file" id="inpComprobante" accept="image/*,.pdf" style="display:none" onchange="onComprobanteChange(this)">
          </div>
        </div>
        <div id="detalleMP" style="display:none">
          <a class="btn-mp" href="https://link.mercadopago.com.ar/jr93" target="_blank" id="btnIrMP"
            onclick="habilitarConfirmacionMP()">
            💳 Ir a pagar con Mercado Pago — <span id="montoBtnMP"></span>
          </a>
          <div id="mpPagado" style="display:none;margin-top:10px">
            <div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:10px;padding:12px;font-size:13px;color:#16a34a;text-align:center">
              ✓ Ya realicé el pago por Mercado Pago
            </div>
          </div>
          <p style="font-size:12px;color:#888;text-align:center;margin-top:8px;line-height:1.5">
            Después de pagar tocá el botón de abajo para confirmar tu pedido.
          </p>
        </div>
        <!-- Botón principal — deshabilitado hasta confirmar pago -->
        <button class="btn-next" id="btnEnviar" disabled style="opacity:.4;cursor:default">
          Confirmar pedido
        </button>
        <p style="font-size:11px;color:#888;text-align:center;margin:8px 0 0;line-height:1.5">
          Al confirmar te contactaremos para coordinar el pago y la entrega
        </p>
        <button class="btn-back" data-to="3">← Volver</button>
      </div>

      <!-- PASO 5 -->
      <div class="checkout-section" id="step5">
        <div class="confirm-box">
          <div class="confirm-icon">✅</div>
          <div class="confirm-title">¡Pedido confirmado!</div>
          <div class="confirm-sub" id="confirmSub"></div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:14px;margin-top:4px;text-align:left;font-size:13px;color:#166534;line-height:1.7">
            Nos estaremos contactando a la brevedad para coordinar el pago y la entrega de tu pedido.
          </div>

          <!-- Link de seguimiento -->
          <div id="confirmTracking" style="display:none;width:100%;background:#f8faff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;text-align:left">
            <div style="font-size:12px;color:#1e40af;font-weight:700;margin-bottom:6px">
              📦 Seguí tu pedido en tiempo real
            </div>
            <div style="font-size:13px;color:#1e3a8a;margin-bottom:8px">
              N° de pedido: <strong class="tracking-nro"></strong>
            </div>
            <a class="tracking-link" href="#" target="_blank"
               style="font-size:11px;color:#2563eb;word-break:break-all;display:block;margin-bottom:10px"></a>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="tracking-copy"
                style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer">
                Copiar link
              </button>
              <button class="tracking-wa"
                style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer">
                📲 Enviar por WhatsApp
              </button>
            </div>
          </div>

          <div style="background:#f9f9f9;border-radius:12px;padding:14px;margin-top:4px;text-align:left;font-size:12px;color:#555;line-height:1.6">
            <strong>Tiempos estimados:</strong><br>
            • Disponibilidad: <strong>24 a 48 hs</strong> (algunos en el día)<br>
            • Retiro en local: desde <strong>24 hs</strong> confirmado el pago<br>
            • Envío en Tucumán: a partir de <strong>24 hs</strong><br>
            • Otras provincias: según logística a coordinar
          </div>
          <button class="confirm-wa" id="btnConfirmClose">Cerrar</button>
        </div>
      </div>

    </div>
  </div>
</div>


<!-- ── Modal de producto ── -->
<div class="prod-overlay" id="prodOverlay">
  <div class="prod-modal" id="prodModal">
    <div class="prod-img-wrap" id="prodImgWrap">
      <button class="prod-close" onclick="cerrarProducto()">×</button>
      <div class="prod-img-placeholder">📦</div>
    </div>
    <div class="prod-body">
      <div class="prod-nombre" id="prodNombre"></div>
      <div class="prod-precios">
        <div>
          <div class="prod-precio-transf" id="prodPrecioTransf"></div>
        </div>
        <div class="prod-precio-mp" id="prodPrecioMP"></div>
      </div>
      <div id="prodAhorro" style="margin-top:6px"></div>
      <div id="prodDescInfo"></div>
      <div id="prodDesc" class="prod-desc"></div>

      <!-- Simulador de crédito -->
      <button class="credito-toggle" id="creditoToggle" onclick="toggleCredito()">
        <span>💳 Comprá en cuotas</span>
        <span class="arrow">▼</span>
      </button>
      <div class="credito-body" id="creditoBody">
        <div class="credito-nota">⚠ El precio base es el precio de lista, sin descuento por transferencia.</div>

        <!-- Selector de cuotas prominente -->
        <div class="credito-cuotas" id="creditoCuotas"></div>

        <!-- Los 3 datos clave -->
        <div id="creditoResumen" class="credito-resumen"></div>

        <!-- Anticipo slider -->
        <div class="credito-anticipo-wrap" style="margin-top:10px">
          <div class="credito-anticipo-label">
            <span>Anticipo</span>
            <span id="creditoAnticipoVal">$ 0</span>
          </div>
          <input type="range" id="creditoSlider" min="0" max="100" step="1" value="0"
            oninput="onAnticipoChange(this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#aaa;margin-top:2px">
            <span>Mínimo 35%</span><span>Máximo 70%</span>
          </div>
        </div>

        <!-- Cuadro detallado colapsable -->
        <details style="margin-top:10px">
          <summary style="font-size:11px;color:#aaa;cursor:pointer;padding:4px 0">Ver cuadro de cuotas detallado</summary>
          <div class="credito-cuadro" id="creditoCuadro" style="margin-top:8px"></div>
        </details>

        <!-- Formulario de solicitud -->
        <div id="creditoForm" style="margin-top:12px;display:none">
          <div style="height:1px;background:#f0f0f0;margin-bottom:12px"></div>
          <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:10px">Tus datos para la solicitud</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <input class="form-input" id="cfNombre"   placeholder="Nombre completo *"            type="text" style="font-size:13px;padding:10px 12px">
            <input class="form-input" id="cfDni"      placeholder="DNI *"                        type="number" inputmode="numeric" style="font-size:13px;padding:10px 12px">
            <input class="form-input" id="cfTel"      placeholder="WhatsApp *"                   type="tel" inputmode="numeric" style="font-size:13px;padding:10px 12px">
            <input class="form-input" id="cfDomicilio" placeholder="Domicilio en Tucumán *"      type="text" style="font-size:13px;padding:10px 12px">
            <input class="form-input" id="cfBarrio"   placeholder="Barrio / Localidad *"         type="text" style="font-size:13px;padding:10px 12px">
            <input class="form-input" id="cfTrabajo"  placeholder="Ocupación / Trabajo *"        type="text" style="font-size:13px;padding:10px 12px">
          </div>
          <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:10px;margin-top:10px;font-size:11px;color:#854F0B;line-height:1.6">
            📎 Al enviar se abre WhatsApp. Adjuntá en ese chat:<br>
            • Foto DNI frente y dorso<br>
            • Boleta de servicio (luz/agua/gas)<br>
            • Comprobante de ingresos
          </div>
          <button class="credito-wa" id="creditoBtnWA" style="margin-top:10px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Enviar solicitud por WhatsApp
          </button>
        </div>

        <button id="creditoBtnSolicitar" class="credito-wa" style="margin-top:10px;background:#111" onclick="mostrarFormCredito()">
          Solicitar esta financiacion
        </button>
      </div>
      </div>

      <div class="prod-actions">
        <button class="prod-add" id="prodBtnAgregar">+ Agregar al carrito</button>
      </div>
    </div>
  </div>
</div>

<!-- ── Botón volver arriba ── -->
<button id="btnTop" title="Volver arriba">↑</button>

<footer>JR Soluciones Informáticas · Tel: 381 223 5528 · Actualizado ${fecha}</footer>

<script src="catalogo.js"></script>
</body>
</html>`;
}

// ── Generar PDF ───────────────────────────────────────────────────────────────
async function generarPDF(htmlPath) {
  try {
    const puppeteer = obtenerPuppeteer();
    log("Generando PDF...");
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page    = await browser.newPage();
    await page.goto("file://" + path.resolve(htmlPath), { waitUntil: "networkidle2", timeout: 120000 });
    await page.evaluate(() => { document.querySelectorAll("img").forEach(img => img.loading = "eager"); });
    await page.waitForFunction(() => Array.from(document.images).every(img => img.complete), { timeout: 120000 });
    await page.pdf({
      path: OUT_PDF, format: "A4", printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
    });
    await browser.close();
    return true;
  } catch (e) {
    logln(`⚠  PDF omitido: ${e.message}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🛍  Generador de Catálogo JR Soluciones Informáticas`);
  console.log(`   Markup: +${Math.round(MARKUP * 100)}%\n`);

  // 1. Scraping
  log("Iniciando scraping con Puppeteer...");
  let productos = [];
  try {
    const [ximaro, daz] = await Promise.allSettled([
      fetchProductosXimaro(),
      fetchProductosDaz(),
    ]);
    if (ximaro.status === "fulfilled") {
      logln(`✓ ${ximaro.value.length} productos de Ximaro`);
      productos.push(...ximaro.value);
    } else {
      logln(`⚠  Ximaro falló: ${ximaro.reason?.message}`);
    }
    if (daz.status === "fulfilled") {
      logln(`✓ ${daz.value.length} productos de DAZ`);
      productos.push(...daz.value);
    } else {
      logln(`⚠  DAZ falló: ${daz.reason?.message}`);
    }
    if (!productos.length) throw new Error("No se obtuvo ningún producto.");
  } catch (e) {
    logln(`\n❌ ${e.message}`);
    process.exit(1);
  }
  logln(`✓ Total: ${productos.length} productos`);

  // 2. Completar precios faltantes
  const rec = await completarPreciosFaltantes(productos);
  if (rec) logln(`✓ ${rec} precios recuperados desde páginas de producto`);

  // 3. Generar archivos
  log("Generando archivos...");
  const grupos    = agrupar(productos);
  const markupPct = Math.round(MARKUP * 100);

  // Índice global de todos los productos (para usos fuera de generarHTML)
  const todosProductos = Object.values(grupos).flatMap(g => g.items);

  // Cargar logo
  let logoB64 = null;
  const logoPath = path.join(__dirname, "logo.png");
  if (fs.existsSync(logoPath)) {
    logoB64 = fs.readFileSync(logoPath).toString("base64");
    logln(`✓ Logo cargado: logo.png`);
  } else {
    logln(`ℹ  Sin logo: colocá logo.png en esta carpeta`);
  }

  // Crear directorio de salida si no existe
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    logln(`✓ Carpeta creada: ${OUT_DIR}`);
  }

  // Escribir CSS separado
  escribirCSS();
  logln(`✓ CSS generado: catalogo.css`);

  // Escribir JS separado
  escribirJS(CART_PHONE);
  logln(`✓ JS generado: catalogo.js`);

  // ── Generar descripciones con IA para productos nuevos ──────────────────────
  const DESC_FILE = path.join(path.dirname(__filename), "descripciones.json");
  let descripciones = {};
  try {
    if (fs.existsSync(DESC_FILE)) {
      descripciones = JSON.parse(fs.readFileSync(DESC_FILE, "utf8"));
    }
  } catch { descripciones = {}; }

  const sinDesc = todosProductos.filter(p => {
    const key = String(p.id ?? p.href);
    return !descripciones[key] && p.name && p.list_price > 0;
  });

  if (sinDesc.length > 0) {
    logln(`\nGenerando descripciones para ${sinDesc.length} productos nuevos...`);

    async function generarDescripcion(p) {
      const key = String(p.id ?? p.href);
      try {
        const body = JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          messages: [{
            role: "user",
            content: [
              ...(p.imgUrl ? [{ type: "image", source: { type: "url", url: p.imgUrl } }] : []),
              {
                type: "text",
                text: `Escribí una descripción comercial breve (2-3 oraciones) en español para este producto que vende una tienda de tecnología en Argentina. Mencioná las características principales y para qué sirve. Solo devolvé el texto, sin títulos.\n\nProducto: ${p.name}`
              }
            ]
          }]
        });

        const resp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: "api.anthropic.com",
            path: "/v1/messages",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              "anthropic-version": "2023-06-01",
              "x-api-key": process.env.ANTHROPIC_API_KEY || ""
            }
          }, res => {
            let data = "";
            res.on("data", d => data += d);
            res.on("end", () => resolve(JSON.parse(data)));
          });
          req.on("error", reject);
          req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
          req.write(body);
          req.end();
        });

        const texto = resp.content?.[0]?.text?.trim() || "";
        if (texto) descripciones[key] = texto;
      } catch { /* silencioso — el producto queda sin descripción esta vez */ }
    }

    // Procesar en lotes de 5 para no saturar la API
    const LOTE = 5;
    let generados = 0;
    for (let i = 0; i < sinDesc.length; i += LOTE) {
      const lote = sinDesc.slice(i, i + LOTE);
      await Promise.all(lote.map(generarDescripcion));
      generados += lote.length;
      log(`  Descripciones: ${Math.min(generados, sinDesc.length)}/${sinDesc.length}...`);
      // Guardar progreso cada lote
      fs.writeFileSync(DESC_FILE, JSON.stringify(descripciones, null, 2), "utf8");
    }
    logln(`\n✓ Descripciones generadas y guardadas: ${Object.keys(descripciones).length} total`);
  } else {
    logln(`✓ Descripciones: todos los productos tienen descripción (${Object.keys(descripciones).length} guardadas)`);
  }

  // Escribir HTML con descripciones inyectadas
  const html    = generarHTML(grupos, markupPct, logoB64, descripciones);
  fs.writeFileSync(OUT_HTML, html, "utf8");
  fs.writeFileSync(OUT_HTML, html, "utf8");
  const sizeKB  = Math.round(fs.statSync(OUT_HTML).size / 1024);
  const cssKB   = Math.round(fs.statSync(path.join(path.dirname(OUT_HTML), "catalogo.css")).size / 1024);
  const jsKB    = Math.round(fs.statSync(path.join(path.dirname(OUT_HTML), "catalogo.js")).size / 1024);
  logln(`✓ HTML generado: ${OUT_HTML} (${sizeKB} KB)`);
  logln(`  catalogo.css: ${cssKB} KB | catalogo.js: ${jsKB} KB`);

  // 4. Resumen final
  console.log("\n─────────────────────────────────────────────────────");
  console.log("✅  ¡Listo!");
  console.log(`\n   📄 ${OUT_HTML}`);
  process.exit(0);
})().catch(err => {
  console.error("\n[ERROR]", err.message);
  process.exit(1);
});