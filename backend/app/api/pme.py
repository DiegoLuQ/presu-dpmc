from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from app.db.session import get_db
from app.models import User, PME, Accion, Actividad, ActividadCodigoContable, CuentaMatrizReglas, Subvencion
from app.schemas.pme import (
    PMECreate,
    PMEResponse,
    PMEWithAccionesResponse,
    AccionCreate,
    AccionResponse,
    ActividadCreate,
    ActividadResponse,
    ActividadCodigoItem,
    AccionWithActividadesResponse
)
from app.api.deps import verificar_permisos

router = APIRouter(prefix="/pme", tags=["PME"])


def _build_actividad_dict(act: Actividad, db: Session) -> dict:
    accion = act.accion
    pme = accion.pme if accion else None
    colegio = pme.colegio if pme else None

    director_nombre = None
    if colegio and colegio.id_director:
        director = db.query(User).filter(User.id_user == colegio.id_director).first()
        if director:
            director_nombre = director.nombre

    codigos_list = []
    codigo_principal = None
    nombre_codigo_principal = None

    if act.codigos_contables:
        for c in act.codigos_contables:
            nombre_cuenta = c.cuenta.nombre if c.cuenta else None
            nombre_subv = c.subvencion.nombre_corto if c.subvencion else None
            if c.es_principal:
                codigo_principal = c.codigo_cuenta
                nombre_codigo_principal = nombre_cuenta
            codigos_list.append({
                "codigo_cuenta": c.codigo_cuenta,
                "id_subvencion": c.id_subvencion,
                "es_principal": bool(c.es_principal),
                "nombre_cuenta": nombre_cuenta,
                "nombre_subvencion": nombre_subv,
                "comentario": c.comentario,
                "estado": c.estado or "Pendiente"
            })

    if not codigo_principal and codigos_list:
        codigo_principal = codigos_list[0]["codigo_cuenta"]
        nombre_codigo_principal = codigos_list[0]["nombre_cuenta"]
        codigos_list[0]["es_principal"] = True

    return {
        "id_actividad": act.id_actividad,
        "id_accion": act.id_accion,
        "nombre_actividad": act.nombre_actividad,
        "descripcion": act.descripcion,
        "dimension": act.dimension,
        "subdimension": act.subdimension,
        "responsable": act.responsable,
        "medios_verificacion": act.medios_verificacion,
        "lista_recursos": act.lista_recursos,
        "costo_estimado": act.costo_estimado,
        "accion_nombre": accion.nombre_accion if accion else None,
        "accion_descripcion": accion.descripcion if accion else None,
        "accion_activa": bool(accion.activo) if (accion and hasattr(accion, 'activo') and accion.activo is not None) else True,
        "colegio_nombre": colegio.nombre if colegio else None,
        "colegio_nombre_completo": getattr(colegio, 'nombre', None) if colegio else None,
        "colegio_direccion": getattr(colegio, 'direccion', None) if colegio else None,
        "colegio_celular": getattr(colegio, 'celular', None) if colegio else None,
        "colegio_rut": getattr(colegio, 'rut', None) if colegio else None,
        "colegio_rbd": getattr(colegio, 'rbd', None) if colegio and hasattr(colegio, 'rbd') else None,
        "colegio_url_img": getattr(colegio, 'url_img', None) if colegio else None,
        "pme_year": pme.year if pme else None,
        "id_pme": pme.id_pme if pme else None,
        "director_nombre": director_nombre,
        "codigo_principal": codigo_principal,
        "nombre_codigo_principal": nombre_codigo_principal,
        "codigos_contables": codigos_list
    }


