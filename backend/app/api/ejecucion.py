"""Presupuesto vs Ejecutado: cruza el presupuesto aprobado con las órdenes de compra
aprobadas de Softland (BD `ordenes_compra`, vista `v_ordenes_area`, SOLO LECTURA).

- Presupuestado = ítems 'Aprobado' de solicitudes 'Aceptado' y activas.
- Solicitado    = todos los ítems de las solicitudes activas.
- Ejecutado     = SUM(v_ordenes_area.total) (pesos, con IVA).
- Año: pre_presupuesto_anual.year (año de ejecución) = YEAR(fecha_oc). Las solicitudes sin
  presupuesto anual usan YEAR(fecha), igual que /presupuesto/solicitudes.
- Las áreas de OC que no existen en org_area se reasignan con pre_mapeo_area_oc y los
  centros de costo se traducen a subvención con pre_mapeo_cc_subvencion
  (Configuración › Ejecución OC).

Claves de dimensión (las usa también el frontend para filtrar):
  área:   'a{id_area}' | 'oc{id_area_oc}' (área OC sin asignar) | 'sin' (OC sin grupo)
  centro: 's{id_subvencion}' | 'cc{CODIGO}' (centro sin equivalencia) | 'sincc' | 'sinsub'
"""
import logging
import re
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, text
from sqlalchemy.orm import Session

from app.api.deps import verificar_permisos, verificar_seccion
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    Area, Cargo, MapeoAreaOC, MapeoCentroCostoSubvencion, PresupuestoAnual,
    PresupuestoDetalle, SolicitudPresupuesto, Subvencion, User,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/presupuesto/ejecucion", tags=["Presupuesto vs Ejecutado"])

# % de ejecución sobre el cual se marca la fila con aviso (⚠)
UMBRAL_ALERTA_PCT = 150

ROLES_MULTICOLEGIO = ["ADM", "SOS", "GERENTE"]


# ── Acceso a la BD de órdenes de compra ─────────────────────────────────────────

def _oc_schema(db: Session) -> Optional[str]:
    """Nombre de la BD de OC si existe y tiene la vista; None si no está disponible."""
    nombre = settings.OC_DB_NAME
    if not nombre or not re.fullmatch(r"[A-Za-z0-9_]+", nombre):
        return None
    try:
        existe = db.execute(text(
            "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = :s AND TABLE_NAME = 'v_ordenes_area'"
        ), {"s": nombre}).first()
    except Exception as e:
        logger.warning("No se pudo verificar la BD de OC '%s': %s", nombre, e)
        db.rollback()
        return None
    return nombre if existe else None


def _ultima_sync(db: Session, schema: str) -> Optional[str]:
    try:
        fin = db.execute(text(f"SELECT MAX(fin) FROM `{schema}`.sincronizaciones")).scalar()
    except Exception:
        db.rollback()
        return None
    # `fin` se guarda en UTC (igual que NOW() del servidor MySQL)
    return fin.isoformat() + "Z" if isinstance(fin, datetime) else None


def _colegio_efectivo(id_colegio: Optional[int], user: User) -> Optional[int]:
    """Mismo criterio que /presupuesto/solicitudes: sin colegio elegido, los roles no
    multicolegio ven solo el suyo."""
    if id_colegio:
        return id_colegio
    if user.rol and user.rol.codigo not in ROLES_MULTICOLEGIO:
        return user.id_colegio
    return None


# ── Resolución de claves ────────────────────────────────────────────────────────

