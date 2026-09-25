---
name: generacion-pdf-documentos
description: Patrón para generar en el backend (Python/ReportLab) cualquier documento imprimible del sistema — actas de recepción, facturas, boletas, órdenes de compra, certificados — con la garantía de UNA HOJA POR DOCUMENTO, y descargarlo desde un botón del frontend. Usa el motor genérico backend/app/services/pdf_base.py.
---

# Generación de Documentos PDF (Actas, Facturas, Boletas, etc.)

Esta habilidad describe cómo emitir **cualquier** documento imprimible del sistema
como PDF generado en el backend, y cómo conectarlo a un botón de descarga en el
frontend.

El caso de referencia ya implementado es el botón **"📄 Descargar PDF de Actas"**
de `go-compras/programar`, pero el motor es genérico: sirve igual para facturas,
boletas, órdenes de compra, certificados o cualquier documento tabular con
encabezado, detalle y firmas.

---

## 0. Por qué en el backend y no con `window.print()`

La primera versión del botón usaba `window.print()`. **No sirve**: el navegador
agrupaba varios documentos en una misma hoja porque las reglas CSS
`page-break-after` son una *sugerencia* que el motor de impresión puede ignorar,
y el resultado dependía del navegador, del zoom y de la configuración de la
impresora del usuario.

Generando el PDF en Python el salto de página es un objeto real dentro del
documento (`PageBreak`), no una sugerencia. El resultado es idéntico en todas
las máquinas.

**Regla de oro del motor: 1 DOCUMENTO = 1 HOJA.** 2 facturas ⇒ 2 páginas.

---

## 1. Arquitectura

```
frontend  botón → api.post(..., { responseType: 'blob' }) → descarga el archivo
                                  │
backend   app/api/<router>.py     │  endpoint que valida el payload (Pydantic)
          app/services/<doc>_pdf.py  plantilla visual del documento
          app/services/pdf_base.py   motor genérico (paginación + bloques)
```

- **`pdf_base.py`** — no tocar salvo para agregar bloques reutilizables. Contiene
  la paginación, la paleta, los estilos y los bloques comunes.
- **`<doc>_pdf.py`** — un módulo por tipo de documento. Solo define su plantilla.
- **Endpoint** — recibe los datos ya calculados desde el frontend (así el PDF
  refleja exactamente lo que el usuario ve en pantalla, incluyendo lo que vive en
  `localStorage`) o los arma desde la base de datos si son datos puramente
  del servidor.

Dependencia: `reportlab` (ya está en `backend/requirements.txt`). Es Python puro,
no necesita GTK ni binarios externos como WeasyPrint — importante en Windows.

---

## 2. El motor: `app/services/pdf_base.py`

### Configuración de página

```python
from app.services.pdf_base import CARTA, OFICIO, ConfigPagina

CARTA.ancho_util          # ancho disponible entre márgenes; base de todas las tablas
ConfigPagina(margen_h=20*mm)   # variante propia si el documento lo requiere
```

### Bloques disponibles

| Función / clase | Para qué sirve |
|---|---|
| `estilos_documento()` | Diccionario de estilos de texto (`th`, `td`, `td_num`, `titulo`, `parrafo`, `nota`, `firma_titulo`…). Se crea **una vez** y se pasa a todos los bloques. |
| `encabezado_documento(...)` | Cabecera de hoja: entidad + subtítulo a la izquierda; badge y metadatos (fecha, folio, RUT) a la derecha. |
| `titulo_centrado(texto, ...)` | Título del documento en negrita, centrado, con filete arriba y abajo. |
| `tabla_datos(...)` | Tabla de detalle. Repite la cabecera si se parte entre hojas. Soporta columnas numéricas alineadas a la derecha y filas de totales destacadas. |
| `nota_al_pie(texto, ...)` | Leyenda legal / de responsabilidad con filete vertical izquierdo. |
| `bloque_firmas([...], ...)` | Fila de firmas. Acepta 1, 2 o 3 columnas `(titulo, subtitulo)`. |
| `PieAnclado([...])` | **Ancla el pie al fondo de la hoja.** Envuelve nota + firmas. |
| `Badge(texto, color, ancho)` | Etiqueta redondeada (`Área: TICs`, `Factura N° 0001234`). |
| `escapar(valor)` | Escapa texto para los `Paragraph`. |
| `normalizar_color(hex)` | Valida un color `#rrggbb` recibido del frontend. |
| `construir_pdf(documentos, ...)` | Ensambla el PDF final insertando el salto de página entre documentos. |

