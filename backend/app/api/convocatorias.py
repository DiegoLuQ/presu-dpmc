"""
Convocatorias de pedidos externos.

Rutas protegidas (requieren JWT):
  POST   /convocatorias                           – Crear convocatoria para una subárea
  GET    /convocatorias?id_presupuesto=X          – Listar convocatorias de un presupuesto
  PATCH  /convocatorias/{id}/cerrar               – Cerrar convocatoria
  GET    /convocatorias/{id}/pedidos              – Ver pedidos de una convocatoria
  PATCH  /convocatorias/pedidos/{id_pedido}       – Aceptar / rechazar / revertir pedido
  POST   /convocatorias/pedidos/{id_pedido}/clasificar-ia – Clasificar con IA
  POST   /convocatorias/{id}/importar             – Importar aceptados al presupuesto

Rutas públicas (solo necesitan el token):
  GET    /convocatorias/publica/{token}           – Info de la convocatoria
  POST   /convocatorias/publica/{token}/pedidos   – Enviar un pedido
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel
import secrets
import json

from app.db.session import get_db
from app.models import (
    PreConvocatoria, PrePedidoExterno,
    SolicitudPresupuesto, PresupuestoDetalle,
    Subarea, Area, User, CategoriaRecurso, Recurso,
    Actividad, Accion, PME, CategoriaCodigoContable, Subvencion, OrgConfig
)
from app.api.auth import get_current_user

router = APIRouter(prefix="/convocatorias", tags=["Convocatorias"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ConvocatoriaCreate(BaseModel):
    id_presupuesto: int
    id_subarea: int
    dias_expiracion: int = 30
    pin: Optional[str] = None


class PedidoCreate(BaseModel):
    nombre_recurso: str
    descripcion: Optional[str] = None
    formato_unidad: str
    cantidad: float
    precio_estimado: float
    fecha_ejecucion: date
    tipo_fecha: str
    motivo: str
    actividad_evento: Optional[str] = None
    destino: Optional[str] = None              # funcionario | alumno | premio | mantencion | otro
    id_actividad_pme: Optional[int] = None     # actividad del PME asociada (opcional)
    id_recurso: Optional[int] = None
    pin: Optional[str] = None   # requerido si la convocatoria tiene PIN


class PedidoEstadoPayload(BaseModel):
    estado_jefe: str   # pendiente | aceptado | rechazado
    comentario_jefe: Optional[str] = None


class PedidoDatosPayload(BaseModel):
    """Edición de los datos de un pedido por parte del jefe antes de importar."""
    nombre_recurso: Optional[str] = None
    descripcion: Optional[str] = None
    formato_unidad: Optional[str] = None
    cantidad: Optional[float] = None
    precio_estimado: Optional[float] = None
    motivo: Optional[str] = None
    actividad_evento: Optional[str] = None
    destino: Optional[str] = None
    id_actividad_pme: Optional[int] = None
    fecha_ejecucion: Optional[str] = None


class VerificarPinPayload(BaseModel):
    pin: str


class PedidoPublicoEditar(BaseModel):
    """Edición de un pedido desde el formulario público (antes de que el jefe lo revise)."""
    nombre_recurso: Optional[str] = None
    descripcion: Optional[str] = None
    formato_unidad: Optional[str] = None
    cantidad: Optional[float] = None
    precio_estimado: Optional[float] = None
    motivo: Optional[str] = None
    actividad_evento: Optional[str] = None
    destino: Optional[str] = None
    id_actividad_pme: Optional[int] = None
    pin: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_pedido(p: PrePedidoExterno) -> dict:
    return {
        "id_pedido":          p.id_pedido,
        "id_convocatoria":    p.id_convocatoria,
        "nombre_recurso":     p.nombre_recurso,
        "descripcion":        p.descripcion,
        "formato_unidad":     p.formato_unidad,
        "cantidad":           float(p.cantidad),
        "precio_estimado":    float(p.precio_estimado),
        "total":              float(p.cantidad) * float(p.precio_estimado),
        "fecha_ejecucion":    p.fecha_ejecucion.isoformat() if p.fecha_ejecucion else None,
        "tipo_fecha":         p.tipo_fecha,
        "motivo":             p.motivo,
        "actividad_evento":   p.actividad_evento,
        "destino":            p.destino,
        "id_actividad_pme":   p.id_actividad_pme,
        "actividad_pme_nombre": p.actividad_pme_nombre,
        "estado_jefe":        p.estado_jefe,
        "comentario_jefe":    p.comentario_jefe,
        "id_cat_recurso":     p.id_cat_recurso,
        "id_recurso":         p.id_recurso,
        "categoria_nombre_ia": p.categoria_nombre_ia,
        "clasificado_ia":     p.clasificado_ia,
        "creado_en":          p.creado_en.isoformat() if p.creado_en else None,
    }


def _resolver_actividad_pme(id_actividad: Optional[int], id_colegio: int, db: Session):
    """Valida que la actividad PME exista y pertenezca al colegio de la convocatoria.
    Devuelve (id_actividad, nombre) o (None, None) si no aplica."""
    if not id_actividad:
        return None, None
    act = (
        db.query(Actividad)
        .join(Accion, Actividad.id_accion == Accion.id_accion)
        .join(PME, Accion.id_pme == PME.id_pme)
        .filter(Actividad.id_actividad == id_actividad, PME.id_colegio == id_colegio)
        .first()
    )
    if not act:
        return None, None
    return act.id_actividad, (act.nombre_actividad or "").strip()[:500] or None


def _build_convocatoria(c: PreConvocatoria, db: Session, base_url: str = "") -> dict:
    total = db.query(func.count(PrePedidoExterno.id_pedido)).filter(
        PrePedidoExterno.id_convocatoria == c.id_convocatoria
    ).scalar() or 0
    pendientes = db.query(func.count(PrePedidoExterno.id_pedido)).filter(
        PrePedidoExterno.id_convocatoria == c.id_convocatoria,
        PrePedidoExterno.estado_jefe == "pendiente"
    ).scalar() or 0
    aceptados = db.query(func.count(PrePedidoExterno.id_pedido)).filter(
        PrePedidoExterno.id_convocatoria == c.id_convocatoria,
        PrePedidoExterno.estado_jefe == "aceptado"
    ).scalar() or 0
    area_nombre = None
    if c.subarea and c.subarea.area:
        area_nombre = c.subarea.area.nombre
    return {
        "id_convocatoria":  c.id_convocatoria,
        "id_presupuesto":   c.id_presupuesto,
        "solicitud_codigo": c.solicitud.codigo if c.solicitud else None,
        "presupuesto_anual_nombre": c.solicitud.presupuesto_anual.nombre if c.solicitud and c.solicitud.presupuesto_anual else None,
        "colegio_nombre":   c.colegio.nombre if c.colegio else None,
        "id_subarea":       c.id_subarea,
        "subarea_nombre":   c.subarea.nombre if c.subarea else None,
        "area_nombre":      area_nombre,
        "token":            c.token,
        "tiene_pin":        bool(c.pin),
        "fecha_expiracion": c.fecha_expiracion.isoformat() if c.fecha_expiracion else None,
        "estado":           c.estado,
        "creado_en":        c.creado_en.isoformat() if c.creado_en else None,
        "total_pedidos":    total,
        "pedidos_pendientes": pendientes,
        "pedidos_aceptados":  aceptados,
        "url_publica":      f"/pedidos/{c.token}",
    }


def _get_convocatoria_or_404(id_convocatoria: int, db: Session) -> PreConvocatoria:
    c = db.query(PreConvocatoria).filter(PreConvocatoria.id_convocatoria == id_convocatoria).first()
    if not c:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada")
    return c


def _es_admin(user: User) -> bool:
    return bool(user.rol and user.rol.codigo == "ADM")


def _verificar_acceso(c: PreConvocatoria, user: User) -> None:
    """Solo el creador de la convocatoria o un administrador pueden gestionarla."""
    if c.id_colegio != user.id_colegio:
        raise HTTPException(status_code=403, detail="Sin acceso")
    if not _es_admin(user) and c.creado_por != user.id_user:
        raise HTTPException(status_code=403, detail="Solo el creador o un administrador puede gestionar esta convocatoria")


# ── Rutas protegidas ─────────────────────────────────────────────────────────

@router.post("", status_code=201)
def crear_convocatoria(
    payload: ConvocatoriaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    solicitud = db.query(SolicitudPresupuesto).filter(
        SolicitudPresupuesto.id_presupuesto == payload.id_presupuesto,
        SolicitudPresupuesto.id_colegio == current_user.id_colegio,
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # No permitir duplicado activo para el mismo cargo en el mismo presupuesto
    # Nota: usamos id_cargo (columna real) en lugar de id_subarea (@property) que
    # no genera expresión SQL válida en filtros de SQLAlchemy.
    cargo_id = payload.id_subarea  # el frontend envía id_subarea que mapea a id_cargo
    existente = db.query(PreConvocatoria).filter(
        PreConvocatoria.id_presupuesto == payload.id_presupuesto,
        PreConvocatoria.id_cargo == cargo_id,
        PreConvocatoria.estado == "activo",
    ).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una convocatoria activa para este cargo en este presupuesto"
        )

    cargo = db.query(Subarea).filter(Subarea.id_cargo == cargo_id).first()
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo no encontrado")

    pin = (payload.pin or "").strip() or None
    token = secrets.token_urlsafe(32)
    nueva = PreConvocatoria(
        id_presupuesto=payload.id_presupuesto,
        id_cargo=cargo_id,
        id_colegio=current_user.id_colegio,
        token=token,
        pin=pin,
        fecha_expiracion=date.today() + timedelta(days=payload.dias_expiracion),
        estado="activo",
        creado_por=current_user.id_user,
        creado_en=datetime.utcnow(),
    )
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return _build_convocatoria(nueva, db)


@router.get("")
def listar_convocatorias(
    id_presupuesto: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista convocatorias del colegio. Cada usuario ve solo las que él creó;
    el administrador (rol ADM) ve todas. Si se entrega id_presupuesto, filtra por esa solicitud."""
    q = db.query(PreConvocatoria).filter(
        PreConvocatoria.id_colegio == current_user.id_colegio,
    )
    if not _es_admin(current_user):
        q = q.filter(PreConvocatoria.creado_por == current_user.id_user)
    if id_presupuesto is not None:
        q = q.filter(PreConvocatoria.id_presupuesto == id_presupuesto)
    convocatorias = q.order_by(PreConvocatoria.creado_en.desc()).all()
    return [_build_convocatoria(c, db) for c in convocatorias]


