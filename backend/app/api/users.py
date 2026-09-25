from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from typing import List

from app.db.session import get_db
from app.models import User, Rol, Colegio, Cargo, Subarea
from app.schemas.auth import UserResponse, UserCreate, UserUpdate
from app.api.auth import get_current_user
from app.core import security
from app.api.deps import verificar_permisos

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "ver"))
):
    """
    Lista todos los usuarios pertenecientes al colegio del usuario actual.
    """
    query = db.query(User).options(
        selectinload(User.rol),
        selectinload(User.colegio),
        selectinload(User.colegios),
        selectinload(User.cargo),
        selectinload(User.cargos)
    )
    if current_user.rol and current_user.rol.codigo != "ADM":
        query = query.filter(User.id_colegio == current_user.id_colegio)
    return query.all()

@router.post("/bulk-import")
def bulk_import_users(
    items: List[dict],
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "crear"))
):
    """
    Importación masiva de usuarios desde Excel.
    Si el usuario (RUT o Correo) ya existe en la BD o en el lote actual, se salta (omitido).
    """
    if not items:
        return {"creados": 0, "omitidos": 0, "detalles": [], "total": 0}

    # Cargar datos existentes para deduplicación rápida
    existing_ruts = set()
    for (r,) in db.query(User.rut).all():
        if r:
            existing_ruts.add(r.strip().lower())
            existing_ruts.add(r.replace(".", "").replace("-", "").strip().lower())

    existing_emails = set()
    for (e,) in db.query(User.correo).all():
        if e:
            existing_emails.add(e.strip().lower())

    # Mapas auxiliares para roles, colegios y subáreas
    roles_list = db.query(Rol).all()
    roles_dict = {}
    for r in roles_list:
        roles_dict[r.nombre.strip().lower()] = r.id_rol
        roles_dict[r.codigo.strip().lower()] = r.id_rol

    colegios_list = db.query(Colegio).all()
    colegios_dict = {c.nombre.strip().lower(): c.id_colegio for c in colegios_list}

    cargos_list = db.query(Cargo).all()
    cargos_dict = {s.nombre.strip().lower(): s.id_cargo for s in cargos_list}
    subareas_dict = cargos_dict

    default_rol_id = current_user.id_rol or (roles_list[0].id_rol if roles_list else 1)

    creados = 0
    omitidos = 0
    detalles = []

    for idx, item in enumerate(items, start=1):
        rut_raw = str(item.get("RUT") or item.get("rut") or "").strip()
        nombre = str(item.get("Nombre") or item.get("nombre") or "").strip()
        correo = str(item.get("Correo") or item.get("correo") or "").strip()
        celular = str(item.get("Celular") or item.get("celular") or "").strip()
        password_raw = str(item.get("Contraseña") or item.get("password") or "").strip()
        rol_name = str(item.get("Rol") or item.get("rol") or "").strip()
        colegio_name = str(item.get("Colegio") or item.get("colegio") or "").strip()
        subarea_name = str(item.get("Cargo") or item.get("cargo") or item.get("Subárea") or item.get("Subarea") or item.get("subarea") or "").strip()

        if not rut_raw or not correo or not nombre:
            omitidos += 1
            detalles.append(f"Fila {idx}: Omitido por faltar campos obligatorios (RUT, Nombre o Correo).")
            continue

        rut_clean = rut_raw.strip().lower()
        rut_clean_norm = rut_raw.replace(".", "").replace("-", "").strip().lower()
        correo_clean = correo.strip().lower()

        # Verificar si el usuario ya existe (por RUT o Correo)
        if rut_clean in existing_ruts or rut_clean_norm in existing_ruts or correo_clean in existing_emails:
            omitidos += 1
            detalles.append(f"Fila {idx}: Omitido - Usuario con RUT '{rut_raw}' o Correo '{correo}' ya se encuentra registrado.")
            continue

        # Registrar en conjuntos para evitar duplicados repetidos en el mismo Excel
        existing_ruts.add(rut_clean)
        existing_ruts.add(rut_clean_norm)
        existing_emails.add(correo_clean)

        id_rol = roles_dict.get(rol_name.lower(), default_rol_id)
        id_colegio = colegios_dict.get(colegio_name.lower(), current_user.id_colegio)
        id_subarea = subareas_dict.get(subarea_name.lower(), None)

        pass_to_hash = password_raw if password_raw else (rut_clean_norm or "123456")
        hashed_pass = security.get_password_hash(pass_to_hash)

        nuevo_user = User(
            rut=rut_raw,
            nombre=nombre,
            correo=correo,
            celular=celular if celular else None,
            id_colegio=id_colegio,
            id_subarea=id_subarea,
            id_rol=id_rol,
            password=hashed_pass,
            status="Activo"
        )

        if id_subarea:
            sub_obj = db.query(Cargo).filter(Cargo.id_cargo == id_subarea).first()
            if sub_obj:
                nuevo_user.cargos = [sub_obj]
                nuevo_user.subareas = [sub_obj]

        if id_colegio:
            col_obj = db.query(Colegio).filter(Colegio.id_colegio == id_colegio).first()
            if col_obj:
                nuevo_user.colegios = [col_obj]

        db.add(nuevo_user)
        creados += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error guardando los usuarios: {str(e)}")

    return {
        "creados": creados,
        "omitidos": omitidos,
        "detalles": detalles,
        "total": len(items)
    }