### `PieAnclado`: por qué existe

Sin él, las firmas quedan pegadas debajo de la tabla, a media hoja. `PieAnclado`
ocupa todo el alto libre y dibuja su contenido contra el borde inferior. Además
es **atómico**: si no cabe en lo que queda de hoja pasa entero a la siguiente y
vuelve a anclarse abajo, así nunca se separa la leyenda de las firmas ni quedan
firmas flotando en la parte superior de una hoja vacía.

### `construir_pdf`: la garantía de 1 hoja por documento

```python
paginas = [flowables_de_mi_documento(d, estilos) for d in documentos]
return construir_pdf(paginas, config=CARTA, titulo="Facturas")
```

`documentos` es una **lista de listas**: cada sublista son los flowables de un
documento completo. El motor mete un `PageBreak` entre una y otra. No armes una
sola lista plana — es exactamente el error que hacía que 2 actas salieran en
1 hoja.

---

## 3. Receta: agregar un tipo de documento nuevo

### Paso 1 — Módulo de plantilla `app/services/facturas_pdf.py`

```python
from typing import List
from reportlab.platypus import Flowable, Paragraph, Spacer
from app.services.pdf_base import (
    CARTA, PieAnclado, bloque_firmas, construir_pdf, encabezado_documento,
    escapar, estilos_documento, nota_al_pie, normalizar_color, tabla_datos,
    titulo_centrado,
)

CLP = lambda n: "$" + f"{int(n):,}".replace(",", ".")


def _flowables_de_factura(f, estilos, color: str) -> List[Flowable]:
    """Plantilla de UNA factura (sin el salto de página: lo pone el motor)."""
    ancho = CARTA.ancho_util

    filas, neto = [], 0
    for i, item in enumerate(f.items, 1):
        total = item.cantidad * item.precio_unitario
        neto += total
        filas.append([str(i), escapar(item.detalle), str(item.cantidad),
                      CLP(item.precio_unitario), CLP(total)])
    iva = round(neto * 0.19)
    filas += [["", "", "", "Neto", CLP(neto)],
              ["", "", "", "IVA 19%", CLP(iva)],
              ["", "", "", "TOTAL", CLP(neto + iva)]]

    return [
        encabezado_documento(
            estilos,
            entidad=f.colegio,
            subtitulo="Sistema de Control Presupuestario & Recepción de Compras",
            ancho_util=ancho,
            badge=f"Factura N° {f.folio}",
            color_badge=color,
            lineas_meta=[f"Fecha: {f.fecha}", f"RUT proveedor: {f.rut}"],
        ),
        Spacer(1, 10),
        titulo_centrado("FACTURA ELECTRÓNICA DE COMPRA", estilos, ancho),
        Spacer(1, 7),
        tabla_datos(
            encabezados=["#", "Detalle", "Cant.", "P. Unitario", "Total"],
            filas=filas,
            proporciones=[0.06, 0.46, 0.10, 0.19, 0.19],   # deben sumar 1
            estilos=estilos,
            ancho_util=ancho,
            alineacion_derecha=(2, 3, 4),   # columnas numéricas
            filas_totales=3,                # las 3 últimas van destacadas
        ),
        Spacer(1, 12),
        PieAnclado([
            nota_al_pie("Documento emitido conforme a la Ley 19.983. Pago a 30 días.",
                        estilos, ancho),
            Spacer(1, 16),
            bloque_firmas(
                [("Emisor", f.proveedor), ("Recibido Conforme", "Depto. Finanzas")],
                estilos, ancho,
            ),
        ]),
    ]


def generar_pdf_facturas(facturas, color_primary: str = "#0d7ff2") -> bytes:
    """UNA HOJA POR FACTURA."""
    color = normalizar_color(color_primary)
    estilos = estilos_documento()
    paginas = [_flowables_de_factura(f, estilos, color) for f in facturas]
    return construir_pdf(paginas, config=CARTA, titulo="Facturas",
                         mensaje_vacio="No hay facturas para generar.")
```

### Paso 2 — Endpoint

El import del servicio va **dentro** de la función: mantiene liviano el arranque
de FastAPI y evita imports circulares.

