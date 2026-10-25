/* ───────────────────────────────────────────────────────────────
   crm.js — CRM comercial del panel
   Diseño: el del lienzo "CRM JR Soluciones", con los verdes del panel.
   Usa lo que ya tiene el panel: $, esc, plata, fecha, api, abrirModal,
   cerrarModal, avisar, waLink.
   Pestañas: Panel comercial · Pipeline · Contactos · Actividades ·
   Presupuestos. La ficha del contacto se abre encima.
   ─────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ── Textos ────────────────────────────────────────────────────
  const ETAPAS = [
    { id: "consulta_nueva", nombre: "Consulta nueva", linea: "#94a3a0" },
    { id: "presupuestado",  nombre: "Presupuestado",  linea: "#3f6fb5" },
    { id: "en_seguimiento", nombre: "En seguimiento", linea: "#0d9488" },
    { id: "aceptado",       nombre: "Aceptado",       linea: "#15803d" },
    { id: "perdido",        nombre: "Perdido",        linea: "#b3261e" },
  ];
  const ABIERTAS = ["consulta_nueva", "presupuestado", "en_seguimiento"];
  const NOM_ETAPA = Object.fromEntries(ETAPAS.map(e => [e.id, e.nombre]));
  const TIPOS_OP = { reparacion: "Reparación", venta: "Venta", mantenimiento: "Mantenimiento", sistema: "Sistema" };
  const TIPOS_CONTACTO = { cliente: "Cliente", interesado: "Interesado", empresa: "Empresa" };
  const ORIGENES = { whatsapp: "WhatsApp", mostrador: "Mostrador", instagram: "Instagram",
                     jrshop: "jrshop.com.ar", referido: "Referido", otro: "Otro" };
  const TIPOS_ACT = { llamada: "Llamada", whatsapp: "WhatsApp", visita: "Visita",
                      presupuesto: "Presupuesto", entrega: "Entrega" };
  const TIPOS_ITEM = { producto: "Producto", repuesto: "Repuesto", mano_de_obra: "Mano de obra", servicio: "Servicio" };
  const ESTADOS_PRE = { borrador: "Borrador", enviado: "Enviado", visto: "Visto", aceptado: "Aceptado", rechazado: "Rechazado" };
  const TIPO_EVENTO = { nota: "NOTA", whatsapp: "WHATSAPP", presupuesto: "PRESUPUESTO",
                        reparacion: "REPARACIÓN", venta: "VENTA", cambio_etapa: "ETAPA" };
  const MOTIVOS = ["Precio más barato en otro lado", "Tardamos en responder", "No consiguió el repuesto",
                   "Decidió no hacerlo", "No respondió", "Otro"];
  const DIAS_CONTACTO_VIEJO = 60;

  const R = { pestana: "resumen", rango: "mes", tipoOp: "", filtroContacto: "", buscaContacto: "",
              fichaId: null, filtroLinea: "", hoy: null, diaSel: null, preSel: null, estadoPre: "",
              pendientes: 0 };

  const etiqueta = (obj, k) => obj[k] || k || "—";
  const iniciales = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  const corto = (t, n = 90) => String(t || "").length > n ? String(t).slice(0, n - 2) + "…" : (t || "");

  // ── Fechas ────────────────────────────────────────────────────
  const diaDe = s => (s ? new Date(String(s).slice(0, 10) + "T12:00:00") : null);
  const difDias = (a, b) => Math.round((diaDe(a) - diaDe(b)) / 86400000);
  const hoyStr = () => R.hoy || new Date().toISOString().slice(0, 10);
  const DIAS_SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  function textoDia(s) {
    if (!s) return "sin fecha";
    const d = difDias(s, hoyStr());
    if (d === 0) return "hoy";
    if (d === 1) return "mañana";
    if (d === -1) return "ayer";
    if (d < 0 && d > -30) return "hace " + (-d) + " días";
    if (d > 1 && d < 7) return DIAS_SEM[diaDe(s).getDay()] + " " + diaDe(s).getDate();
    return fecha(s + "T12:00:00", false);
  }
  function haceDias(iso) {
    if (!iso) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  }
  function textoUltimo(iso) {
    const d = haceDias(iso);
    if (d === null) return { txt: "—", viejo: false };
    const txt = d === 0 ? "hoy" : d === 1 ? "ayer" : d < 60 ? "hace " + d + " días"
              : d < 365 ? "hace " + Math.round(d / 30) + " meses" : "hace más de un año";
    return { txt, viejo: d > DIAS_CONTACTO_VIEJO };
  }
  const mesAnio = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()] + ". " + d.getFullYear();
  };
  const montoOp = o => o.monto_estimado ? plata(o.monto_estimado) + (o.es_mensual ? "/mes" : "") : "A definir";

  // ── Estilos (verdes del panel; la mono es solo para números) ───
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap";
  document.head.appendChild(link);

  const css = `
  .crm, .crm-ficha{
    --k-tinta:#10281a; --k-tinta2:#1b3d29; --k-verde:#15803d; --k-verde2:#16a34a; --k-menta:#dcfce7;
    --k-claro:#f0fdf4; --k-linea:#dce7df; --k-linea2:#eaf1ec; --k-fondo:#f4f8f5; --k-suave:#5f7066;
    --k-texto:#33453a; --k-nar:#c2410c; --k-nar-bg:#ffedd5; --k-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  body.en-crm main{max-width:1500px}
  body.en-crm{background:#f4f8f5}
  .crm .mono,.crm-ficha .mono{font-family:var(--k-mono)}
  .crm-cab{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin:4px 0 18px}
  .crm-kick{font:500 11px var(--k-mono);letter-spacing:.08em;color:var(--k-suave);text-transform:uppercase}
  .crm-h1{margin:3px 0 4px;font-size:26px;font-weight:700;letter-spacing:-.015em;color:var(--k-tinta)}
  .crm-sub{margin:0;font-size:14px;color:var(--k-suave);max-width:640px}
  .crm-acc{display:flex;flex-wrap:wrap;gap:8px;align-items:center}

  .crm-tabs{display:flex;gap:4px;margin-bottom:18px;overflow-x:auto;background:#fff;border:1px solid var(--k-linea);
    border-radius:12px;padding:4px;-webkit-overflow-scrolling:touch}
  .crm-tabs::-webkit-scrollbar{display:none}
  .crm-tab{background:none;border:none;padding:9px 16px;border-radius:9px;font-size:14px;font-weight:600;
    color:var(--k-suave);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:8px}
  .crm-tab:hover{background:var(--k-claro)}
  .crm-tab.on{background:var(--k-tinta);color:#fff}
  .crm-tab .bd{font:600 11px var(--k-mono);background:#f59e0b;color:#2b1700;border-radius:10px;padding:1px 7px}

  .k-btn{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 16px;border-radius:10px;
    font:600 14px inherit;cursor:pointer;border:1px solid var(--k-linea);background:#fff;color:var(--k-tinta);text-decoration:none}
  .k-btn:hover{background:var(--k-claro);border-color:#b9d3c3}
  .k-btn.pri{background:var(--k-verde);border-color:var(--k-verde);color:#fff}
  .k-btn.pri:hover{background:#166534}
  .k-btn.osc{background:var(--k-tinta);border-color:var(--k-tinta);color:#fff}
  .k-btn.osc:hover{background:var(--k-tinta2)}
  .k-btn.wa{background:#25D366;border-color:#25D366;color:#fff}
  .k-btn.rojo{color:#b3261e}
  .k-btn.chico{min-height:34px;padding:0 12px;font-size:13px;border-radius:8px}

  .k-seg{display:inline-flex;border:1px solid var(--k-linea);border-radius:10px;overflow:hidden;background:#fff}
  .k-seg button{min-height:40px;padding:0 15px;border:0;background:#fff;color:var(--k-texto);font:600 13px inherit;cursor:pointer}
  .k-seg button.on{background:var(--k-tinta);color:#fff}
  .k-chips{display:flex;flex-wrap:wrap;gap:7px}
  .k-chip{min-height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--k-linea);background:#fff;color:var(--k-texto);
    font:600 13px inherit;cursor:pointer}
  .k-chip:hover{border-color:#b9d3c3}
  .k-chip.on{background:var(--k-tinta);border-color:var(--k-tinta);color:#fff}
  .k-chip .n{font-family:var(--k-mono);opacity:.75;margin-left:3px}

  .k-card{background:#fff;border:1px solid var(--k-linea);border-radius:14px;padding:18px;min-width:0}
  .k-card h2{margin:0;font-size:16px;font-weight:700;color:var(--k-tinta)}
  .k-card-cab{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:12px}
  .k-card-cab a{font-size:13px;color:var(--k-verde);text-decoration:none;font-weight:600}
  .k-nota{margin:12px 0 0;font-size:12px;color:var(--k-suave)}
  .k-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-bottom:14px}

  /* KPIs */
  .k-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px;margin-bottom:14px}
  .k-kpi{background:#fff;border:1px solid var(--k-linea);border-radius:14px;padding:16px 18px;position:relative;overflow:hidden}
  .k-kpi::before{content:"";position:absolute;left:0;top:0;right:0;height:3px;background:var(--k-verde2)}
  .k-kpi .l{font-size:13px;color:var(--k-suave);font-weight:500}
  .k-kpi .v{font:600 31px var(--k-mono);letter-spacing:-.03em;color:var(--k-tinta);margin:6px 0 4px}
  .k-kpi .nt{font-size:12px;color:var(--k-texto)}
  .k-kpi.osc{background:linear-gradient(150deg,var(--k-tinta2),var(--k-tinta));border-color:var(--k-tinta)}
  .k-kpi.osc::before{background:#4ade80}
  .k-kpi.osc .l{color:#a7c4b2}.k-kpi.osc .v{color:#fff}.k-kpi.osc .nt{color:#c9dccf}
  .k-delta{display:inline-block;font:600 11px var(--k-mono);padding:2px 8px;border-radius:10px;margin-right:6px}
  .k-delta.sube{background:var(--k-menta);color:#14532d}.k-delta.baja{background:#fee2e2;color:#991b1b}.k-delta.igual{background:#eef2ef;color:var(--k-suave)}
  .k-nar{color:var(--k-nar);font-weight:700}

  /* Barras */
  .k-barra{display:grid;grid-template-columns:118px 1fr 36px;gap:10px;align-items:center;padding:6px 0;font-size:13px}
  .k-barra .b{height:12px;background:var(--k-linea2);border-radius:6px;overflow:hidden}
  .k-barra .b i{display:block;height:100%;border-radius:6px;background:var(--k-verde);min-width:3px}
  .k-barra .v{font:600 13px var(--k-mono);text-align:right;color:var(--k-texto)}
  .k-barra.or .b i{background:var(--k-verde2)}
  .k-barra.pe .b i{background:#e0867d}

  /* Para hacer hoy / listas de filas */
  .k-fila{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--k-linea2);cursor:pointer}
  .k-fila:first-of-type{border-top:none}
  .k-fila .t{font-size:14px;font-weight:600;color:var(--k-tinta)}
  .k-fila .s{font-size:12px;color:var(--k-suave);margin-top:1px}
  .k-fila .fx{flex:1;min-width:0}
  .k-pill{font:600 11px var(--k-mono);padding:3px 9px;border-radius:10px;background:#eef2ef;color:var(--k-texto);white-space:nowrap;display:inline-block}
  .k-pill.nar{background:var(--k-nar-bg);color:#9a3412}
  .k-pill.ver{background:var(--k-menta);color:#14532d}
  .k-pill.azul{background:#e3ebf6;color:#1f4b8a}
  .k-pill.osc{background:var(--k-tinta);color:#fff}
  .k-pill.punteado{background:#fff;border:1px dashed #a9bdb0}
  .k-vacio{padding:26px 10px;text-align:center;color:var(--k-suave);font-size:14px}

  /* Pipeline */
  .k-scroll{overflow-x:auto;padding-bottom:10px;-webkit-overflow-scrolling:touch}
  .k-kanban{display:grid;grid-template-columns:repeat(5,minmax(252px,1fr));gap:14px;align-items:start}
  .k-col{background:#e9f0ea;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:420px;transition:background .12s}
  .k-col.sobre{background:#d3ebd9;outline:2px dashed var(--k-verde2)}
  .k-col-cab{padding:2px 4px 8px;border-bottom:3px solid var(--lin,#94a3a0)}
  .k-col-cab .a{display:flex;justify-content:space-between;align-items:baseline}
  .k-col-cab h3{margin:0;font-size:14px;font-weight:700;color:var(--k-tinta)}
  .k-col-cab .n{font:500 12px var(--k-mono);color:var(--k-suave)}
  .k-col-cab .tot{font:600 13px var(--k-mono);color:var(--k-texto);margin-top:2px}
  .k-op{background:#fff;border:1px solid var(--k-linea);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;
    cursor:grab;box-shadow:0 1px 2px rgba(16,40,26,.05);transition:box-shadow .12s,transform .12s}
  .k-op:hover{box-shadow:0 6px 18px rgba(16,40,26,.1);transform:translateY(-1px)}
  .k-op.arr{opacity:.4}
  .k-op .r1{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .k-op .cod{font:500 11px var(--k-mono);color:var(--k-suave)}
  .k-op .cli{font-size:14px;font-weight:700;color:var(--k-tinta)}
  .k-op .det{font-size:13px;color:var(--k-texto);line-height:1.35;margin-top:2px}
  .k-op .r3{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .k-op .mt{font:600 14px var(--k-mono);color:var(--k-tinta)}
  .k-op .or{font-size:12px;color:var(--k-suave)}
  .k-op .px{display:flex;align-items:center;gap:6px;padding-top:8px;border-top:1px dashed var(--k-linea);font-size:12px;color:var(--k-suave)}
  .k-op .px.nar{color:var(--k-nar);font-weight:600}
  .k-op .px svg{flex:none}
  .k-col-vacia{font-size:12px;color:var(--k-suave);text-align:center;padding:22px 6px}
  .t-rep{background:#e3ebf6;color:#1f4b8a}.t-ven{background:var(--k-menta);color:#14532d}
  .t-man{background:#fef3c7;color:#854d0e}.t-sis{background:#ede9fe;color:#5b21b6}

  /* Contactos */
  .k-barra-filtros{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
  .k-buscar{flex:1 1 280px;min-height:42px;padding:0 14px;border:1px solid var(--k-linea);border-radius:10px;background:#fff;font:inherit;
    outline:none}
  .k-buscar:focus{border-color:var(--k-verde2)}
  .k-tabla-w{background:#fff;border:1px solid var(--k-linea);border-radius:14px;overflow-x:auto}
  .k-tabla{width:100%;border-collapse:collapse;min-width:920px}
  .k-tabla th{font:600 11px var(--k-mono);letter-spacing:.06em;text-align:left;padding:12px 14px;color:var(--k-suave);
    background:var(--k-fondo);border-bottom:1px solid var(--k-linea);text-transform:uppercase;white-space:nowrap}
  .k-tabla td{padding:11px 14px;border-bottom:1px solid var(--k-linea2);font-size:14px;vertical-align:middle}
  .k-tabla tr.fi{cursor:pointer}.k-tabla tr.fi:hover td{background:var(--k-claro)}
  .k-tabla tr:last-child td{border-bottom:none}
  .k-ava{width:34px;height:34px;border-radius:50%;background:var(--k-menta);color:#14532d;display:flex;align-items:center;
    justify-content:center;font-size:12px;font-weight:700;flex:none}
  .k-ava.cuad{border-radius:10px;width:58px;height:58px;font:600 20px var(--k-mono);background:var(--k-tinta);color:#fff}
  .k-lista-m{display:none}

  /* Ficha */
  #crmFicha{position:fixed;inset:0;background:#f4f8f5;z-index:110;overflow-y:auto}
  .f-wrap{max-width:1380px;margin:0 auto;padding:18px 20px 60px}
  .f-volver{background:none;border:none;color:var(--k-verde);font-weight:700;font-size:14px;cursor:pointer;padding:6px 0;margin-bottom:8px}
  .f-cab{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
  .f-id{display:flex;align-items:center;gap:16px}
  .f-nom{margin:0 0 6px;font-size:25px;font-weight:700;letter-spacing:-.015em;color:var(--k-tinta)}
  .f-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;align-items:start}
  .f-col{display:flex;flex-direction:column;gap:16px;min-width:0}
  .f-dato{display:flex;flex-direction:column;gap:2px;margin-bottom:11px}
  .f-dato:last-child{margin-bottom:0}
  .f-dato .k{font:500 11px var(--k-mono);letter-spacing:.06em;color:var(--k-suave);text-transform:uppercase}
  .f-dato .v{font-size:14px;color:var(--k-tinta);word-break:break-word;white-space:pre-wrap}
  .f-eq{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--k-linea2);font-size:13px}
  .f-eq .x{background:none;border:none;color:#9bb0a3;cursor:pointer;font-size:15px}
  .f-nota{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--k-linea);border-radius:10px;font:inherit;
    min-height:58px;resize:vertical;outline:none}
  .f-nota:focus{border-color:var(--k-verde2)}
  .f-lin{list-style:none;margin:14px 0 0;padding:0}
  .f-ev{display:grid;grid-template-columns:18px 1fr;gap:12px}
  .f-ev .rail{display:flex;flex-direction:column;align-items:center}
  .f-ev .dot{width:12px;height:12px;border-radius:50%;border:2px solid var(--k-verde2);background:#fff;margin-top:4px;flex:none}
  .f-ev .rail i{flex:1;width:2px;background:var(--k-linea2);margin-top:3px}
  .f-ev:last-child .rail i{display:none}
  .f-ev .tt{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:14px;font-weight:600;color:var(--k-tinta)}
  .f-ev .cu{font:500 12px var(--k-mono);color:var(--k-suave);font-weight:400}
  .f-ev .ty{font:500 11px var(--k-mono);letter-spacing:.05em;color:var(--k-suave);margin-top:2px}
  .f-ev p{margin:3px 0 0;font-size:13px;color:var(--k-texto);line-height:1.45;white-space:pre-wrap}
  .f-ev .cuerpo{padding-bottom:16px}
  .k-etapas{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:10px 0 6px}
  .k-etapas button{height:26px;border:none;border-radius:4px;background:#e3ece6;color:var(--k-suave);font-size:9.5px;font-weight:700;cursor:pointer;line-height:1.1;padding:0 2px}
  .k-etapas button.pasada{background:#a7d8b6;color:#14532d}
  .k-etapas button.actual{background:var(--k-verde2);color:#fff}
  .k-etapas button.actual.perdido{background:#dc2626}
  .k-tot{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  .k-tot .l{font-size:12px;color:var(--k-suave)}.k-tot .v{font:600 18px var(--k-mono);color:var(--k-tinta)}

  /* Actividades */
  .k-semana{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;max-width:780px;margin-bottom:16px}
  .k-dia{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px;min-height:68px;border-radius:12px;cursor:pointer;
    background:#fff;border:1px solid var(--k-linea);font:inherit;color:var(--k-tinta)}
  .k-dia .d{font:500 11px var(--k-mono);letter-spacing:.06em;opacity:.7;text-transform:uppercase}
  .k-dia .n{font:600 19px var(--k-mono)}
  .k-dia .c{font-size:11px;opacity:.75}
  .k-dia.hoy{border-color:var(--k-verde2);background:var(--k-claro)}
  .k-dia.sel{background:var(--k-tinta);border-color:var(--k-tinta);color:#fff}
  .k-act-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:start}
  .k-act-izq{grid-column:span 2;display:flex;flex-direction:column;gap:16px;min-width:0}
  .k-gr{background:#fff;border:1px solid var(--k-linea);border-radius:14px;overflow:hidden}
  .k-gr-cab{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--k-fondo)}
  .k-gr-cab.venc{background:var(--k-nar-bg);color:#9a3412}
  .k-gr-cab h2{margin:0;font-size:14px;font-weight:700}
  .k-gr-cab span{font:500 12px var(--k-mono)}
  .k-act{display:flex;align-items:center;gap:14px;padding:12px 16px;border-top:1px solid var(--k-linea2);min-height:44px}
  .k-act input{width:20px;height:20px;accent-color:var(--k-verde);cursor:pointer;flex:none}
  .k-act .ty{font:600 11px var(--k-mono);letter-spacing:.04em;width:92px;flex:none;color:var(--k-texto);text-transform:uppercase}
  .k-act .tx{flex:1;min-width:0}
  .k-act .tx b{display:block;font-size:14px;font-weight:600;color:var(--k-tinta)}
  .k-act .tx span{font-size:12px;color:var(--k-suave)}
  .k-act .tx a{color:var(--k-verde);text-decoration:none;font-weight:600}
  .k-act .fe{font:500 12px var(--k-mono);color:var(--k-suave);white-space:nowrap}
  .k-act .fe.nar{color:var(--k-nar);font-weight:700}
  .k-act.hecha .tx{text-decoration:line-through;opacity:.55}
  .k-prog{height:9px;background:var(--k-linea2);border-radius:5px;overflow:hidden;margin-top:6px}
  .k-prog i{display:block;height:100%;background:var(--k-verde2);border-radius:5px}
  .k-regla{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--k-linea2);font-size:13px;line-height:1.4}
  .k-regla b{font:600 12px var(--k-mono);color:var(--k-verde);flex:none}

  /* Presupuestos */
  .k-pre-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;align-items:start}
  .k-pre-tabla tr.sel td{background:var(--k-claro)}
  .k-pre-tabla tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--k-verde2)}
  .k-aside{display:flex;flex-direction:column;max-width:540px;padding:0}
  .k-aside .cab{padding:18px 20px;border-bottom:1px solid var(--k-linea2);display:flex;flex-direction:column;gap:6px}
  .k-aside .it{display:grid;grid-template-columns:1fr auto;gap:12px;padding:12px 0;border-bottom:1px dashed var(--k-linea)}
  .k-aside .it .q{font:400 12px var(--k-mono);color:var(--k-suave)}
  .k-aside .pie{padding:16px 20px;border-top:1px solid var(--k-linea2);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .k-item-fila{display:grid;grid-template-columns:1fr 64px 110px;gap:7px;margin-bottom:8px}
  .k-item-fila input,.k-item-fila select{min-width:0}

  .k-modal-sel{background:var(--k-claro);border:1px solid #b9dcc5;border-radius:10px;padding:9px 12px;font-size:13px;
    display:flex;justify-content:space-between;align-items:center;gap:8px}
  .k-modal-sel button{background:none;border:none;color:var(--k-suave);cursor:pointer;font-size:12px;text-decoration:underline}
  .k-sug{border:1px solid var(--k-linea);border-radius:10px;margin-top:6px;overflow:hidden}
  .k-sug div{padding:9px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--k-linea2)}
  .k-sug div:last-child{border-bottom:none}.k-sug div:hover{background:var(--k-claro)}

  @media(max-width:760px){
    .crm-h1{font-size:22px}
    .k-tabla-w{display:none}
    .k-lista-m{display:block}
    .k-act-izq{grid-column:span 1}
    .k-act .ty{display:none}
    .k-kanban{grid-template-columns:repeat(5,82vw)}
    .f-wrap{padding:12px 12px 60px}
  }
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  // ── API ───────────────────────────────────────────────────────
  async function pedir(ruta, cuerpo) {
    const r = await api(ruta, cuerpo === undefined ? {} : { method: "POST", body: JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error(r.error || "Error");
    return r;
  }
  const falla = e => alert(e && e.message ? e.message : "No se pudo completar la acción");

  // ── Esqueleto ─────────────────────────────────────────────────
  const raiz = () => $("sec-crm");
  const cuerpo = () => $("crmCuerpo");

  function armar() {
    const el = raiz();
    if (el.dataset.listo) return;
    el.dataset.listo = "1";
    el.classList.add("crm");
    el.innerHTML = `
      <div class="crm-tabs" id="crmTabs" role="tablist">
        <button class="crm-tab" data-p="resumen">Panel comercial</button>
        <button class="crm-tab" data-p="pipeline">Pipeline</button>
        <button class="crm-tab" data-p="contactos">Contactos</button>
        <button class="crm-tab" data-p="actividades">Actividades <span class="bd oculto" id="crmBadge"></span></button>
        <button class="crm-tab" data-p="presupuestos">Presupuestos</button>
      </div>
      <div id="crmCuerpo"></div>`;
    $("crmTabs").addEventListener("click", e => {
      const b = e.target.closest(".crm-tab");
      if (b) irPestana(b.dataset.p);
    });
    el.addEventListener("click", clic);
    el.addEventListener("input", entrada);
    el.addEventListener("dragstart", arrIni);
    el.addEventListener("dragend", arrFin);
    el.addEventListener("dragover", arrSobre);
    el.addEventListener("dragleave", arrSale);
    el.addEventListener("drop", arrSuelta);
  }

  function irPestana(p) {
    R.pestana = p;
    document.querySelectorAll("#crmTabs .crm-tab").forEach(b => b.classList.toggle("on", b.dataset.p === p));
    const f = { resumen: pintarResumen, pipeline: pintarPipeline, contactos: pintarContactos,
                actividades: pintarActividades, presupuestos: pintarPresupuestos }[p];
    cuerpo().innerHTML = '<div class="cargando">Cargando…</div>';
    f().catch(e => { cuerpo().innerHTML = `<div class="k-vacio">${esc(e.message)}</div>`; });
    refrescarInsignia();
  }

  async function refrescarInsignia() {
    try {
      const r = await pedir("/panel/crm/actividades");
      R.hoy = r.hoy;
      const n = r.actividades.filter(a => !a.hecha && a.vence_en && a.vence_en <= r.hoy).length;
      R.pendientes = n;
      const b = $("crmBadge");
      if (b) { b.textContent = n; b.classList.toggle("oculto", !n); }
    } catch {}
  }

  function abrir() { armar(); irPestana(R.pestana); }

  const cabecera = (kick, titulo, sub, acciones = "") => `
    <div class="crm-cab"><div><div class="crm-kick">CRM / ${esc(kick)}</div>
      <h1 class="crm-h1">${esc(titulo)}</h1><p class="crm-sub">${esc(sub)}</p></div>
      <div class="crm-acc">${acciones}</div></div>`;

  // ═══ 1. PANEL COMERCIAL ═════════════════════════════════════════
  async function pintarResumen() {
    const r = await pedir("/panel/crm/resumen?rango=" + R.rango);
    const per = { semana: "esta semana", mes: "este mes", trimestre: "este trimestre" }[r.rango];
    const ant = { semana: "la semana pasada", mes: "el mes pasado", trimestre: "el trimestre pasado" }[r.rango];
    const dif = r.consultas_nuevas - r.consultas_nuevas_antes;
    const delta = `<span class="k-delta ${dif > 0 ? "sube" : dif < 0 ? "baja" : "igual"}">${dif > 0 ? "▲ +" : dif < 0 ? "▼ " : "= "}${dif}</span>contra ${ant}`;
    const mx = Math.max(1, ...r.embudo.map(e => e.n));
    const mxO = Math.max(1, ...r.origenes.map(o => o.n));
    const mxM = Math.max(1, ...r.motivos_perdida.map(o => o.n));
    const barra = (nom, n, max, cls = "") => `<div class="k-barra ${cls}"><span>${esc(nom)}</span>
      <div class="b"><i style="width:${Math.round(n * 100 / max)}%"></i></div><span class="v">${n}</span></div>`;
    const cierre = r.embudo[0].n ? Math.round(r.embudo[3].n * 10 / r.embudo[0].n) : 0;

    cuerpo().innerHTML = cabecera("PANEL COMERCIAL", "Cómo vienen las ventas",
      "Consultas, presupuestos y cierres. Todo sale de lo que se carga en el pipeline.",
      `<div class="k-seg" role="group" aria-label="Período">${[["semana", "Esta semana"], ["mes", "Este mes"], ["trimestre", "Trimestre"]]
        .map(([k, n]) => `<button data-rango="${k}" class="${r.rango === k ? "on" : ""}">${n}</button>`).join("")}</div>
       <button class="k-btn pri" data-acc="nueva-op">+ Nueva consulta</button>`) + `
      <div class="k-kpis">
        <div class="k-kpi"><div class="l">Consultas nuevas</div><div class="v">${r.consultas_nuevas}</div><div class="nt">${delta}</div></div>
        <div class="k-kpi"><div class="l">Presupuestos enviados</div><div class="v">${r.presupuestos_enviados}</div>
          <div class="nt">${r.presupuestos_sin_respuesta ? `<span class="k-nar">${r.presupuestos_sin_respuesta} sin movimiento hace más de 3 días</span>` : "Ninguno esperando hace más de 3 días"}</div></div>
        <div class="k-kpi"><div class="l">Tasa de cierre</div><div class="v">${r.tasa_cierre === null ? "—" : r.tasa_cierre + "%"}</div>
          <div class="nt">${r.aceptadas} aceptadas · ${r.perdidas} perdidas ${esc(per)}</div></div>
        <div class="k-kpi osc"><div class="l">Monto en juego</div><div class="v">${plata(r.monto_en_juego)}</div>
          <div class="nt">${r.abiertas} abierta${r.abiertas === 1 ? "" : "s"}${r.monto_mensual_en_juego ? " · + " + plata(r.monto_mensual_en_juego) + " por mes" : ""}</div></div>
      </div>
      <div class="k-grid2">
        <section class="k-card"><div class="k-card-cab"><h2>Embudo ${esc(per)}</h2><a href="#" data-p-ir="pipeline">Ver pipeline</a></div>
          ${r.embudo.map(e => barra(e.nombre, e.n, mx, e.etapa === "perdido" ? "pe" : "")).join("")}
          <p class="k-nota">${r.embudo[0].n ? `De cada 10 consultas, ${cierre} terminan aceptadas.` : "Todavía no hay consultas en este período."}</p></section>
        <section class="k-card"><div class="k-card-cab"><h2>De dónde llegan las consultas</h2></div>
          ${r.origenes.length ? r.origenes.map(o => barra(etiqueta(ORIGENES, o.origen === "sin dato" ? "" : o.origen) === "—" ? "Sin dato" : etiqueta(ORIGENES, o.origen), o.n, mxO, "or")).join("")
            : '<div class="k-vacio">Todavía no hay consultas</div>'}
          <p class="k-nota">Cargá siempre el origen: es lo que te dice dónde conviene poner el esfuerzo.</p></section>
      </div>
      <div class="k-grid2">
        <section class="k-card"><div class="k-card-cab"><h2>Para hacer hoy</h2><a href="#" data-p-ir="actividades">Ver todas</a></div>
          ${r.para_hoy.length ? r.para_hoy.map(h => `
            <div class="k-fila" data-ficha="${esc(h.contacto_id)}"><div class="fx"><div class="t">${esc(h.titulo)}</div>
              <div class="s">${esc(h.contacto)}${h.origen === "oportunidad" ? " · próxima acción" : ""}</div></div>
              <span class="k-pill ${h.vencida ? "nar" : ""}">${h.vencida ? "VENCIDA" : esc(etiqueta(TIPOS_ACT, h.tipo).toUpperCase())}</span></div>`).join("")
            : '<div class="k-vacio">Nada pendiente para hoy 🎉</div>'}</section>
        <section class="k-card"><div class="k-card-cab"><h2>Por qué se perdieron</h2></div>
          ${r.motivos_perdida.length ? r.motivos_perdida.map(o => barra(o.motivo, o.n, mxM, "pe")).join("")
            : '<div class="k-vacio">No hay oportunidades perdidas en este período</div>'}
          <p class="k-nota">Se carga al mover una tarjeta a «Perdido». Sirve para ajustar precios y tiempos de respuesta.</p></section>
      </div>`;
  }

  // ═══ 2. PIPELINE ════════════════════════════════════════════════
  let opsCache = [];
  async function pintarPipeline() {
    const r = await pedir("/panel/crm/pipeline" + (R.tipoOp ? "?tipo=" + R.tipoOp : ""));
    opsCache = r.oportunidades;
    const chip = (k, n) => `<button class="k-chip${R.tipoOp === k ? " on" : ""}" data-tipo-op="${k}">${n}</button>`;
    cuerpo().innerHTML = cabecera("PIPELINE", "Oportunidades abiertas",
      "Cada tarjeta es una consulta que todavía no se cerró. Arrastrala a la etapa siguiente cuando avance (en el celular, tocala).",
      `<button class="k-btn pri" data-acc="nueva-op">+ Nueva oportunidad</button>`) + `
      <div class="k-chips" style="margin-bottom:14px" role="group" aria-label="Filtrar por tipo">
        ${chip("", "Todas")}${Object.entries(TIPOS_OP).map(([k, n]) => chip(k, n)).join("")}</div>
      <div class="k-scroll"><div class="k-kanban">
        ${ETAPAS.map(e => {
          const ops = opsCache.filter(o => o.etapa === e.id);
          const suma = ops.filter(o => !o.es_mensual).reduce((a, o) => a + (Number(o.monto_estimado) || 0), 0);
          const mes = ops.filter(o => o.es_mensual).reduce((a, o) => a + (Number(o.monto_estimado) || 0), 0);
          const leyenda = e.id === "perdido" ? "últimos 60 días" : e.id === "aceptado" ? "últimos 60 días" : "en juego";
          return `<section class="k-col" data-etapa="${e.id}" aria-label="${esc(e.nombre)}">
            <div class="k-col-cab" style="--lin:${e.linea}"><div class="a"><h3>${esc(e.nombre)}</h3>
              <span class="n">${ops.length} oportunidad${ops.length === 1 ? "" : "es"}</span></div>
              <div class="tot">${[suma || !mes ? plata(suma) : "", mes ? plata(mes) + "/mes" : ""].filter(Boolean).join(" + ")}</div>
              <div style="font-size:11px;color:var(--k-suave)">${leyenda}</div></div>
            ${ops.length ? ops.map(tarjetaOp).join("") : '<div class="k-col-vacia">Sin oportunidades</div>'}
          </section>`;
        }).join("")}
      </div></div>`;
  }

  const claseTipo = t => ({ reparacion: "t-rep", venta: "t-ven", mantenimiento: "t-man", sistema: "t-sis" }[t] || "");
  const RELOJ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

  function tarjetaOp(o) {
    return `<article class="k-op" draggable="true" data-op="${o.id}">
      <div class="r1"><span class="cod">${esc(o.codigo)}</span><span class="k-pill ${claseTipo(o.tipo)}" style="font-family:inherit">${esc(etiqueta(TIPOS_OP, o.tipo))}</span></div>
      <div><div class="cli">${esc(o.contacto)}</div>${o.detalle ? `<div class="det">${esc(corto(o.detalle, 80))}</div>` : ""}</div>
      <div class="r3"><span class="mt">${montoOp(o)}</span><span class="or">${esc(etiqueta(ORIGENES, o.origen))}</span></div>
      ${o.proxima_accion ? `<div class="px ${o.accion_urgente ? "nar" : ""}">${RELOJ}<span>${esc(corto(o.proxima_accion, 46))}${o.proxima_accion_fecha ? " · " + esc(textoDia(o.proxima_accion_fecha)) : ""}</span></div>` : ""}
    </article>`;
  }

  // Arrastrar y soltar (escritorio)
  let arrId = null;
  function arrIni(e) {
    const t = e.target.closest && e.target.closest(".k-op");
    if (!t) return;
    arrId = t.dataset.op; t.classList.add("arr");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", arrId); } catch {}
  }
  function arrFin() {
    arrId = null;
    document.querySelectorAll(".k-op.arr,.k-col.sobre").forEach(x => x.classList.remove("arr", "sobre"));
  }
  function arrSobre(e) {
    const c = e.target.closest && e.target.closest(".k-col");
    if (!c || !arrId) return;
    e.preventDefault();
    document.querySelectorAll(".k-col.sobre").forEach(x => { if (x !== c) x.classList.remove("sobre"); });
    c.classList.add("sobre");
  }
  function arrSale(e) {
    const c = e.target.closest && e.target.closest(".k-col");
    if (c && !c.contains(e.relatedTarget)) c.classList.remove("sobre");
  }
  function arrSuelta(e) {
    const c = e.target.closest && e.target.closest(".k-col");
    if (!c || !arrId) return;
    e.preventDefault();
    const id = arrId; arrFin();
    moverOp(id, c.dataset.etapa);
  }

  // Cambia la etapa; al perder pide el motivo
  function moverOp(id, etapa, despues) {
    const op = opsCache.find(o => String(o.id) === String(id));
    if (op && op.etapa === etapa) return;
    const aplicar = async motivo => {
      try {
        await pedir(`/panel/crm/oportunidad/${id}/etapa`, { etapa, motivo_perdida: motivo || "" });
        cerrarModal();
        if (despues) await despues(); else irPestana(R.pestana);
        refrescarInsignia();
      } catch (e) { falla(e); }
    };
    if (etapa !== "perdido") return aplicar();
    abrirModal("¿Por qué se perdió?", `
      <div class="campo"><label>Motivo</label>
        <select id="mpSel">${MOTIVOS.map(m => `<option>${esc(m)}</option>`).join("")}</select></div>
      <div class="campo oculto" id="mpOtroC"><label>Contá cuál</label><input type="text" id="mpOtro" maxlength="120"></div>`,
      () => {
        let m = $("mpSel").value;
        if (m === "Otro") m = $("mpOtro").value.trim() || "Otro";
        aplicar(m);
      });
    $("mpSel").onchange = () => $("mpOtroC").classList.toggle("oculto", $("mpSel").value !== "Otro");
    $("modalGuardar").textContent = "Marcar como perdida";
  }

  // Detalle de una oportunidad (en el celular sirve para mover de etapa)
  function abrirOp(id) {
    const o = opsCache.find(x => String(x.id) === String(id));
    if (!o) return;
    abrirModal(`${o.codigo} · ${etiqueta(TIPOS_OP, o.tipo)}`, `
      <div style="font-weight:700;margin-bottom:2px">${esc(o.contacto)}</div>
      <div class="fila-det" style="margin-bottom:10px">${esc(etiqueta(ORIGENES, o.origen))} · ${esc(NOM_ETAPA[o.etapa])}</div>
      <div class="k-etapas" id="opBarra">${ETAPAS.map(e =>
        `<button data-etapa="${e.id}" class="${e.id === o.etapa ? "actual" + (e.id === "perdido" ? " perdido" : "") : ""}">${e.nombre}</button>`).join("")}</div>
      ${o.motivo_perdida ? `<div class="fila-det">Motivo: ${esc(o.motivo_perdida)}</div>` : ""}
      <div class="campo" style="margin-top:14px"><label>Detalle</label><textarea id="opDet">${esc(o.detalle || "")}</textarea></div>
      <div class="campo"><label>Monto estimado</label><input type="number" id="opMonto" min="0" value="${Number(o.monto_estimado) || 0}">
        <label class="check" style="margin-top:6px"><input type="checkbox" id="opMes" ${o.es_mensual ? "checked" : ""}><span>Es un monto mensual</span></label></div>
      <div class="campo"><label>Próxima acción</label><input type="text" id="opAcc" maxlength="200" value="${esc(o.proxima_accion || "")}" placeholder="Ej: Llamar para confirmar">
        <input type="date" id="opAccF" style="margin-top:7px" value="${esc(o.proxima_accion_fecha || "")}"></div>
      <div class="campo"><label>Origen</label><select id="opOri">${Object.entries(ORIGENES).map(([k, n]) =>
        `<option value="${k}" ${o.origen === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="k-btn chico" data-ficha="${esc(o.contacto_id)}">Ver ficha</button>
        <button class="k-btn chico" data-acc="presupuesto-de-op" data-op-id="${o.id}">+ Presupuesto</button></div>`,
      async () => {
        try {
          await pedir(`/panel/crm/oportunidad/${o.id}`, {
            detalle: $("opDet").value, monto_estimado: $("opMonto").value, es_mensual: $("opMes").checked,
            proxima_accion: $("opAcc").value, proxima_accion_fecha: $("opAccF").value, origen: $("opOri").value });
          cerrarModal(); irPestana(R.pestana);
          if (R.fichaId) abrirFicha(R.fichaId);
        } catch (e) { falla(e); }
      });
    $("opBarra").onclick = ev => {
      const b = ev.target.closest("button");
      if (!b || b.dataset.etapa === o.etapa) return;
      moverOp(o.id, b.dataset.etapa, async () => { if (R.fichaId) await abrirFicha(R.fichaId); irPestana(R.pestana); });
    };
  }

  // Selector de contacto con buscador (para no duplicar)
  function selectorContacto(prefijo, inicial, alCambiar, permitirNuevo) {
    let elegido = inicial || null;
    const caja = () => elegido
      ? `<div class="k-modal-sel"><span>👤 <b>${esc(elegido.nombre)}</b></span>${elegido.fijo ? "" : `<button type="button" id="${prefijo}Quitar">cambiar</button>`}</div>`
      : `<input type="text" id="${prefijo}Buscar" placeholder="${permitirNuevo ? "Nombre (o buscá un contacto existente)" : "Buscar contacto por nombre o teléfono"}" autocomplete="off">
         <div id="${prefijo}Sug"></div>
         ${permitirNuevo ? `<input type="text" id="${prefijo}Tel" inputmode="tel" placeholder="WhatsApp / teléfono" style="margin-top:7px">` : ""}`;
    const pintar = () => { $(prefijo + "Caja").innerHTML = caja(); enlazar(); alCambiar && alCambiar(elegido); };
    function enlazar() {
      const q = $(prefijo + "Quitar"); if (q) q.onclick = () => { elegido = null; pintar(); };
      const b = $(prefijo + "Buscar"); if (!b) return;
      let t = null;
      b.oninput = () => {
        clearTimeout(t);
        const v = b.value.trim();
        if (v.length < 2) { $(prefijo + "Sug").innerHTML = ""; return; }
        t = setTimeout(async () => {
          try {
            const r = await pedir("/panel/crm/contactos?q=" + encodeURIComponent(v));
            $(prefijo + "Sug").innerHTML = r.contactos.length ? `<div class="k-sug">${r.contactos.slice(0, 5).map(c =>
              `<div data-c="${esc(c.id)}" data-n="${esc(c.nombre)}">${esc(c.nombre)}<span class="fila-det"> · ${esc(c.whatsapp || c.telefono || "sin teléfono")}</span></div>`).join("")}</div>`
              : (permitirNuevo ? "" : '<div class="fila-det" style="margin-top:6px">Sin resultados. Creá el contacto primero.</div>');
            $(prefijo + "Sug").querySelectorAll("[data-c]").forEach(d => d.onclick = () => {
              elegido = { id: d.dataset.c, nombre: d.dataset.n }; pintar(); });
          } catch {}
        }, 280);
      };
    }
    return { html: `<div id="${prefijo}Caja">${caja()}</div>`, enlazar, get: () => elegido };
  }

  function nuevaOp(pre = {}) {
    const sel = selectorContacto("nc", pre.contacto_id ? { id: pre.contacto_id, nombre: pre.nombre, fijo: !!pre.fijo } : null, null, true);
    abrirModal("Nueva consulta", `
      <div class="campo"><label>Contacto</label>${sel.html}</div>
      <div class="campo"><label>Qué necesita</label><textarea id="ncDet" placeholder="Ej: Notebook no enciende"></textarea></div>
      <div class="campo"><label>Tipo</label><select id="ncTipo">${Object.entries(TIPOS_OP).map(([k, n]) =>
        `<option value="${k}" ${pre.tipo === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="campo"><label>Origen</label><select id="ncOri">${Object.entries(ORIGENES).map(([k, n]) =>
        `<option value="${k}" ${k === (pre.origen || "whatsapp") ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="campo"><label>Monto estimado (opcional)</label><input type="number" id="ncMonto" min="0" placeholder="0">
        <label class="check" style="margin-top:6px"><input type="checkbox" id="ncMes"><span>Es un monto mensual</span></label></div>
      <div class="campo"><label>Próxima acción (opcional)</label><input type="text" id="ncAcc" maxlength="200" placeholder="Ej: Pasar presupuesto">
        <input type="date" id="ncAccF" style="margin-top:7px"></div>`,
      async () => {
        const body = { tipo: $("ncTipo").value, origen: $("ncOri").value, detalle: $("ncDet").value,
          monto_estimado: $("ncMonto").value, es_mensual: $("ncMes").checked,
          proxima_accion: $("ncAcc").value, proxima_accion_fecha: $("ncAccF").value };
        const el = sel.get();
        if (el) body.contacto_id = el.id;
        else {
          if (!$("ncBuscar").value.trim()) return avisar("avisoModal", "Poné el nombre del contacto", false);
          body.contacto = { nombre: $("ncBuscar").value, whatsapp: $("ncTel").value };
        }
        try {
          await pedir("/panel/crm/oportunidades", body);
          cerrarModal();
          if (R.fichaId) abrirFicha(R.fichaId);
          irPestana(R.pestana === "resumen" ? "pipeline" : R.pestana);
        } catch (e) { avisar("avisoModal", e.message, false); }
      });
    $("modalGuardar").textContent = "Crear consulta";
    sel.enlazar();
  }

  // ═══ 3. CONTACTOS ═══════════════════════════════════════════════
  async function pintarContactos() {
    const q = new URLSearchParams();
    if (R.buscaContacto) q.set("q", R.buscaContacto);
    if (R.filtroContacto) q.set("tipo", R.filtroContacto);
    const r = await pedir("/panel/crm/contactos?" + q);
    const cuenta = k => k ? (r.conteo[k] || 0) : Object.values(r.conteo).reduce((a, b) => a + b, 0);
    const chip = (k, n) => `<button class="k-chip${R.filtroContacto === k ? " on" : ""}" data-tipo-ct="${k}">${n} <span class="n">${cuenta(k)}</span></button>`;
    const pillTipo = t => `<span class="k-pill ${t === "empresa" ? "osc" : t === "cliente" ? "ver" : "punteado"}" style="font-family:inherit">${esc(etiqueta(TIPOS_CONTACTO, t))}</span>`;
    const enfocado = document.activeElement && document.activeElement.id === "ctBuscar";
    cuerpo().innerHTML = cabecera("CONTACTOS", "Clientes e interesados",
      "Los clientes que compraron por la web y los que todavía no compraron nada, en un solo lugar.",
      `<button class="k-btn pri" data-acc="nuevo-ct">+ Nuevo contacto</button>`) + `
      <div class="k-barra-filtros">
        <input class="k-buscar" id="ctBuscar" type="search" placeholder="Buscar por nombre, teléfono o equipo…" value="${esc(R.buscaContacto)}" aria-label="Buscar contacto">
        <div class="k-chips" role="group" aria-label="Filtrar">${chip("", "Todos")}${chip("cliente", "Clientes")}${chip("interesado", "Interesados")}${chip("empresa", "Empresas")}</div>
      </div>
      <div class="k-tabla-w"><table class="k-tabla"><thead><tr>
        <th>Nombre</th><th>Tipo</th><th>WhatsApp</th><th>Último contacto</th><th>Oportunidad</th><th style="text-align:right">Compró en total</th><th>Etiquetas</th></tr></thead><tbody>
        ${r.contactos.map(c => {
          const u = textoUltimo(c.ultimo_contacto_en);
          return `<tr class="fi" data-ficha="${esc(c.id)}">
            <td><div style="display:flex;align-items:center;gap:10px"><div class="k-ava">${esc(iniciales(c.nombre))}</div>
              <div><b style="color:var(--k-tinta)">${esc(c.nombre)}</b>${c.equipos ? `<div class="fila-det">🖥 ${esc(corto(c.equipos, 50))}</div>` : ""}</div></div></td>
            <td>${pillTipo(c.tipo)}</td>
            <td class="mono" style="font-size:13px;white-space:nowrap">${esc(c.whatsapp || c.telefono || "—")}</td>
            <td style="white-space:nowrap" class="${u.viejo ? "k-nar" : ""}">${esc(u.txt)}</td>
            <td style="color:var(--k-texto)">${c.oportunidad_texto ? esc(corto(c.oportunidad_texto, 38)) : "—"}</td>
            <td class="mono" style="text-align:right;white-space:nowrap">${c.cantidad_compras ? plata(c.total_compras) : "—"}</td>
            <td style="font-size:12px;color:var(--k-suave)">${esc((c.etiquetas || []).join(", "))}</td></tr>`;
        }).join("") || `<tr><td colspan="7" class="k-vacio">No se encontraron contactos</td></tr>`}
      </tbody></table></div>
      <div class="k-lista-m">${r.contactos.length ? r.contactos.map(c => {
        const u = textoUltimo(c.ultimo_contacto_en);
        return `<div class="k-card" style="margin-bottom:10px;cursor:pointer" data-ficha="${esc(c.id)}">
          <div style="display:flex;gap:11px;align-items:center"><div class="k-ava">${esc(iniciales(c.nombre))}</div>
            <div style="flex:1;min-width:0"><b style="color:var(--k-tinta)">${esc(c.nombre)}</b>
              <div class="fila-det">${esc(c.whatsapp || c.telefono || "sin teléfono")}</div></div>${pillTipo(c.tipo)}</div>
          <div style="display:flex;justify-content:space-between;margin-top:9px;font-size:12px">
            <span class="${u.viejo ? "k-nar" : ""}">Último contacto: ${esc(u.txt)}</span>
            <span class="mono">${c.cantidad_compras ? plata(c.total_compras) : ""}</span></div>
          ${c.oportunidad_texto ? `<div class="fila-det" style="margin-top:4px">${esc(corto(c.oportunidad_texto, 60))}</div>` : ""}</div>`;
      }).join("") : '<div class="k-vacio">No se encontraron contactos</div>'}</div>
      <p class="k-nota">«Último contacto» en naranja: hace más de ${DIAS_CONTACTO_VIEJO} días que no hablamos. Buen público para una promo o un recordatorio de mantenimiento.</p>`;
    if (enfocado) { const i = $("ctBuscar"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function formContacto(c = {}) {
    return `
      <div class="campo"><label>Nombre</label><input type="text" id="fcNombre" maxlength="120" value="${esc(c.nombre || "")}"></div>
      <div class="campo"><label>Tipo</label><select id="fcTipo">${Object.entries(TIPOS_CONTACTO).map(([k, n]) =>
        `<option value="${k}" ${(c.tipo || "interesado") === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="campo"><label>WhatsApp / teléfono</label><input type="text" id="fcTel" inputmode="tel" value="${esc(c.whatsapp || c.telefono || "")}"></div>
      <div class="campo"><label>Email</label><input type="text" id="fcMail" value="${esc(c.email || "")}"></div>
      <div class="campo"><label>Dirección</label><input type="text" id="fcDir" value="${esc(c.direccion || "")}"></div>
      <div class="campo"><label>Persona de contacto (si es empresa)</label><input type="text" id="fcCN" value="${esc(c.contacto_nombre || "")}"></div>
      <div class="campo"><label>Cómo llegó</label><select id="fcOri"><option value="">—</option>${Object.entries(ORIGENES).map(([k, n]) =>
        `<option value="${k}" ${c.origen === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="campo"><label>Etiquetas</label><input type="text" id="fcEti" placeholder="Separadas por coma" value="${esc((c.etiquetas || []).join(", "))}"></div>
      <div class="campo"><label>Notas</label><textarea id="fcNotas">${esc(c.notas || "")}</textarea></div>`;
  }
  const leerFormContacto = () => ({ nombre: $("fcNombre").value, tipo: $("fcTipo").value, whatsapp: $("fcTel").value,
    telefono: $("fcTel").value, email: $("fcMail").value, direccion: $("fcDir").value,
    contacto_nombre: $("fcCN").value, origen: $("fcOri").value, etiquetas: $("fcEti").value, notas: $("fcNotas").value });
  function nuevoContacto() {
    abrirModal("Nuevo contacto", formContacto(), async () => {
      if (!$("fcNombre").value.trim()) return avisar("avisoModal", "Falta el nombre", false);
      try {
        const r = await pedir("/panel/crm/contactos", leerFormContacto());
        cerrarModal();
        if (r.existente) alert("Ya había un contacto con ese teléfono: se abrió el existente.");
        abrirFicha(r.id);
      } catch (e) { avisar("avisoModal", e.message, false); }
    });
  }

  // ═══ 4. FICHA DEL CONTACTO ══════════════════════════════════════
  let fichaDatos = null;
  async function abrirFicha(id) {
    R.fichaId = id;
    let cont = $("crmFicha");
    if (!cont) {
      cont = document.createElement("div");
      cont.id = "crmFicha"; cont.className = "crm-ficha";
      document.body.appendChild(cont);
      cont.addEventListener("click", clic);
      cont.addEventListener("input", entrada);
    }
    cont.classList.remove("oculto");
    document.body.style.overflow = "hidden";
    if (cont.dataset.id !== id) cont.innerHTML = '<div class="cargando">Cargando…</div>';
    cont.dataset.id = id;
    const scroll = cont.scrollTop;
    try {
      const q = R.filtroLinea ? "?filtro=" + R.filtroLinea : "";
      const r = await pedir(`/panel/crm/contacto/${encodeURIComponent(id)}${q}`);
      pintarFicha(r);
      cont.scrollTop = scroll;
    } catch (e) {
      cont.innerHTML = `<div class="f-wrap"><button class="f-volver" data-acc="cerrar-ficha">← Volver</button><div class="k-vacio">${esc(e.message)}</div></div>`;
    }
  }
  function cerrarFicha() {
    const c = $("crmFicha");
    if (c) { c.classList.add("oculto"); c.dataset.id = ""; }
    document.body.style.overflow = "";
    R.fichaId = null; R.filtroLinea = "";
    if (raiz().classList.contains("on")) irPestana(R.pestana);
  }

  function pintarFicha(r) {
    fichaDatos = r;
    const c = r.contacto, t = r.totales;
    const u = textoUltimo(c.ultimo_contacto_en);
    const tel = c.whatsapp || c.telefono;
    const abierta = r.oportunidades.find(o => ABIERTAS.includes(o.etapa));
    const chipL = (k, n) => `<button class="k-chip${R.filtroLinea === k ? " on" : ""}" data-linea="${k}">${n}</button>`;
    const dato = (k, v) => v ? `<div class="f-dato"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>` : "";
    const desde = c.primera_compra || c.creado;

    let abiertaHtml;
    if (abierta) {
      const ai = ETAPAS.findIndex(x => x.id === abierta.etapa);
      abiertaHtml = `<section class="k-card"><div class="k-card-cab"><h2>Oportunidad abierta</h2><span class="mono" style="font-size:11px;color:var(--k-suave)">${esc(abierta.codigo)}</span></div>
        <div style="cursor:pointer" data-op-ficha="${abierta.id}"><div style="font-size:14px">${esc(abierta.detalle || "Sin detalle")}</div>
        <div class="mono" style="font-size:22px;font-weight:600;margin:6px 0">${abierta.monto_estimado ? plata(abierta.monto_estimado) : "A definir"}${abierta.es_mensual ? '<span style="font-size:13px;color:var(--k-suave);font-weight:500"> /mes</span>' : ""}</div></div>
        <div class="k-etapas" data-barra="${abierta.id}" role="group" aria-label="Etapa ${ai + 1} de 5: ${esc(NOM_ETAPA[abierta.etapa])}">${ETAPAS.map((e, i) =>
          `<button data-etapa="${e.id}" class="${i === ai ? "actual" : i < ai ? "pasada" : ""}">${e.nombre}</button>`).join("")}</div>
        <div style="font-size:13px;color:var(--k-texto)">${esc(NOM_ETAPA[abierta.etapa])}${abierta.proxima_accion ? ` · próximo paso: <b>${esc(abierta.proxima_accion)}${abierta.proxima_accion_fecha ? " · " + esc(textoDia(abierta.proxima_accion_fecha)) : ""}</b>` : ""}</div>
        <div style="margin-top:12px"><button class="k-btn chico" data-acc="presupuesto-de-op" data-op-id="${abierta.id}">+ Presupuesto</button></div></section>`;
    } else {
      abiertaHtml = `<section class="k-card"><div class="k-card-cab"><h2>Oportunidad abierta</h2></div>
        <div class="fila-det">No hay ninguna abierta con este contacto.</div>
        <div style="margin-top:12px"><button class="k-btn chico pri" data-acc="nueva-op-ficha">+ Nueva oportunidad</button></div></section>`;
    }
    const cerradas = r.oportunidades.filter(o => !ABIERTAS.includes(o.etapa));

    $("crmFicha").innerHTML = `
      <div class="f-wrap">
        <button class="f-volver" data-acc="cerrar-ficha">← Contactos</button>
        <div class="f-cab">
          <div class="f-id"><div class="k-ava cuad">${esc(iniciales(c.nombre))}</div>
            <div><h1 class="f-nom">${esc(c.nombre)}</h1>
              <div class="k-chips" style="gap:6px">
                <span class="k-pill ${c.tipo === "empresa" ? "osc" : c.tipo === "cliente" ? "ver" : "punteado"}" style="font-family:inherit;font-size:12px">${esc(etiqueta(TIPOS_CONTACTO, c.tipo))}</span>
                ${c.tipo === "cliente" && desde ? `<span class="k-pill" style="font-family:inherit;font-size:12px">Cliente desde ${esc(mesAnio(desde))}</span>` : ""}
                ${c.origen ? `<span class="k-pill" style="font-family:inherit;font-size:12px">Llegó por ${esc(etiqueta(ORIGENES, c.origen))}</span>` : ""}
                ${(c.etiquetas || []).map(e => `<span class="k-pill" style="font-family:inherit;font-size:12px">${esc(e)}</span>`).join("")}</div></div></div>
          <div class="crm-acc">
            ${tel ? `<a class="k-btn" href="tel:${esc(String(tel).replace(/[^\d+]/g, ""))}">Llamar</a>` : ""}
            <button class="k-btn" data-acc="nueva-rep">Nueva reparación</button>
            ${tel ? `<a class="k-btn wa" href="${esc(waLink(tel))}" target="_blank" rel="noopener" data-acc="wa-contacto">Escribir por WhatsApp</a>` : ""}
          </div></div>

        <div class="f-cols">
          <div class="f-col">
            <section class="k-card"><div class="k-card-cab"><h2>Datos</h2><a href="#" data-acc="editar-contacto">Editar</a></div>
              ${dato("WhatsApp", c.whatsapp || c.telefono)}${dato("Email", c.email)}${dato("Dirección", c.direccion)}
              ${dato("Persona de contacto", c.contacto_nombre)}${dato("Notas", c.notas)}
              <div class="f-dato"><span class="k">Último contacto</span><span class="v ${u.viejo ? "k-nar" : ""}">${esc(u.txt)}</span></div></section>
            <section class="k-card"><div class="k-card-cab"><h2>Equipos registrados</h2><a href="#" data-acc="nuevo-equipo">+ Agregar</a></div>
              ${r.equipos.length ? r.equipos.map(e => `<div class="f-eq"><div><b>${esc(e.descripcion)}</b>
                ${e.detalle ? `<div class="fila-det">${esc(e.detalle)}</div>` : ""}</div>
                <button class="x" data-equipo-borrar="${e.id}" aria-label="Quitar equipo">✕</button></div>`).join("")
                : '<div class="fila-det">Sin equipos registrados.</div>'}</section>
            <section class="k-card"><div class="k-card-cab"><h2>Para hacer</h2><a href="#" data-acc="nueva-act-ficha">+ Agregar</a></div>
              ${r.actividades.length ? r.actividades.map(a => `<label class="k-act" style="padding:9px 0"><input type="checkbox" data-hecha="${a.id}">
                <div class="tx"><b>${esc(a.titulo)}</b><span class="${a.vencida ? "k-nar" : ""}">${esc(etiqueta(TIPOS_ACT, a.tipo))} · ${esc(textoDia(a.vence_en))}${a.automatica ? " · automática" : ""}</span></div></label>`).join("")
                : '<div class="fila-det">Nada pendiente.</div>'}</section>
          </div>

          <section class="k-card" style="min-width:0">
            <label for="notaTxt" style="font-size:16px;font-weight:700;color:var(--k-tinta)">Historial</label>
            <textarea class="f-nota" id="notaTxt" rows="2" placeholder="Agregar una nota, llamada o lo que quedó hablado…" style="margin-top:8px"></textarea>
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:8px">
              <div class="k-chips" role="group" aria-label="Mostrar">${chipL("", "Todo")}${chipL("mensajes", "Mensajes")}${chipL("reparaciones", "Reparaciones")}${chipL("presupuestos", "Presupuestos")}</div>
              <button class="k-btn pri chico" data-acc="guardar-nota">Agregar nota</button></div>
            ${r.eventos.length ? `<ol class="f-lin">${r.eventos.map(e => `
              <li class="f-ev"><div class="rail"><span class="dot"></span><i></i></div>
                <div class="cuerpo"><div class="tt"><span>${esc(e.titulo)}</span><span class="cu">${esc(fecha(e.fecha))}</span></div>
                  <div class="ty">${esc(TIPO_EVENTO[e.tipo] || e.tipo)}${e.usuario ? " · " + esc(e.usuario) : ""}</div>
                  ${e.texto ? `<p>${esc(e.texto)}</p>` : ""}</div></li>`).join("")}</ol>`
              : '<div class="fila-det" style="margin-top:14px">Todavía no hay movimientos.</div>'}
          </section>

          <div class="f-col">
            ${abiertaHtml}
            <section class="k-card"><div class="k-tot">
              <div><div class="l">Reparaciones</div><div class="v">${t.reparaciones}</div></div>
              <div><div class="l">Compras</div><div class="v">${t.compras}</div></div>
              <div><div class="l">Total gastado</div><div class="v">${plata(t.total_gastado)}</div></div>
              <div><div class="l">Pendiente de verificar${t.pedidos_por_verificar ? " (" + t.pedidos_por_verificar + ")" : ""}</div>
                <div class="v ${t.saldo_pendiente ? "k-nar" : ""}">${plata(t.saldo_pendiente)}</div></div></div></section>
            ${cerradas.length ? `<section class="k-card"><div class="k-card-cab"><h2>Oportunidades cerradas</h2></div>
              ${cerradas.map(o => `<div class="k-fila" data-op-ficha="${o.id}"><div class="fx"><div class="t">${esc(o.codigo)} · ${esc(corto(o.detalle || etiqueta(TIPOS_OP, o.tipo), 40))}</div>
                <div class="s">${esc(NOM_ETAPA[o.etapa])}${o.motivo_perdida ? " · " + esc(o.motivo_perdida) : ""}</div></div>
                <span class="mono" style="font-size:13px">${o.monto_estimado ? plata(o.monto_estimado) : ""}</span></div>`).join("")}</section>` : ""}
          </div>
        </div>
      </div>`;
  }

  // ═══ 5. ACTIVIDADES ═════════════════════════════════════════════
  async function pintarActividades() {
    const r = await pedir("/panel/crm/actividades");
    R.hoy = r.hoy;
    const todas = r.actividades;
    const pend = todas.filter(a => !a.hecha);
    const n = pend.filter(a => a.vence_en && a.vence_en <= r.hoy).length;
    R.pendientes = n;
    const b = $("crmBadge"); if (b) { b.textContent = n; b.classList.toggle("oculto", !n); }
    const hoyD = diaDe(r.hoy), lunes = new Date(hoyD);
    lunes.setDate(hoyD.getDate() - ((hoyD.getDay() + 6) % 7));
    const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(lunes); d.setDate(lunes.getDate() + i);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
    const N = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

    const fila = a => `<div class="k-act ${a.hecha ? "hecha" : ""}">
      <input type="checkbox" data-hecha="${a.id}" ${a.hecha ? "checked" : ""} aria-label="Marcar hecha">
      <span class="ty">${esc(etiqueta(TIPOS_ACT, a.tipo))}</span>
      <div class="tx"><b>${esc(a.titulo)}</b><span><a href="#" data-ficha="${esc(a.contacto_id)}">${esc(a.contacto)}</a>${a.oportunidad_codigo ? " · " + esc(a.oportunidad_codigo) : ""}${a.automatica ? " · automática" : ""}</span></div>
      <span class="fe ${!a.hecha && a.vence_en && a.vence_en < r.hoy ? "nar" : ""}">${esc(textoDia(a.vence_en))}</span></div>`;
    const grupo = (tit, arr, venc) => arr.length ? `<section class="k-gr"><div class="k-gr-cab ${venc ? "venc" : ""}"><h2>${tit}</h2><span>${arr.length} pendiente${arr.length === 1 ? "" : "s"}</span></div>${arr.map(fila).join("")}</section>` : "";

    let izq;
    if (R.diaSel) {
      izq = grupo(esc(textoDia(R.diaSel)) + " · " + fecha(R.diaSel + "T12:00:00", false), pend.filter(a => a.vence_en === R.diaSel)) ||
        '<div class="k-card k-vacio">No hay actividades ese día</div>';
    } else {
      const venc = pend.filter(a => a.vence_en && a.vence_en < r.hoy);
      const hoy = pend.filter(a => a.vence_en === r.hoy);
      const prox = pend.filter(a => a.vence_en && a.vence_en > r.hoy && difDias(a.vence_en, r.hoy) <= 7);
      const mas = pend.filter(a => !a.vence_en || difDias(a.vence_en, r.hoy) > 7);
      const hechas = todas.filter(a => a.hecha);
      izq = (grupo("Vencidas", venc, true) + grupo("Hoy", hoy) + grupo("Próximos días", prox) +
        grupo("Más adelante", mas) + (hechas.length ? `<section class="k-gr"><div class="k-gr-cab"><h2>Hechas hace poco</h2><span>${hechas.length}</span></div>${hechas.map(fila).join("")}</section>` : "")) ||
        '<div class="k-card k-vacio">No hay actividades pendientes 🎉</div>';
    }
    const sem = r.semana, totalSem = sem.hechas + sem.pendientes;
    cuerpo().innerHTML = cabecera("ACTIVIDADES", "Lo que hay que hacer",
      "Llamadas, mensajes, visitas y presupuestos pendientes. Marcá cada uno cuando lo hagas.",
      `<button class="k-btn pri" data-acc="nueva-act">+ Nueva actividad</button>`) + `
      <div class="k-semana" role="group" aria-label="Semana">${dias.map((d, i) => {
        const c = pend.filter(a => a.vence_en === d).length;
        return `<button type="button" class="k-dia${d === r.hoy ? " hoy" : ""}${d === R.diaSel ? " sel" : ""}" data-dia="${d}">
          <span class="d">${N[i]}</span><span class="n">${Number(d.slice(8))}</span><span class="c">${c} tarea${c === 1 ? "" : "s"}</span></button>`; }).join("")}</div>
      <div class="k-act-grid">
        <div class="k-act-izq">${izq}</div>
        <aside style="display:flex;flex-direction:column;gap:16px">
          <section class="k-card"><div class="k-card-cab"><h2>Recordatorios automáticos</h2></div>
            <p style="margin:0 0 4px;font-size:13px;color:var(--k-texto)">Actividades que el sistema crea solo, sin que las cargues:</p>
            <div class="k-regla"><b>→</b><span>Consulta nueva → <i>responder en el día</i>.</span></div>
            <div class="k-regla"><b>→</b><span>Presupuesto enviado → <i>seguimiento a los 3 días</i>.</span></div>
            <div class="k-regla"><b>→</b><span>Oportunidad aceptada o perdida → se cierran solas las pendientes.</span></div></section>
          <section class="k-card"><div style="font-size:13px;color:var(--k-suave)">Hechas esta semana</div>
            <div class="mono" style="font-size:28px;font-weight:600;color:var(--k-tinta)">${sem.hechas} <span style="font-size:15px;color:var(--k-suave)">de ${totalSem}</span></div>
            <div class="k-prog"><i style="width:${totalSem ? Math.round(sem.hechas * 100 / totalSem) : 0}%"></i></div></section>
        </aside>
      </div>`;
  }

  function nuevaActividad(pre = {}) {
    const sel = selectorContacto("na", pre.contacto_id ? { id: pre.contacto_id, nombre: pre.nombre, fijo: true } : null, null, false);
    abrirModal("Nueva actividad", `
      <div class="campo"><label>Contacto</label>${sel.html}</div>
      <div class="campo"><label>Qué hay que hacer</label><input type="text" id="naTit" maxlength="200" placeholder="Ej: Avisar que el equipo está listo"></div>
      <div class="campo"><label>Tipo</label><select id="naTipo">${Object.entries(TIPOS_ACT).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div class="campo"><label>Para cuándo</label><input type="date" id="naFecha" value="${esc(hoyStr())}"></div>`,
      async () => {
        const el = sel.get();
        if (!el) return avisar("avisoModal", "Elegí un contacto", false);
        if (!$("naTit").value.trim()) return avisar("avisoModal", "Poné qué hay que hacer", false);
        try {
          await pedir("/panel/crm/actividades", { contacto_id: el.id, titulo: $("naTit").value,
            tipo: $("naTipo").value, vence_en: $("naFecha").value, oportunidad_id: pre.oportunidad_id });
          cerrarModal();
          if (R.fichaId) abrirFicha(R.fichaId);
          if (raiz().classList.contains("on")) irPestana(R.pestana);
        } catch (e) { avisar("avisoModal", e.message, false); }
      });
    sel.enlazar();
  }

  // ═══ 6. PRESUPUESTOS ════════════════════════════════════════════
  let preCache = [];
  const clasePre = e => ({ borrador: "punteado", enviado: "azul", visto: "nar", aceptado: "ver", rechazado: "" }[e] || "");
  async function pintarPresupuestos() {
    const q = R.estadoPre ? "?estado=" + R.estadoPre : "";
    const r = await pedir("/panel/crm/presupuestos" + q);
    preCache = r.presupuestos;
    if (!R.preSel || !preCache.some(p => String(p.id) === String(R.preSel))) R.preSel = preCache[0] ? preCache[0].id : null;
    const cuenta = k => k ? ((r.conteo[k] || {}).n || 0) : Object.values(r.conteo).reduce((a, c) => a + c.n, 0);
    const chip = (k, n) => `<button class="k-chip${R.estadoPre === k ? " on" : ""}" data-estado-pre="${k}">${n} <span class="n">${cuenta(k)}</span></button>`;
    const abiertoMonto = ["enviado", "visto"].reduce((a, k) => a + ((r.conteo[k] || {}).monto || 0), 0);
    cuerpo().innerHTML = cabecera("PRESUPUESTOS", "Presupuestos",
      "Cada presupuesto queda atado a su oportunidad: si lo aceptan, la oportunidad se cierra sola.",
      `<button class="k-btn pri" data-acc="nuevo-pre">+ Nuevo presupuesto</button>`) + `
      <div class="k-kpis" style="margin-bottom:14px">
        <div class="k-kpi"><div class="l">Esperando respuesta</div><div class="v">${cuenta("enviado") + cuenta("visto")}</div><div class="nt">${plata(abiertoMonto)} enviados</div></div>
        <div class="k-kpi"><div class="l">Borradores</div><div class="v">${cuenta("borrador")}</div><div class="nt">Sin enviar todavía</div></div>
        <div class="k-kpi"><div class="l">Aceptados</div><div class="v">${cuenta("aceptado")}</div><div class="nt">${plata((r.conteo.aceptado || {}).monto || 0)} en total</div></div>
      </div>
      <div class="k-chips" style="margin-bottom:14px">${chip("", "Todos")}${Object.entries(ESTADOS_PRE).map(([k, n]) => chip(k, n)).join("")}</div>
      <div class="k-pre-grid">
        <div class="k-tabla-w"><table class="k-tabla k-pre-tabla" style="min-width:600px"><thead><tr>
          <th>N.º</th><th>Cliente</th><th>Vence</th><th>Estado</th><th style="text-align:right">Monto</th></tr></thead><tbody>
          ${preCache.map(p => `<tr class="fi ${String(p.id) === String(R.preSel) ? "sel" : ""}" data-pre="${p.id}">
            <td class="mono" style="font-size:13px">${esc(p.numero)}</td>
            <td><b style="color:var(--k-tinta)">${esc(p.contacto)}</b><div class="fila-det">${esc(corto(p.detalle || (p.items[0] || {}).descripcion || "", 44))}</div></td>
            <td style="white-space:nowrap;${p.vencido ? "color:var(--k-nar);font-weight:700" : ""}">${["aceptado", "rechazado", "borrador"].includes(p.estado) ? "—" : (p.vencido ? "Venció " : "") + esc(textoDia(p.vence_en))}</td>
            <td><span class="k-pill ${clasePre(p.estado)}" style="font-family:inherit">${esc(ESTADOS_PRE[p.estado])}</span></td>
            <td class="mono" style="text-align:right;white-space:nowrap">${plata(p.total)}</td></tr>`).join("") ||
            `<tr><td colspan="5" class="k-vacio">Todavía no hay presupuestos. Creá el primero con «+ Nuevo presupuesto».</td></tr>`}
        </tbody></table></div>
        <div id="preAside"></div>
      </div>`;
    if (R.preSel) pintarDetallePre(R.preSel);
  }

  async function pintarDetallePre(id) {
    const cont = $("preAside");
    if (!cont) return;
    cont.innerHTML = '<div class="k-card cargando">Cargando…</div>';
    try {
      const r = await pedir("/panel/crm/presupuesto/" + id);
      const p = r.presupuesto;
      const bloqueado = p.estado === "aceptado";
      cont.innerHTML = `<aside class="k-card k-aside" aria-label="Presupuesto seleccionado">
        <div class="cab"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span class="mono" style="font-size:15px;font-weight:600">${esc(p.numero)}</span>
          <span class="k-pill ${clasePre(p.estado)}" style="font-family:inherit">${esc(ESTADOS_PRE[p.estado])}</span></div>
          <a href="#" data-ficha="${esc(p.contacto_id)}" style="font-size:17px;font-weight:700;color:var(--k-tinta);text-decoration:none">${esc(p.contacto)}</a>
          <span style="font-size:13px;color:var(--k-suave)">${p.oportunidad_codigo ? esc(etiqueta(TIPOS_OP, p.oportunidad_tipo)) + " · " + esc(p.oportunidad_codigo) : "Sin oportunidad vinculada"}${p.vence_en && !["aceptado", "rechazado"].includes(p.estado) ? " · vence " + esc(textoDia(p.vence_en)) : ""}</span></div>
        <div style="padding:8px 20px">
          ${p.items.map(i => `<div class="it"><div><div style="font-size:14px">${esc(i.descripcion)}</div>
            <div class="q">${i.cantidad} × ${plata(i.precio_unit)} · ${esc(etiqueta(TIPOS_ITEM, i.tipo))}</div></div>
            <span class="mono" style="font-weight:500">${plata(i.cantidad * i.precio_unit)}</span></div>`).join("")}
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:16px 0 8px">
            <b>Total</b><span class="mono" style="font-size:24px;font-weight:600">${plata(p.total)}</span></div>
          ${p.notas ? `<div class="fila-det" style="padding-bottom:8px;white-space:pre-wrap">${esc(p.notas)}</div>` : ""}</div>
        <div style="padding:0 20px 14px"><div class="crm-kick" style="margin-bottom:6px">SEGUIMIENTO</div>
          ${r.log.length ? r.log.map(l => `<div style="display:flex;gap:10px;font-size:13px;color:var(--k-texto);padding:2px 0">
            <span class="mono" style="color:var(--k-suave);width:60px;flex:none">${esc(fecha(l.fecha, false))}</span>
            <span>${esc(l.titulo.replace(p.numero, "").replace("Presupuesto", "").replace(/^[\s:]+/, "") || "Creado")}</span></div>`).join("") : '<div class="fila-det">Sin movimientos.</div>'}</div>
        <div class="pie">
          <button class="k-btn" data-acc="pre-pdf" data-pid="${p.id}">Descargar PDF</button>
          <button class="k-btn wa" data-acc="pre-wa" data-pid="${p.id}">Enviar por WhatsApp</button>
          ${bloqueado ? "" : `<button class="k-btn rojo" data-acc="pre-estado" data-pid="${p.id}" data-est="rechazado">Marcar rechazado</button>
          <button class="k-btn osc" data-acc="pre-estado" data-pid="${p.id}" data-est="aceptado">Marcar aceptado</button>`}
          ${!bloqueado && p.estado === "enviado" ? `<button class="k-btn chico" data-acc="pre-estado" data-pid="${p.id}" data-est="visto">Marcar como visto</button>` : ""}
          ${p.estado === "borrador" ? `<button class="k-btn chico" data-acc="pre-editar" data-pid="${p.id}">Editar</button>
          <button class="k-btn chico rojo" data-acc="pre-borrar" data-pid="${p.id}">Borrar borrador</button>` : ""}
        </div></aside>`;
      cont.dataset.json = JSON.stringify(p);
    } catch (e) { cont.innerHTML = `<div class="k-card k-vacio">${esc(e.message)}</div>`; }
  }

  // Formulario de presupuesto (alta y edición)
  function formPresupuesto(p, pre = {}) {
    const items = (p && p.items.length ? p.items : [{ descripcion: "", cantidad: 1, tipo: "producto", precio_unit: "" }]);
    const fila = i => `<div class="k-item-fila">
      <input type="text" class="it-d" maxlength="160" placeholder="Descripción" value="${esc(i.descripcion)}">
      <input type="number" class="it-c" min="1" value="${i.cantidad || 1}" aria-label="Cantidad">
      <input type="number" class="it-p" min="0" placeholder="Precio" value="${i.precio_unit === "" ? "" : Number(i.precio_unit) || ""}" aria-label="Precio unitario">
      <select class="it-t" style="grid-column:1 / span 3">${Object.entries(TIPOS_ITEM).map(([k, n]) => `<option value="${k}" ${i.tipo === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
    const sel = p ? null : selectorContacto("np", pre.contacto_id ? { id: pre.contacto_id, nombre: pre.nombre, fijo: true } : null, null, false);
    abrirModal(p ? "Editar " + p.numero : "Nuevo presupuesto", `
      ${p ? "" : `<div class="campo"><label>Contacto</label>${sel.html}</div>`}
      <div class="campo"><label>Ítems</label><div id="npItems">${items.map(fila).join("")}</div>
        <button type="button" class="k-btn chico" id="npMas">+ Agregar ítem</button></div>
      <div class="campo"><label>Total</label><div class="mono" id="npTotal" style="font-size:20px;font-weight:600">$ 0</div></div>
      <div class="campo"><label>Válido hasta</label><input type="date" id="npVence" value="${esc(p ? (p.vence_en || "") : "")}"></div>
      <div class="campo"><label>Notas (opcional)</label><textarea id="npNotas" placeholder="Garantía, forma de pago, tiempos…">${esc(p ? p.notas || "" : "")}</textarea></div>`,
      async () => {
        const its = [...document.querySelectorAll("#npItems .k-item-fila")].map(f => ({
          descripcion: f.querySelector(".it-d").value, cantidad: f.querySelector(".it-c").value,
          precio_unit: f.querySelector(".it-p").value, tipo: f.querySelector(".it-t").value })).filter(i => i.descripcion.trim());
        if (!its.length) return avisar("avisoModal", "Agregá al menos un ítem", false);
        try {
          let r;
          if (p) r = await pedir("/panel/crm/presupuesto/" + p.id, { items: its, vence_en: $("npVence").value, notas: $("npNotas").value });
          else {
            const c = sel.get();
            if (!c && !pre.oportunidad_id) return avisar("avisoModal", "Elegí el contacto", false);
            r = await pedir("/panel/crm/presupuestos", { items: its, vence_en: $("npVence").value, notas: $("npNotas").value,
              contacto_id: c ? c.id : undefined, oportunidad_id: pre.oportunidad_id });
          }
          cerrarModal();
          R.preSel = r.presupuesto.id;
          if (R.fichaId) abrirFicha(R.fichaId);
          if (raiz().classList.contains("on")) irPestana("presupuestos");
        } catch (e) { avisar("avisoModal", e.message, false); }
      });
    const total = () => {
      const t = [...document.querySelectorAll("#npItems .k-item-fila")].reduce((a, f) =>
        a + (parseInt(f.querySelector(".it-c").value, 10) || 0) * (parseFloat(f.querySelector(".it-p").value) || 0), 0);
      $("npTotal").textContent = plata(t);
    };
    $("npItems").addEventListener("input", total); total();
    $("npMas").onclick = () => { $("npItems").insertAdjacentHTML("beforeend", fila({ descripcion: "", cantidad: 1, tipo: "producto", precio_unit: "" })); };
    if (sel) sel.enlazar();
    $("modalGuardar").textContent = p ? "Guardar cambios" : "Crear presupuesto";
  }

  // Vista imprimible: el navegador la guarda como PDF
  function pdfPresupuesto(p) {
    const w = window.open("", "_blank");
    if (!w) return alert("El navegador bloqueó la ventana. Permití las ventanas emergentes para descargar el PDF.");
    const filas = p.items.map(i => `<tr><td>${esc(i.descripcion)}<br><small>${esc(etiqueta(TIPOS_ITEM, i.tipo))}</small></td>
      <td style="text-align:center">${i.cantidad}</td><td style="text-align:right">${plata(i.precio_unit)}</td>
      <td style="text-align:right">${plata(i.cantidad * i.precio_unit)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.numero)} - JR Soluciones Informáticas</title>
      <style>body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#10281a;margin:40px auto;max-width:720px;padding:0 20px}
      h1{font-size:22px;margin:0}.s{color:#5f7066;font-size:13px}table{width:100%;border-collapse:collapse;margin:22px 0}
      th{text-align:left;font-size:11px;letter-spacing:.06em;color:#5f7066;border-bottom:2px solid #10281a;padding:8px 6px;text-transform:uppercase}
      td{padding:10px 6px;border-bottom:1px solid #dce7df;vertical-align:top}small{color:#5f7066}
      .t{display:flex;justify-content:space-between;font-size:20px;font-weight:700;border-top:2px solid #10281a;padding-top:12px}
      .cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #15803d;padding-bottom:14px;margin-bottom:20px}
      @media print{body{margin:0}}</style></head><body>
      <div class="cab"><div><h1>JR Soluciones Informáticas</h1><div class="s">Tucumán, Argentina · www.jrshop.com.ar</div></div>
        <div style="text-align:right"><b style="font-size:18px">Presupuesto ${esc(p.numero)}</b><div class="s">${esc(fecha(p.creado_en, false))}</div></div></div>
      <div><b>Cliente:</b> ${esc(p.contacto)}</div>
      ${p.vence_en ? `<div class="s">Válido hasta ${esc(fecha(p.vence_en + "T12:00:00", false))}</div>` : ""}
      <table><thead><tr><th>Detalle</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="t"><span>Total</span><span>${plata(p.total)}</span></div>
      ${p.notas ? `<p class="s" style="white-space:pre-wrap;margin-top:20px">${esc(p.notas)}</p>` : ""}
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }

  // ═══ Eventos ════════════════════════════════════════════════════
  async function cambiarEstadoPre(id, est) {
    try { await pedir(`/panel/crm/presupuesto/${id}/estado`, { estado: est }); R.preSel = id; irPestana("presupuestos"); refrescarInsignia(); }
    catch (e) { falla(e); }
  }

  async function clic(e) {
    const t = e.target, q = s => t.closest(s);
    let el;

    if ((el = q("[data-p-ir]"))) { e.preventDefault(); return irPestana(el.dataset.pIr); }
    if ((el = q("[data-rango]"))) { R.rango = el.dataset.rango; return irPestana("resumen"); }
    if ((el = q("[data-tipo-op]"))) { R.tipoOp = el.dataset.tipoOp; return irPestana("pipeline"); }
    if ((el = q("[data-tipo-ct]"))) { R.filtroContacto = el.dataset.tipoCt; return irPestana("contactos"); }
    if ((el = q("[data-estado-pre]"))) { R.estadoPre = el.dataset.estadoPre; return irPestana("presupuestos"); }
    if ((el = q("[data-linea]"))) { R.filtroLinea = el.dataset.linea; return abrirFicha(R.fichaId); }
    if ((el = q("[data-dia]"))) { R.diaSel = R.diaSel === el.dataset.dia ? null : el.dataset.dia; return irPestana("actividades"); }
    if ((el = q("[data-pre]"))) { R.preSel = el.dataset.pre; document.querySelectorAll("[data-pre]").forEach(x => x.classList.toggle("sel", x === el)); return pintarDetallePre(R.preSel); }

    if ((el = q("[data-acc]"))) {
      const a = el.dataset.acc;
      if (a !== "wa-contacto") e.preventDefault();
      const f = fichaDatos && fichaDatos.contacto;
      const enFicha = !!q("#crmFicha");
      if (a === "nueva-op") return nuevaOp();
      if (a === "nuevo-ct") return nuevoContacto();
      if (a === "cerrar-ficha") return cerrarFicha();
      if (a === "nueva-act") return nuevaActividad();
      if (a === "nuevo-pre") return formPresupuesto(null);
      if (a === "nueva-rep" && f) return nuevaOp({ contacto_id: f.id, nombre: f.nombre, tipo: "reparacion", fijo: true });
      if (a === "nueva-op-ficha" && f) return nuevaOp({ contacto_id: f.id, nombre: f.nombre, tipo: "venta", fijo: true });
      if (a === "presupuesto-de-op") {
        const oid = el.dataset.opId;
        const op = (opsCache.concat(fichaDatos ? fichaDatos.oportunidades : [])).find(o => String(o.id) === String(oid));
        if ($("modal") && !$("modal").classList.contains("oculto")) cerrarModal();
        return formPresupuesto(null, { oportunidad_id: oid, contacto_id: op && op.contacto_id, nombre: op && (op.contacto || (f && f.nombre)) });
      }
      if (a === "nueva-act-ficha" && f) {
        const ab = fichaDatos.oportunidades.find(o => ABIERTAS.includes(o.etapa));
        return nuevaActividad({ contacto_id: f.id, nombre: f.nombre, oportunidad_id: ab ? ab.id : undefined });
      }
      if (a === "editar-contacto" && f) {
        return abrirModal("Editar contacto", formContacto(f), async () => {
          try { await pedir("/panel/crm/contacto/" + encodeURIComponent(f.id), leerFormContacto()); cerrarModal(); abrirFicha(f.id); }
          catch (er) { avisar("avisoModal", er.message, false); }
        });
      }
      if (a === "nuevo-equipo" && f) {
        return abrirModal("Agregar equipo", `
          <div class="campo"><label>Equipo</label><input type="text" id="eqDes" maxlength="160" placeholder="Ej: Notebook HP 15-dw"></div>
          <div class="campo"><label>Detalle (opcional)</label><input type="text" id="eqDet" maxlength="300" placeholder="Ej: i5, 8 GB, SSD 240"></div>`,
          async () => {
            if (!$("eqDes").value.trim()) return avisar("avisoModal", "Describí el equipo", false);
            try { await pedir(`/panel/crm/contacto/${encodeURIComponent(f.id)}/equipos`, { descripcion: $("eqDes").value, detalle: $("eqDet").value }); cerrarModal(); abrirFicha(f.id); }
            catch (er) { avisar("avisoModal", er.message, false); }
          });
      }
      if (a === "guardar-nota" && f) {
        const txt = $("notaTxt").value.trim();
        if (!txt) return;
        try { await pedir(`/panel/crm/contacto/${encodeURIComponent(f.id)}/evento`, { tipo: "nota", texto: txt }); abrirFicha(f.id); }
        catch (er) { falla(er); }
        return;
      }
      if (a === "wa-contacto" && f) {
        // WhatsApp se abre (el enlace sigue su curso) y queda anotado en la línea de tiempo
        pedir(`/panel/crm/contacto/${encodeURIComponent(f.id)}/evento`, { tipo: "whatsapp", titulo: "Mensaje por WhatsApp" })
          .then(() => abrirFicha(f.id)).catch(() => {});
        return;
      }
      // Presupuestos
      const aside = $("preAside"), p = aside && aside.dataset.json ? JSON.parse(aside.dataset.json) : null;
      if (a === "pre-pdf" && p) return pdfPresupuesto(p);
      if (a === "pre-estado") return cambiarEstadoPre(el.dataset.pid, el.dataset.est);
      if (a === "pre-editar" && p) return formPresupuesto(p);
      if (a === "pre-borrar") {
        if (!confirm("¿Borrar este borrador?")) return;
        try { await pedir(`/panel/crm/presupuesto/${el.dataset.pid}/borrar`, {}); R.preSel = null; irPestana("presupuestos"); } catch (er) { falla(er); }
        return;
      }
      if (a === "pre-wa" && p) {
        const lineas = p.items.map(i => `• ${i.descripcion}${i.cantidad > 1 ? " x" + i.cantidad : ""}: ${plata(i.cantidad * i.precio_unit)}`).join("\n");
        const texto = `Hola ${p.contacto.split(" ")[0]}! Te paso el presupuesto *${p.numero}* de JR Soluciones Informáticas:\n${lineas}\n*Total: ${plata(p.total)}*` +
          (p.vence_en ? `\nVálido hasta el ${fecha(p.vence_en + "T12:00:00", false)}.` : "") + "\nCualquier duda, escribime por acá.";
        window.open(waLink(p.whatsapp || p.telefono, texto), "_blank");
        if (p.estado === "borrador") cambiarEstadoPre(p.id, "enviado");
        return;
      }
    }

    if ((el = q("[data-equipo-borrar]"))) {
      if (!confirm("¿Quitar este equipo?")) return;
      try { await pedir(`/panel/crm/equipo/${el.dataset.equipoBorrar}/borrar`, {}); abrirFicha(R.fichaId); } catch (er) { falla(er); }
      return;
    }
    if ((el = q("[data-hecha]"))) {
      const id = el.dataset.hecha, hecha = el.checked;
      try {
        await pedir(`/panel/crm/actividad/${id}/hecha`, { hecha });
        if (R.fichaId && $("crmFicha") && !$("crmFicha").classList.contains("oculto")) abrirFicha(R.fichaId);
        if (raiz().classList.contains("on")) irPestana(R.pestana);
      } catch (er) { el.checked = !hecha; falla(er); }
      return;
    }
    if ((el = q("[data-barra] button[data-etapa]"))) {
      const id = el.closest("[data-barra]").dataset.barra;
      const o = fichaDatos.oportunidades.find(x => String(x.id) === id);
      opsCache = fichaDatos.oportunidades;
      if (o && o.etapa !== el.dataset.etapa) moverOp(id, el.dataset.etapa, async () => { await abrirFicha(R.fichaId); });
      return;
    }
    if ((el = q("[data-op-ficha]"))) { opsCache = fichaDatos.oportunidades; return abrirOp(el.dataset.opFicha); }
    if ((el = q(".k-op[data-op]"))) return abrirOp(el.dataset.op);
    if ((el = q("[data-ficha]"))) {
      e.preventDefault();
      if ($("modal") && !$("modal").classList.contains("oculto")) cerrarModal();
      return abrirFicha(el.dataset.ficha);
    }
  }

  function entrada(e) {
    if (e.target.id === "ctBuscar") {
      clearTimeout(entrada.t);
      entrada.t = setTimeout(() => { R.buscaContacto = e.target.value.trim(); pintarContactos(); }, 350);
    }
  }

  window.CRM = { abrir, cerrarFicha };
})();