def _sync_actividad_codigos(db: Session, id_actividad: int, obj: ActividadCreate):
    codigos_items: List[ActividadCodigoItem] = []
    if obj.codigos_contables is not None:
        codigos_items = obj.codigos_contables
    elif obj.codigo_principal or obj.codigos_secundarios:
        if obj.codigo_principal:
            codigos_items.append(ActividadCodigoItem(codigo_cuenta=obj.codigo_principal, es_principal=True))
        if obj.codigos_secundarios:
            for cod in obj.codigos_secundarios:
                if cod and cod != obj.codigo_principal:
                    codigos_items.append(ActividadCodigoItem(codigo_cuenta=cod, es_principal=False))
    else:
        return

    # Eliminar códigos previos
    db.query(ActividadCodigoContable).filter(ActividadCodigoContable.id_actividad == id_actividad).delete(synchronize_session=False)

    tiene_principal = any(c.es_principal for c in codigos_items)
    vistos = set()
    for idx, item in enumerate(codigos_items):
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


@router.get("/actividades", response_model=List[ActividadResponse])
def list_all_actividades(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver")),
    id_accion: Optional[int] = Query(None, description="Filtrar por acción"),
    id_pme: Optional[int] = Query(None, description="Filtrar por PME")
):
    query = db.query(Actividad).join(Accion).options(
        selectinload(Actividad.accion).selectinload(Accion.pme).selectinload(PME.colegio),
        selectinload(Actividad.codigos_contables).selectinload(ActividadCodigoContable.cuenta),
        selectinload(Actividad.codigos_contables).selectinload(ActividadCodigoContable.subvencion)
    )

    if current_user.rol and current_user.rol.codigo not in ["ADM", "GERENTE", "ASESOR", "OPERACIONES", "FINANZAS"]:
        query = query.join(PME).filter(PME.id_colegio == current_user.id_colegio)

    if id_accion:
        query = query.filter(Actividad.id_accion == id_accion)
    elif id_pme:
        query = query.filter(Accion.id_pme == id_pme)

    actividades = query.all()
    return [_build_actividad_dict(act, db) for act in actividades]


# Ahora las rutas genéricas
# ACCIONES - ruta específica ANTES de rutas con path params
@router.get("/acciones", response_model=List[AccionWithActividadesResponse])
def list_all_acciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "ver")),
    id_pme: Optional[int] = Query(None, description="Filtrar por PME")
):
    query = db.query(Accion).options(
        selectinload(Accion.actividades),
        selectinload(Accion.pme).selectinload(PME.colegio)
    )
    
    roles_con_acceso_total = ["ADM", "GERENTE", "ASESOR", "OPERACIONES", "FINANZAS"]
    if current_user.rol and current_user.rol.codigo not in roles_con_acceso_total:
        query = query.join(PME).filter(PME.id_colegio == current_user.id_colegio)
    
    if id_pme:
        query = query.filter(Accion.id_pme == id_pme)
    
    acciones = query.all()
    
    result = []
    for acc in acciones:
        result.append({
            "id_accion": acc.id_accion,
            "id_pme": acc.id_pme,
            "nombre_accion": acc.nombre_accion,
            "descripcion": acc.descripcion,
            "verificacion": acc.verificacion,
            "responsable": acc.responsable,
            "estado": acc.estado,
            "dimension": acc.dimension,
            "subdimensiones": acc.subdimensiones,
            "objetivo_estrategico": acc.objetivo_estrategico,
            "estrategia": acc.estrategia,
            "planes_asociados": acc.planes_asociados,
            "medios_verificacion": acc.medios_verificacion,
            "recursos_necesarios": acc.recursos_necesarios,
            "monto_sep": acc.monto_sep,
            "monto_total": acc.monto_total,
            "nivel_ejecucion": acc.nivel_ejecucion,
            "justificacion_nivel": acc.justificacion_nivel,
            "fecha_inicio": acc.fecha_inicio,
            "fecha_termino": acc.fecha_termino,
            "programa_asociado": acc.programa_asociado,
            "ate": acc.ate,
            "tic": acc.tic,
            "monto_general": acc.monto_general,
            "actividades": acc.actividades,
            "pme_year": acc.pme.year if acc.pme else None,
            "colegio_nombre": acc.pme.colegio.nombre if acc.pme and acc.pme.colegio else None
        })
    
    return result