@router.patch("/{id_convocatoria}/cerrar")
def cerrar_convocatoria(
    id_convocatoria: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_convocatoria_or_404(id_convocatoria, db)
    _verificar_acceso(c, current_user)
    c.estado = "cerrado"
    db.commit()
    return _build_convocatoria(c, db)


@router.delete("/{id_convocatoria}")
def eliminar_convocatoria(
    id_convocatoria: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_convocatoria_or_404(id_convocatoria, db)
    _verificar_acceso(c, current_user)
    db.delete(c)
    db.commit()
    return {"message": "Convocatoria eliminada correctamente"}


@router.get("/{id_convocatoria}/pedidos")
def listar_pedidos(
    id_convocatoria: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_convocatoria_or_404(id_convocatoria, db)
    _verificar_acceso(c, current_user)
    pedidos = db.query(PrePedidoExterno).filter(
        PrePedidoExterno.id_convocatoria == id_convocatoria
    ).order_by(PrePedidoExterno.creado_en).all()
    return [_build_pedido(p) for p in pedidos]


@router.patch("/pedidos/{id_pedido}")
def actualizar_pedido_estado(
    id_pedido: int,
    payload: PedidoEstadoPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pedido = db.query(PrePedidoExterno).filter(PrePedidoExterno.id_pedido == id_pedido).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    conv = pedido.convocatoria
    _verificar_acceso(conv, current_user)
    if payload.estado_jefe not in ("pendiente", "aceptado", "rechazado"):
        raise HTTPException(status_code=422, detail="Estado inválido")
    pedido.estado_jefe = payload.estado_jefe
    if payload.comentario_jefe is not None:
        pedido.comentario_jefe = payload.comentario_jefe
    if payload.estado_jefe == "pendiente":
        pedido.comentario_jefe = None
    db.commit()
    return _build_pedido(pedido)


@router.patch("/pedidos/{id_pedido}/datos")
def editar_pedido_datos(
    id_pedido: int,
    payload: PedidoDatosPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permite al jefe corregir los datos de un pedido antes de importarlo."""
    pedido = db.query(PrePedidoExterno).filter(PrePedidoExterno.id_pedido == id_pedido).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    conv = pedido.convocatoria
    _verificar_acceso(conv, current_user)
    if pedido.estado_jefe == "importado":
        raise HTTPException(status_code=409, detail="No se puede editar un pedido ya importado")

    if payload.nombre_recurso is not None:
        nombre = payload.nombre_recurso.strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre no puede quedar vacío")
        pedido.nombre_recurso = nombre
    if payload.descripcion is not None:
        pedido.descripcion = payload.descripcion.strip() or None
    if payload.formato_unidad is not None:
        pedido.formato_unidad = payload.formato_unidad
    if payload.cantidad is not None:
        if payload.cantidad <= 0:
            raise HTTPException(status_code=422, detail="La cantidad debe ser mayor a 0")
        pedido.cantidad = payload.cantidad
    if payload.precio_estimado is not None:
        if payload.precio_estimado < 0:
            raise HTTPException(status_code=422, detail="El precio no puede ser negativo")
        pedido.precio_estimado = payload.precio_estimado
    if payload.motivo is not None:
        pedido.motivo = payload.motivo.strip()
    if payload.actividad_evento is not None:
        pedido.actividad_evento = payload.actividad_evento.strip() or None
    if payload.destino is not None:
        pedido.destino = payload.destino.strip() or None
    if payload.id_actividad_pme is not None:
        if payload.id_actividad_pme == 0:
            pedido.id_actividad_pme = None
            pedido.actividad_pme_nombre = None
        else:
            pedido.id_actividad_pme, pedido.actividad_pme_nombre = _resolver_actividad_pme(
                payload.id_actividad_pme, conv.id_colegio, db
            )

    if payload.fecha_ejecucion is not None:
        try:
            pedido.fecha_ejecucion = date.fromisoformat(payload.fecha_ejecucion)
        except ValueError:
            raise HTTPException(status_code=422, detail="Formato de fecha de ejecución inválido. Debe ser YYYY-MM-DD")

    db.commit()
    return _build_pedido(pedido)


def _clasificar_pedido_ia_interna(
    pedido: PrePedidoExterno,
    db: Session,
    current_user: User,
):
    from app.services.ai_service import call_ai, build_categoria_prompt
    from app.api.ai_config import _extract_json, _resolver_config_ia, _log_uso

    config = _resolver_config_ia(db, current_user, None)

    categorias = db.query(CategoriaRecurso).all()
    cats_json = [
        {"id_cat_recurso": c.id_cat_recurso, "nombre": c.nombre, "descripcion": c.descripcion or ""}
        for c in categorias
    ]

    system_p, user_p = build_categoria_prompt(
        nombre=pedido.nombre_recurso,
        descripcion=pedido.descripcion or "",
        motivo=pedido.motivo,
        destino="Alumnos",
        categorias=cats_json,
    )

    raw, usage = call_ai(
        config.proveedor, config.api_key_encrypted, config.modelo,
        system_p, user_p, max_tokens=2048,
    )
    _log_uso(db, current_user, config, "clasificar-pedido-externo", usage)
    result = _extract_json(raw)

    recomendaciones = result.get("recomendaciones") or []
    id_cat = None
    nombre_cat = None
    if recomendaciones:
        top = recomendaciones[0]
        id_cat = top.get("id_cat_recurso")
        nombre_cat = top.get("nombre")

    cat = None
    if id_cat is not None:
        cat = db.query(CategoriaRecurso).filter(CategoriaRecurso.id_cat_recurso == id_cat).first()
    if cat is None and nombre_cat:
        nombre_norm = nombre_cat.strip().lower()
        cat = next((c for c in categorias if c.nombre.strip().lower() == nombre_norm), None)

    if cat:
        pedido.id_cat_recurso = cat.id_cat_recurso
        pedido.categoria_nombre_ia = cat.nombre
    elif nombre_cat:
        pedido.categoria_nombre_ia = nombre_cat
    else:
        pedido.categoria_nombre_ia = "Sin clasificar"

    pedido.clasificado_ia = True





@router.post("/{id_convocatoria}/importar")
def importar_pedidos_aceptados(
    id_convocatoria: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_convocatoria_or_404(id_convocatoria, db)
    _verificar_acceso(c, current_user)

    aceptados = db.query(PrePedidoExterno).filter(
        PrePedidoExterno.id_convocatoria == id_convocatoria,
        PrePedidoExterno.estado_jefe == "aceptado",
    ).all()

    if not aceptados:
        raise HTTPException(status_code=422, detail="No hay pedidos aceptados para importar")

    importados = 0
    for p in aceptados:
        if not p.clasificado_ia:
            try:
                _clasificar_pedido_ia_interna(p, db, current_user)
            except Exception as e:
                # Loggear y continuar para no romper la importación
                print(f"Error clasificando pedido {p.id_pedido} en importación: {e}")
                p.categoria_nombre_ia = "Sin clasificar"
                p.clasificado_ia = True

        # Resolver automáticamente código contable y subvención
        codigo_cuenta = None
        id_subvencion = None

        if p.id_cat_recurso:
            pilar = p.destino or "clases(alumno)"
            mapeo_contable = db.query(CategoriaCodigoContable).filter(
                CategoriaCodigoContable.id_cat_recurso == p.id_cat_recurso,
                CategoriaCodigoContable.categoria_pilar == pilar
            ).first()

            # ¿El mapeo coincide con el pilar específico del destino? Solo en ese
            # caso la subvención de la matriz es fiable. Si tenemos que caer al
            # mapeo GENERAL (usado únicamente para resolver el código de cuenta),
            # NO heredamos su subvención: la decide la regla por destino más abajo.
            mapeo_es_pilar_especifico = mapeo_contable is not None

            # Fallback a GENERAL si no hay mapeo específico para el pilar
            if not mapeo_contable:
                mapeo_contable = db.query(CategoriaCodigoContable).filter(
                    CategoriaCodigoContable.id_cat_recurso == p.id_cat_recurso,
                    CategoriaCodigoContable.categoria_pilar == "GENERAL"
                ).first()

            if mapeo_contable:
                codigo_cuenta = mapeo_contable.codigo_cuenta
                if mapeo_es_pilar_especifico and mapeo_contable.subvencion:
                    subv = db.query(Subvencion).filter(
                        func.lower(Subvencion.nombre_corto) == mapeo_contable.subvencion.lower()
                    ).first()
                    if subv:
                        id_subvencion = subv.id_subvencion

        # Fallback estático de subvención si no se resolvió por matriz contable
        if id_subvencion is None:
            pilar_aux = p.destino or "clases(alumno)"
            subv_corto = "SEP" if pilar_aux == "clases(alumno)" else "GENERAL"
            subv_fallback = db.query(Subvencion).filter(
                func.lower(Subvencion.nombre_corto) == subv_corto.lower()
            ).first()
            if subv_fallback:
                id_subvencion = subv_fallback.id_subvencion

        # Resolucion/creación de Recurso en pre_recurso para que quede en el catálogo
        if p.id_recurso:
            id_recurso_final = p.id_recurso
        else:
            recurso_existente = db.query(Recurso).filter(
                func.lower(Recurso.nombre) == p.nombre_recurso.strip().lower()
            ).first()

            if recurso_existente:
                id_recurso_final = recurso_existente.id_recurso
            else:
                # Determinar el grupo del recurso basado en la categoría
                id_grupo_final = 1  # General por defecto
                if p.id_cat_recurso:
                    # 1. Intentar buscar el grupo más común de esta categoría
                    most_common = db.query(Recurso.id_grupo_recurso, func.count(Recurso.id_recurso))\
                        .filter(Recurso.id_cat_recurso == p.id_cat_recurso, Recurso.id_grupo_recurso.isnot(None))\
                        .group_by(Recurso.id_grupo_recurso)\
                        .order_by(func.count(Recurso.id_recurso).desc())\
                        .first()
                    if most_common:
                        id_grupo_final = most_common[0]
                    else:
                        # 2. Mapeos manuales de fallback para categorías que no tienen histórico
                        mapping = {
                            1: 38,   # Equipamiento de Apoyo Pedagógico -> Material Didáctico
                            54: 59,  # Asesorías y Consultorías Pedagógicas -> Evaluaciones/Especialistas
                            58: 40,  # Instrumentos y Materiales de Música/Arte -> Instrumentos Musicales y Artísticos
                            64: 38,  # Insumos Generales de Aprendizaje -> Material Didáctico
                            68: 63,  # Talleres Extraprogramáticos -> Talleres Extraprogramáticos
                            69: 45,  # Kits de Útiles Escolares Personales -> Útiles Escolares Personales (Kits)
                            70: 50,  # Servicios de Transporte y Furgón Escolar -> Servicio de Furgón Escolar (Transporte)
                            74: 51,  # Gastos de Vehículos -> Traslados, Pasajes y Peajes
                            77: 51,  # Pasajes y Viáticos -> Traslados, Pasajes y Peajes
                            78: 55,  # Consumos y Servicios Básicos -> Servicios Básicos
                            81: 54,  # Arriendos de Bienes Inmuebles -> Arriendos y Leasing
                            82: 54,  # Arriendos de Bienes Muebles -> Arriendos y Leasing
                            84: 49,  # Mantención y Reparación de Equipos -> Mantenimiento de Bienes Muebles y Equipos
                        }
                        id_grupo_final = mapping.get(p.id_cat_recurso, 1)

                # Creamos un recurso sugerido/pendiente para que el administrador pueda clasificarlo
                nuevo_recurso = Recurso(
                    nombre=p.nombre_recurso.strip(),
                    descripcion=p.descripcion or f"Recurso importado de convocatoria de {c.subarea.nombre if c.subarea else '—'}",
                    formato=p.formato_unidad or "Unidad",
                    id_cat_recurso=p.id_cat_recurso,
                    id_grupo_recurso=id_grupo_final,
                    estado="PENDIENTE_APROBACION",
                    id_solicitante=current_user.id_user,
                    descripcion_solicitud=p.motivo
                )
                db.add(nuevo_recurso)
                db.flush()  # Para obtener el id_recurso auto-generado
                id_recurso_final = nuevo_recurso.id_recurso

        precio = float(p.precio_estimado)
        cant = float(p.cantidad)
        detalle = PresupuestoDetalle(
            id_presupuesto=c.id_presupuesto,
            nombre_producto=p.nombre_recurso,
            descripcion=p.descripcion,
            formato_unidad=p.formato_unidad,
            cantidad=cant,
            valor_unitario=precio,
            valor_unitario_iva=precio,
            total_iva=cant * precio,
            fecha_ejecucion=p.fecha_ejecucion,
            tipo_fecha=p.tipo_fecha,
            motivo=p.motivo,
            estado_aprobacion="Pendiente",
            destino_gasto=p.destino or "clases(alumno)",
            id_subarea=c.id_subarea,
            id_subvencion=id_subvencion,
            id_recurso=id_recurso_final,
            codigo_cuenta=codigo_cuenta,
            id_actividad=p.id_actividad_pme,
            id_cat_recurso=p.id_cat_recurso,
        )
        db.add(detalle)
        p.estado_jefe = "importado"
        importados += 1

    db.commit()
    return {"importados": importados}


# ── Rutas públicas (sin autenticación) ───────────────────────────────────────

@router.get("/publica/{token}")
def get_convocatoria_publica(token: str, db: Session = Depends(get_db)):
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    expirado = c.fecha_expiracion < date.today()

    # Tutoriales configurados para el colegio de esta convocatoria
    cfg_tut = db.query(OrgConfig).filter(
        OrgConfig.id_colegio == c.id_colegio,
        OrgConfig.clave == "tutoriales_pedidos"
    ).first()
    if not cfg_tut:
        cfg_tut = db.query(OrgConfig).filter(OrgConfig.clave == "tutoriales_pedidos").first()

    tutoriales = []
    if cfg_tut and cfg_tut.valor:
        try:
            val = json.loads(cfg_tut.valor)
            if isinstance(val, list):
                tutoriales = val
        except Exception:
            tutoriales = []

    cfg_btn = db.query(OrgConfig).filter(
        OrgConfig.id_colegio == c.id_colegio,
        OrgConfig.clave == "mostrar_boton_tutoriales_pedidos"
    ).first()
    if not cfg_btn:
        cfg_btn = db.query(OrgConfig).filter(OrgConfig.clave == "mostrar_boton_tutoriales_pedidos").first()

    mostrar_boton = True
    if cfg_btn and cfg_btn.valor is not None:
        try:
            mostrar_boton = bool(json.loads(cfg_btn.valor))
        except Exception:
            mostrar_boton = True

    return {
        "id_convocatoria":  c.id_convocatoria,
        "subarea_nombre":   c.subarea.nombre if c.subarea else "—",
        "area_nombre":      c.subarea.area.nombre if (c.subarea and c.subarea.area) else None,
        "colegio_nombre":   c.colegio.nombre if c.colegio else None,
        "fecha_expiracion": c.fecha_expiracion.isoformat(),
        "estado":           "expirado" if expirado else c.estado,
        "activo":           not expirado and c.estado == "activo",
        "requiere_pin":     bool(c.pin),
        "tutoriales":       tutoriales,
        "mostrar_tutoriales": mostrar_boton,
    }


@router.get("/publica/{token}/recursos")
def buscar_recursos_publico(token: str, q: str = "", db: Session = Depends(get_db)):
    """Autocompletado de recursos existentes para el formulario público."""
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    q = (q or "").strip()
    if len(q) < 2:
        return []
    recursos = (
        db.query(Recurso)
        .filter(Recurso.nombre.ilike(f"%{q}%"), Recurso.estado == "ACTIVO")
        .order_by(Recurso.nombre)
        .limit(10)
        .all()
    )
    return [
        {
            "id_recurso":  r.id_recurso,
            "nombre":      r.nombre,
            "descripcion": r.descripcion,
            "formato":     r.formato,
        }
        for r in recursos
    ]


@router.get("/publica/{token}/actividades-pme")
def buscar_actividades_pme_publico(token: str, q: str = "", db: Session = Depends(get_db)):
    """Autocompletado de actividades del PME del colegio de la convocatoria (opcional)."""
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    base = (
        db.query(Actividad)
        .join(Accion, Actividad.id_accion == Accion.id_accion)
        .join(PME, Accion.id_pme == PME.id_pme)
        .filter(PME.id_colegio == c.id_colegio)
    )
    q = (q or "").strip()
    if q:
        base = base.filter(Actividad.nombre_actividad.ilike(f"%{q}%"))
    actividades = base.order_by(Actividad.nombre_actividad).limit(15).all()
    return [
        {
            "id_actividad":     a.id_actividad,
            "nombre_actividad": (a.nombre_actividad or "").strip(),
            "accion_nombre":    a.accion.nombre_accion if a.accion else None,
            "pme_year":         a.accion.pme.year if a.accion and a.accion.pme else None,
        }
        for a in actividades
    ]


@router.get("/publica/{token}/pedidos")
def listar_pedidos_publico(token: str, pin: Optional[str] = None, db: Session = Depends(get_db)):
    """Lista los pedidos ya enviados a través de este enlace (para mostrarlos en el formulario)."""
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    if c.pin and (pin or "").strip() != c.pin:
        raise HTTPException(status_code=403, detail="PIN incorrecto")
    pedidos = db.query(PrePedidoExterno).filter(
        PrePedidoExterno.id_convocatoria == c.id_convocatoria
    ).order_by(PrePedidoExterno.creado_en).all()
    return [_build_pedido(p) for p in pedidos]


@router.post("/publica/{token}/verificar")
def verificar_pin_publico(token: str, payload: VerificarPinPayload, db: Session = Depends(get_db)):
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    if not c.pin:
        return {"ok": True}
    if (payload.pin or "").strip() != c.pin:
        raise HTTPException(status_code=403, detail="PIN incorrecto")
    return {"ok": True}


@router.post("/publica/{token}/pedidos", status_code=201)
def crear_pedido_publico(token: str, payload: PedidoCreate, db: Session = Depends(get_db)):
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    if c.estado != "activo":
        raise HTTPException(status_code=403, detail="Este formulario está cerrado")
    if c.fecha_expiracion < date.today():
        raise HTTPException(status_code=403, detail="Este formulario ha expirado")
    if c.pin and (payload.pin or "").strip() != c.pin:
        raise HTTPException(status_code=403, detail="PIN incorrecto")

    id_act_pme, nombre_act_pme = _resolver_actividad_pme(payload.id_actividad_pme, c.id_colegio, db)

    pedido = PrePedidoExterno(
        id_convocatoria=c.id_convocatoria,
        nombre_recurso=payload.nombre_recurso,
        descripcion=payload.descripcion,
        formato_unidad=payload.formato_unidad,
        cantidad=payload.cantidad,
        precio_estimado=payload.precio_estimado,
        fecha_ejecucion=payload.fecha_ejecucion,
        tipo_fecha=payload.tipo_fecha,
        motivo=payload.motivo,
        actividad_evento=(payload.actividad_evento or "").strip() or None,
        destino=(payload.destino or "").strip() or None,
        id_actividad_pme=id_act_pme,
        actividad_pme_nombre=nombre_act_pme,
        estado_jefe="pendiente",
        clasificado_ia=False,
        creado_en=datetime.utcnow(),
        id_recurso=payload.id_recurso,
    )
    db.add(pedido)
    db.commit()
    db.refresh(pedido)
    return _build_pedido(pedido)


def _get_pedido_publico_editable(token: str, id_pedido: int, pin: Optional[str], db: Session) -> PrePedidoExterno:
    """Valida acceso por token y devuelve el pedido si aún es editable por quien envió."""
    c = db.query(PreConvocatoria).filter(PreConvocatoria.token == token).first()
    if not c:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    if c.estado != "activo":
        raise HTTPException(status_code=403, detail="Este formulario está cerrado")
    if c.fecha_expiracion < date.today():
        raise HTTPException(status_code=403, detail="Este formulario ha expirado")
    if c.pin and (pin or "").strip() != c.pin:
        raise HTTPException(status_code=403, detail="PIN incorrecto")
    pedido = db.query(PrePedidoExterno).filter(
        PrePedidoExterno.id_pedido == id_pedido,
        PrePedidoExterno.id_convocatoria == c.id_convocatoria,
    ).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    if pedido.estado_jefe != "pendiente":
        raise HTTPException(status_code=409, detail="El jefe de área ya revisó este recurso; no se puede modificar")
    return pedido


@router.patch("/publica/{token}/pedidos/{id_pedido}")
def editar_pedido_publico(token: str, id_pedido: int, payload: PedidoPublicoEditar, db: Session = Depends(get_db)):
    pedido = _get_pedido_publico_editable(token, id_pedido, payload.pin, db)

    if payload.nombre_recurso is not None:
        nombre = payload.nombre_recurso.strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre no puede quedar vacío")
        pedido.nombre_recurso = nombre
    if payload.descripcion is not None:
        pedido.descripcion = payload.descripcion.strip() or None
    if payload.formato_unidad is not None:
        pedido.formato_unidad = payload.formato_unidad
    if payload.cantidad is not None:
        if payload.cantidad <= 0:
            raise HTTPException(status_code=422, detail="La cantidad debe ser mayor a 0")
        pedido.cantidad = payload.cantidad
    if payload.precio_estimado is not None:
        if payload.precio_estimado <= 0:
            raise HTTPException(status_code=422, detail="El precio debe ser mayor a 0")
        pedido.precio_estimado = payload.precio_estimado
    if payload.motivo is not None:
        motivo = payload.motivo.strip()
        if not motivo:
            raise HTTPException(status_code=422, detail="El motivo es obligatorio")
        pedido.motivo = motivo
    if payload.actividad_evento is not None:
        pedido.actividad_evento = payload.actividad_evento.strip() or None
    if payload.destino is not None:
        pedido.destino = payload.destino.strip() or None
    if payload.id_actividad_pme is not None:
        if payload.id_actividad_pme == 0:
            pedido.id_actividad_pme = None
            pedido.actividad_pme_nombre = None
        else:
            pedido.id_actividad_pme, pedido.actividad_pme_nombre = _resolver_actividad_pme(
                payload.id_actividad_pme, pedido.convocatoria.id_colegio, db
            )

    db.commit()
    db.refresh(pedido)
    return _build_pedido(pedido)


@router.delete("/publica/{token}/pedidos/{id_pedido}", status_code=204)
def eliminar_pedido_publico(token: str, id_pedido: int, pin: Optional[str] = None, db: Session = Depends(get_db)):
    pedido = _get_pedido_publico_editable(token, id_pedido, pin, db)
    db.delete(pedido)
    db.commit()
    return None