class _Contexto:
    """Catálogos y mapeos necesarios para traducir filas a claves y etiquetas."""

    def __init__(self, db: Session, schema: Optional[str]):
        self.areas: Dict[int, str] = {a.id_area: a.nombre for a in db.query(Area).all()}
        self.subv: Dict[int, Subvencion] = {s.id_subvencion: s for s in db.query(Subvencion).all()}
        self.mapa_area: Dict[int, Optional[int]] = {
            m.id_area_oc: m.id_area for m in db.query(MapeoAreaOC).all()
        }
        self.mapa_cc: Dict[str, Optional[int]] = {
            m.centro_costo.upper(): m.id_subvencion for m in db.query(MapeoCentroCostoSubvencion).all()
        }
        self.nombre_grupo_oc: Dict[int, str] = {}
        if schema:
            try:
                for id_area, nombre in db.execute(text(
                    f"SELECT id_area, nombre FROM `{schema}`.grupos WHERE id_area IS NOT NULL"
                )).all():
                    self.nombre_grupo_oc.setdefault(int(id_area), nombre)
            except Exception:
                db.rollback()

    # Área
    def area_key_oc(self, id_area: Optional[int]) -> str:
        if id_area is None:
            return "sin"
        destino = self.mapa_area.get(id_area)
        if destino:
            return f"a{destino}"
        if id_area in self.areas:
            return f"a{id_area}"
        return f"oc{id_area}"

    @staticmethod
    def area_key_ppto(id_area: Optional[int]) -> str:
        return f"a{id_area}" if id_area is not None else "sin"

    def area_label(self, key: str) -> str:
        if key == "sin":
            return "Sin área"
        if key.startswith("oc"):
            n = int(key[2:])
            return f"{self.nombre_grupo_oc.get(n, 'Área OC')} (OC área {n}, sin asignar)"
        return self.areas.get(int(key[1:]), f"Área {key[1:]}")

    # Centro de costo / subvención
    def cc_key_oc(self, cc: Optional[str]) -> str:
        if not cc:
            return "sincc"
        cc = cc.upper()
        id_sub = self.mapa_cc.get(cc)
        return f"s{id_sub}" if id_sub else f"cc{cc}"

    @staticmethod
    def cc_key_ppto(id_subvencion: Optional[int]) -> str:
        return f"s{id_subvencion}" if id_subvencion else "sinsub"

    def centros_de(self, key: str) -> List[str]:
        if key.startswith("s") and key[1:].isdigit():
            id_sub = int(key[1:])
            return sorted(cc for cc, s in self.mapa_cc.items() if s == id_sub)
        if key.startswith("cc"):
            return [key[2:]]
        return []

    def cc_label(self, key: str) -> str:
        if key == "sincc":
            return "OC sin centro de costo"
        if key == "sinsub":
            return "Presupuesto sin subvención"
        if key.startswith("cc"):
            return f"{key[2:]} (sin equivalencia)"
        s = self.subv.get(int(key[1:]))
        nombre = (s.nombre_completo or s.nombre_corto) if s else f"Subvención {key[1:]}"
        ccs = self.centros_de(key)
        return f"{' / '.join(ccs)} · {nombre}" if ccs else nombre


# ── Carga de datos agregados ────────────────────────────────────────────────────

