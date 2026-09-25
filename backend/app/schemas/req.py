from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class EstadoDetalleBase(BaseModel):
    nombre: str

class EstadoDetalleResponse(EstadoDetalleBase):
    id_estado: int

    class Config:
        from_attributes = True

class DetalleRequerimientoBase(BaseModel):
    lugar: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_hora: Optional[str] = None
    justificacion: Optional[str] = None
    estado: str = "Pendiente"
    precio: int = 0
    cantidad: int = 1
    id_estado: Optional[int] = None

class DetalleRequerimientoCreate(DetalleRequerimientoBase):
    pass

class DetalleRequerimientoResponse(DetalleRequerimientoBase):
    id_detalle: int
    id_requerimiento: int
    estado_detalle: Optional[EstadoDetalleResponse] = None

    class Config:
        from_attributes = True

class RequerimientoBase(BaseModel):
    numero: str
    id_actividad: Optional[int] = None
    para: Optional[str] = None
    estado: str = "Pendiente"

class RequerimientoCreate(RequerimientoBase):
    detalles: List[DetalleRequerimientoCreate]

class RequerimientoResponse(RequerimientoBase):
    id_requerimiento: int
    id_usuario: int
    fecha: datetime
    
    class Config:
        from_attributes = True

class RequerimientoWithDetailsResponse(RequerimientoBase):
    id_requerimiento: int
    id_usuario: int
    id_actividad: Optional[int] = None
    fecha: datetime
    usuario_nombre: Optional[str] = None
    actividad_nombre: Optional[str] = None
    detalles: List[DetalleRequerimientoResponse]
    imagenes: List["ReqImagenResponse"] = []

    class Config:
        from_attributes = True

class ReqImagenBase(BaseModel):
    url_img: str

class ReqImagenResponse(ReqImagenBase):
    id_imagen: int
    id_requerimiento: int

    class Config:
        from_attributes = True
