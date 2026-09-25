"""Motor genérico de documentos PDF (ReportLab).

Toolkit reutilizable para emitir cualquier documento imprimible del sistema:
actas de recepción, facturas, boletas, órdenes de compra, certificados, etc.

Regla central del motor: **1 DOCUMENTO = 1 HOJA**. `construir_pdf()` recibe una
lista de documentos (cada uno como su propia lista de flowables) e inserta un
salto de página explícito entre ellos. 2 documentos => 2 páginas. Nunca se
agrupan dos documentos en la misma hoja.

Si un documento es tan largo que su tabla no cabe en una hoja, ese documento
continúa en las hojas siguientes (con la cabecera de tabla repetida) y su pie
se ancla al fondo de su última hoja; el documento siguiente igualmente empieza
en hoja nueva.

Uso típico (ver `actas_pdf.py` como implementación de referencia):

    estilos = estilos_documento()
    paginas = [_flowables_de_mi_documento(d, estilos) for d in documentos]
    return construir_pdf(paginas, titulo="Facturas")
"""

from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, List, Optional, Sequence, Tuple, Union

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import legal, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

__all__ = [
    "ConfigPagina",
    "CARTA",
    "OFICIO",
    "COLOR_TEXTO",
    "COLOR_TITULO",
    "COLOR_SUAVE",
    "COLOR_GRIS",
    "COLOR_LINEA",
    "COLOR_LINEA_TENUE",
    "PRIMARY_POR_DEFECTO",
    "escapar",
    "normalizar_color",
    "mezclar_con_blanco",
    "estilos_documento",
    "Badge",
    "PieAnclado",
    "encabezado_documento",
    "titulo_centrado",
    "tabla_datos",
    "bloque_firmas",
    "nota_al_pie",
    "construir_pdf",
]


# ── Configuración de página ──────────────────────────────────────────────────
@dataclass(frozen=True)
class ConfigPagina:
    """Tamaño y márgenes de la hoja. Instancia `CARTA` por defecto."""

    tamano: Tuple[float, float] = letter
    margen_h: float = 15 * mm
    margen_v: float = 12 * mm

    @property
    def ancho_util(self) -> float:
        return self.tamano[0] - (2 * self.margen_h)


CARTA = ConfigPagina()
OFICIO = ConfigPagina(tamano=legal)


# ── Paleta ───────────────────────────────────────────────────────────────────
COLOR_TEXTO = colors.HexColor("#111827")
COLOR_TITULO = colors.HexColor("#1f2937")
COLOR_SUAVE = colors.HexColor("#9ca3af")
COLOR_GRIS = colors.HexColor("#4b5563")
COLOR_LINEA = colors.HexColor("#e5e7eb")
COLOR_LINEA_TENUE = colors.HexColor("#f3f4f6")
COLOR_CABECERA_TABLA = colors.HexColor("#f8fafc")
COLOR_CABECERA_TEXTO = colors.HexColor("#334155")
PRIMARY_POR_DEFECTO = "#0d7ff2"


def normalizar_color(color_hex: Optional[str]) -> str:
    """Valida un color `#rrggbb` recibido desde el frontend y cae al primario."""
    if not color_hex or not str(color_hex).startswith("#"):
        return PRIMARY_POR_DEFECTO
    try:
        colors.HexColor(color_hex)
    except Exception:
        return PRIMARY_POR_DEFECTO
    return color_hex


def mezclar_con_blanco(color_hex: str, ratio: float) -> colors.Color:
    """Aclara un color mezclándolo con blanco (emula `bg-primary/10` de Tailwind)."""
    c = colors.HexColor(color_hex)
    return colors.Color(
        1 + (c.red - 1) * ratio,
        1 + (c.green - 1) * ratio,
        1 + (c.blue - 1) * ratio,
    )


def escapar(valor: Optional[object]) -> str:
    """Escapa texto para el mini-HTML de los Paragraph de ReportLab.

    OBLIGATORIO para todo dato que venga del usuario o de la base de datos: un
    `&` o un `<` sin escapar rompe el parser y aborta la generación del PDF.
    """
    texto = "" if valor is None else str(valor)
    return texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ── Estilos de texto ─────────────────────────────────────────────────────────
