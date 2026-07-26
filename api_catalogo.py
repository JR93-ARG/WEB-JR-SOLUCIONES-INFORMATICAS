"""
api_catalogo.py — API REST para el Catálogo Web JR
====================================================
Seguridad: rate limiting, validación DNI, token de autenticación
Escalabilidad: toda la lógica en gs_manager.py, listo para migrar a BD
"""

import os
import re
import time
from collections import defaultdict
from flask import Flask, request, jsonify
import gs_manager as gs

app = Flask(__name__)

# CORS manual — más confiable que flask-cors en Railway
@app.after_request
def add_cors(response):
    origin = request.headers.get("Origin", "")
    allowed = [
        "https://jr93-arg.github.io",
        "https://www.jrshop.com.ar",
        "https://jrshop.com.ar",
        "http://localhost",
        "http://127.0.0.1",
        "null",
    ]
    if origin in allowed or not origin:
        response.headers["Access-Control-Allow-Origin"]  = origin or "*"
    else:
        response.headers["Access-Control-Allow-Origin"]  = "https://jr93-arg.github.io"
    response.headers["Access-Control-Allow-Methods"]     = "GET, POST, PATCH, OPTIONS"
    response.headers["Access-Control-Allow-Headers"]     = "Content-Type, X-API-Token"
    response.headers["Access-Control-Allow-Credentials"] = "false"
    return response

@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def handle_options(path):
    return jsonify({}), 200

API_TOKEN          = "jrsoluciones2025"
RATE_LIMIT_MAX     = 10
RATE_LIMIT_VENTANA = 3600
_rate_store        = defaultdict(list)
_rate_store_vistas = defaultdict(list)

def check_rate_limit(ip, store=None, max_req=None, ventana=None):
    if store is None: store = _rate_store
    if max_req is None: max_req = RATE_LIMIT_MAX
    if ventana is None: ventana = RATE_LIMIT_VENTANA
    ahora = time.time()
    store[ip] = [t for t in store[ip] if ahora - t < ventana]
    if len(store[ip]) >= max_req:
        return True
    store[ip].append(ahora)
    return False

def get_ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

def sanitizar(valor, max_len=200):
    return str(valor or "").strip()[:max_len]

def validar_dni(dni):
    """DNI argentino: 7 u 8 dígitos. Retorna (valido, dni_limpio).
    Si viene vacío retorna (True, '') — es opcional desde la API."""
    dni_limpio = re.sub(r"[.\-\s]", "", str(dni or ""))
    if not dni_limpio:
        return True, ""  # campo opcional
    return bool(re.match(r"^\d{7,8}$", dni_limpio)), dni_limpio

def validar_telefono(tel):
    tel_limpio = re.sub(r"[\s\-\(\)\+]", "", str(tel or ""))
    return bool(re.match(r"^\d{8,15}$", tel_limpio))

@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True, "status": "API Catalogo JR activa"})

@app.route("/pedido", methods=["POST"])
def recibir_pedido():
    ip = get_ip()

    if check_rate_limit(ip):
        return jsonify({"ok": False, "error": "Demasiadas solicitudes. Intentá en unos minutos."}), 429

    token = request.headers.get("X-API-Token", "")
    if token != API_TOKEN:
        return jsonify({"ok": False, "error": "No autorizado"}), 401

    try:
        datos = request.get_json(force=True, silent=True)
        if not datos or not isinstance(datos, dict):
            return jsonify({"ok": False, "error": "Datos invalidos"}), 400

        errores = []
        nombre = sanitizar(datos.get("cliente"), 100)
        if len(nombre) < 2:
            errores.append("Nombre invalido")

        dni_ok, dni = validar_dni(datos.get("dni", ""))
        if not dni_ok:
            errores.append("DNI invalido (7 u 8 digitos)")

        telefono = sanitizar(datos.get("telefono"), 20)
        if not validar_telefono(telefono):
            errores.append("Telefono invalido")

        items = datos.get("items", [])
        if not items or not isinstance(items, list):
            errores.append("Sin productos")
        elif len(items) > 100:
            errores.append("Demasiados productos")

        if errores:
            return jsonify({"ok": False, "errores": errores}), 400

        payload = {
            "cliente":   nombre,
            "dni":       dni,
            "telefono":  telefono,
            "direccion": sanitizar(datos.get("direccion"), 200),
            "notas":     sanitizar(datos.get("notas"), 500),
            "total":     round(float(datos.get("total", 0)), 2),
            "items": [
                {
                    "producto":    sanitizar(i.get("producto"), 200),
                    "proveedor":   sanitizar(i.get("proveedor"), 100),
                    "cantidad":    max(1, min(int(i.get("cantidad", 1)), 999)),
                    "precio_unit": round(float(i.get("precio_unit", 0)), 2),
                    "subtotal":    round(float(i.get("subtotal", 0)), 2),
                }
                for i in items if sanitizar(i.get("producto"))
            ]
        }

        if not payload["items"]:
            return jsonify({"ok": False, "error": "Sin productos validos"}), 400

        nro_pedido = gs.registrar_pedido_web(payload)
        print(f"[OK] Pedido {nro_pedido} | {nombre} | DNI {dni} | IP {ip}")
        return jsonify({"ok": True, "nroPedido": nro_pedido})

    except Exception as e:
        print(f"[ERROR /pedido] IP={ip} | {e}")
        return jsonify({"ok": False, "error": "Error interno"}), 500