def _registros_presupuesto(db: Session, ctx: _Contexto, id_colegio: Optional[int]) -> List[dict]:
    col = func.coalesce(PresupuestoAnual.id_colegio, SolicitudPresupuesto.id_colegio)
    anio = func.coalesce(PresupuestoAnual.year, func.year(SolicitudPresupuesto.fecha))
    mes = func.month(PresupuestoDetalle.fecha_ejecucion)
    aprobado = case(
        (and_(PresupuestoDetalle.estado_aprobacion == "Aprobado", SolicitudPresupuesto.estado == "Aceptado"), 1),
        else_=0,
    )
    monto = case(
        (PresupuestoDetalle.total_iva > 0, PresupuestoDetalle.total_iva),
        else_=PresupuestoDetalle.cantidad * PresupuestoDetalle.valor_unitario_iva,
    )
    q = (
        db.query(anio.label("anio"), mes.label("mes"), Cargo.id_area, PresupuestoDetalle.id_subvencion,
                 aprobado.label("aprobado"), func.sum(monto).label("monto"))
        .join(SolicitudPresupuesto, SolicitudPresupuesto.id_presupuesto == PresupuestoDetalle.id_presupuesto)
        .outerjoin(PresupuestoAnual, PresupuestoAnual.id_presupuesto_anual == SolicitudPresupuesto.id_presupuesto_anual)
        .outerjoin(Cargo, Cargo.id_cargo == SolicitudPresupuesto.id_cargo)
        .filter(SolicitudPresupuesto.activo == True)  # noqa: E712
    )
    if id_colegio:
        q = q.filter(col == id_colegio)
    q = q.group_by(anio, mes, Cargo.id_area, PresupuestoDetalle.id_subvencion, aprobado)

    out = []
    for r in q.all():
        if r.anio is None:
            continue
        m = float(r.monto or 0)
        out.append({
            "anio": int(r.anio), "mes": int(r.mes) if r.mes else None,
            "area": ctx.area_key_ppto(r.id_area), "cc": ctx.cc_key_ppto(r.id_subvencion),
            "presupuestado": m if r.aprobado else 0.0, "solicitado": m,
            "ejecutado": 0.0, "n_oc": 0,
        })
    return out


def _registros_oc(db: Session, ctx: _Contexto, schema: str, id_colegio: Optional[int]) -> List[dict]:
    sql = (
        f"SELECT anio, MONTH(fecha_oc) AS mes, id_area, centro_costo, SUM(total) AS total, COUNT(*) AS n "
        f"FROM `{schema}`.v_ordenes_area "
        f"{'WHERE id_colegio = :col ' if id_colegio else ''}"
        f"GROUP BY anio, MONTH(fecha_oc), id_area, centro_costo"
    )
    rows = db.execute(text(sql), {"col": id_colegio} if id_colegio else {}).all()
    out = []
    for r in rows:
        if r.anio is None:
            continue
        out.append({
            "anio": int(r.anio), "mes": int(r.mes) if r.mes else None,
            "area": ctx.area_key_oc(int(r.id_area) if r.id_area is not None else None),
            "cc": ctx.cc_key_oc(r.centro_costo),
            "presupuestado": 0.0, "solicitado": 0.0,
            "ejecutado": float(r.total or 0), "n_oc": int(r.n or 0),
        })
    return out


def _filtrar(regs: List[dict], meses: List[int], areas: List[str], centros: List[str]) -> List[dict]:
    sm, sa, sc = set(meses), set(areas), set(centros)
    return [
        r for r in regs
        if (not sm or r["mes"] in sm) and (not sa or r["area"] in sa) and (not sc or r["cc"] in sc)
    ]


_METRICAS = ("presupuestado", "solicitado", "ejecutado", "n_oc")


def _sumar(regs: List[dict], clave) -> Dict:
    acc: Dict = defaultdict(lambda: {m: 0 for m in _METRICAS})
    for r in regs:
        a = acc[clave(r)]
        for m in _METRICAS:
            a[m] += r[m]
    return acc