# Ahora rutas genéricas
@router.get("", response_model=List[PMEResponse])
def list_pmes(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "ver")),
    year: Optional[int] = Query(None, description="Filtrar por año")
):
    from sqlalchemy import func
    
    query = db.query(PME).options(selectinload(PME.colegio))
    
    # Roles que pueden ver todos los PMEs
    roles_con_acceso_total = ["ADM", "GERENTE", "ASESOR", "OPERACIONES", "FINANZAS"]
    
    if current_user.rol and current_user.rol.codigo in roles_con_acceso_total:
        if year:
            query = query.filter(PME.year == year)
    else:
        query = query.filter(PME.id_colegio == current_user.id_colegio)
        if year:
            query = query.filter(PME.year == year)
    
    pmes = query.all()
    
    result = []
    for pme in pmes:
        acciones_count = db.query(Accion).filter(Accion.id_pme == pme.id_pme).count()
        actividades_count = db.query(Actividad).join(Accion).filter(Accion.id_pme == pme.id_pme).count()
        
        pme_dict = {
            "id_pme": pme.id_pme,
            "id_colegio": pme.id_colegio,
            "year": pme.year,
            "acciones_count": acciones_count,
            "actividades_count": actividades_count,
            "colegio_nombre": pme.colegio.nombre if pme.colegio else None
        }
        result.append(pme_dict)
    
    return result


@router.post("", response_model=PMEResponse, status_code=201)
def create_pme(
    obj: PMECreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "crear"))
):
    existente = db.query(PME).filter(
        PME.id_colegio == obj.id_colegio,
        PME.year == obj.year
    ).first()
    
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un PME para este colegio y año")
    
    db_obj = PME(id_colegio=obj.id_colegio, year=obj.year)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.get("/{id_pme}", response_model=PMEWithAccionesResponse)
def get_pme(
    id_pme: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "ver"))
):
    pme = db.query(PME).filter(PME.id_pme == id_pme).first()
    if not pme:
        raise HTTPException(status_code=404, detail="PME no encontrado")
    
    return pme


@router.get("/acciones/{id_accion}", response_model=AccionWithActividadesResponse)
def get_accion(
    id_accion: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "ver"))
):
    accion = db.query(Accion).options(
        selectinload(Accion.actividades)
    ).filter(Accion.id_accion == id_accion).first()
    
    if not accion:
        raise HTTPException(status_code=404, detail="Acción no encontrada")
    
    return accion


@router.get("/{id_pme}/acciones", response_model=List[AccionWithActividadesResponse])
def list_acciones_by_pme(
    id_pme: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "ver"))
):
    pme = db.query(PME).filter(PME.id_pme == id_pme).first()
    if not pme:
        raise HTTPException(status_code=404, detail="PME no encontrado")
    
    acciones = db.query(Accion).options(
        selectinload(Accion.actividades)
    ).filter(Accion.id_pme == id_pme).all()
    
    return acciones