@app.route("/pedidos", methods=["GET"])
def listar_pedidos():
    ip = get_ip()
    if ip not in ("127.0.0.1", "::1", "localhost"):
        return jsonify({"ok": False, "error": "Acceso restringido"}), 403
    try:
        pedidos = gs.obtener_pedidos_web()
        return jsonify({"ok": True, "total": len(pedidos), "pedidos": pedidos})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/pedido/<nro>/estado", methods=["PATCH"])
def cambiar_estado(nro):
    ip = get_ip()
    if ip not in ("127.0.0.1", "::1", "localhost"):
        return jsonify({"ok": False, "error": "Acceso restringido"}), 403
    try:
        body   = request.get_json(force=True, silent=True) or {}
        nuevo  = sanitizar(body.get("estado"), 50)
        user   = sanitizar(body.get("usuario", "sistema"), 50)
        estados = ["Pendiente verificacion", "Pago verificado",
                   "En preparacion", "Enviado", "Entregado", "Cancelado"]
        if nuevo not in estados:
            return jsonify({"ok": False, "error": f"Estado invalido"}), 400
        ok = gs.actualizar_estado_pedido_web(nro, nuevo, user)
        return jsonify({"ok": ok})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ── Vistas de productos ────────────────────────────────────────────────────────
@app.route("/vista", methods=["POST"])
def registrar_vista():
    ip = get_ip()
    if check_rate_limit("vista_" + ip, store=_rate_store_vistas, max_req=100):
        return jsonify({"ok": False}), 429
    token = request.headers.get("X-API-Token", "")
    if token != API_TOKEN:
        return jsonify({"ok": False}), 401
    try:
        datos   = request.get_json(force=True, silent=True) or {}
        id_prod = sanitizar(datos.get("id", ""), 200)
        if not id_prod:
            return jsonify({"ok": False}), 400
        nombre  = sanitizar(datos.get("nombre", ""), 200)
        precio  = sanitizar(datos.get("precio", ""), 50)
        imagen  = sanitizar(datos.get("imagen", ""), 500)
        gs.registrar_vista_producto(id_prod, nombre, precio, imagen)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ── Visitas totales de la página ──────────────────────────────────────────────
_sesiones      = {}        # {ip: timestamp} — solo en memoria (está bien)
_visitas_cache = {"total": None}  # cache en memoria para no leer Sheets en cada request

def _get_total_visitas():
    if _visitas_cache["total"] is not None:
        return _visitas_cache["total"]
    try:
        total = gs.obtener_visitas_pagina()
        _visitas_cache["total"] = max(total, 217)  # mínimo 217
    except Exception:
        _visitas_cache["total"] = 217
    return _visitas_cache["total"]

def _set_total_visitas(n):
    _visitas_cache["total"] = n
    try:
        gs.guardar_visitas_pagina(n)
    except Exception:
        pass  # Si falla el guardado, el cache sigue funcionando

