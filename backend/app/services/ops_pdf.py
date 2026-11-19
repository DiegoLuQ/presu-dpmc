"""PDF de la Orden de Pago de Servicio (OPS), sobre el motor `pdf_base`.

Sigue el contenido del formato Excel "OPS MACAYA": N° G/O, fecha, marca Factura/Boleta,
proveedor, área solicitante, detalle, totales (neto + IVA o bruto − retención), cuotas
de pago, forma de pago, datos bancarios y firma. Una OPS = una hoja (carta).
Las órdenes en BORRADOR o ANULADA llevan marca de agua.
"""
import os
from datetime import date
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Image, Paragraph, Spacer, Table, TableStyle

from app.services.pdf_base import (
    CARTA, COLOR_LINEA, COLOR_TEXTO, PieAnclado, bloque_firmas,
    construir_pdf, escapar, estilos_documento, tabla_datos,
)

COLOR_MARCO = colors.HexColor("#cbd5e1")
COLOR_FONDO = colors.HexColor("#f8fafc")


def clp(valor: Optional[int]) -> str:
    return f"${int(valor or 0):,}".replace(",", ".")


def _fecha(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        return date.fromisoformat(iso[:10]).strftime("%d-%m-%Y")
    except ValueError:
        return iso


def _pct(v: Optional[float]) -> str:
    if v is None:
        return ""
    return f"{v:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def _logo(nombre_colegio: str) -> Optional[str]:
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "logos")
    n = (nombre_colegio or "").lower()
    archivo = "mc.png" if "macaya" in n else "dp.png" if ("diego" in n or "portales" in n) else None
    if archivo and os.path.exists(os.path.join(base, archivo)):
        return os.path.join(base, archivo)
    return None


def _caja(marcada: bool) -> str:
    return "<b>[ X ]</b>" if marcada else "[   ]"


def _estilos() -> dict:
    e = estilos_documento()
    e["etq"] = ParagraphStyle("etq", parent=e["td"], fontName="Helvetica-Bold", textColor=COLOR_TEXTO)
    e["val"] = ParagraphStyle("val", parent=e["td"], textColor=COLOR_TEXTO)
    e["seccion"] = ParagraphStyle("seccion", parent=e["th"], fontSize=8.5, spaceBefore=0)
    e["titulo_doc"] = ParagraphStyle("titulo_doc", parent=e["titulo"], fontSize=12, leading=15)
    e["num"] = ParagraphStyle("num", parent=e["titulo"], fontSize=11, leading=14)
    return e


def _tabla_campos(filas: List[List[str]], e: dict, anchos: List[float]) -> Table:
    """Pares etiqueta / valor (2 o 4 columnas) con marco suave."""
    datos = []
    for fila in filas:
        datos.append([Paragraph(escapar(c), e["etq"] if i % 2 == 0 else e["val"]) for i, c in enumerate(fila)])
    t = Table(datos, colWidths=anchos)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, COLOR_MARCO),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, COLOR_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        *[("BACKGROUND", (c, 0), (c, -1), COLOR_FONDO) for c in range(0, len(anchos), 2)],
    ]))
    return t


def _titulo_seccion(texto: str, e: dict) -> List[Flowable]:
    return [Spacer(1, 3 * mm), Paragraph(escapar(texto).upper(), e["seccion"]), Spacer(1, 1.2 * mm)]


