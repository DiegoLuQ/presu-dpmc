from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from pydantic import BaseModel
import json

from app.db.session import get_db
from app.models import User, Rol, Colegio, Area, Cargo, Subarea, UserCargo, UserSubarea, Actividad, CuentaMatrizReglas, CuentaDescripcion, CuentaOcultaColegio, CuentaDestino, OrgConfig, AreaColegioJefe, SeccionAcceso
from app.core.permissions import SECCIONES_RESTRINGIBLES
from app.schemas.rol import RolResponse
from app.schemas.auth import (
    ColegioResponse, ColegioCreate, ColegioUpdate,
    AreaCreate, AreaUpdate, AreaResponse,
    CargoCreate, CargoUpdate, CargoResponse, SubareaCreate, SubareaUpdate, SubareaResponse,
    AreaJefeResponse, AreaJefeUpdate
)
from app.core.permissions import tiene_permiso
from app.api.deps import get_user_permisos, verificar_permisos
from app.api.auth import get_current_user

router = APIRouter(prefix="/catalogos", tags=["catalogos"])

def verificar_acceso_colegios(current_user: User = Depends(get_current_user)):
    user_permisos = get_user_permisos(current_user.rol)
    if tiene_permiso(user_permisos, "usuarios", "ver") or tiene_permiso(user_permisos, "presupuesto", "ver"):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para ver colegios"
    )

# --- COLEGIOS ---
@router.get("/colegios", response_model=List[ColegioResponse])
def list_colegios(db: Session = Depends(get_db), current_user: User = Depends(verificar_acceso_colegios)):
    # SaaS: Non-ADM users only see their own colegio. ADM can see all for management.
    if current_user.rol and current_user.rol.codigo in ["ADM", "SOS", "OPE"]:
        colegios = db.query(Colegio).all()
    else:
        colegios = db.query(Colegio).filter(Colegio.id_colegio == current_user.id_colegio).all()
    
    # Agregar nombre del director a cada colegio
    result = []
    for col in colegios:
        director_nombre = None
        if col.id_director:
            director = db.query(User).filter(User.id_user == col.id_director).first()
            if director:
                director_nombre = director.nombre
        
        result.append({
            "id_colegio": col.id_colegio,
            "nombre": col.nombre,
            "sigla": col.sigla,
            "direccion": col.direccion,
            "rut": col.rut,
            "correo": col.correo,
            "celular": col.celular,
            "url_img": col.url_img,
            "rbd": col.rbd,
            "id_director": col.id_director,
            "director_nombre": director_nombre
        })
    
    return result

@router.post("/colegios", response_model=ColegioResponse)
def create_colegio(
    col: ColegioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "crear"))
):
    if not (current_user.rol and current_user.rol.codigo == "ADM"):
        raise HTTPException(status_code=403, detail="No tienes permisos para crear colegios.")
    
    nuevo = Colegio(**col.dict())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@router.put("/colegios/{id_colegio}", response_model=ColegioResponse)
def update_colegio(
    id_colegio: int,
    col: ColegioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "editar"))
):
    if not (current_user.rol and current_user.rol.codigo == "ADM"):
        raise HTTPException(status_code=403, detail="No tienes permisos para editar colegios.")

    colegio_db = db.query(Colegio).filter(Colegio.id_colegio == id_colegio).first()
    if not colegio_db:
        raise HTTPException(status_code=404, detail="Colegio no encontrado.")
    
    update_data = col.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(colegio_db, key, value)
    
    db.commit()
    db.refresh(colegio_db)
    return colegio_db

@router.delete("/colegios/{id_colegio}")
def delete_colegio(
    id_colegio: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "eliminar"))
):
    if not (current_user.rol and current_user.rol.codigo == "ADM"):
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar colegios.")

    colegio_db = db.query(Colegio).filter(Colegio.id_colegio == id_colegio).first()
    if not colegio_db:
        raise HTTPException(status_code=404, detail="Colegio no encontrado.")
    
    # Simple check for users
    users_count = db.query(User).filter(User.id_colegio == id_colegio).count()
    if users_count > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar el colegio porque tiene usuarios asignados.")
    
    db.delete(colegio_db)
    db.commit()
    return {"status": "ok", "message": "Colegio eliminado exitosamente."}

