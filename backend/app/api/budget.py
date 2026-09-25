from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from datetime import datetime, date
import re
import unicodedata
from app.db.session import get_db
from app.models import User, SolicitudPresupuesto, PresupuestoDetalle, Subarea, Cargo, Area, Contabilidad, Recurso, CategoriaRecurso, PME, Accion, Actividad, CuentaDescripcion, CuentaMatrizReglas, RolContextoDefault, CategoriaCodigoContable, SubcategoriaRecurso, MapeoRecursoSubcategoria, Subvencion, GrupoRecurso, ActividadCodigoContable, PreConvocatoria, PresupuestoAnual, AreaColegioJefe, Colegio, UserColegio, SolicitudModificacionDetalle, ActaEntrega, ActaEntregaDetalle
from app.schemas.budget import (
    BudgetRequestCreate, BudgetRequestResponse,
    ContabilidadCreate, ContabilidadResponse,
    ResourceBase, ResourceCreate, ResourceResponse,
    CategoriaRecursoCreate, CategoriaRecursoResponse,
    RecursoCreateFull, ActividadBuscarResponse,
    BudgetDetailCreate, BudgetDetailUpdate, BudgetDetailResponse,
    AgregarRecursosRequest,
    ResolverCodigoRequest, ResolverCodigoResponse,
    SugerirRecursoRequest, AprobarRecursoRequest, SugerirCuentaRequest,
    CatCodigoCreate, CatCodigoResponse, ResolucionSubcategoriaResponse, SubvencionResponse, SubvencionCreate,
    MapeoRecursoSubcategoriaCreate, MapeoRecursoSubcategoriaResponse,
    GrupoRecursoCreate, GrupoRecursoResponse,
    ActividadCodigoContableUpsert, ActividadCodigoContableResponse, ActividadCodigosBatchUpsert,
    AsignarCodigoDetalleRequest,
    PresupuestoAnualCreate, PresupuestoAnualUpdate, PresupuestoAnualResponse,
    AsignarPresupuestoAnualRequest,
    ImportarSolicitudCreate, ImportarRecursosRequest, ImportarRecursosResponse,
    ImportarPresupuestoFilaOmitida,
    AnalizarPlanillaRequest, AnalizarPlanillaResponse, AnalisisFilaResultado, RecursoSugerido,
    ActaEntregaCreate, ActaEntregaUpdate, ActaEntregaResponse, ActaEntregaDetalleResponse
)
from app.api.deps import verificar_permisos, verificar_seccion
from app.core.secciones import usuario_puede_seccion
from sqlalchemy import func, or_, and_
from pydantic import BaseModel

router = APIRouter(prefix="/presupuesto", tags=["Presupuesto"])


ROLES_CON_ACCESO_TOTAL = ["ADM", "FIN", "DIR", "SOS", "GERENTE"]

# Roles que pueden crear/elegir el presupuesto anual de cualquier colegio (gestión central).
ROLES_GESTION_PPTO_MULTICOLEGIO = ["ADM", "SOS", "OPE"]


def _es_jefe_compras(user: User) -> bool:
    if not user:
        return False
    cargo_nombres = []
    if user.cargo and user.cargo.nombre:
        cargo_nombres.append(user.cargo.nombre.lower())
    if user.subarea and user.subarea.nombre:
        cargo_nombres.append(user.subarea.nombre.lower())
    if getattr(user, 'cargos', None):
        for c in user.cargos:
            if c.nombre:
                cargo_nombres.append(c.nombre.lower())
    if getattr(user, 'subareas', None):
        for s in user.subareas:
            if s.nombre:
                cargo_nombres.append(s.nombre.lower())
    return any("jefe de compras" in cn or "jefe compras" in cn for cn in cargo_nombres)


def _usuario_puede_gestionar_solicitud(db: Session, user: User, solicitud: SolicitudPresupuesto) -> bool:
    if not user:
        return False
    codigo_rol = user.rol.codigo if user.rol else None
    if codigo_rol in ["ADM", "SOS", "GERENTE", "FIN"]:
        return True
    if _es_jefe_compras(user):
        return True
    if usuario_puede_seccion(db, user, "presupuesto.solicitudes"):
        return True
    if solicitud.id_user == user.id_user:
        return True
    if codigo_rol == "DIR" and solicitud.id_colegio == user.id_colegio:
        return True
    return False


# Las etiquetas que usa el formulario ("Funcionarios", "Alumnos") no son el
# vocabulario con que pre_mapeo_recurso_subcategoria guarda el destino, así que hay
# que traducirlas para poder resolver el código contable de un recurso.
_DESTINO_CANONICO = {
    "alumnos": "clases(alumno)",
    "estudiantes": "clases(alumno)",
    "alumno": "clases(alumno)",
    "clases(alumno)": "clases(alumno)",
    "funcionarios": "oficinas(administracion)",
    "funcionario": "oficinas(administracion)",
    "oficinas(administracion)": "oficinas(administracion)",
    "premio / beneficio": "premio/beneficio",
    "premio/beneficio": "premio/beneficio",
    "premio": "premio/beneficio",
    "mantencion / servicio": "mantencion/servicio",
    "mantencion/servicio": "mantencion/servicio",
    "mantencion": "mantencion/servicio",
    "servicio": "mantencion/servicio",
}