def _redondear(d: dict) -> dict:
    return {k: (round(v) if isinstance(v, float) else v) for k, v in d.items()}


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/resumen")
def resumen_ejecucion(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    _sec: User = Depends(verificar_seccion("presupuesto.solicitudes")),
    id_colegio: Optional[int] = Query(None),
    anio: int = Query(..., description="Año de ejecución (= año del presupuesto anual)"),
    anio_comp: Optional[int] = Query(None, description="Año con el que comparar cada fila"),
    agrupar: str = Query("area", pattern="^(area|cc|area_cc)$"),
    meses: List[int] = Query([]),
    areas: List[str] = Query([], description="Claves de área: a{id}, oc{id}, sin"),
    centros: List[str] = Query([], description="Claves de centro: s{id}, cc{COD}, sincc, sinsub"),
):
    id_col = _colegio_efectivo(id_colegio, current_user)
    schema = _oc_schema(db)
    ctx = _Contexto(db, schema)

    regs = _registros_presupuesto(db, ctx, id_col)
    oc_error = None
    if schema:
        try:
            regs += _registros_oc(db, ctx, schema, id_col)
        except Exception as e:
            db.rollback()
            logger.exception("Error leyendo órdenes de compra: %s", e)
            oc_error = "No se pudieron leer las órdenes de compra (revisa permisos de lectura sobre la BD de OC)."

    # Opciones de filtro: todo lo que aparece en cualquier año (sin filtros aplicados)
    orden = lambda k: 0 if k.startswith("a") or (k.startswith("s") and k[1:].isdigit()) else 1 if k.startswith(("oc", "cc")) else 2  # noqa: E731
    opciones_areas = sorted({r["area"] for r in regs}, key=lambda k: (orden(k), ctx.area_label(k)))
    opciones_cc = sorted({r["cc"] for r in regs}, key=lambda k: (orden(k), ctx.cc_label(k)))

    filtrados = _filtrar(regs, meses, areas, centros)

    if agrupar == "area":
        clave = lambda r: (r["area"], None)  # noqa: E731
    elif agrupar == "cc":
        clave = lambda r: (None, r["cc"])  # noqa: E731
    else:
        clave = lambda r: (r["area"], r["cc"])  # noqa: E731

    del_anio = _sumar([r for r in filtrados if r["anio"] == anio], clave)
    del_comp = _sumar([r for r in filtrados if r["anio"] == anio_comp], clave) if anio_comp else {}

    filas = []
    for k in set(del_anio) | set(del_comp):
        a_key, c_key = k
        base = del_anio.get(k, {m: 0 for m in _METRICAS})
        fila = {
            "key": f"{a_key or ''}|{c_key or ''}",
            "area_key": a_key, "area": ctx.area_label(a_key) if a_key else None,
            "cc_key": c_key, "cc": ctx.cc_label(c_key) if c_key else None,
            "centros": ctx.centros_de(c_key) if c_key else [],
            **_redondear(base),
        }
        if anio_comp:
            comp = del_comp.get(k, {m: 0 for m in _METRICAS})
            fila["comp_presupuestado"] = round(comp["presupuestado"])
            fila["comp_ejecutado"] = round(comp["ejecutado"])
            fila["comp_n_oc"] = comp["n_oc"]
        filas.append(fila)
    filas.sort(key=lambda f: -(max(f["presupuestado"], f["ejecutado"])))

    tot = _sumar([r for r in filtrados if r["anio"] == anio], lambda r: 0).get(0, {m: 0 for m in _METRICAS})
    mensual_acc = _sumar([r for r in filtrados if r["anio"] == anio], lambda r: r["mes"])
    mensual = [
        {"mes": m, "presupuestado": round(mensual_acc[m]["presupuestado"]) if m in mensual_acc else 0,
         "ejecutado": round(mensual_acc[m]["ejecutado"]) if m in mensual_acc else 0}
        for m in range(1, 13)
    ]
    hist_acc = _sumar(filtrados, lambda r: r["anio"])
    historico = [{"anio": y, **_redondear(v)} for y, v in sorted(hist_acc.items())]

    return {
        "oc_disponible": bool(schema) and not oc_error,
        "oc_error": oc_error,
        "ultima_sync": _ultima_sync(db, schema) if schema else None,
        "umbral_alerta": UMBRAL_ALERTA_PCT,
        "id_colegio": id_col,
        "anio": anio,
        "anio_comp": anio_comp,
        "agrupar": agrupar,
        "filas": filas,
        "totales": _redondear(tot),
        "mensual": mensual,
        "historico": historico,
        "opciones": {
            "areas": [{"key": k, "label": ctx.area_label(k)} for k in opciones_areas],
            "centros": [{"key": k, "label": ctx.cc_label(k)} for k in opciones_cc],
        },
        "pendientes_mapeo": {
            "areas": sum(1 for k in opciones_areas if k.startswith("oc")),
            "centros": sum(1 for k in opciones_cc if k.startswith("cc")),
        },
    }