# --- DIRECTORES POR COLEGIO ---
@router.get("/colegios/{id_colegio}/directores")
def get_directores_colegio(
    id_colegio: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista usuarios con rol Director (DIR) de un colegio específico"""
    
    # Buscar usuarios cuyo rol contenga "DIR" o "director" en el código/nombre
    usuarios = db.query(User).join(User.rol).filter(
        User.id_colegio == id_colegio,
        User.status == "Activo",
        (User.rol.has(Rol.codigo.like("%DIR%"))) | 
        (User.rol.has(Rol.nombre.ilike("%director%")))
    ).all()
    
    return [{
        "id_user": u.id_user, 
        "nombre": u.nombre, 
        "correo": u.correo,
        "rol": u.rol.nombre if u.rol else "Sin rol",
        "rol_codigo": u.rol.codigo if u.rol else "None"
    } for u in usuarios]

@router.get("/colegios/{id_colegio}/usuarios")
def get_usuarios_colegio(
    id_colegio: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos los usuarios activos de un colegio"""
    usuarios = db.query(User).join(User.rol).filter(
        User.id_colegio == id_colegio,
        User.status == "Activo"
    ).all()
    
    result = []
    for u in usuarios:
        rol_nombre = u.rol.nombre if u.rol else "Sin rol"
        rol_codigo = u.rol.codigo if u.rol else "None"
        result.append({
            "id_user": u.id_user, 
            "nombre": u.nombre, 
            "correo": u.correo,
            "rol": rol_nombre,
            "rol_codigo": rol_codigo
        })
    return result

# --- ROLES ---
@router.get("/roles", response_model=List[RolResponse])
def list_roles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Rol).all()

# --- AREAS ---
# --- AREAS ---
@router.get("/areas", response_model=List[AreaResponse])
def list_areas(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Area).all()

@router.post("/areas", response_model=AreaResponse)
def create_area(obj: AreaCreate, db: Session = Depends(get_db), current_user: User = Depends(verificar_permisos("usuarios", "crear"))):
    db_obj = Area(**obj.dict())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.put("/areas/{id_area}", response_model=AreaResponse)