def _normalizar_texto(valor: Optional[str]) -> str:
    """Minúsculas, sin tildes y con espacios colapsados. Para comparar valores que
    pueden venir de una celda de Excel escrita a mano."""
    limpio = unicodedata.normalize("NFKD", (valor or "").strip().lower())
    limpio = "".join(c for c in limpio if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", limpio)


def _destino_canonico(valor: Optional[str]) -> Optional[str]:
    return _DESTINO_CANONICO.get(_normalizar_texto(valor))


# ── Presupuesto asignado (global por colegio) ────────────────────────────────
# Se guarda en una fila de Contabilidad con un código reservado, para no requerir
# cambios de esquema. Solo el rol "Sostenedor" (SOS) puede editarlo.
class PresupuestoAsignadoPayload(BaseModel):
    monto: float


def _codigo_ppto_global(id_colegio: int) -> str:
    return f"PPTO_GLOBAL_{id_colegio}"


def _codigo_ppto_area(id_colegio: int, id_area: int) -> str:
    return f"PPTO_AREA_{id_colegio}_{id_area}"


def _total_global(db: Session, id_colegio: int) -> float:
    cont = db.query(Contabilidad).filter(
        Contabilidad.id_colegio == id_colegio,
        Contabilidad.codigo == _codigo_ppto_global(id_colegio)
    ).first()
    return float(cont.presupuesto_asignado) if cont else 0.0


def _suma_areas(db: Session, id_colegio: int, excluir_area: int = None) -> float:
    """Suma de presupuestos asignados a las áreas (opcionalmente excluyendo una)."""
    prefijo = f"PPTO_AREA_{id_colegio}_"
    filas = db.query(Contabilidad).filter(
        Contabilidad.id_colegio == id_colegio,
        Contabilidad.codigo.like(prefijo + "%")
    ).all()
    total = 0.0
    for c in filas:
        if excluir_area is not None and c.codigo == _codigo_ppto_area(id_colegio, excluir_area):
            continue
        total += float(c.presupuesto_asignado or 0)
    return total


class PresupuestoAreaPayload(BaseModel):
    monto: float


@router.get("/presupuesto-area/{id_area}")
def get_presupuesto_area(
    id_area: int,
    id_colegio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    target_colegio = current_user.id_colegio
    if id_colegio and current_user.rol and current_user.rol.codigo in ROLES_CON_ACCESO_TOTAL:
        target_colegio = id_colegio

    cont = db.query(Contabilidad).filter(
        Contabilidad.id_colegio == target_colegio,
        Contabilidad.codigo == _codigo_ppto_area(target_colegio, id_area)
    ).first()
    asignado_area = float(cont.presupuesto_asignado) if cont else 0.0
    total_global = _total_global(db, target_colegio)
    asignado_otras = _suma_areas(db, target_colegio, excluir_area=id_area)
    return {
        "presupuesto_asignado": asignado_area,
        "total_global": total_global,
        "asignado_otras_areas": asignado_otras,
        "disponible_para_asignar": max(total_global - asignado_otras, 0),
    }


@router.put("/presupuesto-area/{id_area}")
def set_presupuesto_area(
    id_area: int,
    payload: PresupuestoAreaPayload,
    id_colegio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    if not current_user.rol or current_user.rol.codigo != "SOS":
        raise HTTPException(status_code=403, detail="Solo el Sostenedor puede asignar el presupuesto por área.")

    target_colegio = current_user.id_colegio
    if id_colegio:
        target_colegio = id_colegio

    total_global = _total_global(db, target_colegio)
    asignado_otras = _suma_areas(db, target_colegio, excluir_area=id_area)
    if total_global <= 0:
        raise HTTPException(status_code=400, detail="Primero define el Presupuesto Total del colegio (en Solicitudes).")
    if payload.monto < 0:
        raise HTTPException(status_code=400, detail="El monto no puede ser negativo.")
    if asignado_otras + payload.monto > total_global:
        disponible = max(total_global - asignado_otras, 0)
        raise HTTPException(status_code=400, detail=f"El monto excede el presupuesto total disponible. Disponible para esta área: {disponible:,.0f}".replace(",", "."))

    codigo = _codigo_ppto_area(target_colegio, id_area)
    cont = db.query(Contabilidad).filter(
        Contabilidad.id_colegio == target_colegio,
        Contabilidad.codigo == codigo
    ).first()

    from app.models import Area
    area_obj = db.query(Area).filter(Area.id_area == id_area).first()
    nombre_area_texto = area_obj.nombre if area_obj else f"Área {id_area}"

    if not cont:
        cont = Contabilidad(
            id_colegio=target_colegio,
            codigo=codigo,
            centro_costo=f"Presupuesto {nombre_area_texto}",
            presupuesto_asignado=payload.monto,
        )
        db.add(cont)
    else:
        cont.centro_costo = f"Presupuesto {nombre_area_texto}"
        cont.presupuesto_asignado = payload.monto
    db.commit()
    return {
        "presupuesto_asignado": payload.monto,
        "total_global": total_global,
        "asignado_otras_areas": asignado_otras,
        "disponible_para_asignar": max(total_global - asignado_otras, 0),
    }


@router.get("/presupuesto-asignado")
def get_presupuesto_asignado(
    id_colegio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    target_colegio = current_user.id_colegio
    if id_colegio and current_user.rol and current_user.rol.codigo in ROLES_CON_ACCESO_TOTAL:
        target_colegio = id_colegio

    cont = db.query(Contabilidad).filter(
        Contabilidad.id_colegio == target_colegio,
        Contabilidad.codigo == _codigo_ppto_global(target_colegio)
    ).first()
    return {"presupuesto_asignado": cont.presupuesto_asignado if cont else 0}


@router.put("/presupuesto-asignado")
def set_presupuesto_asignado(
    payload: PresupuestoAsignadoPayload,
    id_colegio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    if not current_user.rol or current_user.rol.codigo != "SOS":
        raise HTTPException(status_code=403, detail="Solo el Sostenedor puede editar el presupuesto asignado.")
    
    target_colegio = current_user.id_colegio
    if id_colegio:
        target_colegio = id_colegio

    codigo = _codigo_ppto_global(target_colegio)
    cont = db.query(Contabilidad).filter(
        Contabilidad.id_colegio == target_colegio,
        Contabilidad.codigo == codigo
    ).first()
    if not cont:
        cont = Contabilidad(
            id_colegio=target_colegio,
            codigo=codigo,
            centro_costo="Presupuesto Global",
            presupuesto_asignado=payload.monto,
        )
        db.add(cont)
    else:
        cont.presupuesto_asignado = payload.monto
    db.commit()
    return {"presupuesto_asignado": cont.presupuesto_asignado}


def sync_recurso_actividad(db: Session, id_actividad: int, nombre_producto: str):
    """Sincroniza el nombre del producto con la lista de recursos de la actividad PME."""
    if not id_actividad:
        return
    
    actividad = db.query(Actividad).filter(Actividad.id_actividad == id_actividad).first()
    if not actividad:
        return
        
    # Limpiar y normalizar el nombre
    nombre_limpio = nombre_producto.strip()
    if not nombre_limpio:
        return
        
    actual = actividad.lista_recursos or ""
    # Convertir a lista para buscar (separado por comas)
    items = [i.strip().lower() for i in actual.split(',') if i.strip()]
    
    # Si no existe, agregar
    if nombre_limpio.lower() not in items:
        if actual and not actual.endswith(','):
            actividad.lista_recursos = f"{actual}, {nombre_limpio}"
        elif actual:
            actividad.lista_recursos = f"{actual} {nombre_limpio}"
        else:
            actividad.lista_recursos = nombre_limpio
        
        db.add(actividad)
        # El commit se hace en el endpoint principal


def build_detalle_response(detalle: PresupuestoDetalle, db: Optional[Session] = None) -> dict:
    recurso_nombre = None
    recurso_estado = "ACTIVO"
    categoria_nombre = None
    id_grupo_recurso = None
    grupo_nombre = None

    if not detalle.recurso and detalle.id_recurso and db is not None:
        from app.models import Recurso
        from sqlalchemy.orm import joinedload
        r_obj = db.query(Recurso).options(joinedload(Recurso.grupo), joinedload(Recurso.categoria)).filter(Recurso.id_recurso == detalle.id_recurso).first()
        if r_obj:
            detalle.recurso = r_obj

    if detalle.recurso:
        recurso_nombre = detalle.recurso.nombre
        recurso_estado = detalle.recurso.estado or "ACTIVO"
        if detalle.recurso.categoria:
            categoria_nombre = detalle.recurso.categoria.nombre
        if detalle.recurso.grupo:
            id_grupo_recurso = detalle.recurso.grupo.id_grupo_recurso
            grupo_nombre = detalle.recurso.grupo.nombre
        elif detalle.recurso.id_grupo_recurso:
            id_grupo_recurso = detalle.recurso.id_grupo_recurso
            if db is not None:
                from app.models import GrupoRecurso
                g_obj = db.query(GrupoRecurso).filter(GrupoRecurso.id_grupo_recurso == id_grupo_recurso).first()
                if g_obj:
                    grupo_nombre = g_obj.nombre
    # Fallback: categoría asignada directamente al detalle (p.ej. sugerida por IA al importar)
    if not categoria_nombre and detalle.categoria_directa:
        categoria_nombre = detalle.categoria_directa.nombre
    
    actividad_nombre = None
    actividad_dimension = None
    if detalle.id_actividad and detalle.actividad:
        actividad_nombre = detalle.actividad.nombre_actividad
        actividad_dimension = detalle.actividad.dimension

    # Código contable y subvención efectivos.
    # 1. Código guardado directamente en el detalle
    codigo_cuenta = detalle.codigo_cuenta
    id_subvencion = detalle.id_subvencion

    # 2. Fallback: resolver dinámicamente desde los mapeos del recurso (según destino_gasto e id_subvencion)
    if not codigo_cuenta and detalle.id_recurso and detalle.destino_gasto and db is not None:
        from app.models import MapeoRecursoSubcategoria
        mapeo = db.query(MapeoRecursoSubcategoria).filter(
            MapeoRecursoSubcategoria.id_recurso == detalle.id_recurso,
            MapeoRecursoSubcategoria.destino_gasto == detalle.destino_gasto,
            MapeoRecursoSubcategoria.id_subvencion == detalle.id_subvencion
        ).first()
        if not mapeo and detalle.id_subvencion is not None:
            mapeo = db.query(MapeoRecursoSubcategoria).filter(
                MapeoRecursoSubcategoria.id_recurso == detalle.id_recurso,
                MapeoRecursoSubcategoria.destino_gasto == detalle.destino_gasto,
                MapeoRecursoSubcategoria.id_subvencion.is_(None)
            ).first()
        if mapeo and mapeo.subcategoria:
            codigo_cuenta = mapeo.subcategoria.codigo_cuenta

    # 3. Fallback: si aún no tiene código propio, heredar de la actividad PME
    if not codigo_cuenta and detalle.actividad and detalle.actividad.codigo_contable:
        acc = detalle.actividad.codigo_contable
        codigo_cuenta = acc.codigo_cuenta
        if not id_subvencion:
            id_subvencion = acc.id_subvencion

    subvencion_nombre = "GENERAL"
    if detalle.subvencion:
        subvencion_nombre = detalle.subvencion.nombre_corto
    elif detalle.actividad and detalle.actividad.codigo_contable and detalle.actividad.codigo_contable.subvencion:
        subvencion_nombre = detalle.actividad.codigo_contable.subvencion.nombre_corto

    return {
        "id_pre_detalle": detalle.id_pre_detalle,
        "id_presupuesto": detalle.id_presupuesto,
        "nombre_producto": detalle.nombre_producto,
        "descripcion": detalle.descripcion,
        "id_recurso": detalle.id_recurso,
        "recurso_nombre": recurso_nombre,
        "recurso_estado": recurso_estado,
        "categoria_nombre": categoria_nombre,
        "id_grupo_recurso": id_grupo_recurso,
        "grupo_nombre": grupo_nombre,
        "codigo_cuenta": codigo_cuenta,
        "formato_unidad": detalle.formato_unidad,
        "cantidad": float(detalle.cantidad) if detalle.cantidad else 0,
        "cantidad_real": float(detalle.cantidad_real) if detalle.cantidad_real is not None else None,
        "valor_unitario": float(detalle.valor_unitario) if detalle.valor_unitario else 0,
        "valor_unitario_iva": float(detalle.valor_unitario_iva) if detalle.valor_unitario_iva else 0,
        "valor_real_iva": float(detalle.valor_real_iva) if detalle.valor_real_iva is not None else None,
        "total_iva": float(detalle.total_iva) if detalle.total_iva else 0,
        "fecha_ejecucion": detalle.fecha_ejecucion,
        "fecha_termino": detalle.fecha_termino,
        "tipo_fecha": detalle.tipo_fecha,
        "motivo": detalle.motivo,
        "observacion": detalle.observacion,
        "centro_costos": detalle.centro_costos,
        "estado_aprobacion": detalle.estado_aprobacion,
        "estado_compra": detalle.estado_compra or ("Comprado" if detalle.valor_real_iva is not None else "Pendiente"),
        "comentario_revision": detalle.comentario_revision,
        "id_actividad": detalle.id_actividad,
        "actividad_nombre": actividad_nombre,
        "actividad_dimension": actividad_dimension,
        "dimension": actividad_dimension,
        "id_subvencion": id_subvencion,
        "subvencion_nombre": subvencion_nombre,
        "destino_gasto": detalle.destino_gasto,
        "id_cargo": detalle.id_cargo,
        "id_subarea": detalle.id_cargo,
        "cargo_nombre": detalle.cargo_detalle.nombre if detalle.cargo_detalle else (detalle.subarea_detalle.nombre if detalle.subarea_detalle else None),
        "subarea_nombre": detalle.cargo_detalle.nombre if detalle.cargo_detalle else (detalle.subarea_detalle.nombre if detalle.subarea_detalle else None)
    }


def get_solicitudes_eager_options():
    from sqlalchemy.orm import selectinload, joinedload
    return [
        joinedload(SolicitudPresupuesto.colegio),
        joinedload(SolicitudPresupuesto.presupuesto_anual),
        joinedload(SolicitudPresupuesto.user),
        joinedload(SolicitudPresupuesto.cargo).joinedload(Cargo.area),
        selectinload(SolicitudPresupuesto.detalles).options(
            joinedload(PresupuestoDetalle.subvencion),
            joinedload(PresupuestoDetalle.cargo_detalle),
            joinedload(PresupuestoDetalle.categoria_directa),
            joinedload(PresupuestoDetalle.recurso).joinedload(Recurso.categoria),
            joinedload(PresupuestoDetalle.recurso).joinedload(Recurso.grupo),
            joinedload(PresupuestoDetalle.actividad).selectinload(Actividad.codigos_contables).joinedload(ActividadCodigoContable.subvencion)
        )
    ]


def build_solicitudes_batch_response(solicitudes: List[SolicitudPresupuesto], db: Session) -> List[dict]:
    if not solicitudes:
        return []

    # 1. Pre-cargar jefes de área en un solo query agrupados por (id_area, id_colegio)
    from sqlalchemy.orm import joinedload
    area_ids = {s.cargo.id_area for s in solicitudes if s.cargo and s.cargo.id_area}
    jefes_map = {}
    if area_ids:
        assocs = db.query(AreaColegioJefe).options(joinedload(AreaColegioJefe.jefe)).filter(
            AreaColegioJefe.id_area.in_(area_ids)
        ).all()
        for a in assocs:
            if a.jefe:
                jefes_map.setdefault((a.id_area, a.id_colegio), []).append(a.jefe.nombre)

    # 2. Pre-cargar mapeos de cuentas contables solo para recursos que no tengan codigo_cuenta guardado
    recurso_ids = {d.id_recurso for s in solicitudes for d in (s.detalles or []) if not d.codigo_cuenta and d.id_recurso and d.destino_gasto}
    mapeos_map = {}
    if recurso_ids:
        mapeos = db.query(MapeoRecursoSubcategoria).options(joinedload(MapeoRecursoSubcategoria.subcategoria)).filter(
            MapeoRecursoSubcategoria.id_recurso.in_(recurso_ids)
        ).all()
        for m in mapeos:
            if m.subcategoria:
                mapeos_map[(m.id_recurso, m.destino_gasto, m.id_subvencion)] = m.subcategoria.codigo_cuenta

    # 3. Pre-cargar grupos de recursos, recursos faltantes y actividades faltantes
    from app.models import GrupoRecurso, Recurso, Actividad
    grupos_db = db.query(GrupoRecurso).all()
    grupos_map = {g.id_grupo_recurso: g.nombre for g in grupos_db}

    recursos_faltantes_ids = {
        d.id_recurso for s in solicitudes for d in (s.detalles or [])
        if d.id_recurso and not d.recurso
    }
    recursos_faltantes_map = {}
    if recursos_faltantes_ids:
        r_objs = db.query(Recurso).options(joinedload(Recurso.grupo), joinedload(Recurso.categoria)).filter(
            Recurso.id_recurso.in_(recursos_faltantes_ids)
        ).all()
        for r in r_objs:
            recursos_faltantes_map[r.id_recurso] = r

    actividades_faltantes_ids = {
        d.id_actividad for s in solicitudes for d in (s.detalles or [])
        if d.id_actividad and not d.actividad
    }
    actividades_faltantes_map = {}
    if actividades_faltantes_ids:
        act_objs = db.query(Actividad).options(joinedload(Actividad.accion)).filter(
            Actividad.id_actividad.in_(actividades_faltantes_ids)
        ).all()
        for a in act_objs:
            actividades_faltantes_map[a.id_actividad] = a

    def _build_detalle(detalle: PresupuestoDetalle) -> dict:
        recurso_nombre = None
        recurso_estado = "ACTIVO"
        categoria_nombre = None
        id_grupo_recurso = None
        grupo_nombre = None

        rec = detalle.recurso or (recursos_faltantes_map.get(detalle.id_recurso) if detalle.id_recurso else None)
        if rec:
            recurso_nombre = rec.nombre
            recurso_estado = rec.estado or "ACTIVO"
            if rec.categoria:
                categoria_nombre = rec.categoria.nombre
            if rec.grupo:
                id_grupo_recurso = rec.grupo.id_grupo_recurso
                grupo_nombre = rec.grupo.nombre
            elif rec.id_grupo_recurso:
                id_grupo_recurso = rec.id_grupo_recurso
                grupo_nombre = grupos_map.get(id_grupo_recurso)

        if not categoria_nombre and detalle.categoria_directa:
            categoria_nombre = detalle.categoria_directa.nombre

        act_obj = detalle.actividad or (actividades_faltantes_map.get(detalle.id_actividad) if detalle.id_actividad else None)
        actividad_nombre = act_obj.nombre_actividad if act_obj else None
        actividad_dimension = act_obj.dimension if act_obj else None
        accion_nombre = (act_obj.accion.nombre_accion if act_obj.accion else None) if act_obj else None

        codigo_cuenta = detalle.codigo_cuenta
        id_subvencion = detalle.id_subvencion

        if not codigo_cuenta and detalle.id_recurso and detalle.destino_gasto:
            codigo_cuenta = mapeos_map.get((detalle.id_recurso, detalle.destino_gasto, detalle.id_subvencion))
            if not codigo_cuenta and detalle.id_subvencion is not None:
                codigo_cuenta = mapeos_map.get((detalle.id_recurso, detalle.destino_gasto, None))

        if not codigo_cuenta and act_obj and act_obj.codigo_contable:
            acc = act_obj.codigo_contable
            codigo_cuenta = acc.codigo_cuenta
            if not id_subvencion:
                id_subvencion = acc.id_subvencion

        subvencion_nombre = "GENERAL"
        if detalle.subvencion:
            subvencion_nombre = detalle.subvencion.nombre_corto
        elif act_obj and act_obj.codigo_contable and act_obj.codigo_contable.subvencion:
            subvencion_nombre = act_obj.codigo_contable.subvencion.nombre_corto

        cargo_nombre = detalle.cargo_detalle.nombre if detalle.cargo_detalle else None

        return {
            "id_pre_detalle": detalle.id_pre_detalle,
            "id_presupuesto": detalle.id_presupuesto,
            "nombre_producto": detalle.nombre_producto,
            "descripcion": detalle.descripcion,
            "id_recurso": detalle.id_recurso,
            "recurso_nombre": recurso_nombre,
            "recurso_estado": recurso_estado,
            "categoria_nombre": categoria_nombre,
            "id_grupo_recurso": id_grupo_recurso,
            "grupo_nombre": grupo_nombre,
            "codigo_cuenta": codigo_cuenta,
            "formato_unidad": detalle.formato_unidad,
            "cantidad": float(detalle.cantidad) if detalle.cantidad else 0,
            "cantidad_real": float(detalle.cantidad_real) if detalle.cantidad_real is not None else None,
            "valor_unitario": float(detalle.valor_unitario) if detalle.valor_unitario else 0,
            "valor_unitario_iva": float(detalle.valor_unitario_iva) if detalle.valor_unitario_iva else 0,
            "valor_real_iva": float(detalle.valor_real_iva) if detalle.valor_real_iva is not None else None,
            "total_iva": float(detalle.total_iva) if detalle.total_iva else 0,
            "fecha_ejecucion": detalle.fecha_ejecucion,
            "fecha_termino": detalle.fecha_termino,
            "tipo_fecha": detalle.tipo_fecha,
            "motivo": detalle.motivo,
            "observacion": detalle.observacion,
            "centro_costos": detalle.centro_costos,
            "estado_aprobacion": detalle.estado_aprobacion,
            "estado_compra": detalle.estado_compra or ("Comprado" if detalle.valor_real_iva is not None else "Pendiente"),
            "comentario_revision": detalle.comentario_revision,
            "id_actividad": detalle.id_actividad,
            "actividad_nombre": actividad_nombre,
            "actividad_dimension": actividad_dimension,
            "dimension": actividad_dimension,
            "accion_nombre": accion_nombre,
            "id_subvencion": id_subvencion,
            "subvencion_nombre": subvencion_nombre,
            "destino_gasto": detalle.destino_gasto,
            "id_cargo": detalle.id_cargo,
            "id_subarea": detalle.id_cargo,
            "cargo_nombre": cargo_nombre,
            "subarea_nombre": cargo_nombre
        }

    def _build_solicitud(solicitud: SolicitudPresupuesto) -> dict:
        detalles_objs = solicitud.detalles or []
        total = sum(float(d.total_iva or 0) for d in detalles_objs)

        area_nombre = None
        subarea_nombre = None
        id_area = None
        if solicitud.cargo:
            subarea_nombre = solicitud.cargo.nombre
            id_area = solicitud.cargo.id_area
            if solicitud.cargo.area:
                area_nombre = solicitud.cargo.area.nombre

        user_nombre = solicitud.user.nombre if solicitud.user else None

        presupuesto_anual_nombre = None
        presupuesto_anual_year = None
        if solicitud.presupuesto_anual:
            presupuesto_anual_nombre = solicitud.presupuesto_anual.nombre
            presupuesto_anual_year = solicitud.presupuesto_anual.year

        area_jefe_nombre = None
        if id_area:
            nombres = jefes_map.get((id_area, solicitud.id_colegio))
            if nombres:
                area_jefe_nombre = ", ".join(nombres)

        return {
            "id_presupuesto": solicitud.id_presupuesto,
            "codigo": solicitud.codigo,
            "id_user": solicitud.id_user,
            "id_cargo": solicitud.id_cargo,
            "id_subarea": solicitud.id_cargo,
            "id_colegio": solicitud.id_colegio,
            "id_presupuesto_anual": solicitud.id_presupuesto_anual,
            "presupuesto_anual_nombre": presupuesto_anual_nombre,
            "presupuesto_anual_year": presupuesto_anual_year,
            "fecha": solicitud.fecha,
            "comentario": solicitud.comentario,
            "monto_total": float(total),
            "estado": solicitud.estado,
            "activo": bool(solicitud.activo) if solicitud.activo is not None else True,
            "id_area": id_area,
            "area_nombre": area_nombre,
            "area_jefe_nombre": area_jefe_nombre,
            "cargo_nombre": subarea_nombre,
            "subarea_nombre": subarea_nombre,
            "user_nombre": user_nombre,
            "colegio_nombre": solicitud.colegio.nombre if solicitud.colegio else None,
            "detalles": [_build_detalle(d) for d in detalles_objs]
        }

    return [_build_solicitud(s) for s in solicitudes]


def build_solicitud_response(solicitud: SolicitudPresupuesto, db: Session) -> dict:
    res = build_solicitudes_batch_response([solicitud], db)
    return res[0] if res else {}


@router.get("/solicitudes", response_model=List[BudgetRequestResponse])
def list_solicitudes(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    _sec: User = Depends(verificar_seccion("presupuesto.solicitudes")),
    id_colegio: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    id_presupuesto_anual: Optional[int] = Query(None)
):
    query = db.query(SolicitudPresupuesto).options(*get_solicitudes_eager_options())
    
    if id_colegio:
        query = query.filter(SolicitudPresupuesto.id_colegio == id_colegio)
    elif current_user.rol and current_user.rol.codigo not in ["ADM", "SOS", "GERENTE"]:
        query = query.filter(SolicitudPresupuesto.id_colegio == current_user.id_colegio)
    
    if id_presupuesto_anual:
        query = query.filter(SolicitudPresupuesto.id_presupuesto_anual == id_presupuesto_anual)
    elif year:
        query = query.outerjoin(PresupuestoAnual, SolicitudPresupuesto.id_presupuesto_anual == PresupuestoAnual.id_presupuesto_anual).filter(
            or_(
                PresupuestoAnual.year == year,
                and_(
                    SolicitudPresupuesto.id_presupuesto_anual == None,
                    func.extract('year', SolicitudPresupuesto.fecha) == year
                )
            )
        )
    
    solicitudes = query.order_by(SolicitudPresupuesto.fecha.desc()).all()
    return build_solicitudes_batch_response(solicitudes, db)


@router.get("/solicitudes/mis", response_model=List[BudgetRequestResponse])
def mis_solicitudes(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    solicitudes = db.query(SolicitudPresupuesto).options(
        *get_solicitudes_eager_options()
    ).filter(
        SolicitudPresupuesto.id_user == current_user.id_user
    ).order_by(SolicitudPresupuesto.fecha.desc()).all()
    
    return build_solicitudes_batch_response(solicitudes, db)


@router.get("/compras/historial", response_model=List[BudgetRequestResponse])
def historial_compras(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    id_colegio: Optional[int] = Query(None, description="Filtrar por colegio"),
    id_presupuesto_anual: Optional[int] = Query(None, description="Filtrar por presupuesto anual (id)"),
    year: Optional[int] = Query(None, description="Año del presupuesto anual enlazado"),
    incluir_pendientes: Optional[bool] = Query(False, description="Incluir solicitudes sin aprobar V°B°")
):
    """Historial de compras: solicitudes de todos los colegios y años."""
    query = db.query(SolicitudPresupuesto).options(*get_solicitudes_eager_options())
    if not incluir_pendientes:
        query = query.filter(SolicitudPresupuesto.estado.in_(["Aprobado", "Aceptado"]))

    if id_colegio:
        query = query.filter(SolicitudPresupuesto.id_colegio == id_colegio)
    if id_presupuesto_anual:
        query = query.filter(SolicitudPresupuesto.id_presupuesto_anual == id_presupuesto_anual)
    elif year:
        from sqlalchemy import extract, or_
        query = query.outerjoin(
            PresupuestoAnual,
            SolicitudPresupuesto.id_presupuesto_anual == PresupuestoAnual.id_presupuesto_anual
        ).filter(
            or_(
                PresupuestoAnual.year == year,
                extract('year', SolicitudPresupuesto.fecha) == year
            )
        )

    solicitudes = query.order_by(SolicitudPresupuesto.fecha.desc()).all()
    return build_solicitudes_batch_response(solicitudes, db)


# ── Actas de Entrega Oficiales (Seguimiento, Correlativo y PDF) ───────────────

def obtener_iniciales_usuario(user: Optional[User]) -> str:
    if not user or not user.nombre:
        return "ACT"
    partes = [p.strip() for p in user.nombre.strip().split() if p.strip()]
    if not partes:
        return "ACT"
    if len(partes) == 1:
        return partes[0][:2].upper()
    return f"{partes[0][0]}{partes[-1][0]}".upper()


@router.get("/compras/actas/siguiente-correlativo")
def get_siguiente_correlativo_acta(
    id_colegio: int = Query(...),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
):
    """Calcula el siguiente número correlativo secuencial y código oficial para el colegio usando las iniciales del usuario emisor."""
    anho = year or datetime.now().year
    
    # Buscar el mayor correlativo para este colegio y año
    max_num = db.query(func.max(ActaEntrega.numero_correlativo)).filter(
        ActaEntrega.id_colegio == id_colegio,
        func.extract("year", ActaEntrega.fecha) == anho
    ).scalar() or 0

    siguiente_numero = max_num + 1
    iniciales = obtener_iniciales_usuario(current_user)
    codigo_formateado = f"{iniciales} - N°{siguiente_numero:03d}/{anho}"

    return {
        "numero_correlativo": siguiente_numero,
        "codigo_acta": codigo_formateado,
        "iniciales": iniciales,
        "year": anho,
        "id_colegio": id_colegio
    }


@router.post("/compras/actas", response_model=ActaEntregaResponse)
def crear_acta_entrega(
    payload: ActaEntregaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear")),
):
    """Crea y registra formalmente un Acta de Entrega con su correlativo y actualiza el estado de los recursos."""
    from app.services.actas_pdf import generar_pdf_acta_entrega

    colegio = db.query(Colegio).filter(Colegio.id_colegio == payload.id_colegio).first()
    if not colegio:
        raise HTTPException(status_code=404, detail="Colegio no encontrado")

    anho = (payload.fecha or date.today()).year
    iniciales = obtener_iniciales_usuario(current_user)
    
    # Protección de concurrencia: consultar el máximo correlativo actual en la BD
    max_num = db.query(func.max(ActaEntrega.numero_correlativo)).filter(
        ActaEntrega.id_colegio == payload.id_colegio,
        func.extract("year", ActaEntrega.fecha) == anho
    ).scalar() or 0

    num_corr = payload.numero_correlativo
    # Si no se especificó o si ya fue tomado por otro usuario que guardó milisegundos antes:
    if not num_corr or num_corr <= 0 or num_corr <= max_num:
        num_corr = max_num + 1
        cod_acta = f"{iniciales} - N°{num_corr:03d}/{anho}"
    else:
        cod_acta = payload.codigo_acta or f"{iniciales} - N°{num_corr:03d}/{anho}"

    nueva_acta = ActaEntrega(
        id_colegio=payload.id_colegio,
        id_presupuesto=payload.id_presupuesto,
        numero_correlativo=num_corr,
        codigo_acta=cod_acta,
        fecha=payload.fecha or date.today(),
        ciudad=payload.ciudad or "ALTO HOSPICIO",
        para_nombre=payload.para_nombre.strip(),
        para_cargo=payload.para_cargo.strip() if payload.para_cargo else None,
        de_emisor=payload.de_emisor.strip() if payload.de_emisor else "GERENCIA DE OPERACIONES",
        asunto=payload.asunto.strip(),
        numero_factura=payload.numero_factura.strip() if payload.numero_factura else None,
        observacion=payload.observacion.strip() if payload.observacion else None,
        id_usuario_emisor=current_user.id_user,
        created_at=datetime.utcnow(),
    )
    db.add(nueva_acta)
    db.flush()

    # Agregar detalles y actualizar estado de compras en los recursos
    estado_objetivo = payload.actualizar_estado_items or "Comprado"
    for it in payload.items:
        det_acta = ActaEntregaDetalle(
            id_acta=nueva_acta.id_acta,
            id_pre_detalle=it.id_pre_detalle,
            nombre_producto=it.nombre_producto,
            descripcion=it.descripcion,
            cantidad=it.cantidad,
            formato_unidad=it.formato_unidad or "UNIDAD",
            solicitud_codigo=it.solicitud_codigo,
            cargo_area=it.cargo_area,
        )
        db.add(det_acta)

        if it.id_pre_detalle:
            p_det = db.query(PresupuestoDetalle).filter(PresupuestoDetalle.id_pre_detalle == it.id_pre_detalle).first()
            if p_det:
                p_det.estado_compra = estado_objetivo
                if it.cantidad is not None and not p_det.cantidad_real:
                    p_det.cantidad_real = it.cantidad

    db.commit()
    db.refresh(nueva_acta)

    res = ActaEntregaResponse.from_orm(nueva_acta)
    res.colegio_nombre = colegio.nombre
    return res


@router.put("/compras/actas/{id_acta}", response_model=ActaEntregaResponse)
def actualizar_acta_entrega(
    id_acta: int,
    payload: ActaEntregaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "editar")),
):
    """Actualiza los metadatos y campos de encabezado de un Acta de Entrega ya registrada."""
    acta = db.query(ActaEntrega).options(
        selectinload(ActaEntrega.detalles),
        selectinload(ActaEntrega.colegio)
    ).filter(ActaEntrega.id_acta == id_acta).first()

    if not acta:
        raise HTTPException(status_code=404, detail="Acta de entrega no encontrada")

    if payload.codigo_acta is not None:
        acta.codigo_acta = payload.codigo_acta.strip()
    if payload.fecha is not None:
        acta.fecha = payload.fecha
    if payload.ciudad is not None:
        acta.ciudad = payload.ciudad.strip()
    if payload.para_nombre is not None:
        acta.para_nombre = payload.para_nombre.strip()
    if payload.para_cargo is not None:
        acta.para_cargo = payload.para_cargo.strip() if payload.para_cargo else None
    if payload.de_emisor is not None:
        acta.de_emisor = payload.de_emisor.strip() if payload.de_emisor else "GERENCIA DE OPERACIONES"
    if payload.asunto is not None:
        acta.asunto = payload.asunto.strip()
    if payload.numero_factura is not None:
        acta.numero_factura = payload.numero_factura.strip() if payload.numero_factura else None
    if payload.observacion is not None:
        acta.observacion = payload.observacion.strip() if payload.observacion else None

    db.commit()
    db.refresh(acta)

    res = ActaEntregaResponse.from_orm(acta)
    if acta.colegio:
        res.colegio_nombre = acta.colegio.nombre
    return res


@router.get("/compras/actas/{id_acta}/pdf")
def descargar_pdf_acta_id(
    id_acta: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
):
    """Genera y descarga el PDF oficial para un acta registrada por su ID."""
    from app.services.actas_pdf import generar_pdf_acta_entrega

    acta = db.query(ActaEntrega).options(
        selectinload(ActaEntrega.detalles),
        selectinload(ActaEntrega.colegio)
    ).filter(ActaEntrega.id_acta == id_acta).first()
    
    if not acta:
        raise HTTPException(status_code=404, detail="Acta de entrega no encontrada")

    acta_dict = {
        "colegio_nombre": acta.colegio.nombre if acta.colegio else "Colegio Macaya",
        "ciudad": acta.ciudad or "Alto Hospicio",
        "codigo_acta": acta.codigo_acta,
        "fecha": str(acta.fecha),
        "para_nombre": acta.para_nombre,
        "para_cargo": acta.para_cargo or "",
        "de_emisor": acta.de_emisor,
        "asunto": acta.asunto,
        "numero_factura": acta.numero_factura or "—",
        "observacion": acta.observacion or "",
        "items": [
            {
                "cantidad": float(d.cantidad),
                "formato_unidad": d.formato_unidad or "UNIDAD",
                "nombre_producto": d.nombre_producto,
                "descripcion": d.descripcion or "",
            }
            for d in acta.detalles
        ]
    }

    pdf_bytes = generar_pdf_acta_entrega([acta_dict])
    filename = f"Acta_{acta.codigo_acta.replace(' ', '_').replace('/', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class ActaDirectPdfPayload(BaseModel):
    colegio_nombre: Optional[str] = "Colegio Macaya"
    ciudad: Optional[str] = "ALTO HOSPICIO"
    codigo_acta: Optional[str] = "CS - N°051/2026"
    fecha: Optional[str] = None
    para_nombre: str
    para_cargo: Optional[str] = None
    de_emisor: Optional[str] = "GERENCIA DE OPERACIONES"
    asunto: str
    numero_factura: Optional[str] = None
    observacion: Optional[str] = None
    items: List[dict] = []


@router.get("/compras/actas", response_model=List[ActaEntregaResponse])
def listar_actas_entrega(
    id_colegio: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
):
    """Lista todas las Actas de Entrega registradas con sus detalles."""
    query = db.query(ActaEntrega).options(
        selectinload(ActaEntrega.detalles),
        selectinload(ActaEntrega.colegio)
    )

    if id_colegio:
        query = query.filter(ActaEntrega.id_colegio == id_colegio)
    elif current_user.id_colegio and current_user.rol and current_user.rol.codigo not in ROLES_GESTION_PPTO_MULTICOLEGIO:
        query = query.filter(ActaEntrega.id_colegio == current_user.id_colegio)

    if year:
        query = query.filter(func.extract("year", ActaEntrega.fecha) == year)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ActaEntrega.codigo_acta.ilike(term),
                ActaEntrega.para_nombre.ilike(term),
                ActaEntrega.asunto.ilike(term),
                ActaEntrega.numero_factura.ilike(term),
            )
        )

    actas = query.order_by(ActaEntrega.fecha.desc(), ActaEntrega.numero_correlativo.desc()).all()
    resultado = []
    for a in actas:
        res = ActaEntregaResponse.from_orm(a)
        res.colegio_nombre = a.colegio.nombre if a.colegio else None
        resultado.append(res)
    return resultado


@router.delete("/compras/actas/{id_acta}")
def eliminar_acta_entrega(
    id_acta: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar")),
):
    """Elimina un acta de entrega registrada."""
    acta = db.query(ActaEntrega).filter(ActaEntrega.id_acta == id_acta).first()
    if not acta:
        raise HTTPException(status_code=404, detail="Acta no encontrada")
    db.delete(acta)
    db.commit()
    return {"message": "Acta eliminada exitosamente"}



class ToggleActivoRequest(BaseModel):
    activo: bool


@router.patch("/compras/historial/{id_presupuesto}/activo", response_model=BudgetRequestResponse)
def toggle_activo_compra(
    id_presupuesto: int,
    payload: ToggleActivoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    """Activa o desactiva una solicitud dentro del historial de GO-Compras.
    Las solicitudes desactivadas no se contabilizan en el monto total."""
    solicitud = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    solicitud.activo = payload.activo
    db.commit()
    db.refresh(solicitud)
    return build_solicitud_response(solicitud, db)


# ============================================================
# PRESUPUESTO ANUAL (agrupador de solicitudes por año)
# ============================================================

def _serializar_presupuesto_anual(db: Session, ppto: PresupuestoAnual) -> dict:
    agg = db.query(
        func.count(SolicitudPresupuesto.id_presupuesto),
        func.coalesce(func.sum(PresupuestoDetalle.total_iva), 0)
    ).select_from(SolicitudPresupuesto).outerjoin(
        PresupuestoDetalle,
        PresupuestoDetalle.id_presupuesto == SolicitudPresupuesto.id_presupuesto
    ).filter(
        SolicitudPresupuesto.id_presupuesto_anual == ppto.id_presupuesto_anual
    ).first()

    # count(*) sobre el join infla por cada detalle; contamos las solicitudes aparte
    solicitudes_count = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto_anual == ppto.id_presupuesto_anual
    ).count()
    monto_total = float(agg[1]) if agg else 0.0

    return {
        "id_presupuesto_anual": ppto.id_presupuesto_anual,
        "id_colegio": ppto.id_colegio,
        "colegio_nombre": ppto.colegio.nombre if ppto.colegio else None,
        "year": ppto.year,
        "nombre": ppto.nombre,
        "descripcion": ppto.descripcion,
        "estado": ppto.estado,
        "creado_por": ppto.creado_por,
        "creado_por_nombre": ppto.creador.nombre if ppto.creador else None,
        "creado_en": ppto.creado_en,
        "solicitudes_count": solicitudes_count,
        "monto_total": monto_total,
    }


@router.get("/presupuestos-anuales", response_model=List[PresupuestoAnualResponse])
def list_presupuestos_anuales(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    id_colegio: Optional[int] = Query(None)
):
    rol = current_user.rol.codigo if current_user.rol else None
    roles_multicolegio = set(ROLES_CON_ACCESO_TOTAL) | set(ROLES_GESTION_PPTO_MULTICOLEGIO)

    query = db.query(PresupuestoAnual)
    if id_colegio and rol in roles_multicolegio:
        query = query.filter(PresupuestoAnual.id_colegio == id_colegio)
    elif rol != "ADM" and rol not in ROLES_GESTION_PPTO_MULTICOLEGIO:
        query = query.filter(PresupuestoAnual.id_colegio == current_user.id_colegio)

    pptos = query.order_by(PresupuestoAnual.year.desc()).all()
    return [_serializar_presupuesto_anual(db, p) for p in pptos]


@router.post("/presupuestos-anuales", response_model=PresupuestoAnualResponse, status_code=status.HTTP_201_CREATED)
def create_presupuesto_anual(
    obj: PresupuestoAnualCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    rol = current_user.rol.codigo if current_user.rol else None
    if not rol or (rol not in ROLES_CON_ACCESO_TOTAL and rol not in ROLES_GESTION_PPTO_MULTICOLEGIO):
        raise HTTPException(status_code=403, detail="No tienes permiso para crear presupuestos anuales.")

    # Los roles de gestión multi-colegio pueden elegir el colegio destino; el resto usa el suyo.
    if obj.id_colegio and rol in ROLES_GESTION_PPTO_MULTICOLEGIO:
        id_colegio_destino = obj.id_colegio
    else:
        id_colegio_destino = current_user.id_colegio

    colegio = db.query(Colegio).filter(Colegio.id_colegio == id_colegio_destino).first()
    if not colegio:
        raise HTTPException(status_code=404, detail="Colegio no encontrado.")

    existente = db.query(PresupuestoAnual).filter(
        PresupuestoAnual.id_colegio == id_colegio_destino,
        PresupuestoAnual.year == obj.year
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail=f"Ya existe un presupuesto para el año {obj.year} en el colegio {colegio.nombre}.")

    nuevo = PresupuestoAnual(
        id_colegio=id_colegio_destino,
        year=obj.year,
        nombre=(obj.nombre or f"Presupuesto {obj.year}").strip(),
        descripcion=obj.descripcion,
        estado="activo",
        creado_por=current_user.id_user,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return _serializar_presupuesto_anual(db, nuevo)


@router.get("/presupuestos-anuales/{id_presupuesto_anual}", response_model=PresupuestoAnualResponse)
def get_presupuesto_anual(
    id_presupuesto_anual: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    ppto = db.query(PresupuestoAnual).filter(
        PresupuestoAnual.id_presupuesto_anual == id_presupuesto_anual
    ).first()
    if not ppto:
        raise HTTPException(status_code=404, detail="Presupuesto anual no encontrado")
    return _serializar_presupuesto_anual(db, ppto)


@router.patch("/presupuestos-anuales/{id_presupuesto_anual}", response_model=PresupuestoAnualResponse)
def update_presupuesto_anual(
    id_presupuesto_anual: int,
    obj: PresupuestoAnualUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    cargo_nombre = (current_user.cargo.nombre or "").lower() if current_user.cargo else ((current_user.subarea.nombre or "").lower() if current_user.subarea else "")
    cargos_nombres = [(s.nombre or "").lower() for s in (current_user.cargos or current_user.subareas or []) if s.nombre]
    es_jefe_compras_subarea = any(k in cargo_nombre or any(k in s for s in cargos_nombres) for k in ["jefe de compras", "jefe compras", "asistente de compras", "asistente compras"])
    es_jefe_compras_cargo = es_jefe_compras_subarea
    es_admin = current_user.rol and current_user.rol.codigo == "ADM"
    rol = current_user.rol.codigo if current_user.rol else None

    if not es_admin and not es_jefe_compras_subarea and (not rol or (rol not in ROLES_CON_ACCESO_TOTAL and rol not in ROLES_GESTION_PPTO_MULTICOLEGIO)):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar presupuestos anuales.")

    ppto = db.query(PresupuestoAnual).filter(
        PresupuestoAnual.id_presupuesto_anual == id_presupuesto_anual
    ).first()
    if not ppto:
        raise HTTPException(status_code=404, detail="Presupuesto anual no encontrado")

    if obj.nombre is not None:
        ppto.nombre = obj.nombre.strip() or ppto.nombre
    if obj.descripcion is not None:
        ppto.descripcion = obj.descripcion
    if obj.estado is not None:
        ppto.estado = obj.estado

    db.commit()
    db.refresh(ppto)
    return _serializar_presupuesto_anual(db, ppto)


@router.delete("/presupuestos-anuales/{id_presupuesto_anual}")
def delete_presupuesto_anual(
    id_presupuesto_anual: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    cargo_nombre = (current_user.cargo.nombre or "").lower() if current_user.cargo else ((current_user.subarea.nombre or "").lower() if current_user.subarea else "")
    cargos_nombres = [(s.nombre or "").lower() for s in (current_user.cargos or current_user.subareas or []) if s.nombre]
    es_jefe_compras_subarea = any(k in cargo_nombre or any(k in s for s in cargos_nombres) for k in ["jefe de compras", "jefe compras", "asistente de compras", "asistente compras"])
    es_jefe_compras_cargo = es_jefe_compras_subarea
    es_admin = current_user.rol and current_user.rol.codigo == "ADM"
    rol = current_user.rol.codigo if current_user.rol else None

    if not es_admin and not es_jefe_compras_subarea and (not rol or (rol not in ROLES_CON_ACCESO_TOTAL and rol not in ROLES_GESTION_PPTO_MULTICOLEGIO)):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar presupuestos anuales.")

    ppto = db.query(PresupuestoAnual).filter(
        PresupuestoAnual.id_presupuesto_anual == id_presupuesto_anual
    ).first()
    if not ppto:
        raise HTTPException(status_code=404, detail="Presupuesto anual no encontrado")

    # Obtener solicitudes asociadas para eliminarlas en cascada
    solicitudes = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto_anual == id_presupuesto_anual
    ).all()

    solicitudes_eliminadas = len(solicitudes)
    for sol in solicitudes:
        # Eliminar convocatorias asociadas
        convocatorias = db.query(PreConvocatoria).filter(
            PreConvocatoria.id_presupuesto == sol.id_presupuesto
        ).all()
        for conv in convocatorias:
            db.delete(conv)

        # Eliminar los detalles asociados
        db.query(PresupuestoDetalle).filter(
            PresupuestoDetalle.id_presupuesto == sol.id_presupuesto
        ).delete(synchronize_session=False)

        # Eliminar la solicitud
        db.delete(sol)

    db.delete(ppto)
    db.commit()
    return {"message": "Presupuesto anual eliminado", "solicitudes_eliminadas": solicitudes_eliminadas}


@router.get("/presupuestos-anuales/{id_presupuesto_anual}/solicitudes", response_model=List[BudgetRequestResponse])
def list_solicitudes_presupuesto_anual(
    id_presupuesto_anual: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    solicitudes = db.query(SolicitudPresupuesto).options(
        *get_solicitudes_eager_options()
    ).filter(
        SolicitudPresupuesto.id_presupuesto_anual == id_presupuesto_anual
    ).order_by(SolicitudPresupuesto.fecha.desc()).all()
    return build_solicitudes_batch_response(solicitudes, db)


@router.patch("/solicitudes/{id_presupuesto}/presupuesto-anual", response_model=BudgetRequestResponse)
def asignar_presupuesto_anual(
    id_presupuesto: int,
    payload: AsignarPresupuestoAnualRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    """Enlaza o reasigna una solicitud a un presupuesto anual. Con
    id_presupuesto_anual = null se desenlaza."""
    if not current_user.rol or current_user.rol.codigo not in ROLES_CON_ACCESO_TOTAL:
        raise HTTPException(status_code=403, detail="No tienes permiso para asignar presupuestos anuales.")

    solicitud = db.query(SolicitudPresupuesto).options(
        *get_solicitudes_eager_options()
    ).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if payload.id_presupuesto_anual is not None:
        ppto = db.query(PresupuestoAnual).filter(
            PresupuestoAnual.id_presupuesto_anual == payload.id_presupuesto_anual
        ).first()
        if not ppto:
            raise HTTPException(status_code=400, detail="El presupuesto anual indicado no existe")
        if ppto.id_colegio != solicitud.id_colegio:
            raise HTTPException(status_code=400, detail="El presupuesto anual pertenece a otro colegio")

    solicitud.id_presupuesto_anual = payload.id_presupuesto_anual
    db.commit()
    db.refresh(solicitud)
    return build_solicitud_response(solicitud, db)


@router.get("/solicitudes/{id_presupuesto}", response_model=BudgetRequestResponse)
def get_solicitud(
    id_presupuesto: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    solicitud = db.query(SolicitudPresupuesto).options(
        *get_solicitudes_eager_options()
    ).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()
    
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    if not _usuario_puede_gestionar_solicitud(db, current_user, solicitud):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")
    
    return build_solicitud_response(solicitud, db)


def _presupuesto_anual_activo(db: Session, id_colegio: int) -> Optional[PresupuestoAnual]:
    """Presupuesto anual al que se enlazan automáticamente las solicitudes nuevas.
    El presupuesto de un año N se planifica el año anterior, así que una
    solicitud creada este año pertenece al presupuesto del año siguiente
    (año actual + 1). Solo se enlaza si dicho presupuesto existe y está activo."""
    year_objetivo = datetime.now().year + 1
    return db.query(PresupuestoAnual).filter(
        PresupuestoAnual.id_colegio == id_colegio,
        PresupuestoAnual.year == year_objetivo,
        PresupuestoAnual.estado == "activo"
    ).first()


def _obtener_iniciales_colegio(colegio: Optional[Colegio]) -> str:
    """Retorna las iniciales del colegio en minúsculas (ej. 'cm' para Colegio Macaya, 'cdp' para Colegio Diego Portales)."""
    if not colegio or not colegio.nombre:
        return "col"
    nombre = colegio.nombre.strip().lower()
    if "macaya" in nombre:
        return "cm"
    if "diego portales" in nombre or "portales" in nombre:
        return "cdp"

    nombre_limpio = unicodedata.normalize('NFKD', nombre).encode('ASCII', 'ignore').decode('ASCII')
    stopwords = {"de", "del", "la", "el", "los", "las", "y", "e", "en", "para"}
    palabras = [p for p in re.split(r'[\s\-_.]+', nombre_limpio) if p and p not in stopwords]
    if palabras:
        return "".join(p[0] for p in palabras)
    return nombre_limpio[:3]


def _obtener_prefijo_area(area: Optional[Area]) -> str:
    """Retorna el prefijo del área en minúsculas y limpio (ej. 'utp', 'pie', 'dir')."""
    if not area:
        return "area"
    pref = (area.prefijo or area.nombre or "area").strip().lower()
    pref_limpio = unicodedata.normalize('NFKD', pref).encode('ASCII', 'ignore').decode('ASCII')
    pref_limpio = re.sub(r'[^a-z0-9\-]', '', pref_limpio)
    return pref_limpio or "area"


def _generar_codigo_solicitud(db: Session, subarea: Subarea, colegio: Optional[Colegio], year: int) -> str:
    """Genera código correlativo con formato: {iniciales_colegio}-{año}-{area}-{numero:03d}
    Ejemplos: cm-2027-utp-001, cdp-2027-utp-001.
    Asegura unicidad en pre_solicitud incrementando el correlativo si ya estuviese ocupado."""
    col_slug = _obtener_iniciales_colegio(colegio)
    area = subarea.area if subarea else None
    area_slug = _obtener_prefijo_area(area)

    base_prefix = f"{col_slug}-{year}-{area_slug}-"

    count = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.codigo.like(f"{base_prefix}%")
    ).count() + 1

    while True:
        codigo = f"{base_prefix}{count:03d}"
        ocupado = db.query(SolicitudPresupuesto).filter(
            SolicitudPresupuesto.codigo == codigo
        ).first()
        if not ocupado:
            return codigo
        count += 1


@router.post("/solicitudes", response_model=BudgetRequestResponse, status_code=status.HTTP_201_CREATED)
def create_solicitud(
    obj: BudgetRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    cargo_id = obj.id_cargo or obj.id_subarea
    subarea = db.query(Cargo).filter(Cargo.id_cargo == cargo_id).first()
    if not subarea:
        raise HTTPException(status_code=404, detail="La subárea / cargo indicada no existe.")

    # Determinar colegio destino y presupuesto anual:
    # 1. Si se indicó presupuesto anual, el colegio de la solicitud DEBE ser el del presupuesto anual elegido.
    # 2. Si se especificó colegio explícito y el usuario tiene acceso, usar ese.
    # 3. Por defecto, usar el colegio principal del usuario.
    colegio_destino = current_user.id_colegio
    idPptoAnual = obj.id_presupuesto_anual
    year_destino = datetime.now().year + 1

    if idPptoAnual:
        ppto_elegido = db.query(PresupuestoAnual).filter(PresupuestoAnual.id_presupuesto_anual == idPptoAnual).first()
        if ppto_elegido:
            colegio_destino = ppto_elegido.id_colegio
            year_destino = ppto_elegido.year
    elif obj.id_colegio:
        colegio_destino = obj.id_colegio
    else:
        ppto_anual = _presupuesto_anual_activo(db, current_user.id_colegio)
        if ppto_anual:
            idPptoAnual = ppto_anual.id_presupuesto_anual
            year_destino = ppto_anual.year

    colegio_obj = db.query(Colegio).filter(Colegio.id_colegio == colegio_destino).first()

    # Validar unicidad: solo 1 solicitud activa por área en el mismo colegio y año
    if subarea and subarea.id_area:
        query_existente = (
            db.query(SolicitudPresupuesto)
            .join(Cargo, SolicitudPresupuesto.id_cargo == Cargo.id_cargo)
            .filter(
                SolicitudPresupuesto.activo == True,
                SolicitudPresupuesto.id_colegio == colegio_destino,
                Cargo.id_area == subarea.id_area,
            )
        )
        if idPptoAnual:
            query_existente = query_existente.filter(
                SolicitudPresupuesto.id_presupuesto_anual == idPptoAnual
            )
        else:
            query_existente = query_existente.filter(
                func.extract('year', SolicitudPresupuesto.fecha) == year_destino
            )

        solicitud_existente = query_existente.first()
        if solicitud_existente:
            area_nombre = subarea.area.nombre if (subarea and subarea.area) else "esta área"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Ya existe una solicitud de presupuesto ({solicitud_existente.codigo}) para el área "
                    f"'{area_nombre}' en el año {year_destino}. Solo se permite una solicitud por área al año. "
                    f"Comuníquese con Administración si requiere realizar ajustes o solicitar un presupuesto adicional."
                )
            )

    # Generar código con nuevo formato: {iniciales_colegio}-{año}-{area}-{numero:03d} (ej: cm-2027-utp-001)
    codigo = _generar_codigo_solicitud(db, subarea, colegio_obj, year_destino)

    db_obj = SolicitudPresupuesto(
        codigo=codigo,
        id_user=current_user.id_user,
        id_subarea=obj.id_subarea,
        id_colegio=colegio_destino,
        id_presupuesto_anual=idPptoAnual,
        comentario=obj.comentario,
        estado="Pendiente"
    )
    db.add(db_obj)
    db.flush()
    
    for det in obj.detalles:
        db_det = PresupuestoDetalle(
            id_presupuesto=db_obj.id_presupuesto,
            nombre_producto=det.nombre_producto,
            descripcion=det.descripcion,
            id_recurso=det.id_recurso,
            codigo_cuenta=det.codigo_cuenta,
            formato_unidad=det.formato_unidad,
            cantidad=det.cantidad,
            valor_unitario=det.valor_unitario,
            valor_unitario_iva=det.valor_unitario_iva,
            total_iva=det.total_iva,
            fecha_ejecucion=det.fecha_ejecucion,
            fecha_termino=det.fecha_termino,
            tipo_fecha=det.tipo_fecha,
            motivo=det.motivo,
            id_actividad=det.id_actividad,
            estado_aprobacion="Sin Revisar",
            id_subvencion=det.id_subvencion,
            destino_gasto=_destino_canonico(det.destino_gasto) or det.destino_gasto,
            id_subarea=det.id_subarea
        )
        db.add(db_det)
        if det.id_actividad:
            sync_recurso_actividad(db, det.id_actividad, det.nombre_producto)
    
    db.commit()
    db.refresh(db_obj)
    
    return build_solicitud_response(db_obj, db)


def _grupo_para_categoria(db: Session, id_cat_recurso: int, cache: dict) -> Optional[int]:
    """Grupo de recursos más usado dentro de una categoría, para no dejar sin
    clasificar los recursos que crea la importación (quedarían fuera de los
    filtros por grupo del catálogo). Respaldo: el grupo "General"."""
    if id_cat_recurso in cache:
        return cache[id_cat_recurso]

    mas_usado = db.query(Recurso.id_grupo_recurso).filter(
        Recurso.id_cat_recurso == id_cat_recurso,
        Recurso.id_grupo_recurso.isnot(None),
    ).group_by(Recurso.id_grupo_recurso).order_by(
        func.count(Recurso.id_recurso).desc()
    ).first()

    if mas_usado:
        cache[id_cat_recurso] = mas_usado[0]
    else:
        general = db.query(GrupoRecurso).filter(
            func.lower(GrupoRecurso.nombre) == "general"
        ).first()
        cache[id_cat_recurso] = general.id_grupo_recurso if general else None

    return cache[id_cat_recurso]


@router.post("/importar/solicitud", response_model=BudgetRequestResponse, status_code=status.HTTP_201_CREATED)
def crear_solicitud_importada(
    obj: ImportarSolicitudCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear")),
):
    """Crea la cabecera de una solicitud a nombre de un usuario del área, dentro
    de un presupuesto anual concreto. Equivale al formulario /presupuesto/crear,
    pero pudiendo elegir el solicitante y el año de destino: el resultado es el
    mismo que si esa persona la hubiera creado ella misma.

    Nace en estado "Pendiente" y sin detalles; los recursos se cargan después
    desde la planilla (POST /presupuesto/importar/recursos)."""
    if not current_user.rol or current_user.rol.codigo != "ADM":
        raise HTTPException(status_code=403, detail="Solo el Administrador puede crear solicitudes importadas.")

    ppto = db.query(PresupuestoAnual).filter(
        PresupuestoAnual.id_presupuesto_anual == obj.id_presupuesto_anual
    ).first()
    if not ppto:
        raise HTTPException(status_code=404, detail="El presupuesto anual indicado no existe.")

    cargo_id = obj.id_cargo or obj.id_subarea
    subarea = db.query(Cargo).filter(Cargo.id_cargo == cargo_id).first()
    if not subarea:
        raise HTTPException(status_code=404, detail="La subárea indicada no existe.")

    solicitante = db.query(User).filter(User.id_user == obj.id_user).first()
    if not solicitante:
        raise HTTPException(status_code=404, detail="El usuario solicitante indicado no existe.")

    colegio = db.query(Colegio).filter(Colegio.id_colegio == ppto.id_colegio).first()

    # El solicitante debe pertenecer al colegio del presupuesto (por su colegio
    # principal o por la tabla multi-colegio); si no, la solicitud nunca le
    # aparecería en "Mis Solicitudes".
    pertenece = solicitante.id_colegio == ppto.id_colegio or db.query(UserColegio).filter(
        UserColegio.id_user == solicitante.id_user,
        UserColegio.id_colegio == ppto.id_colegio,
    ).first() is not None
    if not pertenece:
        raise HTTPException(
            status_code=400,
            detail=f"{solicitante.nombre} no pertenece a {colegio.nombre if colegio else 'ese colegio'}."
        )

    # Validar unicidad: solo 1 solicitud activa por área en el mismo colegio y año
    if subarea and subarea.id_area:
        solicitud_existente = (
            db.query(SolicitudPresupuesto)
            .join(Cargo, SolicitudPresupuesto.id_cargo == Cargo.id_cargo)
            .filter(
                SolicitudPresupuesto.activo == True,
                SolicitudPresupuesto.id_colegio == ppto.id_colegio,
                Cargo.id_area == subarea.id_area,
                SolicitudPresupuesto.id_presupuesto_anual == ppto.id_presupuesto_anual,
            )
            .first()
        )
        if solicitud_existente:
            area_nombre = subarea.area.nombre if (subarea and subarea.area) else "esta área"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Ya existe una solicitud de presupuesto ({solicitud_existente.codigo}) para el área "
                    f"'{area_nombre}' en el Presupuesto {ppto.year}. Solo se permite una solicitud por área al año. "
                    f"Comuníquese con Administración si requiere realizar ajustes o solicitar un presupuesto adicional."
                )
            )

    codigo = _generar_codigo_solicitud(db, subarea, colegio, ppto.year)

    solicitud = SolicitudPresupuesto(
        codigo=codigo,
        id_user=solicitante.id_user,
        id_subarea=subarea.id_subarea,
        id_colegio=ppto.id_colegio,
        id_presupuesto_anual=ppto.id_presupuesto_anual,
        comentario=(obj.comentario or "").strip() or None,
        estado="Pendiente",
    )
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)

    return build_solicitud_response(solicitud, db)


# Palabras demasiado genéricas para decidir por sí solas que dos recursos se parecen.
_PALABRAS_VACIAS = {
    "de", "del", "la", "el", "los", "las", "para", "con", "sin", "por", "y", "a",
    "en", "un", "una", "unos", "unas", "al", "e", "o", "u", "kit", "set", "pack",
}


def _tokens_recurso(nombre: str) -> set:
    """Palabras significativas de un nombre de recurso, normalizadas sin tildes."""
    limpio = unicodedata.normalize("NFKD", (nombre or "").lower())
    limpio = "".join(c for c in limpio if not unicodedata.combining(c))
    limpio = re.sub(r"[^a-z0-9\s]", " ", limpio)
    return {t for t in limpio.split() if len(t) >= 3 and t not in _PALABRAS_VACIAS}


@router.post("/importar/analizar", response_model=AnalizarPlanillaResponse)
def analizar_planilla(
    obj: AnalizarPlanillaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear")),
):
    """Diagnostica la planilla contra la base SIN escribir nada, para revisarla
    fila por fila antes de importar: qué recursos ya existen (y se reutilizarán),
    cuáles se crearían nuevos, qué categorías no están en el catálogo y qué
    códigos contables no existen en el Manual de Cuentas."""
    if not current_user.rol or current_user.rol.codigo != "ADM":
        raise HTTPException(status_code=403, detail="Solo el Administrador puede analizar planillas.")

    categorias = {
        c.nombre.strip().lower(): c
        for c in db.query(CategoriaRecurso).filter(CategoriaRecurso.estado == "Activo").all()
    }
    cuentas = {c.codigo: c.nombre for c in db.query(CuentaMatrizReglas).all()}

    # Los recursos del catálogo se buscan solo por los nombres de la planilla,
    # para no traer la tabla entera cuando el catálogo es grande.
    nombres = {(i.nombre_producto or "").strip().lower() for i in obj.items if (i.nombre_producto or "").strip()}
    encontrados = {}
    if nombres:
        for r in db.query(Recurso).filter(
            func.lower(Recurso.nombre).in_(list(nombres)),
            Recurso.estado == "ACTIVO",
        ).all():
            encontrados.setdefault(r.nombre.strip().lower(), r)

    # Para las filas SIN coincidencia exacta se buscan parecidos por palabras
    # compartidas ("Agua con gas" → "Agua"). El catálogo se carga una sola vez y
    # solo si hace falta, para no pagarlo cuando todo calza exacto.
    sin_exacto = [
        (i.nombre_producto or "").strip() for i in obj.items
        if (i.nombre_producto or "").strip() and (i.nombre_producto or "").strip().lower() not in encontrados
    ]
    catalogo: List[tuple] = []
    if sin_exacto:
        catalogo = [
            (r, _tokens_recurso(r.nombre))
            for r in db.query(Recurso).options(selectinload(Recurso.categoria)).filter(
                Recurso.estado == "ACTIVO"
            ).all()
        ]

    def _sugerir(nombre: str) -> List[RecursoSugerido]:
        tokens = _tokens_recurso(nombre)
        if not tokens:
            return []
        puntuados = []
        for recurso, tks in catalogo:
            comunes = tokens & tks
            if not comunes:
                continue
            # Con solo compartir 1 palabra clave relevante (ej: 'jugos', 'agua'),
            # sugerirá el recurso existente al usuario.
            score = len(comunes) / len(tokens)
            if score > 0:
                puntuados.append((score, recurso))
        puntuados.sort(key=lambda x: (-x[0], len(x[1].nombre)))
        return [
            RecursoSugerido(
                id_recurso=r.id_recurso,
                nombre=r.nombre,
                descripcion=r.descripcion,
                categoria_nombre=r.categoria.nombre if r.categoria else None,
                id_cat_recurso=r.id_cat_recurso,
                formato=r.formato,
            )
            for _, r in puntuados[:4]
        ]

    filas: List[AnalisisFilaResultado] = []
    for idx, item in enumerate(obj.items, start=1):
        nombre = (item.nombre_producto or "").strip()
        problemas: List[str] = []

        if not nombre:
            problemas.append("sin nombre de recurso")
        if item.precio is None:
            problemas.append("sin precio")

        categoria = categorias.get((item.categoria_nombre or "").strip().lower())
        if not categoria:
            problemas.append(
                "categoría vacía" if not (item.categoria_nombre or "").strip()
                else f"la categoría '{item.categoria_nombre}' no existe"
            )

        recurso = encontrados.get(nombre.lower()) if nombre else None

        codigo = (item.codigo_cuenta or "").strip()
        codigo_valido = bool(codigo) and codigo in cuentas
        if codigo and not codigo_valido:
            problemas.append(f"el código contable '{codigo}' no está en el Manual de Cuentas")

        filas.append(AnalisisFilaResultado(
            fila=idx,
            nombre_producto=nombre,
            id_recurso=recurso.id_recurso if recurso else None,
            recurso_existente=recurso is not None,
            recurso_descripcion_catalogo=recurso.descripcion if recurso else None,
            recurso_categoria_catalogo=(
                recurso.categoria.nombre if recurso and recurso.categoria else None
            ),
            sugerencias=[] if (recurso or not nombre) else _sugerir(nombre),
            id_cat_recurso=categoria.id_cat_recurso if categoria else None,
            categoria_encontrada=categoria is not None,
            codigo_cuenta_valido=codigo_valido,
            codigo_cuenta_nombre=cuentas.get(codigo) if codigo_valido else None,
            problemas=problemas,
        ))

    return AnalizarPlanillaResponse(filas=filas)


@router.post("/importar/recursos", response_model=ImportarRecursosResponse)
def importar_recursos_solicitud(
    obj: ImportarRecursosRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear")),
):
    """Carga los recursos de una planilla en una solicitud ya creada. Equivale a
    "Agregar Recursos" pero en bloque: cada fila se escribe en pre_detalle con
    estado_aprobacion="Pendiente", para revisarlos y aprobar la solicitud después.

    Los recursos se reutilizan por nombre exacto (case-insensitive); si no
    existen se crean en el catálogo. Las filas sin categoría válida o sin precio
    se omiten y se informan una a una. Un código contable que no exista en el
    Manual de Cuentas se descarta sin bloquear la fila."""
    if not current_user.rol or current_user.rol.codigo != "ADM":
        raise HTTPException(status_code=403, detail="Solo el Administrador puede importar recursos masivamente.")

    solicitud = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == obj.id_presupuesto
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="La solicitud indicada no existe.")

    # El año de la planilla lo manda el presupuesto anual enlazado: es contra el que
    # se resuelven las fechas que vienen como mes ("Marzo" → 01/03/{year}).
    year = solicitud.presupuesto_anual.year if solicitud.presupuesto_anual else datetime.now().year

    categorias = {
        c.nombre.strip().lower(): c
        for c in db.query(CategoriaRecurso).filter(CategoriaRecurso.estado == "Activo").all()
    }
    codigos_validos = {c.codigo for c in db.query(CuentaMatrizReglas).all()}
    actividades_validas = {a.id_actividad for a in db.query(Actividad.id_actividad).all()}
    subvenciones = {
        s.nombre_corto.strip().lower(): s
        for s in db.query(Subvencion).all()
    }
    subareas_por_nombre = {
        s.nombre.strip().lower(): s
        for s in db.query(Subarea).all()
    }
    cache_recursos = {
        r.nombre.strip().lower(): r
        for r in db.query(Recurso).filter(Recurso.estado == "ACTIVO").all()
    }

    filas_omitidas: List[ImportarPresupuestoFilaOmitida] = []
    detalles_a_crear = []
    cache_grupos: dict = {}
    creados = 0
    reutilizados = 0

    try:
        for idx, item in enumerate(obj.items, start=1):
            nombre = (item.nombre_producto or "").strip()
            if not nombre:
                filas_omitidas.append(ImportarPresupuestoFilaOmitida(fila=idx, motivo="sin nombre de recurso"))
                continue

            # La pantalla de revisión puede mandar la categoría ya resuelta (incluida
            # una recién creada, que no está en el caché); si no, se busca por nombre.
            categoria = None
            if item.id_cat_recurso:
                categoria = db.query(CategoriaRecurso).filter(
                    CategoriaRecurso.id_cat_recurso == item.id_cat_recurso
                ).first()
            if not categoria:
                categoria = categorias.get((item.categoria_nombre or "").strip().lower())
            if not categoria:
                filas_omitidas.append(ImportarPresupuestoFilaOmitida(
                    fila=idx, motivo=f"categoría '{item.categoria_nombre}' no existe en el catálogo"
                ))
                continue

            if item.precio is None:
                filas_omitidas.append(ImportarPresupuestoFilaOmitida(fila=idx, motivo="precio vacío o inválido"))
                continue

            # destino_gasto es NOT NULL en pre_detalle. Se valida ANTES de tocar el
            # catálogo: si no, una fila descartada dejaría un Recurso huérfano creado.
            destino_fila = item.destino_gasto or obj.destino_gasto
            destino_fila = _destino_canonico(destino_fila) or destino_fila
            if not destino_fila:
                filas_omitidas.append(ImportarPresupuestoFilaOmitida(
                    fila=idx, motivo="sin destino de gasto"
                ))
                continue

            # Recurso: manda el id resuelto en la revisión; si no, se busca por
            # nombre exacto y, si tampoco existe, se crea en el catálogo.
            key = nombre.lower()
            recurso = None
            if item.id_recurso:
                recurso = db.query(Recurso).filter(Recurso.id_recurso == item.id_recurso).first()
            if not recurso:
                recurso = cache_recursos.get(key)
            if recurso:
                reutilizados += 1
            else:
                recurso = Recurso(
                    nombre=nombre,
                    descripcion=item.descripcion or None,
                    formato=item.formato_unidad or None,
                    id_cat_recurso=categoria.id_cat_recurso,
                    # Sin grupo el recurso queda sin clasificar en el catálogo, así que
                    # se hereda el más usado en su categoría (mismo criterio que la
                    # importación de convocatorias), con "General" como respaldo.
                    id_grupo_recurso=_grupo_para_categoria(db, categoria.id_cat_recurso, cache_grupos),
                    estado="ACTIVO",
                )
                db.add(recurso)
                db.flush()
                cache_recursos[key] = recurso
                creados += 1

            codigo_cuenta = (item.codigo_cuenta or "").strip() or None
            if codigo_cuenta and codigo_cuenta not in codigos_validos:
                codigo_cuenta = None

            cantidad = item.cantidad or 1
            motivo = (item.motivo or "").strip() or (obj.motivo_default or "").strip() \
                or f"Presupuesto {year} — importado desde planilla de área."

            # Fecha: la fila manda (mes resuelto o fecha exacta); si no trae, el
            # mes por defecto de la hoja, día 1, igual que el tipo "Mensual" del formulario.
            if item.fecha_ejecucion:
                fecha_ejecucion = item.fecha_ejecucion
                tipo_fecha = item.tipo_fecha or "mensual"
            else:
                mes = obj.mes_ejecucion_default or 1
                if mes < 1 or mes > 12:
                    mes = 1
                fecha_ejecucion = date(year, mes, 1)
                tipo_fecha = "mensual"

            id_actividad = item.id_actividad if item.id_actividad in actividades_validas else None

            # Subvención: manda el id elegido por fila, luego el nombre de la
            # planilla y, por último, el respaldo general de la carga.
            if item.id_subvencion is not None:
                id_subvencion_fila = item.id_subvencion
            else:
                id_subvencion_fila = obj.id_subvencion
                if item.subvencion_nombre:
                    subv = subvenciones.get(item.subvencion_nombre.strip().lower())
                    if subv:
                        id_subvencion_fila = subv.id_subvencion

            # Subárea solicitante del ítem: por defecto la de la solicitud, salvo que
            # la fila traiga la suya (equivale al selector por ítem de Agregar Recursos).
            id_subarea_fila = solicitud.id_subarea
            if item.subarea_nombre:
                sa = subareas_por_nombre.get(item.subarea_nombre.strip().lower())
                if sa:
                    id_subarea_fila = sa.id_subarea

            detalles_a_crear.append(dict(
                nombre_producto=nombre,
                descripcion=item.descripcion or None,
                id_recurso=recurso.id_recurso,
                codigo_cuenta=codigo_cuenta,
                formato_unidad=item.formato_unidad or "unidad",
                cantidad=cantidad,
                # Igual que en "Agregar Recursos" (agregar-recursos/page.tsx): el precio
                # capturado es con IVA incluido; valor_unitario (sin IVA) se deriva de ahí.
                valor_unitario=round(item.precio / 1.19),
                valor_unitario_iva=item.precio,
                total_iva=round(cantidad * item.precio, 2),
                # Igual que el selector "Estimación de Fecha" del formulario.
                fecha_ejecucion=fecha_ejecucion,
                tipo_fecha=tipo_fecha,
                motivo=motivo,
                id_actividad=id_actividad,
                destino_gasto=destino_fila,
                id_subvencion=id_subvencion_fila,
                id_subarea=id_subarea_fila,
                # Categoría también en el detalle (igual que al importar convocatorias):
                # así la línea conserva su clasificación aunque el recurso cambie después.
                id_cat_recurso=categoria.id_cat_recurso,
            ))

        for det in detalles_a_crear:
            db.add(PresupuestoDetalle(
                id_presupuesto=solicitud.id_presupuesto,
                estado_aprobacion="Pendiente",
                **det,
            ))

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        # El rollback descarta también los Recurso creados en este intento.
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al importar los recursos: {e}")

    db.refresh(solicitud)
    return ImportarRecursosResponse(
        id_presupuesto=solicitud.id_presupuesto,
        codigo=solicitud.codigo,
        subarea_nombre=solicitud.subarea.nombre if solicitud.subarea else "—",
        solicitante_nombre=solicitud.user.nombre if solicitud.user else "—",
        filas_importadas=len(detalles_a_crear),
        filas_omitidas=filas_omitidas,
        recursos_creados=creados,
        recursos_reutilizados=reutilizados,
    )


@router.post("/solicitudes/{id_presupuesto}/recursos", response_model=BudgetRequestResponse)
def agregar_recursos_solicitud(
    id_presupuesto: int,
    obj: AgregarRecursosRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    # Verificar que la solicitud existe y pertenece al usuario
    db_obj = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    # Verificar permiso (dueño o admin)
    if current_user.rol and current_user.rol.codigo not in ROLES_CON_ACCESO_TOTAL:
        if db_obj.id_user != current_user.id_user:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")
    
    # Agregar recursos
    for det in obj.detalles:
        db_det = PresupuestoDetalle(
            id_presupuesto=db_obj.id_presupuesto,
            nombre_producto=det.nombre_producto,
            descripcion=det.descripcion,
            id_recurso=det.id_recurso,
            codigo_cuenta=det.codigo_cuenta,
            formato_unidad=det.formato_unidad,
            cantidad=det.cantidad,
            valor_unitario=det.valor_unitario,
            valor_unitario_iva=det.valor_unitario_iva,
            total_iva=det.total_iva,
            fecha_ejecucion=det.fecha_ejecucion,
            fecha_termino=det.fecha_termino,
            tipo_fecha=det.tipo_fecha,
            motivo=det.motivo,
            id_actividad=det.id_actividad,
            estado_aprobacion="Sin Revisar",
            id_subvencion=det.id_subvencion,
            destino_gasto=_destino_canonico(det.destino_gasto) or det.destino_gasto,
            id_subarea=det.id_subarea
        )
        db.add(db_det)
        if det.id_actividad:
            sync_recurso_actividad(db, det.id_actividad, det.nombre_producto)
    
    db.commit()
    db.refresh(db_obj)
    
    return build_solicitud_response(db_obj, db)


@router.patch("/solicitudes/{id_presupuesto}/estado", response_model=BudgetRequestResponse)
def update_solicitud_estado(
    id_presupuesto: int,
    nuevo_estado: str = Query(..., enum=["Aprobado", "Rechazado", "Pendiente", "Enviado", "Aceptado", "Revisar"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "aprobar")),
    _sec: User = Depends(verificar_seccion("presupuesto.solicitudes"))
):
    db_obj = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    db_obj.estado = nuevo_estado
    db.commit()
    db.refresh(db_obj)

    return build_solicitud_response(db_obj, db)


@router.patch("/solicitudes/{id_presupuesto}/enviar", response_model=BudgetRequestResponse)
def enviar_solicitud(
    id_presupuesto: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    """El solicitante envía su solicitud (Pendiente -> Enviado)."""
    db_obj = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if db_obj.id_user != current_user.id_user:
        raise HTTPException(status_code=403, detail="Solo el solicitante puede enviar esta solicitud.")
    if db_obj.estado not in ("Pendiente", "Revisar"):
        raise HTTPException(status_code=400, detail="Solo se pueden enviar solicitudes en estado Pendiente o Revisar.")

    db_obj.estado = "Enviado"
    db.commit()
    db.refresh(db_obj)
    return build_solicitud_response(db_obj, db)


@router.delete("/solicitudes/{id_presupuesto}")
def delete_solicitud(
    id_presupuesto: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    db_obj = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == id_presupuesto
    ).first()

    if not db_obj:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Verificar permiso (dueño o rol con acceso total)
    es_admin_o_sostenedor = bool(current_user.rol and current_user.rol.codigo in ROLES_CON_ACCESO_TOTAL)
    if not es_admin_o_sostenedor:
        if db_obj.id_user != current_user.id_user:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")

    # 1. Validación: No se puede eliminar si fue aprobada por el sostenedor/autoridad (salvo roles con acceso total)
    estado_upper = (db_obj.estado or '').strip().upper()
    if estado_upper in ['APROBADO', 'APROBADA', 'APROBADA_SOSTENEDOR'] and not es_admin_o_sostenedor:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar una solicitud que ya ha sido aprobada por el Sostenedor."
        )

    # 2. Validación: No se puede eliminar si ya tiene productos comprados o en proceso por Compras
    detalles = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_presupuesto == id_presupuesto
    ).all()

    detalles_comprados = [
        d for d in detalles
        if (d.estado_compra or '').lower() in ['comprado', 'en proceso', 'recibido'] or d.valor_real_iva is not None
    ]
    if detalles_comprados and not (current_user.rol and current_user.rol.codigo in ['ADM', 'SOS']):
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar la solicitud porque ya posee ítems comprados o en proceso por Compras."
        )

    # Limpiar tablas hijas asociadas a los detalles para evitar restricciones FK
    detalle_ids = [d.id_pre_detalle for d in detalles]
    if detalle_ids:
        db.query(SolicitudModificacionDetalle).filter(
            SolicitudModificacionDetalle.id_pre_detalle.in_(detalle_ids)
        ).delete(synchronize_session=False)

        db.query(ActaEntregaDetalle).filter(
            ActaEntregaDetalle.id_pre_detalle.in_(detalle_ids)
        ).delete(synchronize_session=False)

    # Eliminar actas de entrega directas asociadas a esta solicitud
    db.query(ActaEntrega).filter(
        ActaEntrega.id_presupuesto == id_presupuesto
    ).delete(synchronize_session=False)

    # Eliminar convocatorias asociadas y sus pedidos
    convocatorias = db.query(PreConvocatoria).filter(
        PreConvocatoria.id_presupuesto == id_presupuesto
    ).all()
    for conv in convocatorias:
        db.delete(conv)

    # Eliminar los detalles (recursos) asociados a la solicitud
    detalles_eliminados = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_presupuesto == id_presupuesto
    ).delete(synchronize_session=False)

    db.delete(db_obj)
    db.commit()

    return {
        "message": "Solicitud eliminada",
        "detalles_eliminados": detalles_eliminados
    }


@router.put("/detalles/{id_detalle}", response_model=BudgetDetailResponse)
def update_detalle(
    id_detalle: int,
    obj: BudgetDetailUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    db_obj = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_pre_detalle == id_detalle
    ).first()

    if not db_obj:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")

    # Verificar acceso (dueño, roles con acceso total o sección de Jefe de Compras)
    solicitud = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == db_obj.id_presupuesto
    ).first()
    cargo_nombre = (current_user.cargo.nombre or "").lower() if current_user.cargo else ((current_user.subarea.nombre or "").lower() if current_user.subarea else "")
    cargos_nombres = [(s.nombre or "").lower() for s in (current_user.cargos or current_user.subareas or []) if s.nombre]
    es_jefe_subarea = any(k in cargo_nombre or any(k in s for s in cargos_nombres) for k in ["jefe de compras", "jefe compras", "asistente de compras", "asistente compras"])
    es_jefe_compras = es_jefe_subarea or usuario_puede_seccion(db, current_user, "go_compras.programar_jefe")
    if current_user.rol and current_user.rol.codigo not in ROLES_CON_ACCESO_TOTAL and not es_jefe_compras:
        if not solicitud or solicitud.id_user != current_user.id_user:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")

    update_data = obj.dict(exclude_unset=True)
    if "destino_gasto" in update_data:
        update_data["destino_gasto"] = (
            _destino_canonico(update_data["destino_gasto"]) or update_data["destino_gasto"]
        )
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    # Sincronizar con PME si se actualizó id_actividad
    if obj.id_actividad:
        sync_recurso_actividad(db, obj.id_actividad, db_obj.nombre_producto)
        
    db.commit()
    db.refresh(db_obj)
    return build_detalle_response(db_obj, db=db)


