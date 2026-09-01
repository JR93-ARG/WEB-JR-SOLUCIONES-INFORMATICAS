/**
 * sincronizar.js — Actualiza el catálogo usando PostgreSQL como caché
 *
 *   node sincronizar.js            scrapea, guarda en BD, baja imágenes nuevas
 *   node sincronizar.js --sin-scrape   genera solo desde la BD (rápido)
 *   node sincronizar.js --solo-imgs    únicamente descarga imágenes pendientes
 *
 * Ventaja sobre correr generar.js solo:
 *   · si un proveedor se cae, el catálogo se arma igual con lo guardado
 *   · las imágenes se bajan una vez y quedan publicadas con el sitio
 *   · queda historial de precios para detectar aumentos
 */

"use strict";

const path = require("path");
const fs   = require("fs");

const db  = require("./db_productos.js");
const img = require("./bajar_imagenes.js");

const OUT_DIR = process.env.OUT_DIR
             || path.join(require("os").homedir(), "Documents", "WEB-JR-SOLUCIONES-INFORMATICAS");

const args        = process.argv.slice(2);
const SIN_SCRAPE  = args.includes("--sin-scrape");
const SOLO_IMGS   = args.includes("--solo-imgs");
const PUBLICAR    = args.includes("--publicar");   // sube a GitHub Pages
const REPARAR     = args.includes("--reparar-imgs"); // fuerza rebajar todas
// GitHub tambien limita a ~500 escrituras por hora. Con 400 imagenes
// por corrida quedan ~410 escrituras, con margen. Lo que sobra se completa
// en la corrida siguiente: las imagenes solo se marcan como listas cuando
// la publicacion salio bien, asi que el proceso es reanudable.
const LIMITE_IMGS = 400;

function log(msg) { console.log(msg); }

// ── Comprobaciones previas ──────────────────────────────────────────
function verificarEntorno() {
  const faltan = [];
  if (!process.env.DATABASE_URL) faltan.push(
    "DATABASE_URL no está definida.\n" +
    "     En Railway: Postgres → Variables → copiar DATABASE_PUBLIC_URL\n" +
    "     En Windows: set DATABASE_URL=postgresql://..."
  );
  if (!db.hayPg()) faltan.push("Falta el paquete 'pg'. Corré: npm install pg");

  if (PUBLICAR && !process.env.GITHUB_TOKEN) faltan.push(
    "GITHUB_TOKEN no está definida (hace falta para publicar en GitHub Pages)"
  );

  if (faltan.length) {
    console.error("\n❌ No se puede continuar:\n");
    faltan.forEach(f => console.error("  · " + f));
    console.error("");
    process.exit(1);
  }
}