def update_area(id_area: int, obj: AreaUpdate, db: Session = Depends(get_db), current_user: User = Depends(verificar_permisos("usuarios", "editar"))):
    db_obj = db.query(Area).filter(Area.id_area == id_area).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Área no encontrada")
    
    update_data = obj.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_obj, key, value)
    
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/areas/jefes", response_model=List[AreaJefeResponse])
def list_areas_jefes(
    id_colegio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_colegio = current_user.id_colegio
    if id_colegio and current_user.rol and current_user.rol.codigo in ["ADM", "SOS"]:
        target_colegio = id_colegio

    areas = db.query(Area).all()

    from sqlalchemy.orm import joinedload
    assignments = db.query(AreaColegioJefe).options(joinedload(AreaColegioJefe.jefe)).filter(
        AreaColegioJefe.id_colegio == target_colegio
    ).all()

    # Un área puede tener varios jefes → agrupamos por área.
    jefes_por_area: Dict[int, list] = {}
    for a in assignments:
        jefes_por_area.setdefault(a.id_area, []).append({
            "id_jefe": a.id_jefe,
            "jefe_nombre": a.jefe.nombre if a.jefe else None
        })

    results = []
    for area in areas:
        jefes = jefes_por_area.get(area.id_area, [])
        primero = jefes[0] if jefes else None
        results.append({
            "id_area": area.id_area,
            "nombre": area.nombre,
            "prefijo": area.prefijo,
            "id_colegio": target_colegio,
            "jefes": jefes,
            # Compatibilidad: primer jefe.
            "id_jefe": primero["id_jefe"] if primero else None,
            "jefe_nombre": primero["jefe_nombre"] if primero else None
        })
    return results

@router.put("/areas/{id_area}/jefes", response_model=AreaJefeResponse)
def set_area_jefe(
    id_area: int,
    payload: AreaJefeUpdate,
    id_colegio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "editar"))
):
    target_colegio = current_user.id_colegio
    if id_colegio and current_user.rol and current_user.rol.codigo in ["ADM", "SOS"]:
        target_colegio = id_colegio

    area = db.query(Area).filter(Area.id_area == id_area).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada")

    # Determinar la lista de jefes deseada (nuevo id_jefes o el id_jefe antiguo).
    if payload.id_jefes is not None:
        ids_deseados = payload.id_jefes
    elif payload.id_jefe is not None:
        ids_deseados = [payload.id_jefe]
    else:
        ids_deseados = []
    # Limpiar: quitar nulos y duplicados preservando el orden.
    ids_limpios = list(dict.fromkeys(i for i in ids_deseados if i))

    # Reemplazar el conjunto de jefes de esta (área, colegio).
    db.query(AreaColegioJefe).filter(
        AreaColegioJefe.id_area == id_area,
        AreaColegioJefe.id_colegio == target_colegio
    ).delete(synchronize_session=False)

    for id_jefe in ids_limpios:
        db.add(AreaColegioJefe(
            id_area=id_area,
            id_colegio=target_colegio,
            id_jefe=id_jefe
        ))

    db.commit()

    # Construir respuesta con nombres.
    jefes = []
    if ids_limpios:
        users = db.query(User).filter(User.id_user.in_(ids_limpios)).all()
        nombres = {u.id_user: u.nombre for u in users}
        # Mantener el orden pedido.
        jefes = [{"id_jefe": i, "jefe_nombre": nombres.get(i)} for i in ids_limpios]

    primero = jefes[0] if jefes else None
    return {
        "id_area": area.id_area,
        "nombre": area.nombre,
        "prefijo": area.prefijo,
        "id_colegio": target_colegio,
        "jefes": jefes,
        "id_jefe": primero["id_jefe"] if primero else None,
        "jefe_nombre": primero["jefe_nombre"] if primero else None
    }

@router.delete("/areas/{id_area}")
def delete_area(id_area: int, db: Session = Depends(get_db), current_user: User = Depends(verificar_permisos("usuarios", "eliminar"))):
    db_obj = db.query(Area).filter(Area.id_area == id_area).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Área no encontrada")
    
    # Check for subareas
    if db.query(Cargo).filter(Cargo.id_area == id_area).count() > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar el área porque tiene cargos asociados")
        
    db.delete(db_obj)
    db.commit()
    return {"detail": "Área eliminada"}

# --- SECCIONES RESTRINGIDAS (lista blanca de usuarios por sección) ---

class SeccionAccesoUpdate(BaseModel):
    id_users: List[int] = []


@router.get("/secciones-restringidas")
def list_secciones_restringidas(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "ver"))
):
    """Lista las secciones restringibles con los usuarios autorizados de cada una."""
    rows = db.query(SeccionAcceso).all()
    por_seccion: Dict[str, List[int]] = {}
    for r in rows:
        por_seccion.setdefault(r.seccion, []).append(r.id_user)
    return [
        {
            "seccion": key,
            "label": meta["label"],
            "id_users": por_seccion.get(key, []),
        }
        for key, meta in SECCIONES_RESTRINGIBLES.items()
    ]


@router.put("/secciones-restringidas/{seccion}")
def set_seccion_restringida(
    seccion: str,
    payload: SeccionAccesoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "editar"))
):
    """Reemplaza la lista blanca de usuarios de una sección restringida.
    Lista vacía = sin restricción (se usa el permiso del rol)."""
    if seccion not in SECCIONES_RESTRINGIBLES:
        raise HTTPException(status_code=404, detail="Sección no reconocida")

    db.query(SeccionAcceso).filter(
        SeccionAcceso.seccion == seccion
    ).delete(synchronize_session=False)

    ids = list(dict.fromkeys(i for i in payload.id_users if i))
    for uid in ids:
        db.add(SeccionAcceso(seccion=seccion, id_user=uid))
    db.commit()

    return {"seccion": seccion, "id_users": ids}