@router.patch("/detalles/{id_detalle}/codigo-contable", response_model=BudgetDetailResponse)
def asignar_codigo_detalle(
    id_detalle: int,
    payload: AsignarCodigoDetalleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "editar"))
):
    """Asignar el código contable (y subvención) a un recurso del presupuesto.
    Usado desde el historial de GO-Compras para los recursos importados de
    convocatoria que llegan sin código."""
    db_obj = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_pre_detalle == id_detalle
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")

    cuenta = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == payload.codigo_cuenta).first()
    if not cuenta:
        raise HTTPException(status_code=400, detail=f"El código de cuenta '{payload.codigo_cuenta}' no existe en la matriz")

    if payload.id_subvencion is not None:
        subv = db.query(Subvencion).filter(Subvencion.id_subvencion == payload.id_subvencion).first()
        if not subv:
            raise HTTPException(status_code=400, detail="La subvención indicada no existe")

    db_obj.codigo_cuenta = payload.codigo_cuenta
    db_obj.id_subvencion = payload.id_subvencion
    db.commit()
    db.refresh(db_obj)
    return build_detalle_response(db_obj, db=db)


@router.patch("/detalles/{id_detalle}/subvencion", response_model=BudgetDetailResponse)
def update_detalle_subvencion(
    id_detalle: int,
    id_subvencion: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "editar"))
):
    db_obj = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_pre_detalle == id_detalle
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")

    subv = db.query(Subvencion).filter(Subvencion.id_subvencion == id_subvencion).first()
    if not subv:
        raise HTTPException(status_code=400, detail="La subvención indicada no existe")

    db_obj.id_subvencion = id_subvencion
    db.commit()
    db.refresh(db_obj)
    return build_detalle_response(db_obj, db=db)