def estilos_documento() -> dict:
    """Set de estilos comunes a todos los documentos del sistema."""
    return {
        "entidad": ParagraphStyle(
            "entidad", fontName="Helvetica-Bold", fontSize=9.5, leading=12,
            textColor=COLOR_TITULO,
        ),
        "subtitulo": ParagraphStyle(
            "subtitulo", fontName="Helvetica", fontSize=7.5, leading=10,
            textColor=COLOR_SUAVE,
        ),
        "meta": ParagraphStyle(
            "meta", fontName="Helvetica", fontSize=7, leading=9,
            textColor=COLOR_SUAVE, alignment=2,
        ),
        "titulo": ParagraphStyle(
            "titulo", fontName="Helvetica-Bold", fontSize=10.5, leading=14,
            textColor=COLOR_TEXTO, alignment=TA_CENTER,
        ),
        "parrafo": ParagraphStyle(
            "parrafo", fontName="Helvetica", fontSize=8.5, leading=12.5,
            textColor=COLOR_GRIS, alignment=TA_JUSTIFY,
        ),
        "th": ParagraphStyle(
            "th", fontName="Helvetica-Bold", fontSize=8, leading=10,
            textColor=COLOR_CABECERA_TEXTO,
        ),
        "td": ParagraphStyle(
            "td", fontName="Helvetica", fontSize=8, leading=10.5,
            textColor=COLOR_GRIS,
        ),
        "td_fuerte": ParagraphStyle(
            "td_fuerte", fontName="Helvetica-Bold", fontSize=8, leading=10.5,
            textColor=COLOR_TEXTO,
        ),
        "td_num": ParagraphStyle(
            "td_num", fontName="Helvetica", fontSize=8, leading=10.5,
            textColor=COLOR_GRIS, alignment=2,
        ),
        "td_num_fuerte": ParagraphStyle(
            "td_num_fuerte", fontName="Helvetica-Bold", fontSize=8, leading=10.5,
            textColor=COLOR_TEXTO, alignment=2,
        ),
        "nota": ParagraphStyle(
            "nota", fontName="Helvetica-Oblique", fontSize=7.5, leading=10,
            textColor=COLOR_SUAVE, leftIndent=8,
        ),
        "firma_titulo": ParagraphStyle(
            "firma_titulo", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
            textColor=COLOR_TITULO, alignment=TA_CENTER,
        ),
        "firma_sub": ParagraphStyle(
            "firma_sub", fontName="Helvetica", fontSize=7, leading=9.5,
            textColor=COLOR_SUAVE, alignment=TA_CENTER,
        ),
    }


# ── Flowables ────────────────────────────────────────────────────────────────
class Badge(Flowable):
    """Etiqueta redondeada alineada a la derecha ("Área: TICs", "N° 0012345")."""

    PAD_X = 7
    PAD_Y = 4

    def __init__(self, texto: str, color_hex: str, ancho_max: float,
                 font_size: float = 8):
        super().__init__()
        self.texto = texto
        self.color = colors.HexColor(color_hex)
        self.fondo = mezclar_con_blanco(color_hex, 0.10)
        self.borde = mezclar_con_blanco(color_hex, 0.25)
        self.ancho_max = ancho_max
        self.font = "Helvetica-Bold"
        self.font_size = font_size

    def wrap(self, availWidth, availHeight):
        from reportlab.pdfbase.pdfmetrics import stringWidth

        self._text_w = min(
            stringWidth(self.texto, self.font, self.font_size),
            self.ancho_max - 2 * self.PAD_X,
        )
        self.width = availWidth
        self.height = self.font_size + 2 * self.PAD_Y
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        w = self._text_w + 2 * self.PAD_X
        x = self.width - w  # alineado a la derecha
        c.setFillColor(self.fondo)
        c.setStrokeColor(self.borde)
        c.setLineWidth(0.7)
        c.roundRect(x, 0, w, self.height, self.height / 2, stroke=1, fill=1)
        c.setFillColor(self.color)
        c.setFont(self.font, self.font_size)
        c.drawString(x + self.PAD_X, self.PAD_Y + 1.5, self.texto)