# --- CARGOS / SUBAREAS ---
def _set_areas_adicionales(db: Session, db_obj: Cargo, ids):
    """Asigna las áreas adicionales (M2M), excluyendo el área principal y duplicados."""
    if ids is None:
        return
    ids_limpios = {i for i in ids if i and i != db_obj.id_area}
    db_obj.areas_adicionales = db.query(Area).filter(Area.id_area.in_(ids_limpios)).all() if ids_limpios else []

def _cargo_full(db: Session, id_cargo: int):
    from sqlalchemy.orm import selectinload
    item = db.query(Cargo).options(
        selectinload(Cargo.area), selectinload(Cargo.areas_adicionales)
    ).filter(Cargo.id_cargo == id_cargo).first()
    return item

@router.get("/cargos", response_model=List[CargoResponse])
@router.get("/subareas", response_model=List[CargoResponse])
def list_cargos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    return db.query(Cargo).options(
        selectinload(Cargo.area), selectinload(Cargo.areas_adicionales)
    ).all()

@router.post("/cargos", response_model=CargoResponse)
@router.post("/subareas", response_model=CargoResponse)
def create_cargo(obj: CargoCreate, db: Session = Depends(get_db), current_user: User = Depends(verificar_permisos("usuarios", "crear"))):
    data = obj.dict()
    ids_adicionales = data.pop("areas_adicionales_ids", None)
    db_obj = Cargo(**data)
    db.add(db_obj)
    db.flush()
    _set_areas_adicionales(db, db_obj, ids_adicionales)
    db.commit()
    return _cargo_full(db, db_obj.id_cargo)

@router.put("/cargos/{id_cargo}", response_model=CargoResponse)
@router.put("/subareas/{id_cargo}", response_model=CargoResponse)
def update_cargo(id_cargo: int, obj: CargoUpdate, db: Session = Depends(get_db), current_user: User = Depends(verificar_permisos("usuarios", "editar"))):
    db_obj = db.query(Cargo).filter(Cargo.id_cargo == id_cargo).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Cargo no encontrado")

    update_data = obj.dict(exclude_unset=True)
    ids_adicionales = update_data.pop("areas_adicionales_ids", None)
    for key, value in update_data.items():
        setattr(db_obj, key, value)
    _set_areas_adicionales(db, db_obj, ids_adicionales)

    db.commit()
    return _cargo_full(db, id_cargo)

@router.delete("/cargos/{id_cargo}")
@router.delete("/subareas/{id_cargo}")
def delete_cargo(id_cargo: int, db: Session = Depends(get_db), current_user: User = Depends(verificar_permisos("usuarios", "eliminar"))):
    db_obj = db.query(Cargo).filter(Cargo.id_cargo == id_cargo).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Cargo no encontrado")
        
    # Verificar usuarios asignados: cargo principal y adicionales (M2M).
    from app.models import User, UserCargo
    asignados = db.query(User).filter(User.id_cargo == id_cargo).count()
    asignados_m2m = db.query(UserCargo).filter(UserCargo.id_cargo == id_cargo).count()
    if asignados > 0 or asignados_m2m > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar el cargo porque tiene usuarios asignados")

    # Verificar solicitudes de presupuesto asociadas (FK)
    from app.models import SolicitudPresupuesto
    if db.query(SolicitudPresupuesto).filter(SolicitudPresupuesto.id_cargo == id_cargo).count() > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar el cargo porque tiene solicitudes de presupuesto asociadas")

    db.delete(db_obj)
    db.commit()
    return {"detail": "Cargo eliminado"}