@router.patch("/detalles/{id_detalle}/estado", response_model=BudgetDetailResponse)
def update_detalle_estado(
    id_detalle: int,
    nuevo_estado: str = Query(..., enum=["Aprobado", "Rechazado", "Pendiente", "Sin Revisar", "Aprobado con Ajustes", "Con Ajustes"]),
    comentario: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "aprobar"))
):
    db_obj = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_pre_detalle == id_detalle
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")

    db_obj.estado_aprobacion = nuevo_estado
    if nuevo_estado in ["Rechazado", "Aprobado con Ajustes", "Con Ajustes"]:
        db_obj.comentario_revision = (comentario or "").strip() or None
        db_obj.comentario_revision = (comentario or "").strip() or None
    elif nuevo_estado in ["Pendiente", "Sin Revisar", "Aprobado"]:
        db_obj.comentario_revision = None
    db.commit()
    db.refresh(db_obj)

    return build_detalle_response(db_obj)


@router.delete("/detalles/{id_detalle}")
def delete_detalle(
    id_detalle: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    db_obj = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_pre_detalle == id_detalle
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")
    
    # Verificar que la solicitud pertenece al usuario
    solicitud = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == db_obj.id_presupuesto
    ).first()
    
    if current_user.rol and current_user.rol.codigo not in ROLES_CON_ACCESO_TOTAL:
        if solicitud.id_user != current_user.id_user:
            raise HTTPException(status_code=403, detail="No tienes acceso")

    # Si el detalle apunta a un recurso sugerido (pendiente de aprobación), al
    # eliminarlo revisamos si queda algún otro detalle que lo use. Si no, borramos
    # también el recurso para que desaparezca de 'Recursos Sugeridos' del contralor.
    id_recurso = db_obj.id_recurso
    db.delete(db_obj)
    db.flush()

    if id_recurso:
        recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
        if recurso and recurso.estado == "PENDIENTE_APROBACION":
            otros = db.query(PresupuestoDetalle).filter(
                PresupuestoDetalle.id_recurso == id_recurso
            ).count()
            if otros == 0:
                # El recurso cascada a sus mapeos de subcategoría (delete-orphan).
                db.delete(recurso)

    db.commit()

    return {"message": "Detalle eliminado"}


