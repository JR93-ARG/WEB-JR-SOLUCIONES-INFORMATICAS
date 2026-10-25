/* ───────────────────────────────────────────────────────────────
   tienda.js — Qué hace la gente en la tienda (jrshop.com.ar)
   Pantalla del panel: visitas, carrito, pasos del pedido, medios de pago,
   productos, búsquedas y de dónde llegan. Los datos salen de /panel/tienda/resumen.
   Usa los estilos de crm.js (tarjetas, KPIs, barras): se carga después de él.
   ─────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const RANGOS = [["hoy", "Hoy"], ["semana", "7 días"], ["mes", "30 días"], ["trimestre", "90 días"]];
  const PERIODO = { hoy: "hoy", semana: "los últimos 7 días", mes: "los últimos 30 días", trimestre: "los últimos 90 días" };
  const ANTES = { hoy: "ayer", semana: "los 7 días anteriores", mes: "los 30 días anteriores", trimestre: "los 90 días anteriores" };
  const MEDIOS = { transferencia: "Transferencia bancaria", mp: "Mercado Pago / tarjeta" };
  const ENTREGAS = { envio: "Envío a domicilio", retiro: "Retiro en el local", "sin dato": "Sin dato" };
  const ORIGENES = { directo: "Directo o sin dato", instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", google: "Google", otro: "Otros sitios" };
  const APARATOS = { celular: "Celular", pc: "Computadora", "sin dato": "Sin dato" };
  const CANALES = { whatsapp: "WhatsApp", copiar: "Copiar link" };

  const estado = { rango: "semana" };

  const css = `
  .tienda-pie{margin-top:18px;font-size:12px;color:var(--k-suave);line-height:1.5}
  .tienda-pie code{font-family:var(--k-mono);background:#eaf1ec;border-radius:5px;padding:1px 6px;color:var(--k-tinta)}
  .t-paso{display:grid;grid-template-columns:minmax(120px,170px) 1fr auto;gap:12px;align-items:center;padding:7px 0;font-size:13px}
  .t-paso .b{height:14px;background:var(--k-linea2);border-radius:7px;overflow:hidden}
  .t-paso .b i{display:block;height:100%;border-radius:7px;background:linear-gradient(90deg,var(--k-verde),var(--k-verde2));min-width:3px}
  .t-paso .v{font:600 13px var(--k-mono);color:var(--k-tinta);text-align:right;white-space:nowrap}
  .t-paso .v small{font:500 11px var(--k-mono);color:var(--k-suave);margin-left:6px}
  .t-paso.fin .b i{background:var(--k-tinta)}
  .t-paso.nar .b i{background:linear-gradient(90deg,#ea7a3a,#c2410c)}
  .t-dias{display:flex;align-items:flex-end;gap:3px;height:150px;padding-top:8px}
  .t-dia{flex:1;min-width:3px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}
  .t-dia i{display:block;border-radius:4px 4px 0 0;background:#b7e0c3;min-height:2px}
  .t-dia i.c{background:var(--k-verde2);border-radius:0}
  .t-dia i.p{background:var(--k-tinta);border-radius:0}
  .t-dia:hover i{filter:brightness(.92)}
  .t-leyenda{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:12px;color:var(--k-suave)}
  .t-leyenda b{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  .t-ejes{display:flex;justify-content:space-between;font:500 11px var(--k-mono);color:var(--k-suave);margin-top:4px}
  .t-medio{border:1px solid var(--k-linea);border-radius:12px;padding:14px;background:var(--k-fondo)}
  .t-medio+.t-medio{margin-top:10px}
  .t-medio .n{font-weight:700;color:var(--k-tinta);margin-bottom:8px}
  .t-medio .g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:left}
  .t-medio .g div span{display:block;font-size:11px;color:var(--k-suave)}
  .t-medio .g div b{font:600 20px var(--k-mono);color:var(--k-tinta)}
  .t-medio .g div.na b{color:var(--k-nar)}
  .t-lista .k-fila{cursor:default}
  .t-lista .k-fila .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .t-lista .k-fila .fx{min-width:0}
  .t-num{font:600 13px var(--k-mono);color:var(--k-tinta);white-space:nowrap;text-align:right}
  .t-num small{display:block;font:400 11px var(--k-mono);color:var(--k-suave)}
  .t-vacio-g{padding:36px 18px;text-align:center}
  .t-vacio-g h2{margin:0 0 6px;font-size:18px;color:var(--k-tinta)}
  .t-vacio-g p{margin:0 auto;max-width:520px;color:var(--k-suave);font-size:14px;line-height:1.55}
  .t-aviso{display:flex;gap:10px;align-items:flex-start;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;
    border-radius:12px;padding:11px 14px;font-size:13px;line-height:1.45;margin-bottom:14px}
  @media(max-width:640px){
    #sec-tienda .k-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #sec-tienda .k-kpi{padding:14px}
    #sec-tienda .k-kpi .v{font-size:25px}
    #sec-tienda .k-kpi.osc{grid-column:1 / -1}
    .t-paso{grid-template-columns:1fr auto;gap:4px 10px}
    .t-paso .b{grid-column:1 / -1;order:3}
    .t-medio .g b{font-size:17px}
  }`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0);
  const miles = n => Number(n || 0).toLocaleString("es-AR");
  const nombre = (m, k) => m[k] || k || "—";
  const corto = (t, n = 60) => (String(t || "").length > n ? String(t).slice(0, n - 1) + "…" : t || "");

  function delta(ahora, antes, periodoAnt) {
    const d = ahora - antes;
    const cls = d > 0 ? "sube" : d < 0 ? "baja" : "igual";
    const txt = d > 0 ? "▲ +" + d : d < 0 ? "▼ " + d : "= 0";
    return `<span class="k-delta ${cls}">${txt}</span>contra ${esc(periodoAnt)}`;
  }

  async function pedir(ruta) {
    const r = await api(ruta);
    if (!r.ok) throw new Error(r.error || "Error");
    return r;
  }

  async function abrir() {
    const el = $("sec-tienda");
    if (!el.dataset.listo) {
      el.dataset.listo = "1";
      el.classList.add("crm");
      el.addEventListener("click", e => {
        const b = e.target.closest("[data-rango-t]");
        if (b) { estado.rango = b.dataset.rangoT; pintar(); }
      });
    }
    pintar();
  }

  async function pintar() {
    const el = $("sec-tienda");
    el.innerHTML = '<div class="cargando">Cargando…</div>';
    let r;
    try { r = await pedir("/panel/tienda/resumen?rango=" + estado.rango); }
    catch (e) { el.innerHTML = `<div class="k-vacio">${esc(e.message)}</div>`; return; }

    const k = r.kpis, E = Object.fromEntries(r.embudo.map(x => [x.clave, x.n]));
    const antes = ANTES[r.rango];
    const desdeTxt = r.midiendo_desde ? fecha(r.midiendo_desde, false) : null;

    const cab = `
      <div class="crm-cab"><div><div class="crm-kick">TIENDA / COMPORTAMIENTO</div>
        <h1 class="crm-h1">Qué hace la gente en la tienda</h1>
        <p class="crm-sub">Quién entra, qué mira, qué agrega al carrito y hasta dónde llega en el pedido. Solo jrshop.com.ar.</p></div>
        <div class="crm-acc"><div class="k-seg" role="group" aria-label="Período">${RANGOS.map(([c, n]) =>
          `<button data-rango-t="${c}" class="${r.rango === c ? "on" : ""}">${n}</button>`).join("")}</div></div></div>`;

    if (!r.midiendo_desde) {
      el.innerHTML = cab + `<section class="k-card t-vacio-g"><h2>Todavía no hay datos</h2>
        <p>El sitio empieza a registrar las visitas cuando se publica la versión nueva de la tienda. Pasadas unas horas vas a ver acá el recorrido de la gente.</p></section>`;
      return;
    }

    const maxPaso = Math.max(1, ...r.embudo.map(x => x.n));
    const pasos = r.embudo.map((x, i) => {
      const prev = i ? r.embudo[i - 1].n : null;
      const cola = prev === null ? "" : `<small>${prev ? pct(x.n, prev) + "% del paso anterior" : ""}</small>`;
      return `<div class="t-paso${x.clave === "compraron" ? " fin" : ""}"><span>${esc(x.nombre)}</span>
        <div class="b"><i style="width:${Math.max(2, Math.round(x.n * 100 / maxPaso))}%"></i></div>
        <span class="v">${miles(x.n)}${cola}</span></div>`;
    }).join("");

    const maxAb = Math.max(1, ...r.abandono_pasos.map(x => x.n));
    const abandonos = r.abandono_pasos.map(x => `<div class="t-paso nar"><span>${esc(x.nombre)}</span>
      <div class="b"><i style="width:${x.n ? Math.max(3, Math.round(x.n * 100 / maxAb)) : 0}%"></i></div>
      <span class="v">${miles(x.n)}</span></div>`).join("");

    const barra = (nom, n, max, cls = "") => `<div class="k-barra ${cls}"><span>${esc(nom)}</span>
      <div class="b"><i style="width:${Math.round(n * 100 / max)}%"></i></div><span class="v">${miles(n)}</span></div>`;
    const lista = (arr, vacio, fila) => arr.length ? arr.map(fila).join("") : `<div class="k-vacio">${vacio}</div>`;

    // Día por día
    const maxDia = Math.max(1, ...r.diario.map(d => d.visitas));
    const dias = r.diario.map(d => `<div class="t-dia" title="${esc(fecha(d.dia + "T12:00:00", false))}: ${d.visitas} visitas · ${d.carritos} con carrito · ${d.pedidos} pedidos">
      <i style="height:${Math.max(2, Math.round(d.visitas * 100 / maxDia))}%"></i></div>`).join("");

    const minimo = r.minimo || { avisos: 0, compraron: 0 };
    const mpTotal = (r.pagos.find(p => p.medio === "mp") || {}).elegidos || 0;
    const sinTerminar = k.carritos_sin_comprar;

    el.innerHTML = cab + `
      <div class="k-kpis">
        <div class="k-kpi"><div class="l">Visitas</div><div class="v">${miles(k.visitas)}</div><div class="nt">${delta(k.visitas, k.visitas_antes, antes)}</div></div>
        <div class="k-kpi"><div class="l">Agregaron al carrito</div><div class="v">${miles(k.carritos)}</div>
          <div class="nt">${k.visitas ? pct(k.carritos, k.visitas) + "% de las visitas" : "—"}</div></div>
        <div class="k-kpi"><div class="l">Pedidos confirmados</div><div class="v">${miles(k.pedidos)}</div><div class="nt">${delta(k.pedidos, k.pedidos_antes, antes)}</div></div>
        <div class="k-kpi osc"><div class="l">Se quedaron a mitad del pedido</div><div class="v">${miles(sinTerminar)}</div>
          <div class="nt">${k.conversion === null ? "" : "Conversión: " + String(k.conversion).replace(".", ",") + "% de las visitas compra"}</div></div>
      </div>

      <section class="k-card" style="margin-bottom:14px">
        <div class="k-card-cab"><h2>Visitas día por día</h2><span class="fila-det">${esc(PERIODO[r.rango])}</span></div>
        ${r.diario.length ? `<div class="t-dias" role="img" aria-label="Visitas por día">${dias}</div>
          <div class="t-ejes"><span>${esc(fecha(r.diario[0].dia + "T12:00:00", false))}</span><span>${esc(fecha(r.diario[r.diario.length - 1].dia + "T12:00:00", false))}</span></div>`
          : '<div class="k-vacio">Sin visitas en este período</div>'}
      </section>

      <div class="k-grid2">
        <section class="k-card"><div class="k-card-cab"><h2>Del ingreso al pedido</h2><span class="fila-det">${esc(PERIODO[r.rango])}</span></div>
          ${pasos}
          <p class="k-nota">Cada barra cuenta visitas distintas, no clics. ${E.entraron ? `De cada 100 visitas, ${pct(E.compraron, E.entraron)} terminan en pedido.` : ""}</p></section>
        <section class="k-card"><div class="k-card-cab"><h2>Dónde se frenan</h2><span class="fila-det">abrieron el pedido y no lo confirmaron</span></div>
          ${abandonos}
          ${minimo.avisos ? `<div class="t-aviso" style="margin:12px 0 0"><span>⚠️</span><span><b>${miles(minimo.avisos)}</b> vieron el aviso de «mínimo de compra combinado»${minimo.compraron ? ` y ${miles(minimo.compraron)} compraron igual` : " y ninguno terminó la compra"}. Si pasa seguido, puede estar frenando ventas.</span></div>` : ""}
          <p class="k-nota">«En el pago» es la gente que llegó al último paso y no confirmó: la más cercana a comprar.</p></section>
      </div>

      <div class="k-grid2">
        <section class="k-card"><div class="k-card-cab"><h2>Medio de pago elegido</h2><span class="fila-det">lo último que eligió cada visita</span></div>
          ${r.pagos.length ? r.pagos.map(p => `<div class="t-medio"><div class="n">${esc(nombre(MEDIOS, p.medio))}</div>
            <div class="g"><div><span>Lo eligieron</span><b>${miles(p.elegidos)}</b></div><div><span>Compraron</span><b>${miles(p.compraron)}</b></div>
            <div class="${p.abandonaron ? "na" : ""}"><span>No terminaron</span><b>${miles(p.abandonaron)}</b></div></div></div>`).join("")
            : '<div class="k-vacio">Todavía nadie llegó a elegir cómo pagar</div>'}
          ${r.entregas.length ? `<div class="crm-kick" style="margin:16px 0 4px">PEDIDOS CONFIRMADOS</div>` + r.entregas.map(x => barra(nombre(ENTREGAS, x.tipo), x.n, Math.max(1, ...r.entregas.map(y => y.n)), "or")).join("") : ""}
          ${mpTotal === 0 && !r.pagos.some(p => p.medio === "mp") ? '<p class="k-nota">Mercado Pago no aparece como opción en la tienda hoy.</p>' : ""}</section>
        <section class="k-card"><div class="k-card-cab"><h2>De dónde llegan</h2></div>
          ${r.origenes.length ? r.origenes.map(o => barra(nombre(ORIGENES, o.origen), o.n, Math.max(1, ...r.origenes.map(y => y.n)), "or")).join("") : '<div class="k-vacio">Sin datos todavía</div>'}
          ${r.aparatos.length ? `<div class="crm-kick" style="margin:16px 0 4px">DESDE QUÉ APARATO</div>` + r.aparatos.map(o => barra(nombre(APARATOS, o.aparato), o.n, Math.max(1, ...r.aparatos.map(y => y.n)), "or")).join("") : ""}
          ${r.compartidos.length ? `<div class="crm-kick" style="margin:16px 0 4px">PRODUCTOS COMPARTIDOS</div>` + r.compartidos.map(o => barra(nombre(CANALES, o.canal), o.n, Math.max(1, ...r.compartidos.map(y => y.n)), "or")).join("") : ""}
          <p class="k-nota">«Directo» incluye a quien abre el link desde apps que no informan de dónde viene.</p></section>
      </div>

      <div class="k-grid2">
        <section class="k-card t-lista"><div class="k-card-cab"><h2>Productos más mirados</h2><span class="fila-det">vistas · al carrito</span></div>
          ${lista(r.mas_vistos, "Todavía no hay productos vistos", p => `<div class="k-fila"><div class="fx"><div class="t">${esc(corto(p.nombre))}</div>
            <div class="s">${esc(p.id)} · ${miles(p.visitas)} visita${p.visitas === 1 ? "" : "s"}</div></div>
            <div class="t-num">${miles(p.vistas)} vistas<small>${p.carritos ? p.carritos + " al carrito (" + pct(p.carritos, p.visitas) + "%)" : "ninguno al carrito"}</small></div></div>`)}
          <p class="k-nota">Muchas vistas y pocos carritos: revisá precio, foto o descripción.</p></section>
        <section class="k-card t-lista"><div class="k-card-cab"><h2>En carritos que no se compraron</h2><span class="fila-det">por producto</span></div>
          ${lista(r.en_carrito.filter(p => p.sin_comprar > 0), "No quedaron productos sin comprar", p => `<div class="k-fila"><div class="fx"><div class="t">${esc(corto(p.nombre))}</div>
            <div class="s">${esc(p.id)} · lo agregaron ${miles(p.carritos)} vez${p.carritos === 1 ? "" : "ces"}</div></div>
            <div class="t-num k-nar">${miles(p.sin_comprar)}<small>sin comprar</small></div></div>`)}
          <p class="k-nota">Son clientes que ya quisieron el producto: buenos para un mensaje o una promo.</p></section>
      </div>

      <div class="k-grid2">
        <section class="k-card t-lista"><div class="k-card-cab"><h2>Qué buscan</h2></div>
          ${lista(r.busquedas, "Todavía no hay búsquedas", b => `<div class="k-fila"><div class="fx"><div class="t">${esc(b.termino)}</div></div>
            <div class="t-num">${miles(b.n)}<small>${b.sin_resultados ? "sin resultados" : "búsqueda" + (b.n === 1 ? "" : "s")}</small></div></div>`)}</section>
        <section class="k-card t-lista"><div class="k-card-cab"><h2>Buscaron y no encontraron</h2></div>
          ${lista(r.sin_resultados, "Todo lo que buscaron tuvo resultados", b => `<div class="k-fila"><div class="fx"><div class="t">${esc(b.termino)}</div></div>
            <div class="t-num k-nar">${miles(b.n)}</div></div>`)}
          <p class="k-nota">Lo que se pide y no hay: idea directa de qué sumar al catálogo.</p></section>
      </div>

      <p class="tienda-pie">Se mide desde el ${esc(desdeTxt)}. No se guarda nombre, teléfono, mail ni IP: cada visita es un código al azar que vive solo en esa pestaña.
        Para que tus propias visitas no cuenten, abrí la tienda una vez con <code>#nomedir</code> al final de la dirección (por ejemplo <code>www.jrshop.com.ar/#nomedir</code>) en cada navegador que uses; con <code>#medir</code> se vuelve a activar.</p>`;
  }

  window.TIENDA = { abrir };
})();