@router.post("/", response_model=UserResponse)
def create_user(
    obj: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "crear"))
):
    """
    Crea un nuevo usuario en la base de datos (con contraseña cifrada).
    """
    # Verificar si el email o rut ya existen
    existing_user = db.query(User).filter(
        (User.rut == obj.rut) | (User.correo == obj.correo)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Un usuario con ese RUT o Correo ya existe."
        )

    # Set id_cargo / id_subarea
    cargos_ids = obj.cargos_ids if obj.cargos_ids is not None else obj.subareas_ids
    cargo_id = obj.id_cargo or obj.id_subarea
    if cargos_ids and len(cargos_ids) > 0:
        cargo_id = cargos_ids[0]

    # Colegios: el primero de colegios_ids es el "principal"; si no se envía lista,
    # se usa el colegio único (obj.id_colegio o el del creador) y se refleja en la M2M.
    colegios_ids = obj.colegios_ids if obj.colegios_ids else (
        [obj.id_colegio] if obj.id_colegio else [current_user.id_colegio]
    )
    colegio_principal = colegios_ids[0] if colegios_ids else current_user.id_colegio

    # Hashear contraseña
    hashed_pass = security.get_password_hash(obj.password)

    nuevo_user = User(
        rut=obj.rut,
        nombre=obj.nombre,
        correo=obj.correo,
        celular=obj.celular,
        id_colegio=colegio_principal,
        id_cargo=cargo_id,
        id_rol=obj.id_rol,
        password=hashed_pass,
        status="Activo"
    )

    if cargos_ids:
        cargos_list = db.query(Cargo).filter(Cargo.id_cargo.in_(cargos_ids)).all()
        nuevo_user.cargos = cargos_list

    if colegios_ids:
        colegios_list = db.query(Colegio).filter(Colegio.id_colegio.in_(colegios_ids)).all()
        nuevo_user.colegios = colegios_list

    db.add(nuevo_user)
    db.commit()
    db.refresh(nuevo_user)

    return db.query(User).options(
        selectinload(User.rol),
        selectinload(User.colegio),
        selectinload(User.colegios),
        selectinload(User.cargo),
        selectinload(User.cargos)
    ).filter(User.id_user == nuevo_user.id_user).first()

@router.put("/{id_user}", response_model=UserResponse)
def update_user(
    id_user: int,
    obj: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "editar"))
):
    """
    Actualiza la información de un usuario existente.
    """
    query = db.query(User).filter(User.id_user == id_user)
    if current_user.rol and current_user.rol.codigo != "ADM":
        query = query.filter(User.id_colegio == current_user.id_colegio)
    user_to_update = query.first()
    
    if not user_to_update:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        
    update_data = obj.dict(exclude_unset=True)

    def norm_rut(val: str) -> str:
        return val.replace(".", "").replace("-", "").strip().lower() if val else ""
    
    # Validar duplicado de RUT o Correo sólo si fueron modificados
    new_rut = update_data.get("rut")
    new_correo = update_data.get("correo")

    if new_rut and norm_rut(new_rut) != norm_rut(user_to_update.rut):
        target_rut = norm_rut(new_rut)
        for other_u in db.query(User).filter(User.id_user != id_user).all():
            if other_u.rut and norm_rut(other_u.rut) == target_rut:
                raise HTTPException(
                    status_code=400,
                    detail=f"Ya existe otro usuario con el RUT '{new_rut}'."
                )

    if new_correo and new_correo.strip().lower() != (user_to_update.correo or "").strip().lower():
        target_email = new_correo.strip().lower()
        existing_other = db.query(User).filter(
            User.id_user != id_user,
            func.lower(User.correo) == target_email
        ).first()
        if existing_other:
            raise HTTPException(
                status_code=400,
                detail=f"Ya existe otro usuario con el Correo '{new_correo}'."
            )

    if "password" in update_data:
        if update_data["password"]:
            update_data["password"] = security.get_password_hash(update_data["password"])
        else:
            update_data.pop("password", None)
        
    cargos_ids = update_data.pop("cargos_ids", None)
    if cargos_ids is None:
        cargos_ids = update_data.pop("subareas_ids", None)
    else:
        update_data.pop("subareas_ids", None)

    if cargos_ids is not None:
        cargos_list = db.query(Cargo).filter(Cargo.id_cargo.in_(cargos_ids)).all()
        user_to_update.cargos = cargos_list
        selected_id = cargos_ids[0] if len(cargos_ids) > 0 else None
        user_to_update.id_cargo = selected_id

    colegios_ids = update_data.pop("colegios_ids", None)
    if colegios_ids is not None:
        colegios_list = db.query(Colegio).filter(Colegio.id_colegio.in_(colegios_ids)).all()
        user_to_update.colegios = colegios_list
        if len(colegios_ids) > 0:
            user_to_update.id_colegio = colegios_ids[0]

    for key, value in update_data.items():
        if value is not None:
            setattr(user_to_update, key, value)

    try:
        db.commit()
        db.refresh(user_to_update)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Error al guardar cambios: {str(e)}"
        )

    return db.query(User).options(
        selectinload(User.rol),
        selectinload(User.colegio),
        selectinload(User.colegios),
        selectinload(User.cargo),
        selectinload(User.cargos)
    ).filter(User.id_user == id_user).first()

@router.delete("/{id_user}")
def delete_user(
    id_user: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verificar_permisos("usuarios", "eliminar"))
):
    """
    Desactiva o elimina un usuario lógicamente.
    """
    query = db.query(User).filter(User.id_user == id_user)
    if current_user.rol and current_user.rol.codigo != "ADM":
        query = query.filter(User.id_colegio == current_user.id_colegio)
    user_to_delete = query.first()
    
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        
    if user_to_delete.id_user == current_user.id_user:
         raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario.")
         
    # Aquí podríamos cambiar status="Inactivo" en vez de eliminar física
    user_to_delete.status = "Inactivo"
    db.commit()
    
    return {"status": "ok", "message": "Usuario inactivado."}