@app.route("/visita-pagina", methods=["POST"])
def visita_pagina():
    ip    = get_ip()
    ahora = time.time()
    # Registrar sesión activa (expira en 3 minutos)
    _sesiones[ip] = ahora
    for k in list(_sesiones.keys()):
        if ahora - _sesiones[k] > 180:
            del _sesiones[k]
    # Sumar visita (solo 1 por IP por hora)
    if not check_rate_limit("pag_" + ip):
        nuevo_total = _get_total_visitas() + 1
        _set_total_visitas(nuevo_total)
    return jsonify({
        "ok":      True,
        "total":   _get_total_visitas(),
        "activos": len(_sesiones)
    })

@app.route("/stats-pagina", methods=["GET"])
def stats_pagina():
    return jsonify({
        "ok":      True,
        "total":   _get_total_visitas(),
        "activos": len(_sesiones)
    })

@app.route("/vistas-top", methods=["GET"])
def vistas_top():
    token = request.headers.get("X-API-Token", "")
    if token != API_TOKEN:
        return jsonify({"ok": False}), 401
    try:
        top = gs.obtener_vistas_top(20)
        return jsonify({"ok": True, "vistas": top})
    except Exception as e:
        return jsonify({"ok": True, "vistas": []})

@app.route("/sincronizar-indice", methods=["POST"])
def sincronizar_indice():
    token = request.headers.get("X-API-Token", "")
    if token != API_TOKEN:
        return jsonify({"ok": False}), 401
    try:
        datos     = request.get_json(force=True, silent=True) or {}
        productos = datos.get("productos", [])
        if not productos:
            return jsonify({"ok": True, "nuevos": 0})
        # Sanitizar
        limpios = [
            {
                "id":     sanitizar(str(p.get("id","")), 200),
                "nombre": sanitizar(p.get("nombre",""), 200),
                "precio": sanitizar(p.get("precio",""), 50),
                "imagen": sanitizar(p.get("imagen",""), 500),
            }
            for p in productos if p.get("id")
        ]
        nuevos = gs.sincronizar_indice_productos(limpios)
        return jsonify({"ok": True, "nuevos": nuevos})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/descripcion", methods=["POST"])
