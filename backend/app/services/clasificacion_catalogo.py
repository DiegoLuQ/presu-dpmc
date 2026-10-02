"""Código contable de un ítem del presupuesto según el catálogo de Recursos.

Se resuelve al guardar o editar el ítem: el insumo se busca en el catálogo por su id
o, si no lo trae (copiado de "Anteriores", planilla Excel, convocatoria), por su
nombre exacto. Con el destino del ítem se toma el código que el catálogo tenga para
ese insumo + destino. La subvención NO sale de aquí: la fija el formulario según el
destino.

Un insumo nuevo (aún sin códigos en el catálogo) queda sin código: lo completa el
Contralor al revisar el recurso sugerido.
"""
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import MapeoRecursoSubcategoria, Recurso


def _canon(destino: Optional[str]) -> Optional[str]:
    # Import diferido: evita el ciclo con app.api.budget.
    from app.api.budget import _destino_canonico
    return _destino_canonico(destino) or destino


def recurso_del_catalogo(db: Session, id_recurso: Optional[int], nombre: Optional[str]) -> Optional[Recurso]:
    recurso = None
    if id_recurso:
        recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
    if not recurso and nombre and nombre.strip():
        recurso = (
            db.query(Recurso)
            .filter(func.lower(func.trim(Recurso.nombre)) == nombre.strip().lower())
            .filter(Recurso.estado == "ACTIVO")
            .order_by(Recurso.id_recurso)
            .first()
        )
    return recurso


def codigo_catalogo(
    db: Session,
    id_recurso: Optional[int],
    nombre: Optional[str],
    destino: Optional[str],
    cache: Optional[dict] = None,
) -> tuple:
    """(id_recurso del catálogo o None, código contable o None)."""
    destino_c = _canon(destino)
    clave = (id_recurso, (nombre or "").strip().lower(), destino_c)
    if cache is not None and clave in cache:
        return cache[clave]

    recurso = recurso_del_catalogo(db, id_recurso, nombre)
    codigo = None
    if recurso and destino_c:
        # Varios códigos para el mismo destino: manda el primero que se registró.
        mapeo = (
            db.query(MapeoRecursoSubcategoria)
            .filter(
                MapeoRecursoSubcategoria.id_recurso == recurso.id_recurso,
                MapeoRecursoSubcategoria.destino_gasto == destino_c,
            )
            .order_by(MapeoRecursoSubcategoria.id_mapeo)
            .first()
        )
        if mapeo and mapeo.subcategoria:
            codigo = mapeo.subcategoria.codigo_cuenta

    resultado = (recurso.id_recurso if recurso else None, codigo)
    if cache is not None:
        cache[clave] = resultado
    return resultado


def aplicar_catalogo(db: Session, detalle, cache: Optional[dict] = None, estricto: bool = True) -> None:
    """Asigna al detalle (objeto o dict) el código contable del catálogo.

    estricto=True (formulario): el código es siempre el del catálogo; si no tiene, vacío.
    estricto=False (importaciones): solo se asigna cuando el catálogo tiene código, sin
    borrar el que traía el ítem.
    Si el insumo se encontró por nombre y el detalle no tenía recurso, lo vincula.
    """
    es_dict = isinstance(detalle, dict)
    get = detalle.get if es_dict else (lambda k: getattr(detalle, k, None))

    id_recurso, codigo = codigo_catalogo(
        db, get("id_recurso"), get("nombre_producto"), get("destino_gasto"), cache
    )

    valores = {}
    if codigo or estricto:
        valores["codigo_cuenta"] = codigo
    if id_recurso and not get("id_recurso"):
        valores["id_recurso"] = id_recurso
    for campo, valor in valores.items():
        if es_dict:
            detalle[campo] = valor
        else:
            setattr(detalle, campo, valor)
