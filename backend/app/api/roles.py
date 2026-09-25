from fastapi import APIRouter, Depends, HTTPException, status
import traceback
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models import Rol, User
from app.schemas.rol import RolCreate, RolUpdate, RolResponse
from app.api.deps import verificar_permisos

router = APIRouter(prefix="/roles", tags=["roles"])

@router.get("/", response_model=List[RolResponse])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("roles", "ver"))
):
    try:
        import json
        roles = db.query(Rol).all()
        result = []
        for rol in roles:
            raw_permisos = rol.permisos
            permisos_list = []
            if raw_permisos is not None:
                if isinstance(raw_permisos, str):
                    try:
                        permisos_list = json.loads(raw_permisos)
                    except:
                        permisos_list = []
                elif isinstance(raw_permisos, list):
                    permisos_list = raw_permisos
            
            result.append({
                "id_rol": rol.id_rol,
                "nombre": rol.nombre,
                "codigo": rol.codigo,
                "prefijo": rol.prefijo,
                "permisos": permisos_list
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=RolResponse)
def create_rol(
    rol: RolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("roles", "crear"))
):
    import json
    rol_data = rol.dict()
    
    # Convertir permisos a JSON string si es lista
    if rol_data.get("permisos") and isinstance(rol_data["permisos"], list):
        rol_data["permisos"] = json.dumps(rol_data["permisos"])
    
    db_rol = Rol(**rol_data)
    db.add(db_rol)
    db.commit()
    db.refresh(db_rol)
    
    # Devolver diccionario con permisos parseados
    permisos_raw = db_rol.permisos
    permisos_list = []
    if permisos_raw is not None:
        if isinstance(permisos_raw, str):
            try:
                permisos_list = json.loads(permisos_raw)
            except:
                permisos_list = []
        elif isinstance(permisos_raw, list):
            permisos_list = permisos_raw
    
    return {
        "id_rol": db_rol.id_rol,
        "nombre": db_rol.nombre,
        "codigo": db_rol.codigo,
        "prefijo": db_rol.prefijo,
        "permisos": permisos_list
    }

@router.put("/{id_rol}", response_model=RolResponse)
def update_rol(
    id_rol: int,
    rol: RolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("roles", "editar"))
):
    import json
    db_rol = db.query(Rol).filter(Rol.id_rol == id_rol).first()
    if not db_rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    update_data = rol.dict(exclude_unset=True)
    
    # Convertir permisos a JSON string si es lista
    if "permisos" in update_data and update_data["permisos"] is not None:
        if isinstance(update_data["permisos"], list):
            update_data["permisos"] = json.dumps(update_data["permisos"])
    
    for key, value in update_data.items():
        setattr(db_rol, key, value)
    
    db.commit()
    db.refresh(db_rol)
    
    # Devolver diccionario con permisos parseados
    permisos_raw = db_rol.permisos
    permisos_list = []
    if permisos_raw is not None:
        if isinstance(permisos_raw, str):
            try:
                permisos_list = json.loads(permisos_raw)
            except:
                permisos_list = []
        elif isinstance(permisos_raw, list):
            permisos_list = permisos_raw
    
    return {
        "id_rol": db_rol.id_rol,
        "nombre": db_rol.nombre,
        "codigo": db_rol.codigo,
        "prefijo": db_rol.prefijo,
        "permisos": permisos_list
    }

@router.delete("/{id_rol}")
def delete_rol(
    id_rol: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("roles", "eliminar"))
):
    db_rol = db.query(Rol).filter(Rol.id_rol == id_rol).first()
    if not db_rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
        
    # Check if the role is currently in use by any user
    if db.query(User).filter(User.id_rol == id_rol).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar un rol que está asignado a usuarios"
        )
        
    db.delete(db_rol)
    db.commit()
    return {"status": "ok", "message": "Rol eliminado exitosamente"}