@router.post("/{id_pme}/acciones", response_model=AccionResponse, status_code=201)
def create_accion(
    id_pme: int,
    obj: AccionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "crear"))
):
    pme = db.query(PME).filter(PME.id_pme == id_pme).first()
    if not pme:
        raise HTTPException(status_code=404, detail="PME no encontrado")
    
    db_obj = Accion(
        id_pme=id_pme,
        nombre_accion=obj.nombre_accion,
        descripcion=obj.descripcion,
        verificacion=obj.verificacion,
        responsable=obj.responsable,
        estado=obj.estado,
        activo=obj.activo if obj.activo is not None else True,
        dimension=obj.dimension,
        subdimensiones=obj.subdimensiones,
        objetivo_estrategico=obj.objetivo_estrategico,
        estrategia=obj.estrategia,
        planes_asociados=obj.planes_asociados,
        medios_verificacion=obj.medios_verificacion,
        recursos_necesarios=obj.recursos_necesarios,
        monto_sep=obj.monto_sep,
        monto_total=obj.monto_total,
        nivel_ejecucion=obj.nivel_ejecucion,
        justificacion_nivel=obj.justificacion_nivel,
        fecha_inicio=obj.fecha_inicio,
        fecha_termino=obj.fecha_termino,
        programa_asociado=obj.programa_asociado,
        ate=obj.ate,
        tic=obj.tic,
        monto_general=obj.monto_general
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.put("/acciones/{id_accion}", response_model=AccionResponse)
def update_accion(
    id_accion: int,
    obj: AccionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "editar"))
):
    accion = db.query(Accion).filter(Accion.id_accion == id_accion).first()
    if not accion:
        raise HTTPException(status_code=404, detail="Acción no encontrada")

    if obj.id_pme:
        accion.id_pme = obj.id_pme
    accion.nombre_accion = obj.nombre_accion
    accion.descripcion = obj.descripcion
    accion.verificacion = obj.verificacion
    accion.responsable = obj.responsable
    accion.estado = obj.estado
    if obj.activo is not None:
        accion.activo = obj.activo
    accion.dimension = obj.dimension
    accion.subdimensiones = obj.subdimensiones
    accion.objetivo_estrategico = obj.objetivo_estrategico
    accion.estrategia = obj.estrategia
    accion.planes_asociados = obj.planes_asociados
    accion.medios_verificacion = obj.medios_verificacion
    accion.recursos_necesarios = obj.recursos_necesarios
    accion.monto_sep = obj.monto_sep
    accion.monto_total = obj.monto_total
    accion.nivel_ejecucion = obj.nivel_ejecucion
    accion.justificacion_nivel = obj.justificacion_nivel
    accion.fecha_inicio = obj.fecha_inicio
    accion.fecha_termino = obj.fecha_termino
    accion.programa_asociado = obj.programa_asociado
    accion.ate = obj.ate
    accion.tic = obj.tic
    accion.monto_general = obj.monto_general

    db.commit()
    db.refresh(accion)
    return accion


@router.get("/acciones/{id_accion}/actividades", response_model=List[ActividadResponse])
def list_actividades_by_accion(
    id_accion: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "ver"))
):
    accion = db.query(Accion).filter(Accion.id_accion == id_accion).first()
    if not accion:
        raise HTTPException(status_code=404, detail="Acción no encontrada")

    actividades = db.query(Actividad).options(
        selectinload(Actividad.accion).selectinload(Accion.pme).selectinload(PME.colegio),
        selectinload(Actividad.codigos_contables).selectinload(ActividadCodigoContable.cuenta),
        selectinload(Actividad.codigos_contables).selectinload(ActividadCodigoContable.subvencion)
    ).filter(Actividad.id_accion == id_accion).all()

    return [_build_actividad_dict(act, db) for act in actividades]


@router.post("/acciones/{id_accion}/actividades", response_model=ActividadResponse, status_code=201)
def create_actividad(
    id_accion: int,
    obj: ActividadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "crear"))
):
    accion = db.query(Accion).filter(Accion.id_accion == id_accion).first()
    if not accion:
        raise HTTPException(status_code=404, detail="Acción no encontrada")

    db_obj = Actividad(
        id_accion=id_accion,
        nombre_actividad=obj.nombre_actividad,
        descripcion=obj.descripcion,
        dimension=obj.dimension,
        subdimension=obj.subdimension,
        responsable=obj.responsable,
        medios_verificacion=obj.medios_verificacion,
        lista_recursos=obj.lista_recursos,
        costo_estimado=obj.costo_estimado
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)

    _sync_actividad_codigos(db, db_obj.id_actividad, obj)
    db.commit()
    db.refresh(db_obj)

    return _build_actividad_dict(db_obj, db)


@router.patch("/acciones/{id_accion}/toggle-activo", response_model=AccionResponse)
def toggle_activo_accion(
    id_accion: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "editar"))
):
    accion = db.query(Accion).filter(Accion.id_accion == id_accion).first()
    if not accion:
        raise HTTPException(status_code=404, detail="Acción no encontrada")

    accion.activo = not bool(accion.activo)
    db.commit()
    db.refresh(accion)
    return accion


@router.get("/actividades/{id_actividad}")
def get_actividad(
    id_actividad: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("presupuesto", "ver"))
):
    actividad = db.query(Actividad).filter(Actividad.id_actividad == id_actividad).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    return {
        "id_actividad": actividad.id_actividad,
        "nombre_actividad": actividad.nombre_actividad,
        "lista_recursos": actividad.lista_recursos
    }


