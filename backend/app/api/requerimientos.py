from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models_req import Requerimiento, DetalleRequerimiento, EstadoDetalle, ReqImagen
from app.models import User, Actividad, Subarea
from app.schemas.req import (
    RequerimientoCreate,
    RequerimientoResponse,
    RequerimientoWithDetailsResponse,
    DetalleRequerimientoCreate,
    DetalleRequerimientoResponse,
    EstadoDetalleBase,
    EstadoDetalleResponse
)
from app.api.deps import verificar_permisos

router = APIRouter(prefix="/requerimientos", tags=["Requerimientos"])

@router.get("", response_model=List[RequerimientoWithDetailsResponse])
def list_requerimientos(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("requerimiento", "ver")),
    id_area: Optional[int] = Query(None, description="Filtrar por área")
):
    query = db.query(Requerimiento)
    
    if id_area:
        query = query.join(User).join(Subarea).filter(Subarea.id_area == id_area)
    elif current_user.subarea and current_user.subarea.area:
        id_area_usuario = current_user.subarea.area.id_area
        query = query.join(User).join(Subarea).filter(Subarea.id_area == id_area_usuario)
    
    requerimientos = query.all()
    results = []
    
    for req in requerimientos:
        usuario = db.query(User).filter(User.id_user == req.id_usuario).first()
        actividad = db.query(Actividad).filter(Actividad.id_actividad == req.id_actividad).first()
        
        detalles = []
        for det in req.detalles:
            estado_detalle = db.query(EstadoDetalle).filter(EstadoDetalle.id_estado == det.id_estado).first()
            detalles.append({
                "id_detalle": det.id_detalle,
                "id_requerimiento": det.id_requerimiento,
                "lugar": det.lugar,
                "descripcion": det.descripcion,
                "fecha_hora": det.fecha_hora,
                "justificacion": det.justificacion,
                "estado": det.estado,
                "precio": det.precio,
                "cantidad": det.cantidad,
                "id_estado": det.id_estado,
                "estado_detalle": {"id_estado": estado_detalle.id_estado, "nombre": estado_detalle.nombre} if estado_detalle else None
            })
        
        results.append({
            "id_requerimiento": req.id_requerimiento,
            "numero": req.numero,
            "id_usuario": req.id_usuario,
            "id_actividad": req.id_actividad,
            "fecha": req.fecha,
            "para": req.para,
            "estado": req.estado,
            "usuario_nombre": usuario.nombre if usuario else "Anon",
            "actividad_nombre": actividad.nombre_actividad if actividad else "Sin actividad",
            "detalles": detalles,
            "imagenes": []
        })
    
    return results

@router.post("", response_model=RequerimientoWithDetailsResponse, status_code=status.HTTP_201_CREATED)
def create_requerimiento(
    obj: RequerimientoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("requerimiento", "crear"))
):
    db_obj = Requerimiento(
        numero=obj.numero,
        id_usuario=current_user.id_user,
        id_actividad=obj.id_actividad,
        para=obj.para,
        estado="Pendiente"
    )
    db.add(db_obj)
    db.flush()
    
    for det in obj.detalles:
        db_det = DetalleRequerimiento(
            id_requerimiento=db_obj.id_requerimiento,
            lugar=det.lugar,
            descripcion=det.descripcion,
            fecha_hora=det.fecha_hora,
            justificacion=det.justificacion,
            estado="Pendiente",
            precio=det.precio,
            cantidad=det.cantidad,
            id_estado=det.id_estado
        )
        db.add(db_det)
    
    db.commit()
    db.refresh(db_obj)
    
    return {
        "id_requerimiento": db_obj.id_requerimiento,
        "numero": db_obj.numero,
        "id_usuario": db_obj.id_usuario,
        "id_actividad": db_obj.id_actividad,
        "fecha": db_obj.fecha,
        "para": db_obj.para,
        "estado": db_obj.estado,
        "usuario_nombre": current_user.nombre,
        "actividad_nombre": db_obj.actividad.nombre_actividad if db_obj.actividad else "Sin actividad",
        "detalles": db_obj.detalles
    }

@router.patch("/{id_requerimiento}/estado")
def update_requerimiento_estado(
    id_requerimiento: int,
    nuevo_estado: str = Query(..., enum=["Aprobado", "Rechazado", "Pendiente"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("requerimiento", "aprobar"))
):
    db_obj = db.query(Requerimiento).filter(Requerimiento.id_requerimiento == id_requerimiento).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Requerimiento no encontrado")
    
    db_obj.estado = nuevo_estado
    db.commit()
    db.refresh(db_obj)
    
    return {"id_requerimiento": db_obj.id_requerimiento, "estado": db_obj.estado}

@router.get("/estados", response_model=List[EstadoDetalleResponse])
def list_estados(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("requerimiento", "ver"))
):
    return db.query(EstadoDetalle).all()

@router.post("/estados", response_model=EstadoDetalleResponse, status_code=status.HTTP_201_CREATED)
def create_estado(
    obj: EstadoDetalleBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("requerimiento", "crear"))
):
    db_obj = EstadoDetalle(**obj.dict())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.post("/{id_requerimiento}/imagenes", status_code=status.HTTP_201_CREATED)
def add_imagen(
    id_requerimiento: int,
    url_img: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("requerimiento", "crear"))
):
    requerimiento = db.query(Requerimiento).filter(Requerimiento.id_requerimiento == id_requerimiento).first()
    if not requerimiento:
        raise HTTPException(status_code=404, detail="Requerimiento no encontrado")
    
    db_img = ReqImagen(id_requerimiento=id_requerimiento, url_img=url_img)
    db.add(db_img)
    db.commit()
    db.refresh(db_img)
    
    return {"id_imagen": db_img.id_imagen, "id_requerimiento": id_requerimiento, "url_img": db_img.url_img}
