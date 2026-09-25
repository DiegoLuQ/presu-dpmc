from pydantic import BaseModel, EmailStr
from typing import Optional, List
from app.schemas.rol import RolResponse

class AreaBase(BaseModel):
    nombre: str
    prefijo: Optional[str] = None

class AreaCreate(AreaBase):
    pass

class AreaUpdate(BaseModel):
    nombre: Optional[str] = None
    prefijo: Optional[str] = None

class AreaResponse(AreaBase):
    id_area: int
    class Config:
        from_attributes = True

class AreaJefeUpdate(BaseModel):
    # Nuevo: lista de jefes (un área puede tener varios).
    id_jefes: Optional[List[int]] = None
    # Compatibilidad: se sigue aceptando un solo id_jefe.
    id_jefe: Optional[int] = None

class JefeInfo(BaseModel):
    id_jefe: int
    jefe_nombre: Optional[str] = None
    class Config:
        from_attributes = True

class AreaJefeResponse(BaseModel):
    id_area: int
    nombre: str
    prefijo: Optional[str] = None
    id_colegio: int
    # Lista completa de jefes del área.
    jefes: List[JefeInfo] = []
    # Compatibilidad con consumidores antiguos (primer jefe, si hay).
    id_jefe: Optional[int] = None
    jefe_nombre: Optional[str] = None
    class Config:
        from_attributes = True

class CargoBase(BaseModel):
    nombre: str
    id_area: int

class CargoCreate(CargoBase):
    areas_adicionales_ids: Optional[List[int]] = None

class CargoUpdate(BaseModel):
    nombre: Optional[str] = None
    id_area: Optional[int] = None
    areas_adicionales_ids: Optional[List[int]] = None

class CargoResponse(CargoBase):
    id_cargo: int
    id_subarea: Optional[int] = None
    area: Optional[AreaResponse] = None
    areas_adicionales: Optional[List[AreaResponse]] = None
    class Config:
        from_attributes = True

SubareaBase = CargoBase
SubareaCreate = CargoCreate
SubareaUpdate = CargoUpdate
SubareaResponse = CargoResponse

class ColegioBase(BaseModel):
    nombre: str
    rut: Optional[str] = None
    direccion: Optional[str] = None
    correo: Optional[str] = None
    celular: Optional[str] = None
    url_img: Optional[str] = None
    rbd: Optional[str] = None
    id_director: Optional[int] = None

class ColegioCreate(ColegioBase):
    pass

class ColegioUpdate(BaseModel):
    nombre: Optional[str] = None
    rut: Optional[str] = None
    direccion: Optional[str] = None
    correo: Optional[str] = None
    celular: Optional[str] = None
    url_img: Optional[str] = None
    rbd: Optional[str] = None
    id_director: Optional[int] = None

class ColegioResponse(ColegioBase):
    id_colegio: int
    director_nombre: Optional[str] = None

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    rut: str
    nombre: str
    correo: EmailStr
    celular: Optional[str] = None
    id_colegio: Optional[int] = None
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None
    id_rol: Optional[int] = None

class UserCreate(UserBase):
    password: str
    cargos_ids: Optional[List[int]] = None
    subareas_ids: Optional[List[int]] = None
    colegios_ids: Optional[List[int]] = None

class UserUpdate(BaseModel):
    rut: Optional[str] = None
    nombre: Optional[str] = None
    correo: Optional[EmailStr] = None
    celular: Optional[str] = None
    id_colegio: Optional[int] = None
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None
    id_rol: Optional[int] = None
    password: Optional[str] = None
    status: Optional[str] = None
    cargos_ids: Optional[List[int]] = None
    subareas_ids: Optional[List[int]] = None
    colegios_ids: Optional[List[int]] = None

class UserResponse(UserBase):
    id_user: int
    status: str
    rol: Optional[RolResponse] = None
    colegio: Optional[ColegioResponse] = None
    colegios: Optional[List[ColegioResponse]] = None
    cargo: Optional[CargoResponse] = None
    cargos: Optional[List[CargoResponse]] = None
    subarea: Optional[SubareaResponse] = None
    subareas: Optional[List[SubareaResponse]] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    user_id: Optional[int] = None
    codigo_rol: Optional[str] = None

class LoginRequest(BaseModel):
    identifier: str
    password: str
