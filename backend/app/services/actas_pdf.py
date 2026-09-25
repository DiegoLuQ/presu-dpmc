"""Generador de PDF de Actas de Entrega Oficiales (ReportLab).

Garantiza la regla 1 ACTA = 1 HOJA con diseño compacto de alta capacidad (15+ ítems).
Firma 'Recibí Conforme' fijada en el pie de página.
"""

import os
from datetime import date, datetime
from typing import List, Optional
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

MESES_ES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
]


def formatear_fecha_oficial(d_val) -> str:
    """Retorna fecha en formato: '14 DE AGOSTO 2026'."""
    if not d_val:
        d_val = date.today()
    if isinstance(d_val, str):
        try:
            d_val = datetime.strptime(d_val.split("T")[0], "%Y-%m-%d").date()
        except Exception:
            return str(d_val).upper()
    return f"{d_val.day} DE {MESES_ES[d_val.month - 1]} {d_val.year}"


def escapar(texto: Optional[str]) -> str:
    if not texto:
        return ""
    return str(texto).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _obtener_logo_path(colegio_nombre: str) -> Optional[str]:
    """Busca el archivo de logo local para el colegio."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logos_dir = os.path.join(base_dir, "static", "logos")
    nombre_lower = (colegio_nombre or "").lower()
    if "macaya" in nombre_lower:
        path = os.path.join(logos_dir, "mc.png")
        if os.path.exists(path):
            return path
    elif "diego" in nombre_lower or "portales" in nombre_lower:
        path = os.path.join(logos_dir, "dp.png")
        if os.path.exists(path):
            return path
    for f in ["mc.png", "dp.png"]:
        p = os.path.join(logos_dir, f)
        if os.path.exists(p):
            return p
    return None


def _flowables_de_acta_entrega(acta_data: dict, estilos: dict, numero_pagina: int = 1) -> List[Flowable]:
    """Genera la lista de flowables compactos para UNA acta de entrega."""
    ancho_util = 215.9 * mm - (30 * mm)  # Margen izq/der 15mm

    colegio = acta_data.get("colegio_nombre") or "Colegio Macaya"
    ciudad = acta_data.get("ciudad") or "ALTO HOSPICIO"
    codigo_acta = acta_data.get("codigo_acta") or "CS - N°051/2026"
    fecha_raw = acta_data.get("fecha")
    fecha_texto = f"{ciudad.upper()}, {formatear_fecha_oficial(fecha_raw)}."
    
    para_nombre = (acta_data.get("para_nombre") or "").strip()
    para_cargo = (acta_data.get("para_cargo") or "").strip()
    if para_cargo and (para_cargo.upper() in para_nombre.upper()):
        para_full = para_nombre
    elif para_cargo and para_nombre:
        para_full = f"{para_nombre} – {para_cargo}"
    else:
        para_full = para_nombre or para_cargo
    
    de_emisor = acta_data.get("de_emisor") or "GERENCIA DE OPERACIONES"
    asunto = acta_data.get("asunto") or "ENTREGA DE INSUMOS Y MATERIALES"
    numero_factura = acta_data.get("numero_factura") or "—"
    observacion = acta_data.get("observacion") or ""
    items = acta_data.get("items") or []

    story: List[Flowable] = []

    # 1. Cabecera Compacta (Logo más pequeño + Textos a la izquierda / Página a la derecha)
    logo_path = _obtener_logo_path(colegio)
    logo_element = None
    if logo_path:
        try:
            logo_element = Image(logo_path, width=25 * mm, height=23 * mm)
            logo_element.hAlign = 'LEFT'
        except Exception:
            logo_element = None

    info_colegio_html = f"""
    <font size=8.5><b>{escapar(colegio)}</b></font><br/>
    <font size=7.5 color="#444444">{escapar(ciudad.title())}</font><br/>
    <font size=7.5 color="#444444">Gerencia de Operaciones</font>
    """
    p_info_colegio = Paragraph(info_colegio_html, estilos["left_small"])
    p_pagina = Paragraph(f"<font size=9 color='#444444'><b>{numero_pagina}</b></font>", estilos["right"])

    col_izq = []
    if logo_element:
        col_izq.append(logo_element)
        col_izq.append(Spacer(1, 1 * mm))
    col_izq.append(p_info_colegio)

    header_table = Table(
        [[col_izq, p_pagina]],
        colWidths=[ancho_util - 25 * mm, 25 * mm]
    )
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 2 * mm))

    # 2. Título Central
    story.append(Paragraph("<b>ACTA ENTREGA</b>", estilos["title_bold"]))
    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph(f"<b>{escapar(codigo_acta)}</b>", estilos["title_code"]))
    story.append(Spacer(1, 2 * mm))

    # 3. Línea Horizontal Superior
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceBefore=1, spaceAfter=4))

    # 4. Bloque de Metadatos (FECHA, PARA, DE, ASUNTO, FACTURA Nº)
    meta_rows = [
        [
            Paragraph("<b>FECHA</b>", estilos["meta_label"]),
            Paragraph(f":  {escapar(fecha_texto)}", estilos["meta_val"])
        ],
        [
            Paragraph("<b>PARA</b>", estilos["meta_label"]),
            Paragraph(f":  <b>{escapar(para_full.upper())}</b>", estilos["meta_val"])
        ],
        [
            Paragraph("<b>DE</b>", estilos["meta_label"]),
            Paragraph(f":  <b>{escapar(de_emisor.upper())}</b>", estilos["meta_val"])
        ],
        [
            Paragraph("<b>ASUNTO</b>", estilos["meta_label"]),
            Paragraph(f":  <b>{escapar(asunto.upper())}</b>", estilos["meta_val"])
        ],
        [
            Paragraph("<b>FACTURA N°</b>", estilos["meta_label"]),
            Paragraph(f":  {escapar(numero_factura.upper())}", estilos["meta_val"])
        ],
    ]
    t_meta = Table(meta_rows, colWidths=[24 * mm, ancho_util - 24 * mm])
    t_meta.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0.9 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0.9 * mm),
    ]))
    story.append(t_meta)

    # 5. Línea Horizontal Inferior
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceBefore=4, spaceAfter=4))

    # 6. Observación (si existe)
    if observacion and observacion.strip():
        obs_p = Paragraph(f"<b>Observación:</b> <i>{escapar(observacion)}</i>", estilos["body"])
        story.append(obs_p)
        story.append(Spacer(1, 2 * mm))
    else:
        story.append(Spacer(1, 1 * mm))

    # 7. Detalle de Ítems Entregados (Compacto para soportar 15+ artículos)
    item_rows = []
    for idx, it in enumerate(items, 1):
        cant = it.get("cantidad") or 1
        cant_str = f"{int(cant):02d}" if float(cant).is_integer() else f"{cant:g}"
        unidad = (it.get("formato_unidad") or "UNIDAD").upper()
        nombre = (it.get("nombre_producto") or "").upper()
        desc = it.get("descripcion") or ""
        desc_text = f" - {desc.upper()}" if desc and desc.upper() != nombre else ""
        full_prod = f"{nombre}{desc_text}".strip()

        item_rows.append([
            Paragraph(f"<b>{cant_str}</b>", estilos["item_cant"]),
            Paragraph(f"<b>{escapar(unidad)}</b>", estilos["item_unit"]),
            Paragraph(f"<b>{escapar(full_prod)}</b>", estilos["item_desc"]),
        ])

    if item_rows:
        t_items = Table(
            item_rows,
            colWidths=[12 * mm, 22 * mm, ancho_util - 34 * mm]
        )
        t_items.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0.5 * mm),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0.5 * mm),
            ('TOPPADDING', (0, 0), (-1, -1), 0.8 * mm),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0.8 * mm),
        ]))
        story.append(t_items)

    return story


def _draw_acta_footer(canvas, doc):
    """Dibuja el bloque fijo 'Recibí Conforme' en el pie de la página."""
    canvas.saveState()
    x_start = 15 * mm
    line_end = 125 * mm
    
    # Título Recibí Conforme
    canvas.setFont("Helvetica-Bold", 9.5)
    canvas.setFillColor(colors.black)
    canvas.drawString(x_start, 35 * mm, "Recibí Conforme")
    
    # Línea Nombre
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(x_start, 27 * mm, "Nombre:")
    canvas.setStrokeColor(colors.gray)
    canvas.setLineWidth(0.7)
    canvas.line(x_start + 16 * mm, 27 * mm, line_end, 27 * mm)
    
    # Línea Rut
    canvas.drawString(x_start, 19 * mm, "Rut:")
    canvas.line(x_start + 16 * mm, 19 * mm, line_end, 19 * mm)
    
    # Línea Firma
    canvas.drawString(x_start, 11 * mm, "Firma:")
    canvas.line(x_start + 16 * mm, 11 * mm, line_end, 11 * mm)
    
    canvas.restoreState()


def _estilos_acta():
    styles = getSampleStyleSheet()
    
    return {
        "left_small": ParagraphStyle(
            "LeftSmall",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            alignment=TA_LEFT,
        ),
        "right": ParagraphStyle(
            "Right",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            alignment=TA_RIGHT,
        ),
        "title_bold": ParagraphStyle(
            "TitleBold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=14,
            alignment=TA_CENTER,
            textColor=colors.black,
        ),
        "title_code": ParagraphStyle(
            "TitleCode",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            alignment=TA_CENTER,
            textColor=colors.black,
        ),
        "meta_label": ParagraphStyle(
            "MetaLabel",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "meta_val": ParagraphStyle(
            "MetaVal",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "body": ParagraphStyle(
            "BodyTextCustom",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "item_cant": ParagraphStyle(
            "ItemCant",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "item_unit": ParagraphStyle(
            "ItemUnit",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "item_desc": ParagraphStyle(
            "ItemDesc",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
    }


def generar_pdf_acta_entrega(actas_data: List[dict]) -> bytes:
    """Genera el buffer de bytes del PDF con 1 o más actas (cada una en su hoja)."""
    buffer = BytesIO()
    
    # Tamaño carta con margen inferior de 40mm para el footer fijo de firma
    doc = BaseDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=10 * mm,
        bottomMargin=42 * mm,
    )
    
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id='normal',
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0
    )
    template = PageTemplate(id='acta_template', frames=frame, onPage=_draw_acta_footer)
    doc.addPageTemplates([template])

    estilos = _estilos_acta()
    story: List[Flowable] = []

    for idx, acta in enumerate(actas_data):
        flowables = _flowables_de_acta_entrega(acta, estilos, numero_pagina=idx + 1)
        story.extend(flowables)
        if idx < len(actas_data) - 1:
            story.append(PageBreak())

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
