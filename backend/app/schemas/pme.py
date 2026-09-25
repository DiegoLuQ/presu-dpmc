from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class AccionBase(BaseModel):
    nombre_accion: str
    descripcion: Optional[str] = None
    verificacion: Optional[str] = None
    responsable: Optional[str] = None
    estado: str = "Pendiente"
    activo: bool = True
    dimension: Optional[str] = None
    subdimensiones: Optional[str] = None
    objetivo_estrategico: Optional[str] = None
    estrategia: Optional[str] = None
    planes_asociados: Optional[str] = None
    medios_verificacion: Optional[str] = None
    recursos_necesarios: Optional[str] = None
    monto_sep: Optional[Decimal] = None
    monto_total: Optional[Decimal] = None
    nivel_ejecucion: Optional[str] = None
    justificacion_nivel: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_termino: Optional[str] = None
    programa_asociado: Optional[str] = None
    ate: Optional[str] = None
    tic: Optional[str] = None
    monto_general: Optional[Decimal] = None


class AccionCreate(AccionBase):
    id_pme: Optional[int] = None


class AccionResponse(AccionBase):
    id_accion: int
    id_pme: int
    pme_year: Optional[int] = None
    colegio_nombre: Optional[str] = None

    class Config:
        from_attributes = True


class ActividadCodigoItem(BaseModel):
    codigo_cuenta: str
    id_subvencion: Optional[int] = None
    es_principal: bool = False
    nombre_cuenta: Optional[str] = None
    nombre_subvencion: Optional[str] = None
    comentario: Optional[str] = None
    estado: Optional[str] = "Pendiente"


class ActividadBase(BaseModel):
    nombre_actividad: str
    descripcion: Optional[str] = None
    dimension: Optional[str] = None
    subdimension: Optional[str] = None
    responsable: Optional[str] = None
    medios_verificacion: Optional[str] = None
    lista_recursos: Optional[str] = None
    costo_estimado: Optional[Decimal] = None


class ActividadCreate(ActividadBase):
    id_accion: Optional[int] = None
    codigos_contables: Optional[List[ActividadCodigoItem]] = None
    codigo_principal: Optional[str] = None
    codigos_secundarios: Optional[List[str]] = None


class ActividadResponse(ActividadBase):
    id_actividad: int
    id_accion: int
    accion_nombre: Optional[str] = None
    accion_descripcion: Optional[str] = None
    accion_activa: Optional[bool] = True
    colegio_nombre: Optional[str] = None
    colegio_direccion: Optional[str] = None
    colegio_celular: Optional[str] = None
    colegio_rut: Optional[str] = None
    colegio_rbd: Optional[str] = None
    colegio_url_img: Optional[str] = None
    pme_year: Optional[int] = None
    id_pme: Optional[int] = None
    director_nombre: Optional[str] = None
    codigo_principal: Optional[str] = None
    nombre_codigo_principal: Optional[str] = None
    codigos_contables: List[ActividadCodigoItem] = []

    class Config:
        from_attributes = True


class AccionWithActividadesResponse(AccionResponse):
    actividades: List[ActividadResponse] = []


class PMEBase(BaseModel):
    year: int


class PMECreate(PMEBase):
    id_colegio: int


class PMEResponse(PMEBase):
    id_pme: int
    id_colegio: int
    acciones_count: Optional[int] = 0
    actividades_count: Optional[int] = 0
    colegio_nombre: Optional[str] = None

    class Config:
        from_attributes = True


class PMEWithAccionesResponse(PMEResponse):
    acciones: List[AccionWithActividadesResponse] = []


class ActividadWithAccionResponse(ActividadResponse):
    accion: Optional[AccionResponse] = None