// ── Principal ───────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  console.log("═".repeat(58));
  console.log("  JR Shop — Sincronización de catálogo");
  console.log("═".repeat(58));

  verificarEntorno();

  // 0. Validar el acceso a GitHub antes de trabajar 20 minutos
  if (PUBLICAR) {
    log("\n▸ Verificando acceso a GitHub...");
    const gh = require("./github_push.js");
    const chk = await gh.verificarAcceso();
    if (!chk.ok) {
      console.error("\n❌ No se puede publicar:\n");
      console.error("  · " + chk.motivo + "\n");
      process.exit(1);
    }
    log(`  ✓ ${chk.repo} (rama ${chk.rama})`);
  }

  // 1. Scraping (salvo que se pida omitirlo)
  if (!SIN_SCRAPE && !SOLO_IMGS) {
    log("\n▸ Scrapeando proveedores...");
    const gen = require("./generar.js");
    if (typeof gen.obtenerProductos !== "function") {
      console.error("  ❌ generar.js no exporta obtenerProductos().");
      console.error("     Revisá que tenga el bloque module.exports al final.");
      process.exit(1);
    }
    const productos = await gen.obtenerProductos();
    log(`  ${productos.length} productos obtenidos`);

    if (!productos.length) {
      log("  ⚠ Sin productos: se conserva lo que ya está en la base.");
    } else {
      log("\n▸ Guardando en la base...");
      await db.sincronizar(productos, { log });
    }
  }

  // 2. Imágenes
  //    Se marcan como listas DESPUES de publicar: si la publicacion falla,
  //    la base no queda diciendo que estan cuando en el sitio no llegaron.
  let imagenesBajadas = [];
  if (!SIN_SCRAPE || SOLO_IMGS) {
    log("\n▸ Imágenes...");

    if (REPARAR) {
      const n = await db.reconciliarImagenes(new Set());
      log(`  reparación: ${n} imágenes marcadas para volver a bajar`);
    }

    // Confrontar la base con lo que realmente hay en GitHub
    else if (PUBLICAR) {
      try {
        const gh = require("./github_push.js");
        const publicadas = await gh.imagenesPublicadas();
        const rotas = await db.reconciliarImagenes(publicadas);
        if (rotas) {
          log(`  ${rotas} figuraban descargadas pero no están publicadas → se rebajan`);
        }
      } catch (e) {
        log(`  (no se pudo verificar contra GitHub: ${e.message})`);
      }
    }

    const pendientes = await db.pendientesDeImagen(LIMITE_IMGS);
    if (!pendientes.length) {
      log("  todas al día");
    } else {
      log(`  ${pendientes.length} pendientes`);
      const { ok } = await img.bajarTodas(pendientes, OUT_DIR, { log });
      imagenesBajadas = ok;

      // Sin publicar, el archivo queda en disco: se marca ahora
      if (!PUBLICAR && ok.length) {
        await db.marcarImagenes(ok);
        log(`  ${ok.length} registradas en la base`);
      }
    }
  }

  // 2b. PUBLICAR LAS IMAGENES ANTES QUE EL CATALOGO
  //     Asi el index.html que se genere despues solo va a listar productos
  //     cuya foto ya esta arriba. Si se hiciera al reves, el catalogo
  //     saldria anunciando productos con "Sin foto" hasta el dia siguiente.
  if (PUBLICAR && imagenesBajadas.length) {
    log("\n▸ Publicando imágenes...");
    const gh = require("./github_push.js");
    const fecha = new Date().toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const rImg = await gh.publicar(OUT_DIR, {
      log,
      mensaje: `Imagenes - ${fecha}`,
      soloImagenes: true,
    });

    const publicadas = new Set(rImg.rutas || []);
    const confirmadas = imagenesBajadas.filter(i => publicadas.has(i.ruta));
    if (confirmadas.length) {
      await db.marcarImagenes(confirmadas);
      log(`  ${confirmadas.length} imágenes publicadas y registradas`);
    }
    const sinPublicar = imagenesBajadas.length - confirmadas.length;
    if (sinPublicar) log(`  ${sinPublicar} quedaron para la próxima corrida`);
    imagenesBajadas = [];   // ya procesadas
  }

  if (SOLO_IMGS) {
    log(`\n✓ Listo en ${Math.round((Date.now()-t0)/1000)}s`);
    return;
  }

  // 3. Generar el sitio — solo con productos que ya tienen su foto arriba
  log("\n▸ Generando catálogo desde la base...");
  let productos = await db.leerActivos();
  const esperandoFoto = await db.contarSinFoto();
  log(`  ${productos.length} productos con foto`);
  if (esperandoFoto) {
    log(`  ${esperandoFoto} esperan su imagen — entran cuando esté publicada`);
  }

  // Red de seguridad: si casi nada tiene foto todavia (tipicamente la
  // primera corrida), publicar igual con placeholder. Un catalogo vacio
  // es peor que uno con algunas fotos faltando.
  const total = productos.length + esperandoFoto;
  if (total > 0 && productos.length < total * 0.5) {
    log(`  ⚠ menos de la mitad tiene foto — se publican todos por esta vez`);
    productos = await db.leerActivos({ incluirSinFoto: true });
    log(`  ${productos.length} productos (algunos sin foto)`);
  }

  if (!productos.length) {
    console.error("  ❌ La base está vacía. Corré primero sin --sin-scrape.");
    process.exit(1);
  }

  const gen = require("./generar.js");
  if (typeof gen.construirSitio !== "function") {
    console.error("  ❌ generar.js no exporta construirSitio().");
    process.exit(1);
  }
  // Ranking de vistas para la seccion "Los mas consultados".
  // Se pide a la API con el token del entorno: nunca viaja al navegador.
  let vistasTop = {};
  try {
    const base  = process.env.API_BASE || "https://www.jrshop.site";
    const token = process.env.API_TOKEN || "jrsoluciones2025";
    const res = await fetch(base + "/vistas-top", {
      headers: { "X-API-Token": token },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.ok && Array.isArray(data.vistas)) {
      for (const v of data.vistas) {
        if (v && v.id) vistasTop[v.id] = Number(v.count) || 0;
      }
      log(`  ranking de vistas: ${Object.keys(vistasTop).length} productos`);
    }
  } catch (e) {
    log(`  (sin ranking de vistas: ${e.message})`);
  }

  await gen.construirSitio(productos, { log, vistasTop });

  // 4. Publicar en GitHub Pages
  if (PUBLICAR) {
    log("\n▸ Publicando en GitHub Pages...");
    const gh = require("./github_push.js");
    const fecha = new Date().toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const r = await gh.publicar(OUT_DIR, {
      log,
      mensaje: `Actualizacion automatica - ${fecha}`,
    });
    if (!r.subidos) log("  el sitio ya estaba al día");

    // Marcar solo las imágenes que efectivamente entraron en la publicación.
    // Si el tope horario cortó la tanda, el resto queda pendiente y se
    // reintenta en la corrida siguiente.
    if (imagenesBajadas.length) {
      const publicadas = new Set(r.rutas || []);
      const confirmadas = imagenesBajadas.filter(i => publicadas.has(i.ruta));
      if (confirmadas.length) {
        await db.marcarImagenes(confirmadas);
        log(`  ${confirmadas.length} imágenes registradas en la base`);
      }
      const sinPublicar = imagenesBajadas.length - confirmadas.length;
      if (sinPublicar) {
        log(`  ${sinPublicar} imágenes quedaron sin publicar — se reintentan mañana`);
      }
    }
    if (r.pendientes) {
      log(`  quedan ${r.pendientes} archivos para la próxima corrida`);
    }
  }

  // 5. Resumen
  const dirImg = path.join(OUT_DIR, "img");
  let mb = 0, cant = 0;
  if (fs.existsSync(dirImg)) {
    for (const f of fs.readdirSync(dirImg)) {
      mb += fs.statSync(path.join(dirImg, f)).size;
      cant++;
    }
    mb = mb / 1048576;
  }

  console.log("\n" + "═".repeat(58));
  console.log(`  ✓ Listo en ${Math.round((Date.now()-t0)/1000)}s`);
  console.log(`    ${productos.length} productos · ${cant} imágenes (${mb.toFixed(0)} MB)`);
  console.log("═".repeat(58));
  if (!PUBLICAR) console.log("\n  Siguiente paso: actualizar.bat para publicar\n");
  else console.log("");

})().catch(e => {
  console.error("\n❌ Error:", e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
