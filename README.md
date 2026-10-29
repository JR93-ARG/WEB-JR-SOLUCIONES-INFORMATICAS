# JR Shop — sitio publicado (GitHub Pages)

Este repositorio es lo que se ve en **https://www.jrshop.com.ar** (dominio en `CNAME`).
Es **la salida publicada**: casi todo se genera solo desde el repo
[`jrrailway`](https://github.com/JR93-ARG/jrrailway).

> ⚠️ **No edites a mano** `index.html`, `catalogo.css`, `catalogo.js`, `productos.json`, `p/`, `img/` ni `og/`.
> Se pisan en cada actualización automática. Esos cambios se hacen en `jrrailway/actualizador/generar.js`.

## Qué hay acá

| Ruta | Qué es | Quién la mantiene |
|---|---|---|
| `index.html`, `catalogo.css`, `catalogo.js` | La tienda (catálogo, carrito, pedido, animaciones, seguimiento anónimo) | Generada por `jrrailway` |
| `productos.json` | Lista de productos para búsquedas y sugerencias | Generada |
| `p/*.html` | Una página por producto, para compartir por WhatsApp/redes (llevan la vista previa y redirigen a la tienda) | Generada |
| `img/`, `og/` | Fotos de productos y de vista previa | Generadas |
| `seguimiento.html` | El cliente sigue su pedido con `?pedido=WEB-0000` | Manual |
| `comprobante/` | Página para ver/adjuntar el comprobante de pago (`?p=WEB-0000`) | Manual |
| `panel/` | **Panel de administración** (`/panel/`): pedidos, CRM, estadísticas, productos, precios, config | Manual — **sí se edita acá** |
| `logo.png`, `og-image.jpg`, `CNAME` | Identidad del sitio y dominio | Manual |

El actualizador solo toca `index.html`, `catalogo.*`, `productos.json`, `seguimiento.html`, `p/`, `img/` y `og/`
(y borra de `p/`, `img/` y `og/` lo que ya no existe). **`panel/` y `comprobante/` no se tocan.**

## Panel (`panel/`)

Aplicación de una sola página, sin build: se edita y se sube.

- `index.html` — estilos, pantallas y lógica general (con un índice de secciones en el comentario del principio).
- `crm.js` — CRM de ventas.
- `tienda.js` — estadísticas de la tienda.

Habla con la API de Railway (`jrrailway/api/`). Para probarlo en local alcanza con
`python -m http.server 8000` dentro de este repo y abrir `http://localhost:8000/panel/`.

## Cómo se actualiza

Un servicio de Railway (`jrrailway`, modo `actualizador`) scrapea proveedores, genera el sitio y lo sube
acá en un solo commit llamado *"Actualizacion automatica …"*. Ver `jrrailway/README.md` y `jrrailway/docs/actualizador.md`.