# --- ACTIVIDADES ---
@router.get("/actividades", response_model=List[dict])
def list_actividades(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    actividades = db.query(Actividad).all()
    return [
        {
            "id_actividad": a.id_actividad,
            "nombre_actividad": a.nombre_actividad,
            "dimension": a.dimension,
            "subdimension": a.subdimension
        }
        for a in actividades
    ]


# --- CUENTAS CONTABLES Y REGLAS ---
@router.get("/cuentas", response_model=List[dict])
def list_cuentas(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reglas = db.query(CuentaMatrizReglas).all()
    descripciones = {d.codigo: d for d in db.query(CuentaDescripcion).all()}
    destinos = {d.codigo: d for d in db.query(CuentaDestino).all()}

    ocultas = set(
        r.codigo_cuenta for r in db.query(CuentaOcultaColegio).filter(
            CuentaOcultaColegio.id_colegio == current_user.id_colegio
        ).all()
    )

    result = []
    for r in reglas:
        desc = descripciones.get(r.codigo)
        dest = destinos.get(r.codigo)
        result.append({
            "codigo": r.codigo,
            "nombre": r.nombre,
            "grupo": r.grupo,
            "libro_rendicion": r.libro_rendicion,
            "documentos_habilitados": r.documentos_habilitados,
            "subvenciones_reglas": r.subvenciones_reglas,
            "caracteristicas": desc.caracteristicas if desc else "",
            "diferenciacion_publico": desc.diferenciacion_publico if desc else "",
            "ejemplos_compra": desc.ejemplos_compra if desc else [],
            "advertencias_sistema": desc.advertencias_sistema if desc else [],
            "destinos": {
                "ESTUDIANTE": dest.estudiante if dest else None,
                "FUNCIONARIO": dest.funcionario if dest else None,
                "PREMIO": dest.premio if dest else None,
                "MANTENCION": dest.mantencion if dest else None,
            } if dest else None,
            "destino_principal": dest.destino_principal if dest else None,
            "oculta": r.codigo in ocultas
        })
    return result


@router.post("/cuentas/{codigo}/ocultar", status_code=200)
def ocultar_cuenta(codigo: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existe = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == codigo).first()
    if not existe:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    ya_oculta = db.query(CuentaOcultaColegio).filter(
        CuentaOcultaColegio.id_colegio == current_user.id_colegio,
        CuentaOcultaColegio.codigo_cuenta == codigo
    ).first()
    if not ya_oculta:
        db.add(CuentaOcultaColegio(id_colegio=current_user.id_colegio, codigo_cuenta=codigo))
        db.commit()
    return {"ok": True}


@router.delete("/cuentas/{codigo}/ocultar", status_code=200)
def mostrar_cuenta(codigo: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    registro = db.query(CuentaOcultaColegio).filter(
        CuentaOcultaColegio.id_colegio == current_user.id_colegio,
        CuentaOcultaColegio.codigo_cuenta == codigo
    ).first()
    if registro:
        db.delete(registro)
        db.commit()
    return {"ok": True}


# Roles autorizados a editar la ficha/matriz de cuentas contables.
# OPE = Operaciones (Contralor de Operaciones), SOS = Sostenedor, ADM = Administrador.
ROLES_EDIT_CUENTAS = {"OPE", "SOS", "ADM"}

# Códigos de subvención de la matriz (deben coincidir con la constante SUBVENCIONES
# del frontend en contralor-operaciones/page.tsx).
SUBVENCIONES_CODES = [
    'SUBV_GENERAL', 'ADM_CENTRAL_SUBV_GRAL', 'SEP', 'ADM_CENTRAL_SEP',
    'PIE', 'MANTENIMIENTO', 'PRO_RETENCION', 'INTERNADO', 'REFUERZO_EDUCATIVO'
]


def _upsert_destino(db: Session, codigo: str, grupo: Optional[str], destinos: Optional[dict], destino_principal: Optional[str]):
    """Crea o actualiza la fila de matriz de destinos de una cuenta.
    `destinos` es un dict con claves ESTUDIANTE/FUNCIONARIO/PREMIO/MANTENCION."""
    if destinos is None and destino_principal is None:
        return
    dest = db.query(CuentaDestino).filter(CuentaDestino.codigo == codigo).first()
    if not dest:
        dest = CuentaDestino(codigo=codigo, grupo=grupo)
        db.add(dest)
    d = destinos or {}
    dest.estudiante = d.get("ESTUDIANTE")
    dest.funcionario = d.get("FUNCIONARIO")
    dest.premio = d.get("PREMIO")
    dest.mantencion = d.get("MANTENCION")
    dest.destino_principal = destino_principal


@router.post("/cuentas/importar", status_code=200)
def importar_cuentas(
    payload: List[dict],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.rol or current_user.rol.codigo not in ROLES_EDIT_CUENTAS:
        raise HTTPException(status_code=403, detail="Solo el Contralor o el Sostenedor pueden importar cuentas.")

    for item in payload:
        codigo = str(item.get("codigo", "")).strip()
        if not codigo:
            continue

        cuenta = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == codigo).first()
        if not cuenta:
            cuenta = CuentaMatrizReglas(codigo=codigo)
            db.add(cuenta)

        cuenta.nombre = item.get("nombre", "")
        cuenta.grupo = item.get("grupo", codigo[:4] + "00")
        cuenta.libro_rendicion = item.get("libro_rendicion", "GENERAL")
        # Solo sobreescribir documentos si la columna viene en la fila (no borrar en filas parciales).
        if "documentos_habilitados" in item:
            cuenta.documentos_habilitados = item.get("documentos_habilitados") or []
        elif cuenta.documentos_habilitados is None:
            cuenta.documentos_habilitados = []

        # Build subvenciones_reglas rules dict (habilitado + critico + glosa)
        subv_list = [s.strip().upper() for s in item.get("subvenciones_habilitadas", [])]
        criticas = set(s.strip().upper() for s in item.get("subvenciones_criticas", []))
        glosas = item.get("subvenciones_glosas", {}) or {}
        subv_dict = {}
        for s in SUBVENCIONES_CODES:
            # match with or without prefix
            subv_dict[s] = {
                "habilitado": s in subv_list or s.replace('SUBV_', '') in subv_list,
                "critico_fiscalizacion": s in criticas or s.replace('SUBV_', '') in criticas,
                "glosa_advertencia": glosas.get(s, glosas.get(s.replace('SUBV_', ''), ""))
            }
        cuenta.subvenciones_reglas = subv_dict
        cuenta.descripcion_breve = item.get("descripcion_breve", "")

        # Update or create CuentaDescripcion
        desc = db.query(CuentaDescripcion).filter(CuentaDescripcion.codigo == codigo).first()
        if not desc:
            desc = CuentaDescripcion(codigo=codigo, nombre=cuenta.nombre, ejemplos_compra=[], advertencias_sistema=[])
            db.add(desc)
        desc.nombre = cuenta.nombre
        if "caracteristicas" in item:
            desc.caracteristicas = item.get("caracteristicas", "")
        if "diferenciacion_publico" in item:
            desc.diferenciacion_publico = item.get("diferenciacion_publico", "")
        if "ejemplos_compra" in item:
            desc.ejemplos_compra = item.get("ejemplos_compra") or []
        if "advertencias_sistema" in item:
            desc.advertencias_sistema = item.get("advertencias_sistema") or []

        # Update or create CuentaDestino (matriz de destinos)
        if "destinos" in item or "destino_principal" in item:
            _upsert_destino(db, codigo, cuenta.grupo, item.get("destinos"), item.get("destino_principal"))

    db.commit()
    return {"ok": True}


# --- EDICIÓN GRANULAR DE UNA CUENTA (Ficha Técnica y Matriz de Reglas) ---

class SubvencionReglaIn(BaseModel):
    habilitado: bool = False
    critico_fiscalizacion: bool = False
    glosa_advertencia: str = ""


class DestinosIn(BaseModel):
    ESTUDIANTE: Optional[str] = None    # 'PRINCIPAL' | 'APLICA' | None
    FUNCIONARIO: Optional[str] = None
    PREMIO: Optional[str] = None
    MANTENCION: Optional[str] = None


class CuentaUpdateIn(BaseModel):
    libro_rendicion: str
    documentos_habilitados: List[str] = []
    subvenciones_reglas: Dict[str, SubvencionReglaIn] = {}
    caracteristicas: str = ""
    diferenciacion_publico: str = ""
    ejemplos_compra: List[str] = []
    advertencias_sistema: List[str] = []
    destinos: Optional[DestinosIn] = None
    destino_principal: Optional[str] = None


@router.put("/cuentas/{codigo}", status_code=200)
def actualizar_cuenta(
    codigo: str,
    payload: CuentaUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.rol or current_user.rol.codigo not in ROLES_EDIT_CUENTAS:
        raise HTTPException(status_code=403, detail="Solo el Contralor o el Sostenedor pueden editar la ficha de cuentas.")

    cuenta = db.query(CuentaMatrizReglas).filter(CuentaMatrizReglas.codigo == codigo).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    # 1) Matriz de reglas (reasignar listas/dicts completos para que SQLAlchemy detecte el cambio)
    cuenta.libro_rendicion = payload.libro_rendicion
    cuenta.documentos_habilitados = list(payload.documentos_habilitados)
    cuenta.subvenciones_reglas = {k: v.dict() for k, v in payload.subvenciones_reglas.items()}

    # 2) Ficha técnica (crear si no existe)
    desc = db.query(CuentaDescripcion).filter(CuentaDescripcion.codigo == codigo).first()
    if not desc:
        desc = CuentaDescripcion(codigo=codigo, nombre=cuenta.nombre, ejemplos_compra=[], advertencias_sistema=[])
        db.add(desc)
    desc.nombre = cuenta.nombre
    desc.caracteristicas = payload.caracteristicas
    desc.diferenciacion_publico = payload.diferenciacion_publico
    desc.ejemplos_compra = list(payload.ejemplos_compra)
    desc.advertencias_sistema = list(payload.advertencias_sistema)

    # 3) Matriz de destinos (crear si no existe)
    destinos_dict = payload.destinos.dict() if payload.destinos else None
    _upsert_destino(db, codigo, cuenta.grupo, destinos_dict, payload.destino_principal)

    db.commit()
    return {"ok": True, "codigo": codigo}


# --- CONFIGURACIÓN GENÉRICA POR COLEGIO (clave/valor) ---
ROLES_CONFIG_ADMIN = {"ADM", "DIR", "GERENTE", "SOS", "SOSTENEDOR"}


class ConfigPayload(BaseModel):
    valor: object  # cualquier JSON-serializable


@router.get("/config/{clave}")
def get_config(clave: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cfg = None
    if current_user.id_colegio:
        cfg = db.query(OrgConfig).filter(
            OrgConfig.id_colegio == current_user.id_colegio,
            OrgConfig.clave == clave
        ).first()
    
    # Fallback to any colegio if not configured specifically for this colegio
    if not cfg:
        cfg = db.query(OrgConfig).filter(OrgConfig.clave == clave).first()

    valor = None
    if cfg and cfg.valor:
        try:
            valor = json.loads(cfg.valor)
        except Exception:
            valor = None
    return {"clave": clave, "valor": valor}


@router.put("/config/{clave}")
def set_config(clave: str, payload: ConfigPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.rol or current_user.rol.codigo not in ROLES_CONFIG_ADMIN:
        raise HTTPException(status_code=403, detail="No tienes permiso para cambiar la configuración.")
    
    # Si es ADM o SOS, propagar a todos los colegios para consistencia del sistema
    if current_user.rol.codigo in {"ADM", "SOS", "GERENTE"}:
        colegios = db.query(Colegio).all()
        for col in colegios:
            cfg = db.query(OrgConfig).filter(
                OrgConfig.id_colegio == col.id_colegio,
                OrgConfig.clave == clave
            ).first()
            if not cfg:
                db.add(OrgConfig(id_colegio=col.id_colegio, clave=clave, valor=json.dumps(payload.valor)))
            else:
                cfg.valor = json.dumps(payload.valor)
    else:
        cfg = db.query(OrgConfig).filter(
            OrgConfig.id_colegio == current_user.id_colegio,
            OrgConfig.clave == clave
        ).first()
        if not cfg:
            db.add(OrgConfig(id_colegio=current_user.id_colegio, clave=clave, valor=json.dumps(payload.valor)))
        else:
            cfg.valor = json.dumps(payload.valor)

    db.commit()
    return {"clave": clave, "valor": payload.valor}