def _flowables_ops(d: dict, e: dict) -> List[Flowable]:
    W = CARTA.ancho_util
    story: List[Flowable] = []
    es_factura = d["tipo_documento"] == "FACTURA"
    titulo = "ORDEN DE PAGO DE SERVICIO" if d.get("tipo_orden") != "COMPRA" else "ORDEN DE COMPRA"

    # 1. Encabezado: logo + entidad | título + N° G/O + fecha
    izq: List[Flowable] = []
    ruta_logo = _logo(d.get("colegio") or "")
    if ruta_logo:
        try:
            img = Image(ruta_logo, width=18 * mm, height=17 * mm)
            img.hAlign = "LEFT"
            izq.append(img)
            izq.append(Spacer(1, 1 * mm))
        except Exception:
            pass
    izq.append(Paragraph(f"<b>{escapar(d.get('razon_social') or d.get('colegio'))}</b>", e["val"]))
    if d.get("colegio_rut"):
        izq.append(Paragraph(f"RUT: {escapar(d['colegio_rut'])}", e["td"]))
    if d.get("colegio_direccion"):
        izq.append(Paragraph(escapar(d["colegio_direccion"]), e["td"]))

    der = Table([
        [Paragraph(titulo, e["titulo_doc"])],
        [Paragraph(f"N° G/O: {d['numero_ops']}", e["num"])],
        [Paragraph(f"Fecha: <b>{_fecha(d.get('fecha_emision'))}</b>", e["titulo"])],
    ], colWidths=[W * 0.48])
    der.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.9, COLOR_MARCO), ("BACKGROUND", (0, 0), (-1, -1), COLOR_FONDO),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    cab = Table([[izq, der]], colWidths=[W * 0.52, W * 0.48])
    cab.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(cab)
    story.append(Spacer(1, 3 * mm))

    # 2. Tipo de documento
    marca = Table([[Paragraph(f"Factura: {_caja(es_factura)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Boleta de honorarios: {_caja(not es_factura)}", e["val"])]],
                  colWidths=[W])
    marca.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(marca)

    # 3. Proveedor
    story += _titulo_seccion("Proveedor", e)
    a = [W * 0.15, W * 0.40, W * 0.15, W * 0.30]
    story.append(_tabla_campos([
        ["Proveedor", d.get("proveedor") or "", "RUT", d.get("rut_proveedor") or ""],
        ["Dirección", d.get("proveedor_direccion") or "", "Teléfono", d.get("proveedor_telefono") or ""],
        ["Área Solicitante", d.get("area") or "", "Correo", d.get("proveedor_correo") or ""],
    ], e, a))

    # 4. Detalle + totales
    story += _titulo_seccion("Detalle", e)
    filas = []
    for it in d.get("items", []):
        cant = it.get("cantidad")
        cant_txt = (f"{cant:g}".replace(".", ",") if cant else "")
        filas.append([cant_txt, escapar(it["detalle"]).replace("\n", "<br/>"),
                      clp(it["valor_unitario"]), clp(it["valor_total"])])
    totales = []
    base_lbl = "TOTAL NETO" if es_factura else "TOTAL BRUTO"
    totales.append(["", base_lbl, "", clp(d["monto_base"])])
    if d.get("descuento_monto"):
        totales.append(["", "DESCUENTO", "", f"−{clp(d['descuento_monto'])}"])
    if es_factura:
        totales.append(["", f"IVA {_pct(d.get('iva_pct'))} %", "", clp(d["iva_monto"])])
    else:
        totales.append(["", f"IMPUESTO RETENIDO {_pct(d.get('retencion_pct'))} %", "", f"−{clp(d['retencion_monto'])}"])
    totales.append(["", "<b>TOTAL A PAGAR</b>", "", f"<b>{clp(d['total_pagar'])}</b>"])
    story.append(tabla_datos(
        ["Cant.", "Detalle", "Unitario", "Total"], filas + totales,
        [0.08, 0.60, 0.16, 0.16], e, W, alineacion_derecha=(2, 3),
        estilo_primera_columna="td", filas_totales=len(totales), marcador_vacio="",
    ))

    # 5. Cuotas de pago
    story += _titulo_seccion("Pago", e)
    pagos = [[str(p["nro_cuota"]), clp(p["monto"]), f"{_pct(p.get('porcentaje'))} %" if p.get("porcentaje") is not None else "",
              _fecha(p.get("fecha_pago")), (p.get("medio") or "").title(), p.get("nro_cheque") or ""]
             for p in d.get("pagos", [])]
    story.append(tabla_datos(["N°", "Valor", "%", "Fecha de pago", "Medio", "N° cheque"], pagos,
                             [0.08, 0.20, 0.12, 0.20, 0.20, 0.20], e, W,
                             alineacion_derecha=(1, 2), estilo_primera_columna="td", marcador_vacio=""))
    forma = d.get("forma_pago")
    linea_forma = f"Anticipo: {_caja(forma == 'ANTICIPO')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Contado: {_caja(forma == 'CONTADO')}"
    if d.get("observacion"):
        linea_forma += f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Observación: {escapar(d['observacion'])}"
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(linea_forma, e["val"]))

    # 6. Datos bancarios (transferencia)
    cta = d.get("cuenta") or {}
    story += _titulo_seccion("Datos para transferencia", e)
    story.append(_tabla_campos([
        ["Nombre", cta.get("titular") or "", "RUT", cta.get("rut") or ""],
        ["Banco", cta.get("banco") or "", "Tipo de cuenta", cta.get("tipo") or ""],
        ["N° de cuenta", cta.get("numero") or "", "E-mail", cta.get("correo") or ""],
    ], e, a))

    # 7. Firma (anclada al pie)
    pie: List[Flowable] = [Spacer(1, 16 * mm)]
    if d.get("estado") == "ANULADA" and d.get("motivo_anulacion"):
        pie.insert(0, Paragraph(f"<b>ANULADA:</b> {escapar(d['motivo_anulacion'])}", e["val"]))
    pie.append(bloque_firmas([(d.get("firmante_nombre") or "Firma autorizada", d.get("firmante_cargo") or "")], e, W, ancho_linea=70 * mm))
    story.append(PieAnclado(pie))
    return story


def generar_pdf_ops(datos: dict) -> bytes:
    marca = {"BORRADOR": "BORRADOR", "ANULADA": "ANULADA"}.get(datos.get("estado"))

    def marca_agua(canv, doc):
        if not marca:
            return
        canv.saveState()
        canv.setFont("Helvetica-Bold", 90)
        canv.setFillColor(colors.Color(0.86, 0.15, 0.15, alpha=0.10) if marca == "ANULADA"
                          else colors.Color(0.4, 0.45, 0.55, alpha=0.10))
        w, h = doc.pagesize
        canv.translate(w / 2, h / 2)
        canv.rotate(40)
        canv.drawCentredString(0, 0, marca)
        canv.restoreState()

    return construir_pdf([_flowables_ops(datos, _estilos())], config=CARTA,
                         titulo=f"OPS {datos.get('numero_ops')}", on_page=marca_agua)