@router.get("/oc")
def listar_oc(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    _sec: User = Depends(verificar_seccion("presupuesto.solicitudes")),
    id_colegio: Optional[int] = Query(None),
    anio: int = Query(...),
    area: Optional[str] = Query(None, description="Clave de área"),
    centro: Optional[str] = Query(None, description="Clave de centro"),
    meses: List[int] = Query([]),
):
    """OC individuales de una fila del informe (para el modal de detalle)."""
    schema = _oc_schema(db)
    if not schema:
        return {"oc_disponible": False, "ordenes": []}
    id_col = _colegio_efectivo(id_colegio, current_user)
    ctx = _Contexto(db, schema)
    sql = (
        f"SELECT empresa, id_colegio, num_oc, fecha_oc, centro_costo, subtotal, total, solicitante, "
        f"grupo, grupo_manual, id_area FROM `{schema}`.v_ordenes_area WHERE anio = :anio "
        f"{'AND id_colegio = :col ' if id_col else ''}ORDER BY fecha_oc DESC, num_oc DESC"
    )
    params = {"anio": anio}
    if id_col:
        params["col"] = id_col
    try:
        rows = db.execute(text(sql), params).all()
    except Exception as e:
        db.rollback()
        logger.exception("Error leyendo órdenes de compra: %s", e)
        raise HTTPException(status_code=502, detail="No se pudieron leer las órdenes de compra.")

    sm = set(meses)
    ordenes = []
    for r in rows:
        a_key = ctx.area_key_oc(int(r.id_area) if r.id_area is not None else None)
        c_key = ctx.cc_key_oc(r.centro_costo)
        if area and a_key != area:
            continue
        if centro and c_key != centro:
            continue
        if sm and (not r.fecha_oc or r.fecha_oc.month not in sm):
            continue
        ordenes.append({
            "empresa": r.empresa, "id_colegio": r.id_colegio, "num_oc": r.num_oc,
            "fecha_oc": r.fecha_oc.isoformat() if r.fecha_oc else None,
            "centro_costo": r.centro_costo, "subtotal": float(r.subtotal or 0), "total": float(r.total or 0),
            "solicitante": r.solicitante, "grupo": r.grupo, "grupo_manual": bool(r.grupo_manual),
            "area_key": a_key, "area": ctx.area_label(a_key), "cc_key": c_key, "cc": ctx.cc_label(c_key),
        })
    return {"oc_disponible": True, "ordenes": ordenes}


# ── Configuración de mapeos ─────────────────────────────────────────────────────