@router.get("/actividades/buscar", response_model=List[ActividadBuscarResponse])
def buscar_actividades(
    q: str = Query("", description="Texto a buscar"),
    id_presupuesto: Optional[int] = Query(None, description="ID solicitud para obtener su colegio"),
    id_colegio: Optional[int] = Query(None, description="ID colegio del PME"),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    target_colegio_id = id_colegio
    if not target_colegio_id and id_presupuesto:
        sol = db.query(SolicitudPresupuesto).filter(SolicitudPresupuesto.id_presupuesto == id_presupuesto).first()
        if sol and sol.id_colegio:
            target_colegio_id = sol.id_colegio

    if not target_colegio_id:
        target_colegio_id = current_user.id_colegio

    ano_actual = datetime.now().year

    pmes = db.query(PME).filter(
        PME.id_colegio == target_colegio_id,
        PME.year == ano_actual
    ).all()

    if not pmes:
        pmes = db.query(PME).filter(
            PME.id_colegio == target_colegio_id,
            PME.year == ano_actual - 1
        ).all()

    if not pmes:
        return []

    pme_ids = [p.id_pme for p in pmes]
    ano_pme = pmes[0].year
    colegio_obj = pmes[0].colegio or (db.query(Colegio).filter(Colegio.id_colegio == target_colegio_id).first() if target_colegio_id else None)
    colegio_nombre = colegio_obj.nombre if colegio_obj else (current_user.colegio.nombre if current_user.colegio else "")

    query = db.query(Actividad).join(Accion).filter(
        Accion.id_pme.in_(pme_ids)
    )

    if q:
        query = query.filter(
            (Actividad.nombre_actividad.ilike(f"%{q}%")) |
            (Accion.nombre_accion.ilike(f"%{q}%"))
        )

    actividades = query.group_by(Actividad.id_actividad).all()

    return [
        {
            "id": a.id_actividad,
            "nombre": a.nombre_actividad,
            "lista_recursos": a.lista_recursos,
            "dimension": a.dimension,
            "nombre_accion": a.accion.nombre_accion if a.accion else "",
            "ano_pme": ano_pme,
            "colegio_nombre": colegio_nombre
        } for a in actividades
    ]


def _ids_actividades_pme_vigente(db: Session, id_colegio: int) -> tuple:
    """(ids de actividades del PME vigente del colegio, ids de sus PME).

    Misma resolución de año que /actividades/buscar, para que lo que se sugiera
    sea seleccionable en el mismo desplegable."""
    ano_actual = datetime.now().year
    pmes = db.query(PME).filter(PME.id_colegio == id_colegio, PME.year == ano_actual).all()
    if not pmes:
        pmes = db.query(PME).filter(PME.id_colegio == id_colegio, PME.year == ano_actual - 1).all()
    pme_ids = [p.id_pme for p in pmes]
    if not pme_ids:
        return set(), []
    ids = {
        row[0] for row in db.query(Actividad.id_actividad).join(Accion).filter(
            Accion.id_pme.in_(pme_ids)
        ).all()
    }
    return ids, pme_ids


def _actividades_asociadas_a_insumo(
    db: Session,
    id_colegio: int,
    id_recurso: Optional[int],
    nombre: str,
    ids_pme_actual: Optional[set] = None,
    pme_ids: Optional[list] = None,
) -> List[dict]:
    """Actividades PME asociadas a un recurso/insumo, sin usar IA.

    Dos orígenes, en orden de prioridad:
      1. "historial": actividades a las que ya se vinculó este mismo insumo en
         solicitudes del colegio (cualquier estado del ítem salvo "Rechazado", y
         sin importar qué usuario la creó).
      2. "plan_pme": actividades cuyo `lista_recursos` del Plan PME vigente
         nombra este recurso.

    `ids_pme_actual`/`pme_ids` se pueden pasar precalculados para no repetir la
    consulta cuando se resuelven muchos insumos de una sola vez.
    """
    nombre_norm = (nombre or "").strip()
    if not id_recurso and not nombre_norm:
        return []

    if ids_pme_actual is None or pme_ids is None:
        ids_pme_actual, pme_ids = _ids_actividades_pme_vigente(db, id_colegio)

    sugerencias: dict = {}

    # ── 1. Historial de vinculaciones del colegio ────────────────────────────
    condiciones = []
    if id_recurso:
        condiciones.append(PresupuestoDetalle.id_recurso == id_recurso)
    if nombre_norm:
        # Match por nombre además de por id_recurso: un insumo escrito a mano o un
        # recurso nuevo aún sin aprobar no tiene fila en pre_recurso, pero sí quedó
        # registrado con su nombre en solicitudes anteriores. Se compara sin
        # mayúsculas ni espacios de borde porque los nombres cargados traen ambos.
        condiciones.append(
            func.lower(func.trim(PresupuestoDetalle.nombre_producto)) == nombre_norm.lower()
        )

    detalles = db.query(PresupuestoDetalle).join(
        SolicitudPresupuesto,
        SolicitudPresupuesto.id_presupuesto == PresupuestoDetalle.id_presupuesto
    ).options(
        selectinload(PresupuestoDetalle.actividad)
    ).filter(
        SolicitudPresupuesto.id_colegio == id_colegio,
        PresupuestoDetalle.id_actividad.isnot(None),
        PresupuestoDetalle.estado_aprobacion != "Rechazado",
        or_(*condiciones)
    ).order_by(PresupuestoDetalle.id_pre_detalle.asc()).all()

    for d in detalles:
        act = d.actividad
        if not act:
            continue
        item = sugerencias.get(act.id_actividad)
        if not item:
            item = {
                "id_actividad": act.id_actividad,
                "nombre_actividad": act.nombre_actividad,
                "dimension": act.dimension,
                "subdimension": act.subdimension,
                "origen": "historial",
                "veces_usado": 0,
                "ultimo_motivo": None,
                "en_pme_actual": act.id_actividad in ids_pme_actual,
                "en_plan_pme": False
            }
            sugerencias[act.id_actividad] = item
        item["veces_usado"] += 1
        if d.motivo:
            # Recorremos en orden ascendente: queda el motivo más reciente.
            item["ultimo_motivo"] = d.motivo

    # ── 2. Recursos declarados en el Plan PME (lista_recursos) ───────────────
    if pme_ids and nombre_norm:
        objetivo = nombre_norm.lower()
        actividades_plan = db.query(Actividad).join(Accion).filter(
            Accion.id_pme.in_(pme_ids),
            Actividad.lista_recursos.isnot(None)
        ).all()
        for act in actividades_plan:
            tokens = [t.strip().lower() for t in (act.lista_recursos or "").split(",")]
            if objetivo not in tokens:
                continue
            item = sugerencias.get(act.id_actividad)
            if item:
                item["en_plan_pme"] = True
                continue
            sugerencias[act.id_actividad] = {
                "id_actividad": act.id_actividad,
                "nombre_actividad": act.nombre_actividad,
                "dimension": act.dimension,
                "subdimension": act.subdimension,
                "origen": "plan_pme",
                "veces_usado": 0,
                "ultimo_motivo": None,
                "en_pme_actual": True,
                "en_plan_pme": True
            }

    return sorted(
        sugerencias.values(),
        key=lambda s: (
            0 if s["origen"] == "historial" else 1,
            -s["veces_usado"],
            s["nombre_actividad"] or ""
        )
    )


@router.get("/actividades/sugeridas-por-recurso", response_model=List[dict])
def actividades_sugeridas_por_recurso(
    id_recurso: Optional[int] = Query(None, description="Id del recurso del catálogo"),
    nombre: str = Query("", description="Nombre del producto/insumo"),
    id_presupuesto: Optional[int] = Query(None, description="Solicitud para determinar el colegio"),
    id_colegio: Optional[int] = Query(None, description="ID colegio del PME"),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    """Actividades PME asociadas a un recurso/insumo. Alimenta la tarjeta de
    sugerencias del paso 3 (Vinculación Plan PME) al agregar un insumo."""
    target_colegio_id = id_colegio
    if not target_colegio_id and id_presupuesto:
        sol = db.query(SolicitudPresupuesto).filter(SolicitudPresupuesto.id_presupuesto == id_presupuesto).first()
        if sol and sol.id_colegio:
            target_colegio_id = sol.id_colegio

    if not target_colegio_id:
        target_colegio_id = current_user.id_colegio

    return _actividades_asociadas_a_insumo(
        db, target_colegio_id, id_recurso, nombre
    )


# ── Fase 1 del flujo por lote: ordenar el borrador antes de gastar en IA ──────

class InsumoBorradorItem(BaseModel):
    """Una fila del borrador tal como la tiene el formulario en el navegador.
    `fecha_ejecucion` llega como texto para que un borrador con la fecha a medio
    llenar no invalide todo el lote."""
    nombre_producto: str
    descripcion: Optional[str] = None
    motivo: Optional[str] = None
    destino_gasto: Optional[str] = None
    dimension_pme: Optional[str] = None
    codigo_cuenta: Optional[str] = None
    id_recurso: Optional[int] = None
    id_actividad: Optional[int] = None
    cantidad: Optional[float] = None
    valor_unitario_iva: Optional[float] = None
    total_iva: Optional[float] = None
    fecha_ejecucion: Optional[str] = None
    tipo_fecha: Optional[str] = None


class AnalizarLoteRequest(BaseModel):
    items: List[InsumoBorradorItem]


def _clave_grupo(item: InsumoBorradorItem) -> str:
    """Clave de agrupación: nombre + destino + dimensión, normalizados.

    Deliberadamente ignora fecha, cantidad, precio y motivo. Los tres primeros no
    entran al prompt de la asesoría PME, así que no cambian la respuesta; el motivo
    sí entra, pero la IA recibe las actividades sin descripción ni subdimensión y
    discrimina casi solo por nombre del insumo y destino, de modo que dos filas del
    mismo producto con distinto motivo obtendrían la misma sugerencia. Los grupos
    con motivos distintos se marcan (`motivos_distintos`) para poder separarlos."""
    nombre = " ".join((item.nombre_producto or "").lower().split())
    destino = " ".join((item.destino_gasto or "").lower().split())
    dimension = " ".join((item.dimension_pme or "").lower().split())
    return f"{nombre}|{destino}|{dimension}"


@router.post("/insumos/analizar-lote", response_model=dict)
def analizar_lote_insumos(
    obj: AnalizarLoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear")),
):
    """Ordena un borrador de insumos SIN escribir nada y SIN usar IA.

    Por cada grupo de filas equivalentes resuelve:
      · si el insumo ya existe en el catálogo oficial (`pre_recurso`) por nombre
        exacto, o qué recursos parecidos hay (para no duplicar "Agua con gas"
        cuando ya existe "Agua");
      · si ya hay una actividad PME asociada (historial del colegio o
        `lista_recursos` del Plan PME), caso en que no hace falta consultar la IA.

    Devuelve el resumen "N filas → G grupos → R resueltos → P pendientes", que es
    lo que decide cuánto se va a gastar en la asesoría por lote.
    """
    items = obj.items
    if not items:
        return {
            "total_filas": 0, "total_grupos": 0, "filas_repetidas": 0,
            "grupos_resueltos": 0, "grupos_pendientes": 0, "grupos": []
        }

    # ── Catálogo: coincidencia exacta por nombre ──
    nombres = {
        (i.nombre_producto or "").strip().lower()
        for i in items if (i.nombre_producto or "").strip()
    }
    exactos = {}
    if nombres:
        for r in db.query(Recurso).options(selectinload(Recurso.categoria)).filter(
            func.lower(func.trim(Recurso.nombre)).in_(list(nombres)),
            Recurso.estado == "ACTIVO",
        ).all():
            exactos.setdefault(r.nombre.strip().lower(), r)

    # El catálogo completo solo se carga si hay nombres sin coincidencia exacta.
    faltantes = [n for n in nombres if n not in exactos]
    catalogo: List[tuple] = []
    if faltantes:
        catalogo = [
            (r, _tokens_recurso(r.nombre))
            for r in db.query(Recurso).options(selectinload(Recurso.categoria)).filter(
                Recurso.estado == "ACTIVO"
            ).all()
        ]

    # Código contable de cada recurso para los destinos presentes en el borrador.
    # Sirve para saber si dos variantes del mismo insumo ("Archivador Oficio" vs
    # "Ancho") rinden a la misma cuenta: si sí, da igual cuál se elija; si no, la
    # elección cambia la contabilidad y no puede hacerse a ciegas.
    destinos_canon = {d for d in (_destino_canonico(i.destino_gasto) for i in items) if d}
    codigo_por_recurso_destino: dict = {}
    if destinos_canon:
        for mapeo in db.query(MapeoRecursoSubcategoria).options(
            selectinload(MapeoRecursoSubcategoria.subcategoria)
        ).filter(MapeoRecursoSubcategoria.destino_gasto.in_(list(destinos_canon))).all():
            if mapeo.subcategoria:
                codigo_por_recurso_destino.setdefault(
                    (mapeo.id_recurso, mapeo.destino_gasto), mapeo.subcategoria.codigo_cuenta
                )

    def _parecidos(nombre: str, destino_canon: Optional[str]) -> List[dict]:
        tokens = _tokens_recurso(nombre)
        if not tokens:
            return []
        puntuados = []
        for recurso, tks in catalogo:
            comunes = tokens & tks
            if comunes:
                puntuados.append((len(comunes) / len(tokens), recurso))
        puntuados.sort(key=lambda p: (-p[0], p[1].nombre))
        return [
            {
                "id_recurso": r.id_recurso,
                "nombre": r.nombre,
                "categoria_nombre": r.categoria.nombre if r.categoria else None,
                "formato": r.formato,
                "score": round(score, 2),
                "codigo_cuenta": codigo_por_recurso_destino.get((r.id_recurso, destino_canon)),
            }
            for score, r in puntuados[:5]
        ]

    # Recursos ya referenciados por las filas (p. ej. un "parecido" que el usuario
    # eligió en una pasada anterior): se resuelven por id para poder mostrar su
    # nombre, ya que no salen de la coincidencia exacta por nombre.
    ids_en_filas = {i.id_recurso for i in items if i.id_recurso}
    por_id = {}
    if ids_en_filas:
        por_id = {
            r.id_recurso: r
            for r in db.query(Recurso).options(selectinload(Recurso.categoria)).filter(
                Recurso.id_recurso.in_(list(ids_en_filas))
            ).all()
        }

    # PME vigente: se resuelve una sola vez para todo el lote.
    ids_pme_actual, pme_ids = _ids_actividades_pme_vigente(db, current_user.id_colegio)

    # ── Agrupación ──
    grupos: dict = {}
    for idx, item in enumerate(items):
        clave = _clave_grupo(item)
        g = grupos.get(clave)
        if not g:
            g = {
                "grupo_id": clave,
                "nombre_producto": (item.nombre_producto or "").strip(),
                "destino_gasto": item.destino_gasto,
                "dimension_pme": item.dimension_pme,
                "filas": [],
                "periodos": [],
                "motivos": [],
                "total_iva": 0.0,
                "cantidad_total": 0.0,
                "codigos_propios": [],
            }
            grupos[clave] = g
        g["filas"].append(idx)
        g["total_iva"] += float(item.total_iva or 0)
        g["cantidad_total"] += float(item.cantidad or 0)
        periodo = (item.fecha_ejecucion or "")[:7]
        if periodo and periodo not in g["periodos"]:
            g["periodos"].append(periodo)
        motivo = (item.motivo or "").strip()
        if motivo and motivo not in g["motivos"]:
            g["motivos"].append(motivo)
        codigo = (item.codigo_cuenta or "").strip()
        if codigo and codigo not in g["codigos_propios"]:
            g["codigos_propios"].append(codigo)

    # Nombres de las actividades ya referenciadas por el borrador, para poder decir
    # cuál heredan las filas del grupo que aún no la tienen.
    ids_act_en_filas = {i.id_actividad for i in items if i.id_actividad}
    acts_por_id = {}
    if ids_act_en_filas:
        acts_por_id = {
            a.id_actividad: a
            for a in db.query(Actividad).filter(
                Actividad.id_actividad.in_(list(ids_act_en_filas))
            ).all()
        }

    # ── Resolución por grupo ──
    salida = []
    for g in grupos.values():
        primera = items[g["filas"][0]]
        nombre_lower = g["nombre_producto"].lower()
        exacto = exactos.get(nombre_lower)

        # El recurso y la actividad se buscan en TODAS las filas del grupo, no solo en
        # la primera: es normal que una fila ya esté resuelta (se editó a mano) y las
        # demás no. Mirando solo la primera, un grupo ya resuelto se reportaba como
        # "requiere IA" y se volvía a pagar una consulta que ya estaba respondida.
        id_recurso_en_filas = next(
            (items[f].id_recurso for f in g["filas"] if items[f].id_recurso), None
        )
        id_act_en_filas = next(
            (items[f].id_actividad for f in g["filas"] if items[f].id_actividad), None
        )
        filas_sin_actividad = [f for f in g["filas"] if not items[f].id_actividad]

        id_recurso = id_recurso_en_filas or (exacto.id_recurso if exacto else None)
        # El recurso a mostrar: el ya asignado a alguna fila manda sobre la coincidencia
        # exacta, porque puede ser un "parecido" que el usuario eligió a propósito.
        recurso = por_id.get(id_recurso_en_filas) if id_recurso_en_filas else None
        recurso = recurso or exacto

        act_heredada = acts_por_id.get(id_act_en_filas) if id_act_en_filas else None
        destino_canon = _destino_canonico(primera.destino_gasto)
        parecidos = [] if exacto else _parecidos(g["nombre_producto"], destino_canon)
        codigos_parecidos = {p["codigo_cuenta"] for p in parecidos if p["codigo_cuenta"]}

        actividades = _actividades_asociadas_a_insumo(
            db, current_user.id_colegio, id_recurso, g["nombre_producto"],
            ids_pme_actual=ids_pme_actual, pme_ids=pme_ids,
        )
        # Solo sirve sin IA una actividad que se pueda seleccionar en el PME vigente.
        utilizables = [a for a in actividades if a["en_pme_actual"]]

        salida.append({
            **g,
            "cantidad_filas": len(g["filas"]),
            "motivos_distintos": len(g["motivos"]) > 1,
            # Catálogo oficial
            "id_recurso": id_recurso,
            # Solo la coincidencia exacta por nombre: es la que se aplica sin preguntar.
            "recurso_existente": exacto is not None,
            "recurso_nombre_catalogo": recurso.nombre if recurso else None,
            "recurso_categoria_catalogo": (
                recurso.categoria.nombre if recurso and recurso.categoria else None
            ),
            # Sin coincidencia exacta se siguen ofreciendo los parecidos incluso si ya
            # se eligió uno, para poder cambiar la decisión en una segunda pasada.
            "recursos_parecidos": parecidos,
            # La planilla ya trajo código contable: build_detalle_response lo usa con
            # prioridad 1 y nunca consulta el mapeo del recurso, así que para estas
            # filas elegir un recurso del catálogo no cambia nada contable.
            "tiene_codigo_propio": len(g["codigos_propios"]) > 0,
            # Si las variantes rinden a cuentas distintas, elegir "cualquiera" cambia
            # la contabilidad: la decisión deja de ser indiferente.
            "codigos_parecidos_divergen": len(codigos_parecidos) > 1,
            "codigos_parecidos": sorted(codigos_parecidos),
            # PME sin IA
            "ya_vinculado": id_act_en_filas is not None,
            # Actividad que alguna fila del grupo ya tiene: las demás la heredan sin IA.
            "id_actividad_grupo": id_act_en_filas,
            "actividad_grupo_nombre": act_heredada.nombre_actividad if act_heredada else None,
            "actividad_grupo_dimension": act_heredada.dimension if act_heredada else None,
            "filas_sin_actividad": len(filas_sin_actividad),
            "actividades_sugeridas": utilizables,
            # Solo hace falta la IA si NINGUNA fila del grupo tiene actividad y tampoco
            # hay una resuelta por historial o Plan PME.
            "requiere_ia": id_act_en_filas is None and len(utilizables) == 0,
        })

    salida.sort(key=lambda g: (-g["cantidad_filas"], g["nombre_producto"]))
    pendientes = sum(1 for g in salida if g["requiere_ia"])

    return {
        "total_filas": len(items),
        "total_grupos": len(salida),
        "filas_repetidas": len(items) - len(salida),
        "grupos_resueltos": len(salida) - pendientes,
        "grupos_pendientes": pendientes,
        "sin_recurso_catalogo": sum(1 for g in salida if not g["id_recurso"]),
        "con_codigo_propio": sum(1 for g in salida if g["tiene_codigo_propio"]),
        # Tamaño del catálogo de actividades del PME vigente. Es lo que domina el
        # prompt de la asesoría, así que el frontend lo usa para estimar el consumo
        # con el número real del colegio y no con una constante.
        "actividades_pme_vigente": len(ids_pme_actual),
        "grupos": salida,
    }


@router.get("/recursos/buscar", response_model=List[dict])
def buscar_recursos(
    q: str = Query("", description="Texto a buscar"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    query = db.query(Recurso).filter(Recurso.estado == "ACTIVO").join(Recurso.categoria, isouter=True).join(Recurso.grupo, isouter=True).options(selectinload(Recurso.categoria), selectinload(Recurso.grupo))
    
    if q:
        # Dividir los términos de búsqueda para que busque cada término en nombre, descripción, categoría o grupo
        terminos = [t.strip() for t in q.split() if len(t.strip()) >= 2]
        if terminos:
            condiciones = []
            for term in terminos:
                condiciones.append(
                    or_(
                        Recurso.nombre.ilike(f"%{term}%"),
                        Recurso.descripcion.ilike(f"%{term}%"),
                        CategoriaRecurso.nombre.ilike(f"%{term}%"),
                        GrupoRecurso.nombre.ilike(f"%{term}%")
                    )
                )
            query = query.filter(or_(*condiciones))
    
    offset = (page - 1) * limit
    recursos = query.offset(offset).limit(limit).all()
    
    return [{
        "id_recurso": r.id_recurso,
        "nombre": r.nombre,
        "descripcion": r.descripcion,
        "formato": r.formato,
        "categoria_nombre": r.categoria.nombre if r.categoria else None,
        "id_cat_recurso": r.id_cat_recurso,
        "id_grupo_recurso": r.id_grupo_recurso,
        "grupo_nombre": r.grupo.nombre if r.grupo else None
    } for r in recursos]


@router.get("/subvenciones/activas", response_model=List[SubvencionResponse])
def list_subvenciones_activas(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    return db.query(Subvencion).filter(Subvencion.estado == "ACTIVO").all()


@router.get("/subvenciones", response_model=List[SubvencionResponse])
def list_subvenciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    return db.query(Subvencion).all()


@router.post("/subvenciones", response_model=SubvencionResponse, status_code=201)
def create_subvencion(
    payload: SubvencionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    existente = db.query(Subvencion).filter(Subvencion.nombre_corto == payload.nombre_corto.upper()).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe una subvención con este nombre corto")
    nueva = Subvencion(
        nombre_corto=payload.nombre_corto.upper(),
        nombre_completo=payload.nombre_completo,
        estado=payload.estado
    )
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


@router.put("/subvenciones/{id_subvencion}", response_model=SubvencionResponse)
def update_subvencion(
    id_subvencion: int,
    payload: SubvencionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    sub = db.query(Subvencion).filter(Subvencion.id_subvencion == id_subvencion).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subvención no encontrada")
    sub.nombre_corto = payload.nombre_corto.upper()
    sub.nombre_completo = payload.nombre_completo
    sub.estado = payload.estado
    db.commit()
    db.refresh(sub)
    return sub


# ============================================================
# CÓDIGO CONTABLE POR ACTIVIDAD (PME)
# Una actividad engloba todos los recursos de una compra y se rinde
# bajo un único código de cuenta + subvención. Es único por actividad.
# ============================================================

def _serializar_actividad_codigo(reg: ActividadCodigoContable) -> dict:
    return {
        "id_actividad_codigo": reg.id_actividad_codigo,
        "id_actividad": reg.id_actividad,
        "codigo_cuenta": reg.codigo_cuenta,
        "id_subvencion": reg.id_subvencion,
        "es_principal": bool(getattr(reg, 'es_principal', False)),
        "fecha": reg.fecha,
        "comentario": reg.comentario,
        "estado": reg.estado,
        "nombre_cuenta": reg.cuenta.nombre if reg.cuenta else None,
        "nombre_subvencion": reg.subvencion.nombre_corto if reg.subvencion else None,
        "nombre_actividad": reg.actividad.nombre_actividad if reg.actividad else None,
    }


@router.get("/actividades/{id_actividad}/codigos-contables", response_model=List[ActividadCodigoContableResponse])
def list_actividad_codigos_contables(
    id_actividad: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    regs = db.query(ActividadCodigoContable).filter(
        ActividadCodigoContable.id_actividad == id_actividad
    ).order_by(ActividadCodigoContable.es_principal.desc(), ActividadCodigoContable.id_actividad_codigo.asc()).all()
    return [_serializar_actividad_codigo(r) for r in regs]


@router.put("/actividades/{id_actividad}/codigos-contables", response_model=List[ActividadCodigoContableResponse])
def batch_upsert_actividad_codigos_contables(
    id_actividad: int,
    payload: ActividadCodigosBatchUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    actividad = db.query(Actividad).filter(Actividad.id_actividad == id_actividad).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    # Eliminar previos
    db.query(ActividadCodigoContable).filter(ActividadCodigoContable.id_actividad == id_actividad).delete(synchronize_session=False)

    nuevos_regs = []
    tiene_principal = any(c.es_principal for c in payload.codigos)
    vistos = set()
    for idx, item in enumerate(payload.codigos):
        cod_str = str(item.codigo_cuenta).strip()
        if not cod_str or cod_str in vistos:
            continue
        vistos.add(cod_str)
        es_p = item.es_principal
        if not tiene_principal and idx == 0:
            es_p = True
            tiene_principal = True

        reg = ActividadCodigoContable(
            id_actividad=id_actividad,
            codigo_cuenta=cod_str,
            id_subvencion=item.id_subvencion,
            es_principal=es_p,
            comentario=item.comentario,
            estado=item.estado or "Pendiente"
        )
        db.add(reg)
        nuevos_regs.append(reg)

    db.commit()
    for r in nuevos_regs:
        db.refresh(r)

    return [_serializar_actividad_codigo(r) for r in nuevos_regs]


@router.get("/actividades/{id_actividad}/codigo-contable", response_model=Optional[ActividadCodigoContableResponse])
def get_actividad_codigo_contable(
    id_actividad: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    reg = db.query(ActividadCodigoContable).filter(
        ActividadCodigoContable.id_actividad == id_actividad
    ).order_by(ActividadCodigoContable.es_principal.desc()).first()
    if not reg:
        return None
    return _serializar_actividad_codigo(reg)


@router.put("/actividades/{id_actividad}/codigo-contable", response_model=ActividadCodigoContableResponse)
def upsert_actividad_codigo_contable(
    id_actividad: int,
    payload: ActividadCodigoContableUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    actividad = db.query(Actividad).filter(Actividad.id_actividad == id_actividad).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    cuenta = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == payload.codigo_cuenta).first()
    if not cuenta:
        raise HTTPException(status_code=400, detail=f"El código de cuenta '{payload.codigo_cuenta}' no existe en la matriz")

    if payload.id_subvencion:
        subvencion = db.query(Subvencion).filter(Subvencion.id_subvencion == payload.id_subvencion).first()
        if not subvencion:
            raise HTTPException(status_code=400, detail="La subvención indicada no existe")

    # Si se marca como principal, desmarcar otros principales de la actividad
    if payload.es_principal:
        db.query(ActividadCodigoContable).filter(
            ActividadCodigoContable.id_actividad == id_actividad,
            ActividadCodigoContable.codigo_cuenta != payload.codigo_cuenta
        ).update({"es_principal": False})

    reg = db.query(ActividadCodigoContable).filter(
        ActividadCodigoContable.id_actividad == id_actividad,
        ActividadCodigoContable.codigo_cuenta == payload.codigo_cuenta
    ).first()

    if reg:
        reg.id_subvencion = payload.id_subvencion
        reg.es_principal = payload.es_principal
        reg.comentario = payload.comentario
        reg.estado = payload.estado
        reg.fecha = datetime.utcnow()
    else:
        # Si no había ningún otro registro, hacerlo principal por defecto
        existentes = db.query(ActividadCodigoContable).filter(ActividadCodigoContable.id_actividad == id_actividad).count()
        es_p = payload.es_principal or (existentes == 0)

        reg = ActividadCodigoContable(
            id_actividad=id_actividad,
            codigo_cuenta=payload.codigo_cuenta,
            id_subvencion=payload.id_subvencion,
            es_principal=es_p,
            comentario=payload.comentario,
            estado=payload.estado
        )
        db.add(reg)

    db.commit()
    db.refresh(reg)
    return _serializar_actividad_codigo(reg)


@router.delete("/actividades/{id_actividad}/codigo-contable")
def delete_actividad_codigo_contable(
    id_actividad: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    regs = db.query(ActividadCodigoContable).filter(
        ActividadCodigoContable.id_actividad == id_actividad
    ).all()
    if not regs:
        raise HTTPException(status_code=404, detail="La actividad no tiene código contable asignado")

    for r in regs:
        db.delete(r)
    db.commit()
    return {"message": "Códigos contables de la actividad eliminados"}


@router.get("/recursos/{id_recurso}/resolucion", response_model=ResolucionSubcategoriaResponse)
def resolver_subcategoria(
    id_recurso: int,
    destino: str = Query(..., description="Destino del gasto"),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    mapeo = db.query(MapeoRecursoSubcategoria).filter(
        MapeoRecursoSubcategoria.id_recurso == id_recurso,
        MapeoRecursoSubcategoria.destino_gasto == destino
    ).first()

    if not mapeo:
        raise HTTPException(
            status_code=404, 
            detail=f"No se encontró subcategoría contable para este recurso con el destino '{destino}'"
        )
    
    subcat = db.query(SubcategoriaRecurso).filter(
        SubcategoriaRecurso.id_subcat_recurso == mapeo.id_subcat_recurso
    ).first()

    if not subcat:
        raise HTTPException(
            status_code=404,
            detail="Subcategoría asociada no encontrada"
        )

    return {
        "codigo_cuenta": subcat.codigo_cuenta,
        "nombre": subcat.nombre
    }


@router.get("/grupos-recurso", response_model=List[GrupoRecursoResponse])
def list_grupos_recurso(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    return db.query(GrupoRecurso).all()


@router.post("/grupos-recurso", response_model=GrupoRecursoResponse)
def create_grupo_recurso(
    obj: GrupoRecursoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    ex = db.query(GrupoRecurso).filter(
        func.lower(GrupoRecurso.nombre) == obj.nombre.lower()
    ).first()
    if ex:
        return ex
    db_obj = GrupoRecurso(**obj.dict())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.put("/grupos-recurso/{id_grupo_recurso}", response_model=GrupoRecursoResponse)
def update_grupo_recurso(
    id_grupo_recurso: int,
    obj: GrupoRecursoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "editar"))
):
    grupo = db.query(GrupoRecurso).filter(GrupoRecurso.id_grupo_recurso == id_grupo_recurso).first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    
    ex = db.query(GrupoRecurso).filter(
        func.lower(GrupoRecurso.nombre) == obj.nombre.lower(),
        GrupoRecurso.id_grupo_recurso != id_grupo_recurso
    ).first()
    if ex:
        raise HTTPException(status_code=400, detail="Ya existe un grupo con este nombre")
        
    grupo.nombre = obj.nombre
    grupo.descripcion = obj.descripcion
    db.commit()
    db.refresh(grupo)
    return grupo


class BulkDeleteGruposRequest(BaseModel):
    ids: List[int]


@router.delete("/grupos-recurso/{id_grupo_recurso}")
def delete_grupo_recurso(
    id_grupo_recurso: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    grupo = db.query(GrupoRecurso).filter(GrupoRecurso.id_grupo_recurso == id_grupo_recurso).first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    
    # Desvincular recursos antes de eliminar el grupo para evitar error de FK y permitir la eliminación
    db.query(Recurso).filter(Recurso.id_grupo_recurso == id_grupo_recurso).update(
        {Recurso.id_grupo_recurso: None},
        synchronize_session=False
    )
        
    db.delete(grupo)
    db.commit()
    return {"message": "Grupo de recursos eliminado"}


@router.post("/grupos-recurso/bulk-delete")
def bulk_delete_grupos_recurso(
    data: BulkDeleteGruposRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    if not data.ids:
        return {"eliminados": 0}
    
    # Desvincular recursos de los grupos seleccionados
    db.query(Recurso).filter(Recurso.id_grupo_recurso.in_(data.ids)).update(
        {Recurso.id_grupo_recurso: None},
        synchronize_session=False
    )
    
    count = db.query(GrupoRecurso).filter(GrupoRecurso.id_grupo_recurso.in_(data.ids)).delete(synchronize_session=False)
    db.commit()
    return {"eliminados": count}


@router.get("/recursos", response_model=List[ResourceResponse])
def list_recursos(
    response: Response,
    search: Optional[str] = Query(None, description="Texto de búsqueda"),
    page: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    query = db.query(Recurso).filter(Recurso.estado == "ACTIVO").join(Recurso.categoria, isouter=True).options(
        selectinload(Recurso.grupo),
        selectinload(Recurso.categoria),
        selectinload(Recurso.mapeos_subcategorias).selectinload(MapeoRecursoSubcategoria.subcategoria)
    )
    
    if search:
        query = query.filter(
            or_(
                Recurso.nombre.ilike(f"%{search}%"),
                Recurso.descripcion.ilike(f"%{search}%"),
                CategoriaRecurso.nombre.ilike(f"%{search}%")
            )
        )
        
    total = query.count()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    
    if page is not None and limit is not None:
        offset = (page - 1) * limit
        query = query.offset(offset).limit(limit)
        
    recursos = query.all()
    
    res = []
    for r in recursos:
        codigos = list(dict.fromkeys([m.subcategoria.codigo_cuenta for m in r.mapeos_subcategorias if m.subcategoria and m.subcategoria.codigo_cuenta]))
        res.append({
            "id_recurso": r.id_recurso,
            "nombre": r.nombre,
            "descripcion": r.descripcion,
            "formato": r.formato,
            "id_grupo_recurso": r.id_grupo_recurso,
            "grupo_nombre": r.grupo.nombre if r.grupo else None,
            "id_cat_recurso": r.id_cat_recurso,
            "categoria_nombre": r.categoria.nombre if r.categoria else None,
            "categoria_descripcion": r.categoria.descripcion if r.categoria else None,
            "codigos_contables": codigos
        })
    return res



@router.post("/recursos", response_model=ResourceResponse)
def create_recurso(
    obj: RecursoCreateFull,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    recurso_existente = db.query(Recurso).filter(
        func.lower(Recurso.nombre) == obj.nombre.lower()
    ).first()
    
    if recurso_existente:
        raise HTTPException(
            status_code=400, 
            detail="Ya existe un recurso con este nombre. Utilice el recurso existente o elija otro nombre."
        )
    
    db_obj = Recurso(**obj.dict())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    return {
        "id_recurso": db_obj.id_recurso,
        "nombre": db_obj.nombre,
        "descripcion": db_obj.descripcion,
        "formato": db_obj.formato,
        "id_grupo_recurso": db_obj.id_grupo_recurso,
        "grupo_nombre": db_obj.grupo.nombre if db_obj.grupo else None,
        "id_cat_recurso": db_obj.id_cat_recurso,
        "categoria_nombre": db_obj.categoria.nombre if db_obj.categoria else None,
        "categoria_descripcion": db_obj.categoria.descripcion if db_obj.categoria else None
    }


@router.put("/recursos/{id_recurso}", response_model=ResourceResponse)
def update_recurso(
    id_recurso: int,
    obj: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "editar"))
):
    recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    
    if "nombre" in obj and obj["nombre"]:
        recurso.nombre = obj["nombre"]
    if "descripcion" in obj:
        recurso.descripcion = obj["descripcion"]
    if "formato" in obj:
        recurso.formato = obj["formato"]
    if "id_grupo_recurso" in obj:
        recurso.id_grupo_recurso = obj["id_grupo_recurso"]
    if "id_cat_recurso" in obj:
        recurso.id_cat_recurso = obj["id_cat_recurso"]
    
    # Actualizar campos de detalle si vienen presentes
    motivo = obj.get("motivo")
    id_actividad = obj.get("id_actividad")
    if motivo is not None or id_actividad is not None:
        detalles = db.query(PresupuestoDetalle).filter(PresupuestoDetalle.id_recurso == id_recurso).all()
        for d in detalles:
            if motivo is not None:
                d.motivo = motivo
            if id_actividad is not None:
                d.id_actividad = id_actividad
    
    db.commit()
    db.refresh(recurso)
    
    return {
        "id_recurso": recurso.id_recurso,
        "nombre": recurso.nombre,
        "descripcion": recurso.descripcion,
        "formato": recurso.formato,
        "id_grupo_recurso": recurso.id_grupo_recurso,
        "grupo_nombre": recurso.grupo.nombre if recurso.grupo else None,
        "id_cat_recurso": recurso.id_cat_recurso,
        "categoria_nombre": recurso.categoria.nombre if recurso.categoria else None,
        "categoria_descripcion": recurso.categoria.descripcion if recurso.categoria else None
    }


@router.delete("/recursos/eliminar-todos")
def delete_all_recursos(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    # Solo eliminar recursos que no estén asociados a detalles de presupuesto
    from sqlalchemy import not_
    recursos_con_detalles = db.query(PresupuestoDetalle.id_recurso).filter(
        PresupuestoDetalle.id_recurso.isnot(None)
    ).distinct().subquery()

    recursos_a_eliminar = db.query(Recurso).filter(
        Recurso.id_recurso.notin_(recursos_con_detalles)
    ).all()

    total = len(recursos_a_eliminar)
    for r in recursos_a_eliminar:
        db.delete(r)

    db.commit()
    return {"message": f"{total} recursos eliminados", "eliminados": total}


@router.delete("/recursos/{id_recurso}/sugerido")
def delete_recurso_sugerido(
    id_recurso: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    """Descarta un recurso sugerido (PENDIENTE_APROBACION) desde 'Recursos
    Sugeridos' del contralor. Es un soft delete: el recurso sale de la bandeja
    de sugerencias (pasa a estado DESCARTADO) pero el/los detalles de presupuesto
    que lo solicitaron PERMANECEN en su presupuesto. Solo aplica a recursos en
    estado PENDIENTE_APROBACION para no afectar el catálogo activo."""
    recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")

    if recurso.estado != "PENDIENTE_APROBACION":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden descartar aquí recursos sugeridos (pendientes de aprobación)."
        )

    recurso.estado = "DESCARTADO"
    db.commit()
    return {"message": "Recurso sugerido descartado de la bandeja del contralor"}


@router.delete("/recursos/{id_recurso}")
def delete_recurso(
    id_recurso: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    
    detalles_count = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_recurso == id_recurso
    ).count()
    if detalles_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"No se puede eliminar. Hay {detalles_count} detalles de presupuesto asociados"
        )
    
    db.delete(recurso)
    db.commit()
    return {"message": "Recurso eliminado"}



@router.get("/categoria-recurso", response_model=List[CategoriaRecursoResponse])
def list_categorias(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    return db.query(CategoriaRecurso).filter(CategoriaRecurso.estado == "Activo").all()


@router.post("/categoria-recurso", response_model=CategoriaRecursoResponse)
def create_categoria(
    obj: CategoriaRecursoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    data = obj.dict()
    data["destino_gasto"] = ", ".join(data["destino_gasto"])
    db_obj = CategoriaRecurso(**data)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.put("/categoria-recurso/{id_cat_recurso}", response_model=CategoriaRecursoResponse)
def update_categoria(
    id_cat_recurso: int,
    obj: CategoriaRecursoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "editar"))
):
    categoria = db.query(CategoriaRecurso).filter(
        CategoriaRecurso.id_cat_recurso == id_cat_recurso
    ).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    categoria.nombre = obj.nombre
    categoria.codigo_contable = obj.codigo_contable
    categoria.descripcion = obj.descripcion
    categoria.estado = obj.estado
    categoria.destino_gasto = ", ".join(obj.destino_gasto)

    db.commit()
    db.refresh(categoria)
    return categoria


class BulkDeleteCategoriasRequest(BaseModel):
    ids: List[int]


@router.delete("/categoria-recurso/{id_cat_recurso}")
def delete_categoria(
    id_cat_recurso: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    categoria = db.query(CategoriaRecurso).filter(
        CategoriaRecurso.id_cat_recurso == id_cat_recurso
    ).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Desvincular recursos asociados antes de borrar la categoría
    db.query(Recurso).filter(
        Recurso.id_cat_recurso == id_cat_recurso
    ).update({Recurso.id_cat_recurso: None}, synchronize_session=False)

    # Eliminar los códigos contables asociados antes de borrar la categoría (evita fallo de FK)
    db.query(CategoriaCodigoContable).filter(
        CategoriaCodigoContable.id_cat_recurso == id_cat_recurso
    ).delete(synchronize_session=False)

    db.delete(categoria)
    db.commit()
    return {"message": "Categoría eliminada"}


@router.post("/categoria-recurso/bulk-delete")
def bulk_delete_categorias_recurso(
    data: BulkDeleteCategoriasRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    if not data.ids:
        return {"eliminados": 0}
    
    # Desvincular recursos
    db.query(Recurso).filter(Recurso.id_cat_recurso.in_(data.ids)).update(
        {Recurso.id_cat_recurso: None},
        synchronize_session=False
    )
    
    # Eliminar códigos contables asociados
    db.query(CategoriaCodigoContable).filter(
        CategoriaCodigoContable.id_cat_recurso.in_(data.ids)
    ).delete(synchronize_session=False)
    
    count = db.query(CategoriaRecurso).filter(CategoriaRecurso.id_cat_recurso.in_(data.ids)).delete(synchronize_session=False)
    db.commit()
    return {"eliminados": count}


@router.get("/categoria-recurso/{id_cat_recurso}/codigos", response_model=List[CatCodigoResponse])
def get_codigos_categoria(
    id_cat_recurso: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    rows = db.query(CategoriaCodigoContable).filter(
        CategoriaCodigoContable.id_cat_recurso == id_cat_recurso
    ).all()
    result = []
    for r in rows:
        cuenta = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == r.codigo_cuenta).first()
        result.append(CatCodigoResponse(
            id=r.id,
            categoria_pilar=r.categoria_pilar,
            codigo_cuenta=r.codigo_cuenta,
            subvencion=r.subvencion,
            nombre_cuenta=cuenta.nombre if cuenta else None
        ))
    return result


@router.post("/categoria-recurso/{id_cat_recurso}/codigos", status_code=201)
def add_codigo_categoria(
    id_cat_recurso: int,
    payload: CatCodigoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    if not db.query(CategoriaRecurso).filter(CategoriaRecurso.id_cat_recurso == id_cat_recurso).first():
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if not db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == payload.codigo_cuenta).first():
        raise HTTPException(status_code=404, detail="Código contable no existe")
    nuevo = CategoriaCodigoContable(
        id_cat_recurso=id_cat_recurso,
        categoria_pilar=payload.categoria_pilar,
        codigo_cuenta=payload.codigo_cuenta,
        subvencion=payload.subvencion,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return {"id": nuevo.id, "ok": True}


@router.delete("/categoria-recurso/{id_cat_recurso}/codigos/{codigo_id}", status_code=200)
def delete_codigo_categoria(
    id_cat_recurso: int,
    codigo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    row = db.query(CategoriaCodigoContable).filter(
        CategoriaCodigoContable.id == codigo_id,
        CategoriaCodigoContable.id_cat_recurso == id_cat_recurso
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Código no encontrado")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/contabilidad", response_model=List[ContabilidadResponse])
def list_contabilidad(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    id_colegio: Optional[int] = Query(None)
):
    query = db.query(Contabilidad)
    
    id_colegio_target = id_colegio or current_user.id_colegio
    if id_colegio_target:
        query = query.filter(Contabilidad.id_colegio == id_colegio_target)
        
    items = query.all()
    results = []
    
    for item in items:
        # Sumar únicamente los montos reales de ítems efectivamente comprados/adjudicados (valor_real_iva no nulo)
        q_exec = db.query(
            func.sum(PresupuestoDetalle.valor_real_iva)
        ).join(
            SolicitudPresupuesto,
            PresupuestoDetalle.id_presupuesto == SolicitudPresupuesto.id_presupuesto
        ).filter(
            SolicitudPresupuesto.id_colegio == item.id_colegio,
            SolicitudPresupuesto.estado.in_(["Aprobado", "Aceptado"]),
            PresupuestoDetalle.estado_aprobacion.in_(["Aprobado", "Aceptado"]),
            PresupuestoDetalle.valor_real_iva.isnot(None)
        )

        codigo_display = item.codigo
        centro_display = item.centro_costo

        # Si el centro es un presupuesto de área (PPTO_AREA_X_Y)
        if item.codigo and item.codigo.startswith("PPTO_AREA_"):
            parts = item.codigo.split("_")
            if len(parts) >= 4:
                try:
                    id_area = int(parts[3])
                    from app.models import Area, Subarea
                    area_obj = db.query(Area).filter(Area.id_area == id_area).first()
                    if area_obj:
                        codigo_display = f"ÁREA {area_obj.prefijo or area_obj.nombre.upper()}"
                    # Filtrar compras asociadas a los usuarios/cargos de esta área
                    q_exec = q_exec.join(Cargo, SolicitudPresupuesto.id_cargo == Cargo.id_cargo).filter(Cargo.id_area == id_area)
                except ValueError:
                    pass
        elif item.codigo in ["SEP", "PIE", "MANTENIMIENTO", "PRO_RETENCION", "SUBV_GENERAL", "Colegio"]:
            # Filtrar compras por la subvención específica
            from app.models import Subvencion
            subv_obj = db.query(Subvencion).filter(Subvencion.nombre_corto == item.codigo).first()
            if subv_obj:
                q_exec = q_exec.filter(PresupuestoDetalle.id_subvencion == subv_obj.id_subvencion)

        executed = q_exec.scalar() or 0

        # Agregar nombre del colegio si el usuario puede ver múltiples o para mayor claridad
        if item.colegio:
            centro_display = f"{centro_display} — {item.colegio.nombre}"
            
        results.append({
            "id_contabilidad": item.id_contabilidad,
            "id_colegio": item.id_colegio,
            "codigo": codigo_display,
            "centro_costo": centro_display,
            "presupuesto_asignado": item.presupuesto_asignado,
            "ejecutado": float(executed),
            "disponible": item.presupuesto_asignado - float(executed)
        })
        
    return results


@router.post("/contabilidad", response_model=ContabilidadResponse)
def create_contabilidad(
    obj: ContabilidadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    db_obj = Contabilidad(**obj.dict())
    if not db_obj.id_colegio:
        db_obj.id_colegio = current_user.id_colegio
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return {**db_obj.__dict__, "ejecutado": 0, "disponible": db_obj.presupuesto_asignado}


@router.put("/contabilidad/{id_contabilidad}", response_model=ContabilidadResponse)
def update_contabilidad(
    id_contabilidad: int,
    obj: ContabilidadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "modificar"))
):
    db_obj = db.query(Contabilidad).filter(
        Contabilidad.id_contabilidad == id_contabilidad
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Centro de costo no encontrado")
    
    db_obj.codigo = obj.codigo
    db_obj.centro_costo = obj.centro_costo
    db_obj.presupuesto_asignado = obj.presupuesto_asignado
    db.commit()
    db.refresh(db_obj)
    
    executed = db.query(func.sum(PresupuestoDetalle.total_iva)).join(
        SolicitudPresupuesto
    ).filter(
        SolicitudPresupuesto.estado == "Aprobado"
    ).scalar() or 0
    disponible = db_obj.presupuesto_asignado - float(executed)
    return {**db_obj.__dict__, "ejecutado": float(executed), "disponible": disponible}


@router.delete("/contabilidad/{id_contabilidad}")
def delete_contabilidad(
    id_contabilidad: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "eliminar"))
):
    db_obj = db.query(Contabilidad).filter(
        Contabilidad.id_contabilidad == id_contabilidad
    ).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Centro de costo no encontrado")
    
    db.delete(db_obj)
    db.commit()
    return {"message": "Centro de costo eliminado"}


_DESTINO_LABEL = {
    'ESTUDIANTE': 'estudiantes',
    'DOCENTE': 'docentes',
    'ADMINISTRATIVO': 'uso administrativo',
    'COMUNIDAD': 'actividades comunitarias',
    'GENERAL': 'uso general',
}
_TRANS_LABEL = {
    'COMPRA': 'Compra',
    'ARRIENDO': 'Arriendo',
    'MANTENCION': 'Servicio / Mantención',
}
_SUBV_LABEL = {
    'SEP': 'Fondo SEP',
    'PIE': 'Fondo PIE',
    'GENERAL': 'Subvención General',
    'PRO_RETENCION': 'Pro Retención',
}


@router.post("/recursos/sugerir", response_model=ResourceResponse)
def api_sugerir_recurso(
    req: SugerirRecursoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    # Verificar si ya existe por nombre
    existing = db.query(Recurso).filter(func.lower(Recurso.nombre) == req.nombre.lower()).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Ya existe un recurso con ese nombre."
        )
        
    db_recurso = Recurso(
        nombre=req.nombre,
        descripcion=f"Recurso propuesto por {current_user.nombre}: {req.descripcion_solicitud}",
        formato="Unidad",
        id_cat_recurso=req.id_cat_recurso,
        id_grupo_recurso=req.id_grupo_recurso,
        estado="PENDIENTE_APROBACION",
        id_solicitante=current_user.id_user,
        descripcion_solicitud=req.descripcion_solicitud
    )
    db.add(db_recurso)
    db.commit()
    db.refresh(db_recurso)
    
    return {
        "id_recurso": db_recurso.id_recurso,
        "nombre": db_recurso.nombre,
        "descripcion": db_recurso.descripcion,
        "formato": db_recurso.formato,
        "id_cat_recurso": db_recurso.id_cat_recurso,
        "categoria_nombre": db_recurso.categoria.nombre if db_recurso.categoria else None,
        "categoria_descripcion": db_recurso.categoria.descripcion if db_recurso.categoria else None
    }


class RecursoASugerir(BaseModel):
    """`ref` es el identificador que puso el cliente (índice del grupo) y vuelve en la
    respuesta, para poder escribir el id_recurso creado en las filas correctas."""
    ref: int
    nombre: str
    descripcion_solicitud: Optional[str] = None
    formato: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    id_grupo_recurso: Optional[int] = None


class SugerirRecursosLoteRequest(BaseModel):
    recursos: List[RecursoASugerir]


@router.post("/recursos/sugerir-lote", response_model=dict)
def sugerir_recursos_lote(
    obj: SugerirRecursosLoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear")),
):
    """Crea varios recursos como PENDIENTE_APROBACION de una sola vez.

    Versión por lote de /recursos/sugerir, para los insumos de un borrador que no
    existen en el catálogo oficial. Si el nombre ya existe se REUTILIZA el recurso en
    vez de fallar: entre el análisis y la creación alguien pudo haberlo dado de alta,
    y duplicar el catálogo es peor que reutilizar.
    """
    if not obj.recursos:
        return {"creados": [], "reutilizados": [], "omitidos": []}

    nombres = {r.nombre.strip().lower() for r in obj.recursos if r.nombre.strip()}
    existentes = {}
    if nombres:
        for r in db.query(Recurso).filter(
            func.lower(func.trim(Recurso.nombre)).in_(list(nombres))
        ).all():
            existentes.setdefault(r.nombre.strip().lower(), r)

    creados, reutilizados, omitidos = [], [], []
    vistos: dict = {}

    for item in obj.recursos:
        nombre = (item.nombre or "").strip()
        if not nombre:
            omitidos.append({"ref": item.ref, "motivo": "nombre vacío"})
            continue
        clave = nombre.lower()

        # Mismo nombre repetido dentro del propio lote: se crea una sola vez.
        if clave in vistos:
            reutilizados.append({"ref": item.ref, "id_recurso": vistos[clave], "nombre": nombre})
            continue

        ya = existentes.get(clave)
        if ya:
            vistos[clave] = ya.id_recurso
            reutilizados.append({"ref": item.ref, "id_recurso": ya.id_recurso, "nombre": ya.nombre})
            continue

        db_recurso = Recurso(
            nombre=nombre,
            descripcion=f"Recurso propuesto por {current_user.nombre}: {item.descripcion_solicitud or nombre}",
            formato=item.formato or "Unidad",
            id_cat_recurso=item.id_cat_recurso,
            id_grupo_recurso=item.id_grupo_recurso,
            estado="PENDIENTE_APROBACION",
            id_solicitante=current_user.id_user,
            descripcion_solicitud=item.descripcion_solicitud,
        )
        db.add(db_recurso)
        db.flush()   # para obtener el id sin cerrar la transacción del lote
        vistos[clave] = db_recurso.id_recurso
        creados.append({"ref": item.ref, "id_recurso": db_recurso.id_recurso, "nombre": nombre})

    db.commit()
    return {"creados": creados, "reutilizados": reutilizados, "omitidos": omitidos}


@router.get("/recursos/pendientes", response_model=List[dict])
def list_recursos_pendientes(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    from sqlalchemy.orm import selectinload as sl
    recursos = db.query(Recurso).options(
        sl(Recurso.solicitante).selectinload(User.cargo).selectinload(Cargo.area),
        sl(Recurso.solicitante).selectinload(User.rol),
        sl(Recurso.categoria),
        sl(Recurso.grupo)
    ).filter(Recurso.estado == "PENDIENTE_APROBACION").all()

    # Destino, subvención, motivo y actividad PME que eligió el solicitante (en el detalle de presupuesto asociado).
    ids = [r.id_recurso for r in recursos]
    info_por_recurso = {}
    if ids:
        detalles = db.query(PresupuestoDetalle).options(
            sl(PresupuestoDetalle.subvencion),
            sl(PresupuestoDetalle.actividad)
        ).filter(
            PresupuestoDetalle.id_recurso.in_(ids)
        ).order_by(PresupuestoDetalle.id_pre_detalle.asc()).all()
        for d in detalles:
            info_por_recurso[d.id_recurso] = {
                "id_pre_detalle": d.id_pre_detalle,
                "destino_gasto": d.destino_gasto,
                "subvencion_codigo": d.subvencion.nombre_corto if d.subvencion else None,
                "motivo": d.motivo,
                "id_actividad": d.id_actividad,
                "actividad_nombre": d.actividad.nombre_actividad if d.actividad else None,
                "dimension": d.actividad.dimension if d.actividad else None,
                "actividad_descripcion": d.actividad.descripcion if d.actividad else None,
                "actividad_recursos": d.actividad.lista_recursos if d.actividad else None,
                "nombre_accion": d.actividad.accion.nombre_accion if (d.actividad and d.actividad.accion) else None
            }

    return [{
        "id_recurso": r.id_recurso,
        "id_pre_detalle": info_por_recurso.get(r.id_recurso, {}).get("id_pre_detalle"),
        "nombre": r.nombre,
        "descripcion": r.descripcion,
        "descripcion_solicitud": r.descripcion_solicitud,
        "tipo": "SERVICIO" if r.nombre and ("servicio" in r.nombre.lower() or "arriendo" in r.nombre.lower()) else "BIEN",
        "formato": r.formato or "unidad",
        "solicitante_nombre": r.solicitante.nombre if r.solicitante else "Desconocido",
        "solicitante_area": r.solicitante.subarea.area.nombre if (r.solicitante and r.solicitante.subarea and r.solicitante.subarea.area) else None,
        "solicitante_subarea": r.solicitante.subarea.nombre if (r.solicitante and r.solicitante.subarea) else None,
        "solicitante_cargo": r.solicitante.rol.nombre if (r.solicitante and r.solicitante.rol) else None,
        "id_cat_recurso": r.id_cat_recurso,
        "categoria_nombre": r.categoria.nombre if r.categoria else None,
        "id_grupo_recurso": r.id_grupo_recurso,
        "grupo_nombre": r.grupo.nombre if r.grupo else None,
        "destino_gasto": info_por_recurso.get(r.id_recurso, {}).get("destino_gasto"),
        "subvencion_codigo": info_por_recurso.get(r.id_recurso, {}).get("subvencion_codigo"),
        "motivo": info_por_recurso.get(r.id_recurso, {}).get("motivo"),
        "id_actividad": info_por_recurso.get(r.id_recurso, {}).get("id_actividad"),
        "actividad_nombre": info_por_recurso.get(r.id_recurso, {}).get("actividad_nombre"),
        "dimension": info_por_recurso.get(r.id_recurso, {}).get("dimension"),
        "actividad_descripcion": info_por_recurso.get(r.id_recurso, {}).get("actividad_descripcion"),
        "actividad_recursos": info_por_recurso.get(r.id_recurso, {}).get("actividad_recursos"),
        "nombre_accion": info_por_recurso.get(r.id_recurso, {}).get("nombre_accion"),
    } for r in recursos]


@router.post("/sugerir-cuenta")
def sugerir_cuenta_contable(
    req: SugerirCuentaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    destino_map = {
        'ESTUDIANTE': 'clases(alumno)',
        'DOCENTE': 'clases(alumno)',
        'ADMINISTRATIVO': 'oficinas(administracion)',
        'COMUNIDAD': 'oficinas(administracion)',
    }
    destino_gasto = destino_map.get(req.destino_uso, 'clases(alumno)')

    subcats = db.query(SubcategoriaRecurso).filter(
        SubcategoriaRecurso.id_cat_recurso == req.id_cat_recurso
    ).all()

    if subcats:
        # Prioridad 1: match exacto destino_gasto
        exact = [s for s in subcats if s.destino_gasto == destino_gasto]
        candidates = exact if exact else subcats
        return {"codigo_cuenta": candidates[0].codigo_cuenta, "confianza": "alta" if exact else "media"}

    # Fallback: categoria tiene codigo_contable
    cat = db.query(CategoriaRecurso).filter(CategoriaRecurso.id_cat_recurso == req.id_cat_recurso).first()
    if cat and cat.codigo_contable:
        return {"codigo_cuenta": cat.codigo_contable, "confianza": "baja"}

    return {"codigo_cuenta": None, "confianza": "ninguna"}


@router.post("/recursos/aprobar-clasificar/{id_recurso}")
def aprobar_y_clasificar_recurso(
    id_recurso: int,
    req: AprobarRecursoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "aprobar"))
):
    recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
        
    # 1. Cambiar estado a ACTIVO
    recurso.estado = "ACTIVO"
    
    # 2. Crear mapeo en la tabla MapeoRecursoSubcategoria
    subcat = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.codigo_cuenta == req.codigo_cuenta).first()
    if not subcat:
        raise HTTPException(status_code=400, detail="El código contable no existe en las subcategorías.")

    id_subvencion = None
    if req.subvencion:
        subv = db.query(Subvencion).filter(func.lower(Subvencion.nombre_corto) == req.subvencion.lower()).first()
        if subv:
            id_subvencion = subv.id_subvencion

    # Map destino_uso to destino_gasto (para compatibilidad)
    destino_map = {
        'ESTUDIANTE': 'clases(alumno)',
        'DOCENTE': 'clases(alumno)',
        'ADMINISTRATIVO': 'oficinas(administracion)',
        'FUNCIONARIO': 'oficinas(administracion)',
        'COMUNIDAD': 'oficinas(administracion)',
        'GENERAL': 'oficinas(administracion)',
        'PREMIO': 'premio/beneficio',
        'MANTENCION': 'mantencion/servicio',
    }
    destino_gasto = destino_map.get(req.destino_uso, 'clases(alumno)')
    if req.destino_uso in ['clases(alumno)', 'oficinas(administracion)', 'premio/beneficio', 'mantencion/servicio']:
        destino_gasto = req.destino_uso

    existe = db.query(MapeoRecursoSubcategoria).filter(
        MapeoRecursoSubcategoria.id_recurso == recurso.id_recurso,
        MapeoRecursoSubcategoria.id_subcat_recurso == subcat.id_subcat_recurso,
        MapeoRecursoSubcategoria.destino_gasto == destino_gasto,
        MapeoRecursoSubcategoria.id_subvencion == id_subvencion
    ).first()

    if not existe:
        nuevo_mapeo = MapeoRecursoSubcategoria(
            id_recurso=recurso.id_recurso,
            id_subcat_recurso=subcat.id_subcat_recurso,
            destino_gasto=destino_gasto,
            id_subvencion=id_subvencion
        )
        db.add(nuevo_mapeo)
    
    # 3. Bulk update en pre_detalle para solicitudes pendientes
    detalles_pendientes = db.query(PresupuestoDetalle).filter(
        PresupuestoDetalle.id_recurso == id_recurso,
        PresupuestoDetalle.codigo_cuenta.is_(None)
    ).all()
    
    count = 0
    for det in detalles_pendientes:
        det.codigo_cuenta = req.codigo_cuenta
        count += 1
        
    db.commit()
    
    return {
        "message": "Recurso aprobado y clasificado correctamente.",
        "detalles_actualizados": count
    }


class CodigoDestinoLote(BaseModel):
    destino: str  # ESTUDIANTE, FUNCIONARIO, PREMIO, MANTENCION
    codigo_cuenta: str
    nombre_cuenta: Optional[str] = None
    subvencion: Optional[str] = 'GENERAL'


class ItemAprobarLote(BaseModel):
    id_recurso: int
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    formato: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    id_grupo_recurso: Optional[int] = None
    # Nuevo: lista de códigos contables por destino (el usuario elige cuáles agregar)
    codigos_destino: Optional[List[CodigoDestinoLote]] = None
    # Fallback legado: un solo código/destino (retrocompatibilidad)
    codigo_cuenta: Optional[str] = None
    destino_uso: Optional[str] = 'ESTUDIANTE'
    tipo_transaccion: Optional[str] = 'COMPRA'
    subvencion: Optional[str] = 'GENERAL'


class AprobarRecursosLoteRequest(BaseModel):
    items: List[ItemAprobarLote]


@router.post("/recursos/aprobar-clasificar-lote")
def aprobar_clasificar_recursos_lote(
    obj: AprobarRecursosLoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "aprobar"))
):
    """Aprueba y clasifica masivamente una lista de recursos sugeridos en una sola transacción.
    
    Soporta dos modos:
    - Nuevo: codigos_destino[] con múltiples códigos contables por destino.
    - Legado: un solo codigo_cuenta + destino_uso (retrocompatible).
    """
    if not obj.items:
        return {"aprobados": 0, "detalles_actualizados": 0}

    total_aprobados = 0
    total_detalles = 0
    total_mapeos = 0

    destino_map = {
        'ESTUDIANTE': 'clases(alumno)',
        'DOCENTE': 'clases(alumno)',
        'ADMINISTRATIVO': 'oficinas(administracion)',
        'FUNCIONARIO': 'oficinas(administracion)',
        'COMUNIDAD': 'oficinas(administracion)',
        'GENERAL': 'oficinas(administracion)',
        'PREMIO': 'premio/beneficio',
        'MANTENCION': 'mantencion/servicio',
    }

    for item in obj.items:
        recurso = db.query(Recurso).filter(Recurso.id_recurso == item.id_recurso).first()
        if not recurso:
            continue

        if item.nombre:
            recurso.nombre = item.nombre
        if item.descripcion:
            recurso.descripcion = item.descripcion
        if item.formato:
            recurso.formato = item.formato
        if item.id_cat_recurso:
            recurso.id_cat_recurso = item.id_cat_recurso
        if item.id_grupo_recurso:
            recurso.id_grupo_recurso = item.id_grupo_recurso

        recurso.estado = "ACTIVO"
        total_aprobados += 1

        # Determinar los pares (destino, codigo_cuenta, subvencion) a crear
        pares_destino = []
        if item.codigos_destino and len(item.codigos_destino) > 0:
            # Modo nuevo: múltiples destinos
            for cd in item.codigos_destino:
                if cd.codigo_cuenta:
                    pares_destino.append((cd.destino, cd.codigo_cuenta, cd.subvencion or 'GENERAL'))
        elif item.codigo_cuenta:
            # Modo legado: un solo código
            pares_destino.append((item.destino_uso or 'ESTUDIANTE', item.codigo_cuenta, item.subvencion or 'GENERAL'))

        # Crear mapeos en pre_recurso_cuenta por cada par destino/código
        primer_codigo = None
        for (destino, codigo_cuenta, subvencion) in pares_destino:
            if primer_codigo is None:
                primer_codigo = codigo_cuenta

            subcat = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.codigo_cuenta == codigo_cuenta).first()
            if not subcat:
                continue

            id_subvencion = None
            if subvencion:
                subv = db.query(Subvencion).filter(func.lower(Subvencion.nombre_corto) == subvencion.lower()).first()
                if subv:
                    id_subvencion = subv.id_subvencion

            destino_gasto = destino_map.get(destino, 'clases(alumno)')

            existe = db.query(MapeoRecursoSubcategoria).filter(
                MapeoRecursoSubcategoria.id_recurso == recurso.id_recurso,
                MapeoRecursoSubcategoria.id_subcat_recurso == subcat.id_subcat_recurso,
                MapeoRecursoSubcategoria.destino_gasto == destino_gasto,
                MapeoRecursoSubcategoria.id_subvencion == id_subvencion
            ).first()

            if not existe:
                db.add(MapeoRecursoSubcategoria(
                    id_recurso=recurso.id_recurso,
                    id_subcat_recurso=subcat.id_subcat_recurso,
                    destino_gasto=destino_gasto,
                    id_subvencion=id_subvencion
                ))
                total_mapeos += 1

        # Actualizar detalles de presupuesto pendientes con el primer código
        if primer_codigo:
            detalles_pendientes = db.query(PresupuestoDetalle).filter(
                PresupuestoDetalle.id_recurso == item.id_recurso,
                PresupuestoDetalle.codigo_cuenta.is_(None)
            ).all()

            for det in detalles_pendientes:
                det.codigo_cuenta = primer_codigo
                total_detalles += 1

    db.commit()
    return {"aprobados": total_aprobados, "detalles_actualizados": total_detalles, "mapeos_creados": total_mapeos}


@router.get("/recursos/todos-mapeos")
def get_todos_mapeos_recursos(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    from sqlalchemy.orm import joinedload
    mapeos = db.query(MapeoRecursoSubcategoria).options(
        joinedload(MapeoRecursoSubcategoria.subcategoria),
        joinedload(MapeoRecursoSubcategoria.subvencion)
    ).all()

    resultado: Dict[int, list] = {}
    for m in mapeos:
        if m.id_recurso not in resultado:
            resultado[m.id_recurso] = []
        codigo_cuenta = m.subcategoria.codigo_cuenta if m.subcategoria else ""
        nombre_subcat = m.subcategoria.nombre if m.subcategoria else ""
        nombre_subv = m.subvencion.nombre_corto if m.subvencion else None
        resultado[m.id_recurso].append({
            "id_mapeo": m.id_mapeo,
            "id_recurso": m.id_recurso,
            "id_subcat_recurso": m.id_subcat_recurso,
            "codigo_cuenta": codigo_cuenta,
            "nombre_subcategoria": nombre_subcat,
            "id_subvencion": m.id_subvencion,
            "nombre_subvencion": nombre_subv,
            "destino_gasto": m.destino_gasto
        })
    return resultado


@router.get("/recursos/{id_recurso}/mapeos", response_model=List[MapeoRecursoSubcategoriaResponse])
def get_mapeos_recurso(
    id_recurso: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    mapeos = db.query(MapeoRecursoSubcategoria).filter(
        MapeoRecursoSubcategoria.id_recurso == id_recurso
    ).all()

    # Cargar las reglas de subvención de las cuentas involucradas para saber si una
    # subvención tiene fiscalización crítica ("punto rojo"). El nombre_corto de
    # pre_subvencion puede colapsar varias claves del manual (ej. GENERAL abarca
    # SUBV_GENERAL y ADM_CENTRAL_SUBV_GRAL); se marca crítica si CUALQUIERA lo es.
    from app.models import CuentaMatrizReglas
    SUBV_BOTON_A_MANUAL = {
        "GENERAL": ["SUBV_GENERAL", "ADM_CENTRAL_SUBV_GRAL"],
        "SEP": ["SEP", "ADM_CENTRAL_SEP"],
        "PIE": ["PIE"],
        "PRO_RETENCION": ["PRO_RETENCION"],
        "MANTENIMIENTO": ["MANTENIMIENTO"],
        "INTERNADO": ["INTERNADO"],
        "REFUERZO_EDUCATIVO": ["REFUERZO_EDUCATIVO"],
    }
    codigos = {m.subcategoria.codigo_cuenta for m in mapeos if m.subcategoria}
    reglas_map = {}
    if codigos:
        filas = (
            db.query(CuentaMatrizReglas.codigo, CuentaMatrizReglas.subvenciones_reglas)
            .filter(CuentaMatrizReglas.codigo.in_(codigos))
            .all()
        )
        reglas_map = {c: (r or {}) for c, r in filas}

    def _es_critico(codigo_cuenta: str, nombre_corto) -> bool:
        if not nombre_corto:
            return False
        reglas = reglas_map.get(codigo_cuenta, {})
        claves = SUBV_BOTON_A_MANUAL.get(nombre_corto.upper(), [nombre_corto.upper()])
        return any((reglas.get(k) or {}).get("critico_fiscalizacion") for k in claves)

    res = []
    for m in mapeos:
        codigo_cuenta = m.subcategoria.codigo_cuenta if m.subcategoria else ""
        nombre_subvencion = m.subvencion.nombre_corto if m.subvencion else None
        res.append(MapeoRecursoSubcategoriaResponse(
            id_mapeo=m.id_mapeo,
            id_recurso=m.id_recurso,
            id_subcat_recurso=m.id_subcat_recurso,
            codigo_cuenta=codigo_cuenta,
            nombre_subcategoria=m.subcategoria.nombre if m.subcategoria else "",
            id_subvencion=m.id_subvencion,
            nombre_subvencion=nombre_subvencion,
            destino_gasto=m.destino_gasto,
            critico_fiscalizacion=_es_critico(codigo_cuenta, nombre_subvencion)
        ))
    return res


@router.post("/recursos/{id_recurso}/mapeos", response_model=MapeoRecursoSubcategoriaResponse, status_code=201)
def add_mapeo_recurso(
    id_recurso: int,
    payload: MapeoRecursoSubcategoriaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    recurso = db.query(Recurso).filter(Recurso.id_recurso == id_recurso).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
        
    subcat = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.id_subcat_recurso == payload.id_subcat_recurso).first()
    if not subcat and getattr(payload, 'codigo_cuenta', None):
        subcat = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.codigo_cuenta == payload.codigo_cuenta).first()
    
    if not subcat:
        # Intentar buscar en CuentaMatrizReglas por código de cuenta contable
        matriz = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == str(payload.id_subcat_recurso)).first()
        if matriz:
            subcat = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.codigo_cuenta == matriz.codigo).first()
            if not subcat:
                subcat = SubcategoriaRecurso(
                    id_cat_recurso=recurso.id_cat_recurso or 1,
                    nombre=matriz.nombre,
                    codigo_cuenta=matriz.codigo,
                    destino_gasto=payload.destino_gasto
                )
                db.add(subcat)
                db.commit()
                db.refresh(subcat)

    if not subcat:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada")
        
    payload_subcat_id = subcat.id_subcat_recurso
        
    if payload.id_subvencion:
        subv = db.query(Subvencion).filter(Subvencion.id_subvencion == payload.id_subvencion).first()
        if not subv:
            raise HTTPException(status_code=404, detail="Subvención no encontrada")
            
    existe = db.query(MapeoRecursoSubcategoria).filter(
        MapeoRecursoSubcategoria.id_recurso == id_recurso,
        MapeoRecursoSubcategoria.id_subcat_recurso == payload_subcat_id,
        MapeoRecursoSubcategoria.id_subvencion == payload.id_subvencion,
        MapeoRecursoSubcategoria.destino_gasto == payload.destino_gasto
    ).first()
    if existe:
        raise HTTPException(status_code=400, detail="Este mapeo ya existe para el recurso")
        
    db_obj = MapeoRecursoSubcategoria(
        id_recurso=id_recurso,
        id_subcat_recurso=payload_subcat_id,
        id_subvencion=payload.id_subvencion,
        destino_gasto=payload.destino_gasto
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    return MapeoRecursoSubcategoriaResponse(
        id_mapeo=db_obj.id_mapeo,
        id_recurso=db_obj.id_recurso,
        id_subcat_recurso=db_obj.id_subcat_recurso,
        codigo_cuenta=db_obj.subcategoria.codigo_cuenta if db_obj.subcategoria else "",
        nombre_subcategoria=db_obj.subcategoria.nombre if db_obj.subcategoria else "",
        id_subvencion=db_obj.id_subvencion,
        nombre_subvencion=db_obj.subvencion.nombre_corto if db_obj.subvencion else None,
        destino_gasto=db_obj.destino_gasto
    )


@router.delete("/recursos/{id_recurso}/mapeos/{id_mapeo}", status_code=200)
def delete_mapeo_recurso(
    id_recurso: int,
    id_mapeo: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "crear"))
):
    mapeo = db.query(MapeoRecursoSubcategoria).filter(
        MapeoRecursoSubcategoria.id_mapeo == id_mapeo,
        MapeoRecursoSubcategoria.id_recurso == id_recurso
    ).first()
    if not mapeo:
        raise HTTPException(status_code=404, detail="Mapeo no encontrado")
        
    db.delete(mapeo)
    db.commit()
    return {"message": "Mapeo eliminado correctamente"}


@router.get("/recursos/{id_recurso}/resolver")
def resolver_mapeo_recurso(
    id_recurso: int,
    destino_gasto: str = Query(...),
    id_subvencion: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    mapeo = db.query(MapeoRecursoSubcategoria).filter(
        MapeoRecursoSubcategoria.id_recurso == id_recurso,
        MapeoRecursoSubcategoria.destino_gasto == destino_gasto,
        MapeoRecursoSubcategoria.id_subvencion == id_subvencion
    ).first()
    
    if not mapeo and id_subvencion is not None:
        mapeo = db.query(MapeoRecursoSubcategoria).filter(
            MapeoRecursoSubcategoria.id_recurso == id_recurso,
            MapeoRecursoSubcategoria.destino_gasto == destino_gasto,
            MapeoRecursoSubcategoria.id_subvencion.is_(None)
        ).first()
        
    if not mapeo:
        raise HTTPException(status_code=404, detail="No se encontró un código contable configurado para esta combinación de Recurso, Destino y Subvención")
        
    return {
        "codigo_cuenta": mapeo.subcategoria.codigo_cuenta if mapeo.subcategoria else "",
        "nombre_cuenta": mapeo.subcategoria.nombre if mapeo.subcategoria else ""
    }


@router.get("/subcategorias")
def list_subcategorias(
    id_cat_recurso: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    query = db.query(SubcategoriaRecurso)
    if id_cat_recurso is not None:
        query = query.filter(SubcategoriaRecurso.id_cat_recurso == id_cat_recurso)
    subcategorias = query.all()
    return [{
        "id_subcat_recurso": s.id_subcat_recurso,
        "id_cat_recurso": s.id_cat_recurso,
        "nombre": s.nombre,
        "codigo_cuenta": s.codigo_cuenta,
        "destino_gasto": s.destino_gasto
    } for s in subcategorias]


# ── Solicitudes de Modificación de Justificación / Motivo ─────────────────────

class SolicitudModificacionCreate(BaseModel):
    id_pre_detalle: int
    valor_propuesto: str
    motivo_cambio: Optional[str] = None
    cantidad_real: Optional[float] = None
    valor_real_iva: Optional[float] = None
    centro_costos: Optional[str] = None
    observacion: Optional[str] = None

class SolicitudModificacionRespuesta(BaseModel):
    accion: str  # APROBAR | RECHAZAR
    comentario: Optional[str] = None

@router.post("/solicitudes-modificacion")
def crear_solicitud_modificacion(
    payload: SolicitudModificacionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    import json
    detalle = db.query(PresupuestoDetalle).filter(PresupuestoDetalle.id_pre_detalle == payload.id_pre_detalle).first()
    if not detalle:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    prop_data = {
        "motivo": payload.valor_propuesto.strip(),
        "cantidad_real": payload.cantidad_real,
        "valor_real_iva": payload.valor_real_iva,
        "centro_costos": payload.centro_costos,
        "observacion": payload.observacion
    }

    # Crear la solicitud de modificación en estado PENDIENTE con el payload completo en JSON
    sol = SolicitudModificacionDetalle(
        id_pre_detalle=payload.id_pre_detalle,
        campo_modificado="general",
        valor_anterior=detalle.motivo or "",
        valor_propuesto=json.dumps(prop_data, ensure_ascii=False),
        motivo_cambio=payload.motivo_cambio.strip() if payload.motivo_cambio else None,
        estado="PENDIENTE",
        id_user_solicitante=current_user.id_user,
        fecha_solicitud=datetime.utcnow()
    )
    detalle.estado_compra = "En revisión"
    db.add(sol)
    db.commit()
    db.refresh(sol)
    return {"mensaje": "Solicitud de modificación enviada correctamente a revisión", "id_solicitud_mod": sol.id_solicitud_mod}


@router.get("/solicitudes-modificacion")
def listar_solicitudes_modificacion(
    estado: Optional[str] = Query("PENDIENTE"),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    import json
    query = db.query(SolicitudModificacionDetalle)
    if estado:
        query = query.filter(SolicitudModificacionDetalle.estado == estado)
    
    # Filtrar por colegio si corresponde
    solicitudes = query.order_by(SolicitudModificacionDetalle.fecha_solicitud.desc()).all()
    resultado = []
    for s in solicitudes:
        det = s.detalle
        sol_presupuesto = det.solicitud if det else None

        motivo_prop = s.valor_propuesto
        cant_real_prop = None
        val_real_prop = None
        centro_costos_prop = None
        obs_prop = None

        try:
            parsed = json.loads(s.valor_propuesto)
            if isinstance(parsed, dict):
                motivo_prop = parsed.get("motivo", s.valor_propuesto)
                cant_real_prop = parsed.get("cantidad_real")
                val_real_prop = parsed.get("valor_real_iva")
                centro_costos_prop = parsed.get("centro_costos")
                obs_prop = parsed.get("observacion")
        except Exception:
            pass
        
        resultado.append({
            "id_solicitud_mod": s.id_solicitud_mod,
            "id_pre_detalle": s.id_pre_detalle,
            "nombre_producto": det.nombre_producto if det else "",
            "cantidad": det.cantidad if det else 0,
            "cantidad_real": det.cantidad_real if det else None,
            "cantidad_real_propuesta": cant_real_prop,
            "formato_unidad": det.formato_unidad if det else "",
            "valor_unitario_iva": det.valor_unitario_iva if det else 0,
            "total_iva": det.total_iva if det else 0,
            "valor_real_iva": det.valor_real_iva if det else None,
            "valor_real_iva_propuesto": val_real_prop,
            "centro_costos_propuesto": centro_costos_prop,
            "observacion_propuesta": obs_prop,
            "codigo_cuenta": det.codigo_cuenta if det else "",
            "solicitud_codigo": f"SOL-{sol_presupuesto.id_presupuesto:04d}" if sol_presupuesto else "",
            "subarea": sol_presupuesto.subarea.nombre if (sol_presupuesto and sol_presupuesto.subarea) else "",
            "colegio": sol_presupuesto.colegio.nombre if (sol_presupuesto and sol_presupuesto.colegio) else "",
            "valor_anterior": s.valor_anterior,
            "valor_propuesto": motivo_prop,
            "motivo_cambio": s.motivo_cambio,
            "estado": s.estado,
            "solicitante": s.solicitante.nombre if s.solicitante else "",
            "fecha_solicitud": s.fecha_solicitud.isoformat() if s.fecha_solicitud else None,
            "aprobador": s.aprobador.nombre if s.aprobador else None,
            "fecha_respuesta": s.fecha_respuesta.isoformat() if s.fecha_respuesta else None,
            "comentario_respuesta": s.comentario_respuesta
        })
    return resultado


@router.put("/solicitudes-modificacion/{id_solicitud_mod}/responder")
def responder_solicitud_modificacion(
    id_solicitud_mod: int,
    payload: SolicitudModificacionRespuesta,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_seccion("go_compras.programar_jefe"))
):
    import json
    sol = db.query(SolicitudModificacionDetalle).filter(SolicitudModificacionDetalle.id_solicitud_mod == id_solicitud_mod).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud de modificación no encontrada")

    if sol.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail="Esta solicitud ya fue procesada")

    sol.id_user_aprobador = current_user.id_user
    sol.fecha_respuesta = datetime.utcnow()
    sol.comentario_respuesta = payload.comentario.strip() if payload.comentario else None

    if payload.accion.upper() == "APROBAR":
        sol.estado = "APROBADO"
        if sol.detalle:
            motivo_final = sol.valor_propuesto
            try:
                parsed = json.loads(sol.valor_propuesto)
                if isinstance(parsed, dict):
                    motivo_final = parsed.get("motivo", sol.valor_propuesto)
                    if parsed.get("cantidad_real") is not None:
                        sol.detalle.cantidad_real = float(parsed.get("cantidad_real"))
                    if parsed.get("valor_real_iva") is not None:
                        sol.detalle.valor_real_iva = float(parsed.get("valor_real_iva"))
                    if parsed.get("centro_costos"):
                        sol.detalle.centro_costos = parsed.get("centro_costos")
                    if parsed.get("observacion"):
                        sol.detalle.observacion = parsed.get("observacion")
            except Exception:
                pass
            sol.detalle.motivo = motivo_final
            sol.detalle.estado_compra = "Comprado"
            if sol.detalle.estado_aprobacion in ['Comprado', 'En revisión', None, '']:
                sol.detalle.estado_aprobacion = "Aprobado"
    else:
        sol.estado = "RECHAZADO"
        if sol.detalle:
            sol.detalle.estado_compra = "Pendiente"
            sol.detalle.cantidad_real = None
            sol.detalle.valor_real_iva = None
            sol.detalle.observacion = None

    db.commit()
    return {"mensaje": f"Solicitud {sol.estado.lower()} con éxito"}