def generar_descripcion():
    ip = get_ip()
    if check_rate_limit("desc_" + ip, store=_rate_store_vistas, max_req=40):
        return jsonify({"ok": False, "descripcion": ""}), 429
    try:
        import urllib.request, re as _re

        datos   = request.get_json(force=True, silent=True) or {}
        href    = sanitizar(datos.get("href", ""), 500)
        fuente  = sanitizar(datos.get("fuente", ""), 100).lower()
        nombre  = sanitizar(datos.get("producto", ""), 300)
        desc    = ""

        def limpiar_html(txt):
            txt = _re.sub(r'<[^>]+>', ' ', txt)
            txt = _re.sub(r'\s+', ' ', txt)
            return txt.strip()

        # ── Scraping DAZ (WooCommerce) ────────────────────────────────
        if href and "dazimportadora" in href:
            try:
                req = urllib.request.Request(href, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html",
                    "Accept-Language": "es-AR,es;q=0.9",
                })
                with urllib.request.urlopen(req, timeout=8) as r:
                    html = r.read().decode("utf-8", errors="ignore")

                # Intentar varios selectores de WooCommerce
                for patron in [
                    # Descripción corta debajo del precio
                    r'class="woocommerce-product-details__short-description"[^>]*>(.*?)</div>',
                    # Descripción larga en tab
                    r'class="woocommerce-product-details__short-description"[^>]*>(.*?)</section>',
                    # Entry summary
                    r'entry-summary.*?<p>(.*?)</p>',
                    # Cualquier párrafo dentro de la ficha
                    r'product[_-]description[^>]*>(.*?)</div>',
                ]:
                    m = _re.search(patron, html, _re.DOTALL | _re.IGNORECASE)
                    if m:
                        texto = limpiar_html(m.group(1))
                        if len(texto) > 40:
                            desc = texto[:500]
                            break

                # Fallback: buscar listas con características del producto
                if not desc:
                    m = _re.search(r'<ul[^>]*>(.*?)</ul>', html, _re.DOTALL)
                    if m:
                        items = _re.findall(r'<li[^>]*>(.*?)</li>', m.group(1), _re.DOTALL)
                        if items:
                            texto = " · ".join(limpiar_html(i) for i in items[:5] if limpiar_html(i))
                            if len(texto) > 30:
                                desc = texto[:400]

            except Exception as e:
                print(f"[desc/daz] {e}")

        # ── Scraping Ximaro (Odoo) ────────────────────────────────────
        elif href and "ximaro" in href:
            try:
                req = urllib.request.Request(href, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html",
                    "Accept-Language": "es-AR,es;q=0.9",
                })
                with urllib.request.urlopen(req, timeout=8) as r:
                    html = r.read().decode("utf-8", errors="ignore")

                for patron in [
                    # Descripción del producto en Odoo
                    r'id="product_long_description"[^>]*>(.*?)</div>',
                    r'class="[^"]*product[_-]description[^"]*"[^>]*>(.*?)</div>',
                    r'class="[^"]*o_field_html[^"]*"[^>]*>(.*?)</div>',
                    # Descripción en sección de detalles
                    r'<div[^>]*data-field="description[^"]*"[^>]*>(.*?)</div>',
                    # Cualquier párrafo en el área del producto
                    r'<section[^>]*class="[^"]*product[^"]*"[^>]*>.*?<p>(.*?)</p>',
                ]:
                    m = _re.search(patron, html, _re.DOTALL | _re.IGNORECASE)
                    if m:
                        texto = limpiar_html(m.group(1))
                        if len(texto) > 40:
                            desc = texto[:500]
                            break

            except Exception as e:
                print(f"[desc/ximaro] {e}")

        # ── Fallback por plantilla ────────────────────────────────────
        if not desc and nombre:
            n = nombre.lower()
            if any(w in n for w in ["celular", "smartphone", "iphone", "samsung", "xiaomi", "motorola", "redmi", "infinix"]):
                desc = f"{nombre} — smartphone con conectividad avanzada y camara de alta resolucion. Ideal para uso diario, entretenimiento y productividad."
            elif any(w in n for w in ["notebook", "laptop", "computadora"]):
                desc = f"{nombre} — equipo portatil de alto rendimiento para trabajo y estudio."
            elif any(w in n for w in ["smart tv", "television", "tv "]):
                desc = f"{nombre} — televisor Smart con acceso a streaming y aplicaciones. Imagen nítida para disfrutar en familia."
            elif any(w in n for w in ["parlante", "speaker", "soundbar"]):
                desc = f"{nombre} — audio de calidad para música y entretenimiento en casa o en movimiento."
            elif any(w in n for w in ["auricular", "headset", "earphone"]):
                desc = f"{nombre} — audio de calidad con diseño cómodo. Ideal para llamadas, música y entretenimiento."
            elif any(w in n for w in ["tablet", "ipad"]):
                desc = f"{nombre} — tablet versátil para trabajo, estudio y entretenimiento con pantalla amplia."
            elif any(w in n for w in ["proyector"]):
                desc = f"{nombre} — proyector para disfrutar de cine en casa o presentaciones."
            elif any(w in n for w in ["tv box", "android box", "streaming"]):
                desc = f"{nombre} — convierte tu TV en Smart con acceso a streaming y apps en 4K."
            elif any(w in n for w in ["cargador", "power bank", "bateria", "cable"]):
                desc = f"{nombre} — accesorio esencial para mantener tus dispositivos cargados."
            else:
                desc = f"{nombre} — producto de tecnologia con excelente relacion calidad-precio. Consulta disponibilidad."

        return jsonify({"ok": True, "descripcion": desc})
    except Exception as e:
        print(f"[desc] Error: {e}")
        return jsonify({"ok": False, "descripcion": ""}), 500

@app.route("/solicitud-credito", methods=["POST"])
def solicitud_credito():
    ip = get_ip()
    if check_rate_limit("credito_" + ip, store=_rate_store_vistas, max_req=5):
        return jsonify({"ok": False, "error": "Demasiadas solicitudes"}), 429
    try:
        datos = request.get_json(force=True, silent=True) or {}
        nro = gs.registrar_credito({
            "nombre":       sanitizar(datos.get("nombre", ""), 200),
            "dni":          sanitizar(datos.get("dni", ""), 20),
            "telefono":     sanitizar(datos.get("telefono", ""), 30),
            "domicilio":    sanitizar(datos.get("domicilio", ""), 200),
            "barrio":       sanitizar(datos.get("barrio", ""), 100),
            "trabajo":      sanitizar(datos.get("trabajo", ""), 200),
            "producto":     sanitizar(datos.get("producto", ""), 300),
            "precio_lista": float(datos.get("precio_lista", 0)),
            "anticipo":     float(datos.get("anticipo", 0)),
            "cuotas":       int(datos.get("cuotas", 0)),
            "cuota_mensual":float(datos.get("cuota_mensual", 0)),
            "total":        float(datos.get("total", 0)),
        })
        return jsonify({"ok": True, "nro": nro})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