@router.put("/actividades/{id_actividad}", response_model=ActividadResponse)
def update_actividad(
    id_actividad: int,
    obj: ActividadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "editar"))
):
    actividad = db.query(Actividad).filter(Actividad.id_actividad == id_actividad).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    actividad.nombre_actividad = obj.nombre_actividad
    actividad.descripcion = obj.descripcion
    actividad.dimension = obj.dimension
    actividad.subdimension = obj.subdimension
    actividad.responsable = obj.responsable
    actividad.medios_verificacion = obj.medios_verificacion
    actividad.lista_recursos = obj.lista_recursos
    actividad.costo_estimado = obj.costo_estimado
    if obj.id_accion:
        actividad.id_accion = obj.id_accion

    _sync_actividad_codigos(db, id_actividad, obj)
    db.commit()
    db.refresh(actividad)

    return _build_actividad_dict(actividad, db)


@router.delete("/acciones/{id_accion}")
def delete_accion(
    id_accion: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "eliminar"))
):
    accion = db.query(Accion).filter(Accion.id_accion == id_accion).first()
    if not accion:
        raise HTTPException(status_code=404, detail="Acción no encontrada")
    
    db.delete(accion)
    db.commit()
    return {"message": "Acción eliminada"}


@router.delete("/actividades/{id_actividad}")
def delete_actividad(
    id_actividad: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "eliminar"))
):
    actividad = db.query(Actividad).filter(Actividad.id_actividad == id_actividad).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    
    db.delete(actividad)
    db.commit()
    return {"message": "Actividad eliminada"}


@router.post("/acciones/importar")
def importar_acciones(
    acciones: List[dict],
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "crear"))
):
    resultados = {"creados": 0, "errores": []}
    
    for i, item in enumerate(acciones):
        try:
            id_pme = item.get("id_pme")
            if not id_pme:
                resultados["errores"].append(f"Fila {i+1}: Falta id_pme")
                continue
            
            pme = db.query(PME).filter(PME.id_pme == id_pme).first()
            
            if not pme:
                resultados["errores"].append(f"Fila {i+1}: No existe PME con id {id_pme}")
                continue
            
            nombre_accion = item.get("nombre_accion")
            if not nombre_accion:
                resultados["errores"].append(f"Fila {i+1}: Falta nombre_accion")
                continue
            
            accion_existente = db.query(Accion).filter(
                Accion.id_pme == pme.id_pme,
                Accion.nombre_accion == nombre_accion
            ).first()
            
            if accion_existente:
                resultados["errores"].append(f"Fila {i+1}: Ya existe acción '{nombre_accion}'")
                continue
            
            nueva_accion = Accion(
                id_pme=pme.id_pme,
                nombre_accion=nombre_accion,
                descripcion=item.get("descripcion"),
                verificacion=item.get("verificacion"),
                responsable=item.get("responsable"),
                estado=item.get("estado", "Pendiente"),
                activo=bool(item.get("activo", True)) if item.get("activo") is not None else True,
                dimension=item.get("dimension"),
                subdimensiones=item.get("subdimensiones"),
                objetivo_estrategico=item.get("objetivo_estrategico"),
                estrategia=item.get("estrategia"),
                planes_asociados=item.get("planes_asociados"),
                medios_verificacion=item.get("medios_verificacion"),
                recursos_necesarios=item.get("recursos_necesarios") or item.get("recursos_necesarios_ejecucion") or item.get("Recursos Necesarios Ejecución"),
                monto_sep=item.get("monto_sep") or item.get("monto_subvencion_sep") or item.get("Monto Subvención SEP"),
                monto_total=item.get("monto_total") or item.get("Monto Total"),
                nivel_ejecucion=item.get("nivel_ejecucion") or item.get("Nivel de ejecución") or item.get("Nivel de ejecucion"),
                justificacion_nivel=item.get("justificacion_nivel") or item.get("Justificación de nivel") or item.get("Justificacion de nivel"),
                fecha_inicio=item.get("fecha_inicio") or item.get("Fecha Inicio"),
                fecha_termino=item.get("fecha_termino") or item.get("Fecha Termino") or item.get("Fecha Término"),
                programa_asociado=item.get("programa_asociado") or item.get("Programa Asociado"),
                ate=item.get("ate") or item.get("Ate"),
                tic=item.get("tic") or item.get("Tic"),
                monto_general=item.get("monto_general") or item.get("monto_subvencion_general") or item.get("Monto Subvención General")
            )
            db.add(nueva_accion)
            resultados["creados"] += 1
            
        except Exception as e:
            resultados["errores"].append(f"Fila {i+1}: Error - {str(e)}")
    
    db.commit()
    return resultados