@router.get("/mapeos")
def obtener_mapeos(
    db: Session = Depends(get_db),
    _user: User = Depends(verificar_permisos("usuarios", "ver")),
):
    schema = _oc_schema(db)
    ctx = _Contexto(db, schema)
    areas_oc: Dict[int, dict] = {}
    centros: Dict[str, dict] = {}

    if schema:
        try:
            for id_area, n, total in db.execute(text(
                f"SELECT id_area, COUNT(*), SUM(total) FROM `{schema}`.v_ordenes_area WHERE id_area IS NOT NULL GROUP BY id_area"
            )).all():
                id_area = int(id_area)
                if id_area in ctx.areas and id_area not in ctx.mapa_area:
                    continue  # existe en org_area y no fue reasignada: no requiere configuración
                areas_oc[id_area] = {"id_area_oc": id_area, "nombre_oc": ctx.nombre_grupo_oc.get(id_area),
                                     "n_oc": int(n), "total": float(total or 0)}
            for cc, n, total in db.execute(text(
                f"SELECT centro_costo, COUNT(*), SUM(total) FROM `{schema}`.v_ordenes_area "
                f"WHERE centro_costo IS NOT NULL AND centro_costo <> '' GROUP BY centro_costo"
            )).all():
                centros[cc.upper()] = {"centro_costo": cc.upper(), "n_oc": int(n), "total": float(total or 0)}
        except Exception as e:
            db.rollback()
            logger.exception("Error leyendo órdenes de compra para mapeos: %s", e)

    # Filas ya configuradas aunque hoy no tengan OC
    for id_oc in ctx.mapa_area:
        areas_oc.setdefault(id_oc, {"id_area_oc": id_oc, "nombre_oc": ctx.nombre_grupo_oc.get(id_oc), "n_oc": 0, "total": 0.0})
    for cc in ctx.mapa_cc:
        centros.setdefault(cc, {"centro_costo": cc, "n_oc": 0, "total": 0.0})

    for a in areas_oc.values():
        a["id_area"] = ctx.mapa_area.get(a["id_area_oc"])
        a["existe_en_sistema"] = a["id_area_oc"] in ctx.areas
    for c in centros.values():
        c["id_subvencion"] = ctx.mapa_cc.get(c["centro_costo"])

    return {
        "oc_disponible": bool(schema),
        "ultima_sync": _ultima_sync(db, schema) if schema else None,
        "areas_oc": sorted(areas_oc.values(), key=lambda a: a["id_area_oc"]),
        "centros": sorted(centros.values(), key=lambda c: -c["n_oc"]),
        "areas": [{"id_area": i, "nombre": n} for i, n in sorted(ctx.areas.items(), key=lambda x: x[1])],
        "subvenciones": [
            {"id_subvencion": s.id_subvencion, "nombre_corto": s.nombre_corto, "nombre_completo": s.nombre_completo, "estado": s.estado}
            for s in sorted(ctx.subv.values(), key=lambda s: s.id_subvencion)
        ],
    }


class MapeoAreaBody(BaseModel):
    id_area: Optional[int] = None
    nombre_oc: Optional[str] = None


class MapeoCCBody(BaseModel):
    id_subvencion: Optional[int] = None


@router.put("/mapeos/area/{id_area_oc}")
def guardar_mapeo_area(
    id_area_oc: int,
    body: MapeoAreaBody,
    db: Session = Depends(get_db),
    _user: User = Depends(verificar_permisos("usuarios", "editar")),
):
    if body.id_area is not None and not db.query(Area).filter(Area.id_area == body.id_area).first():
        raise HTTPException(status_code=404, detail="Área de destino no encontrada")
    obj = db.query(MapeoAreaOC).filter(MapeoAreaOC.id_area_oc == id_area_oc).first()
    if not obj:
        obj = MapeoAreaOC(id_area_oc=id_area_oc)
        db.add(obj)
    obj.id_area = body.id_area
    if body.nombre_oc:
        obj.nombre_oc = body.nombre_oc[:100]
    db.commit()
    return {"id_area_oc": id_area_oc, "id_area": obj.id_area}


@router.put("/mapeos/cc/{centro_costo}")
def guardar_mapeo_cc(
    centro_costo: str,
    body: MapeoCCBody,
    db: Session = Depends(get_db),
    _user: User = Depends(verificar_permisos("usuarios", "editar")),
):
    cc = centro_costo.strip().upper()
    if not cc or len(cc) > 20:
        raise HTTPException(status_code=400, detail="Centro de costo inválido")
    if body.id_subvencion is not None and not db.query(Subvencion).filter(Subvencion.id_subvencion == body.id_subvencion).first():
        raise HTTPException(status_code=404, detail="Subvención no encontrada")
    obj = db.query(MapeoCentroCostoSubvencion).filter(MapeoCentroCostoSubvencion.centro_costo == cc).first()
    if not obj:
        obj = MapeoCentroCostoSubvencion(centro_costo=cc)
        db.add(obj)
    obj.id_subvencion = body.id_subvencion
    db.commit()
    return {"centro_costo": cc, "id_subvencion": obj.id_subvencion}