class PieAnclado(Flowable):
    """Pie del documento (totales, notas, firmas) anclado al fondo de la hoja.

    Ocupa todo el alto libre restante y dibuja su contenido pegado al borde
    inferior. Es atómico: si no cabe en lo que queda de hoja pasa entero a la
    siguiente, donde vuelve a quedar anclado abajo. Así nunca se parte una nota
    de sus firmas ni quedan firmas flotando arriba de una hoja casi vacía.
    """

    def __init__(self, contenido: List[Flowable]):
        super().__init__()
        self.contenido = contenido

    def wrap(self, availWidth, availHeight):
        self._alturas = [f.wrap(availWidth, availHeight)[1] for f in self.contenido]
        necesario = sum(self._alturas)
        self.width = availWidth
        # Si cabe, se estira hasta el fondo de la hoja; si no, conserva su alto
        # natural para que el frame lo desplace completo a la hoja siguiente.
        self.height = max(necesario, availHeight - 2) if availHeight >= necesario else necesario
        return (self.width, self.height)

    def draw(self):
        y = 0.0
        for flowable, alto in zip(reversed(self.contenido), reversed(self._alturas)):
            flowable.drawOn(self.canv, 0, y)
            y += alto


# ── Bloques de alto nivel ────────────────────────────────────────────────────
def encabezado_documento(
    estilos: dict,
    entidad: str,
    subtitulo: str,
    ancho_util: float,
    badge: Optional[str] = None,
    color_badge: str = PRIMARY_POR_DEFECTO,
    lineas_meta: Sequence[str] = (),
) -> Table:
    """Encabezado de hoja: entidad + subtítulo a la izquierda; badge y metadatos
    (fecha, folio, RUT...) a la derecha."""
    izquierda: List[Flowable] = [
        Paragraph(escapar(entidad).upper(), estilos["entidad"]),
        Paragraph(escapar(subtitulo), estilos["subtitulo"]),
    ]
    derecha: List[Flowable] = []
    if badge:
        derecha.append(Badge(badge, color_badge, ancho_util * 0.45))
        derecha.append(Spacer(1, 3))
    for linea in lineas_meta:
        derecha.append(Paragraph(escapar(linea), estilos["meta"]))

    tabla = Table(
        [[izquierda, derecha or [Spacer(1, 1)]]],
        colWidths=[ancho_util * 0.55, ancho_util * 0.45],
    )
    tabla.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, COLOR_LINEA_TENUE),
        ])
    )
    return tabla