@router.post("/actividades/importar")
def importar_actividades(
    actividades: List[dict],
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "crear"))
):
    resultados = {"creados": 0, "errores": []}
    
    for i, item in enumerate(actividades):
        try:
            id_accion = item.get("id_accion")
            if not id_accion:
                resultados["errores"].append(f"Fila {i+1}: Falta id_accion")
                continue
            
            accion = db.query(Accion).filter(Accion.id_accion == id_accion).first()
            
            if not accion:
                resultados["errores"].append(f"Fila {i+1}: No existe acción con id {id_accion}")
                continue
            
            nombre_actividad = item.get("nombre_actividad")
            if not nombre_actividad:
                resultados["errores"].append(f"Fila {i+1}: Falta nombre_actividad")
                continue
            
            nueva_actividad = Actividad(
                id_accion=accion.id_accion,
                nombre_actividad=nombre_actividad,
                descripcion=item.get("descripcion"),
                dimension=item.get("dimension"),
                subdimension=item.get("subdimension"),
                responsable=item.get("responsable"),
                medios_verificacion=item.get("medios_verificacion"),
                lista_recursos=item.get("lista_recursos"),
                costo_estimado=item.get("costo_estimado")
            )
            db.add(nueva_actividad)
            resultados["creados"] += 1
            
        except Exception as e:
            resultados["errores"].append(f"Fila {i+1}: Error - {str(e)}")
    
    db.commit()
    return resultados


@router.post("/copiar")
def copiar_pme(
    id_pme_origen: int,
    id_pme_destino: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("pme", "crear"))
):
    pme_origen = db.query(PME).filter(PME.id_pme == id_pme_origen).first()
    if not pme_origen:
        raise HTTPException(status_code=404, detail="PME origen no encontrado")
    
    pme_destino = db.query(PME).filter(PME.id_pme == id_pme_destino).first()
    if not pme_destino:
        raise HTTPException(status_code=404, detail="PME destino no encontrado")
    
    acciones_origen = db.query(Accion).filter(Accion.id_pme == id_pme_origen).all()
    
    copied = {"acciones": 0, "actividades": 0}
    
    for accion_origen in acciones_origen:
        nueva_accion = Accion(
            id_pme=id_pme_destino,
            nombre_accion=accion_origen.nombre_accion,
            descripcion=accion_origen.descripcion,
            verificacion=accion_origen.verificacion,
            responsable=accion_origen.responsable,
            estado="Pendiente",
            activo=bool(accion_origen.activo) if accion_origen.activo is not None else True
        )
        db.add(nueva_accion)
        db.flush()
        copied["acciones"] += 1
        
        actividades_origen = db.query(Actividad).filter(Actividad.id_accion == accion_origen.id_accion).all()
        
        for act_origen in actividades_origen:
            nueva_actividad = Actividad(
                id_accion=nueva_accion.id_accion,
                nombre_actividad=act_origen.nombre_actividad,
                descripcion=act_origen.descripcion,
                dimension=act_origen.dimension,
                subdimension=act_origen.subdimension,
                responsable=act_origen.responsable,
                medios_verificacion=act_origen.medios_verificacion,
                lista_recursos=act_origen.lista_recursos,
                costo_estimado=act_origen.costo_estimado
            )
            db.add(nueva_actividad)
            copied["actividades"] += 1
    
    db.commit()
    return {"message": "PME copiado exitosamente", "copied": copied}