```python
class FacturaItemPayload(BaseModel):
    detalle: str
    cantidad: int = 1
    precio_unitario: float = 0


class FacturaPayload(BaseModel):
    colegio: Optional[str] = None
    folio: Optional[str] = None
    rut: Optional[str] = None
    fecha: Optional[str] = None
    proveedor: Optional[str] = None
    items: List[FacturaItemPayload] = []


class FacturasPdfRequest(BaseModel):
    facturas: List[FacturaPayload]
    color_primary: Optional[str] = None


@router.post("/compras/facturas/pdf")
def generar_facturas_pdf(
    payload: FacturasPdfRequest,
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
):
    """Cada factura se imprime en SU PROPIA HOJA: 2 facturas = 2 páginas."""
    from app.services.facturas_pdf import generar_pdf_facturas

    if not payload.facturas:
        raise HTTPException(status_code=400, detail="No hay facturas para generar.")

    pdf = generar_pdf_facturas(payload.facturas, payload.color_primary or "#0d7ff2")
    nombre = f"facturas-{datetime.now().strftime('%Y%m%d-%H%M')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
```

Requiere `Response` y `datetime` importados en el router (ya lo están en
`budget.py`). El permiso debe ser el mismo del módulo donde vive el botón.

### Paso 3 — Botón de descarga en el frontend

Patrón estándar reutilizable para cualquier documento:

```tsx
import { FileText, Loader2 } from 'lucide-react';
import api from '@/lib/api/client';

const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

const handleDownloadPdf = async (facturas: Factura[]) => {
    if (isGeneratingPdf) return;
    if (facturas.length === 0) {
        alert('No hay documentos para generar.');
        return;
    }
    setIsGeneratingPdf(true);
    try {
        // El color del tema activo (verde Macaya / azul Diego Portales)
        const colorPrimary = getComputedStyle(document.documentElement)
            .getPropertyValue('--primary').trim() || '#0d7ff2';

        const res = await api.post(
            '/presupuesto/compras/facturas/pdf',
            { facturas, color_primary: colorPrimary },
            { responseType: 'blob' }          // ← imprescindible
        );

        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `facturas-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error generando el PDF:', error);
        alert('No se pudo generar el PDF. Intente nuevamente.');
    } finally {
        setIsGeneratingPdf(false);
    }
};
```

```tsx
<button
    onClick={() => handleDownloadPdf(facturas)}
    disabled={isGeneratingPdf}
    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all duration-200 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 active:scale-95 cursor-pointer"
    title="Descargar el documento PDF oficial"
>
    {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
    {isGeneratingPdf ? 'Generando PDF...' : '📄 Descargar PDF'}
</button>
```

---

## 4. Errores frecuentes

- **Los documentos salen agrupados en una hoja.** Estás pasando una lista plana
  de flowables a `construir_pdf`. Debe ser una lista **por documento**.
- **`ValueError` / `paraparser` al construir el PDF.** Un dato con `&`, `<` o `>`
  sin escapar. Todo texto que venga de la base de datos o del usuario pasa por
  `escapar()`. Los bloques de `pdf_base` ya escapan sus argumentos; si construyes
  un string con marcado (`<b>`, `<font>`) escapa **solo la parte variable**:
  `f"{escapar(nombre)} <font size=7>({escapar(codigo)})</font>"`.
- **La descarga baja un archivo corrupto o de 0 bytes.** Falta
  `{ responseType: 'blob' }` en la llamada de axios: sin eso el binario se
  corrompe al interpretarse como texto.
- **El negrita de una fila no se aplica.** `TableStyle(("FONTNAME", ...))` no
  afecta a las celdas que son `Paragraph`; el estilo tiene que venir en el propio
  `ParagraphStyle`. Por eso `tabla_datos` usa `td_fuerte` / `td_num_fuerte` en
  las filas de totales en lugar de un comando de tabla.
- **404 al llamar el endpoint nuevo.** Hay que reiniciar uvicorn.
- **Las proporciones de columnas no suman 1** ⇒ la tabla se sale del margen o
  queda angosta.
- **Tildes y ñ**: las fuentes estándar (Helvetica) las soportan sin registrar
  nada. Solo si necesitas una tipografía corporativa hay que registrar un TTF con
  `pdfmetrics.registerFont`.
- **No uses `alert()` dentro de un flujo automatizado con navegador**: bloquea la
  pestaña. En la app real es aceptable.

---

## 5. Archivos de referencia

- `backend/app/services/pdf_base.py` — motor genérico.
- `backend/app/services/actas_pdf.py` — implementación completa más corta (acta).
- `backend/app/api/budget.py` → `POST /presupuesto/compras/actas/pdf` — endpoint.
- `frontend/app/(protected)/go-compras/programar/page.tsx` →
  `handleDownloadPdfActas` — botón de descarga.