CATALOGO_URL = "https://jr93-arg.github.io/WEB-JR-SOLUCIONES-INFORMATICAS"

@app.route("/p/<producto_id>")
def preview_producto(producto_id):
    prod_id   = sanitizar(producto_id, 100)
    try:
        info = gs.obtener_info_producto(prod_id)
    except Exception:
        info = {}

    nombre     = info.get("nombre", "JR Soluciones Informáticas")
    precio     = info.get("precio", "")
    imagen     = info.get("imagen", "") or f"{CATALOGO_URL}/og-image.jpg"
    precio_txt = f"Desde {precio} con transferencia · " if precio else ""
    og_image   = imagen if imagen.startswith("http") else f"{CATALOGO_URL}/og-image.jpg"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta property="og:type"         content="product">
  <meta property="og:site_name"    content="JR Soluciones Informaticas">
  <meta property="og:title"        content="{nombre}">
  <meta property="og:description"  content="{precio_txt}Tecnologia y electronica. Envio a todo el pais.">
  <meta property="og:image"        content="{og_image}">
  <meta property="og:image:width"  content="600">
  <meta property="og:image:height" content="600">
  <meta property="og:url"          content="{CATALOGO_URL}/?id={prod_id}">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:image"       content="{og_image}">
  <meta http-equiv="refresh"       content="0;url={CATALOGO_URL}/?id={prod_id}">
  <title>{nombre} - JR Soluciones</title>
</head>
<body>
  <p>Redirigiendo...</p>
  <script>window.location.replace("{CATALOGO_URL}/?id={prod_id}");</script>