def titulo_centrado(texto: str, estilos: dict, ancho_util: float) -> Table:
    """Título del documento, centrado y en negrita, con filete arriba y abajo."""
    tabla = Table([[Paragraph(escapar(texto), estilos["titulo"])]], colWidths=[ancho_util])
    tabla.setStyle(
        TableStyle([
            ("LINEABOVE", (0, 0), (-1, 0), 0.7, COLOR_LINEA_TENUE),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, COLOR_LINEA_TENUE),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    return tabla


Celda = Union[str, Paragraph]


def tabla_datos(
    encabezados: Sequence[str],
    filas: Iterable[Sequence[Celda]],
    proporciones: Sequence[float],
    estilos: dict,
    ancho_util: float,
    alineacion_derecha: Sequence[int] = (),
    estilo_primera_columna: str = "td_fuerte",
    filas_totales: int = 0,
    marcador_vacio: str = "-",
) -> Table:
    """Tabla de detalle del documento (recursos, ítems facturados, etc.).

    - `proporciones`: fracciones del ancho útil, una por columna (deben sumar 1).
    - `alineacion_derecha`: índices de columnas numéricas (montos, cantidades).
    - `filas_totales`: nº de filas finales a destacar como totales (subtotal,
      IVA, total) — se les aplica negrita y un filete superior. En esas filas
      las celdas vacías se dejan en blanco, no se marcan con `marcador_vacio`.
    - `marcador_vacio`: relleno de las celdas de datos sin valor.
    - Las celdas `str` se convierten a Paragraph (admiten `<b>`, `<font>`); si
      ya vienen como Paragraph se respetan tal cual.

    La cabecera se repite automáticamente si la tabla se parte entre hojas.
    """
    cabecera = [Paragraph(escapar(h), estilos["th"]) for h in encabezados]
    datos: List[List[Celda]] = [cabecera]

    filas = list(filas)
    inicio_totales = len(filas) - filas_totales if filas_totales > 0 else len(filas)

    for nro_fila, fila in enumerate(filas):
        es_total = nro_fila >= inicio_totales
        construida: List[Celda] = []
        for idx, celda in enumerate(fila):
            if isinstance(celda, Paragraph):
                construida.append(celda)
                continue
            if idx in alineacion_derecha:
                estilo = estilos["td_num_fuerte" if es_total else "td_num"]
            elif idx == 0:
                estilo = estilos[estilo_primera_columna]
            elif es_total:
                estilo = estilos["td_fuerte"]
            else:
                estilo = estilos["td"]
            vacio = "" if es_total else marcador_vacio
            construida.append(Paragraph(str(celda) if celda not in (None, "") else vacio, estilo))
        datos.append(construida)

    anchos = [ancho_util * p for p in proporciones]
    tabla = Table(datos, colWidths=anchos, repeatRows=1)
    comandos = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_CABECERA_TABLA),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, COLOR_LINEA),
        ("LINEBELOW", (0, 1), (-1, -2), 0.5, COLOR_LINEA_TENUE),
        ("BOX", (0, 0), (-1, -1), 0.7, COLOR_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if filas_totales > 0:
        primera_total = len(datos) - filas_totales
        comandos += [
            ("LINEABOVE", (0, primera_total), (-1, primera_total), 0.8, COLOR_LINEA),
            ("BACKGROUND", (0, primera_total), (-1, -1), COLOR_CABECERA_TABLA),
        ]
    tabla.setStyle(TableStyle(comandos))
    return tabla


def nota_al_pie(texto: str, estilos: dict, ancho_util: float) -> Table:
    """Leyenda legal / de responsabilidad con filete vertical a la izquierda."""
    tabla = Table([[Paragraph(escapar(texto), estilos["nota"])]], colWidths=[ancho_util])
    tabla.setStyle(
        TableStyle([
            ("LINEBEFORE", (0, 0), (0, 0), 1.5, COLOR_LINEA),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ])
    )
    return tabla


def bloque_firmas(
    firmas: Sequence[Tuple[str, str]],
    estilos: dict,
    ancho_util: float,
    ancho_linea: float = 45 * mm,
) -> Table:
    """Fila de firmas. `firmas` es una secuencia de `(titulo, subtitulo)`;
    admite 1, 2 o 3 columnas (ej. emisor / receptor / visación)."""
    if not firmas:
        return Table([[Spacer(1, 1)]], colWidths=[ancho_util])

    def celda(titulo: str, subtitulo: str) -> Table:
        interna = Table(
            [
                [""],
                [Paragraph(escapar(titulo), estilos["firma_titulo"])],
                [Paragraph(escapar(subtitulo), estilos["firma_sub"])],
            ],
            colWidths=[ancho_linea],
        )
        interna.setStyle(
            TableStyle([
                ("LINEBELOW", (0, 0), (0, 0), 0.8, colors.HexColor("#d1d5db")),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 2),
                ("TOPPADDING", (0, 1), (0, 1), 5),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        return interna

    ancho_col = ancho_util / len(firmas)
    tabla = Table(
        [[celda(titulo, subtitulo) for titulo, subtitulo in firmas]],
        colWidths=[ancho_col] * len(firmas),
    )
    tabla.setStyle(
        TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    return tabla


# ── Constructor del PDF ──────────────────────────────────────────────────────
def construir_pdf(
    documentos: Sequence[Sequence[Flowable]],
    config: ConfigPagina = CARTA,
    titulo: str = "Documento",
    autor: str = "Sistema de Control Presupuestario & Recepción de Compras",
    mensaje_vacio: str = "No hay documentos para generar.",
) -> bytes:
    """Ensambla el PDF final: UNA HOJA POR DOCUMENTO.

    `documentos` es una lista donde cada elemento es la lista de flowables de
    un documento completo. Entre documento y documento se inserta un
    `PageBreak`, de modo que 2 documentos siempre producen 2 páginas.
    """
    buffer = BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=config.tamano,
        leftMargin=config.margen_h,
        rightMargin=config.margen_h,
        topMargin=config.margen_v,
        bottomMargin=config.margen_v,
        title=titulo,
        author=autor,
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="documento",
    )
    doc.addPageTemplates([PageTemplate(id="documento", frames=[frame])])

    story: List[Flowable] = []
    for indice, bloques in enumerate(documentos):
        if indice > 0:
            # Salto explícito: el siguiente documento SIEMPRE arranca en hoja nueva.
            story.append(PageBreak())
        story.extend(bloques)

    if not story:
        story.append(Paragraph(escapar(mensaje_vacio), estilos_documento()["parrafo"]))

    doc.build(story)
    return buffer.getvalue()