</body>
</html>"""
    from flask import Response
    return Response(html, mimetype="text/html")

# ── Actualización automática del catálogo ─────────────────────────────────
import subprocess, threading as _threading

_actualizacion_en_curso = False
_ultimo_resultado       = {"ok": None, "logs": [], "fecha": None}

def _disparar_actualizacion():
    global _actualizacion_en_curso, _ultimo_resultado
    if _actualizacion_en_curso:
        return {"ok": False, "error": "Ya hay una actualización en curso"}
    _actualizacion_en_curso = True
    logs = []
    try:
        import datetime as _dt
        fecha = _dt.datetime.now().strftime("%d/%m/%Y %H:%M")
        logs.append(f"[{fecha}] Iniciando scraping...")

        generar_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generar.js")
        if not os.path.exists(generar_path):
            raise FileNotFoundError(f"No se encontró generar.js en {generar_path}")

        proc = subprocess.run(
            ["node", generar_path],
            capture_output=True, text=True,
            timeout=30 * 60,  # 30 minutos
            env={**os.environ}
        )
        for line in (proc.stdout + proc.stderr).split("\n"):
            if line.strip():
                logs.append(line.strip())

        # Subir archivos a GitHub via API
        import base64, urllib.request as _ur

        github_token = os.environ.get("GITHUB_TOKEN","")
        github_repo  = os.environ.get("GITHUB_REPO","JR93-ARG/WEB-JR-SOLUCIONES-INFORMATICAS")

        if not github_token:
            raise ValueError("GITHUB_TOKEN no configurado en Railway Variables")

        out_dir = os.path.join(
            os.path.expanduser("~"), "Documents",
            "WEB-JR-SOLUCIONES-INFORMATICAS"
        )
        archivos = ["index.html", "catalogo.css", "catalogo.js",
                    "seguimiento.html", "CNAME"]
        subidos = 0
        for archivo in archivos:
            local = os.path.join(out_dir, archivo)
            if not os.path.exists(local):
                logs.append(f"  ⚠ No encontrado: {archivo}")
                continue
            try:
                with open(local, "rb") as f:
                    contenido_b64 = base64.b64encode(f.read()).decode()

                # Obtener SHA actual
                sha = None
                try:
                    req_get = urllib.request.Request(
                        f"https://api.github.com/repos/{github_repo}/contents/{archivo}",
                        headers={
                            "Authorization": f"token {github_token}",
                            "User-Agent": "JR-Actualizador/1.0",
                            "Accept": "application/vnd.github.v3+json",
                        }
                    )
                    with _ur.urlopen(req_get, timeout=10) as r:
                        info = __import__("json").loads(r.read())
                        sha = info.get("sha")
                except Exception:
                    pass

                body = __import__("json").dumps({
                    "message": f"🤖 Auto-actualización — {fecha}",
                    "content": contenido_b64,
                    "branch":  "main",
                    **({"sha": sha} if sha else {}),
                }).encode()

                req_put = _ur.Request(
                    f"https://api.github.com/repos/{github_repo}/contents/{archivo}",
                    data=body, method="PUT",
                    headers={
                        "Authorization":  f"token {github_token}",
                        "User-Agent":     "JR-Actualizador/1.0",
                        "Accept":         "application/vnd.github.v3+json",
                        "Content-Type":   "application/json",
                        "Content-Length": str(len(body)),
                    }
                )
                with _ur.urlopen(req_put, timeout=30) as r:
                    r.read()
                logs.append(f"  ✓ {archivo}")
                subidos += 1
            except Exception as e:
                logs.append(f"  ✗ {archivo}: {e}")

        logs.append(f"✅ Listo — {subidos}/{len(archivos)} archivos publicados en GitHub Pages")
        _ultimo_resultado = {"ok": True, "logs": logs, "fecha": fecha, "subidos": subidos}
        return _ultimo_resultado

    except Exception as e:
        logs.append(f"❌ Error: {e}")
        _ultimo_resultado = {"ok": False, "logs": logs, "fecha": None, "error": str(e)}
        return _ultimo_resultado
    finally:
        _actualizacion_en_curso = False


@app.route("/actualizar-catalogo", methods=["POST"])
def actualizar_catalogo():
    """Dispara la actualización manualmente (requiere token)."""
    token = request.headers.get("X-API-Token") or request.json and request.json.get("token")
    if token != "jrsoluciones2025":
        return jsonify({"ok": False, "error": "No autorizado"}), 401

    if _actualizacion_en_curso:
        return jsonify({"ok": False, "error": "Ya hay una actualización en curso"}), 429

    def run():
        _disparar_actualizacion()

    _threading.Thread(target=run, daemon=True).start()
    return jsonify({"ok": True, "mensaje": "Actualización iniciada en segundo plano"})


@app.route("/estado-actualizacion", methods=["GET"])
def estado_actualizacion():
    """Devuelve el estado de la última actualización."""
    return jsonify({
        "en_curso":       _actualizacion_en_curso,
        "ultimo_resultado": _ultimo_resultado,
    })


if __name__ == "__main__":
    # ── Cron job interno — actualización automática a las 13:00hs ──────────
    import threading, datetime as _dt

    def _cron_actualizacion():
        """Hilo que verifica la hora y dispara la actualización diaria."""
        ultimo_dia = None
        while True:
            try:
                ahora    = _dt.datetime.now(_dt.timezone(
                    _dt.timedelta(hours=-3)))  # UTC-3 Argentina
                hoy      = ahora.date()
                if ahora.hour == 13 and ahora.minute == 0 and hoy != ultimo_dia:
                    ultimo_dia = hoy
                    print(f"[CRON] Disparando actualización automática — {ahora.strftime('%d/%m/%Y %H:%M')}")
                    try:
                        _disparar_actualizacion()
                    except Exception as e:
                        print(f"[CRON] Error: {e}")
            except Exception:
                pass
            time.sleep(30)  # Revisar cada 30 segundos

    threading.Thread(target=_cron_actualizacion, daemon=True).start()

    print("=" * 55)
    print("  API Catalogo JR Soluciones Informaticas")
    print("  http://localhost:5050")
    print(f"  Rate limit: {RATE_LIMIT_MAX} pedidos/hora por IP")
    print("  Cron: actualización automática a las 13:00hs ARG")
    print("=" * 55)
    app.run(host="127.0.0.1", port=5050, debug=False)
