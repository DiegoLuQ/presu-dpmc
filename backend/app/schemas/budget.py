from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from typing_extensions import Literal
from datetime import datetime, date


DestinoGasto = Literal["Alumnos", "Funcionarios", "Premio / Beneficio", "Mantención / Servicio"]


class CategoriaRecursoBase(BaseModel):
    nombre: str
    codigo_contable: Optional[str] = None
    descripcion: Optional[str] = None
    estado: str = "Activo"
    destino_gasto: List[DestinoGasto] = Field(..., min_length=1)

    @field_validator("destino_gasto", mode="before")
    @classmethod
    def _split_destino(cls, v):
        # Acepta string separado por coma (desde la BD) o lista (desde el cliente)
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


class CategoriaRecursoCreate(CategoriaRecursoBase):
    pass


class CategoriaRecursoResponse(CategoriaRecursoBase):
    id_cat_recurso: int

    class Config:
        from_attributes = True


class GrupoRecursoBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class GrupoRecursoCreate(GrupoRecursoBase):
    pass


class GrupoRecursoResponse(GrupoRecursoBase):
    id_grupo_recurso: int

    class Config:
        from_attributes = True


class ResourceBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    formato: Optional[str] = None


class ResourceCreate(ResourceBase):
    id_grupo_recurso: int
    id_cat_recurso: int


class ResourceResponse(ResourceBase):
    id_recurso: int
    id_grupo_recurso: Optional[int] = None
    grupo_nombre: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    categoria_nombre: Optional[str] = None
    categoria_descripcion: Optional[str] = None
    codigos_contables: Optional[List[str]] = None

    class Config:
        from_attributes = True


class RecursoCreateFull(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    formato: Optional[str] = None
    id_grupo_recurso: Optional[int] = None
    id_cat_recurso: int


class ActividadBuscarResponse(BaseModel):
    id: int
    nombre: str
    lista_recursos: Optional[str] = None
    dimension: Optional[str] = None
    nombre_accion: Optional[str] = None
    ano_pme: Optional[int] = None
    colegio_nombre: Optional[str] = None


class BudgetDetailBase(BaseModel):
    nombre_producto: str
    descripcion: Optional[str] = None
    id_recurso: Optional[int] = None
    codigo_cuenta: Optional[str] = None
    formato_unidad: str
    cantidad: float
    cantidad_real: Optional[float] = None
    valor_unitario: float
    valor_unitario_iva: float
    valor_real_iva: Optional[float] = None
    total_iva: float
    fecha_ejecucion: date
    fecha_termino: Optional[date] = None
    tipo_fecha: str
    motivo: str
    observacion: Optional[str] = None
    centro_costos: Optional[str] = None
    estado_compra: Optional[str] = 'Pendiente'
    id_actividad: Optional[int] = None
    id_subvencion: Optional[int] = None
    destino_gasto: str
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None



class BudgetDetailCreate(BudgetDetailBase):
    pass


class BudgetDetailUpdate(BaseModel):
    nombre_producto: Optional[str] = None
    descripcion: Optional[str] = None
    id_recurso: Optional[int] = None
    codigo_cuenta: Optional[str] = None
    formato_unidad: Optional[str] = None
    cantidad: Optional[float] = None
    cantidad_real: Optional[float] = None
    valor_unitario: Optional[float] = None
    valor_unitario_iva: Optional[float] = None
    valor_real_iva: Optional[float] = None
    total_iva: Optional[float] = None
    fecha_ejecucion: Optional[date] = None
    fecha_termino: Optional[date] = None
    tipo_fecha: Optional[str] = None
    motivo: Optional[str] = None
    observacion: Optional[str] = None
    centro_costos: Optional[str] = None
    id_actividad: Optional[int] = None
    id_subvencion: Optional[int] = None
    destino_gasto: Optional[str] = None
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None
    estado_aprobacion: Optional[str] = None
    estado_compra: Optional[str] = None


class BudgetDetailResponse(BaseModel):
    id_pre_detalle: int
    id_presupuesto: int
    nombre_producto: str
    descripcion: Optional[str] = None
    id_recurso: Optional[int] = None
    recurso_nombre: Optional[str] = None
    recurso_estado: Optional[str] = None
    categoria_nombre: Optional[str] = None
    id_grupo_recurso: Optional[int] = None
    grupo_nombre: Optional[str] = None
    codigo_cuenta: Optional[str] = None
    formato_unidad: str
    cantidad: float
    cantidad_real: Optional[float] = None
    valor_unitario: float
    valor_unitario_iva: float
    valor_real_iva: Optional[float] = None
    total_iva: float
    fecha_ejecucion: date
    fecha_termino: Optional[date] = None
    tipo_fecha: str
    motivo: str
    observacion: Optional[str] = None
    centro_costos: Optional[str] = None
    estado_aprobacion: str
    estado_compra: Optional[str] = 'Pendiente'
    comentario_revision: Optional[str] = None
    id_actividad: Optional[int] = None
    actividad_nombre: Optional[str] = None
    accion_nombre: Optional[str] = None
    id_subvencion: Optional[int] = None
    subvencion_nombre: Optional[str] = None
    destino_gasto: str
    id_cargo: Optional[int] = None
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None
    cargo_nombre: Optional[str] = None
    subarea_nombre: Optional[str] = None

    class Config:
        from_attributes = True



class BudgetRequestBase(BaseModel):
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None
    id_colegio: Optional[int] = None
    comentario: Optional[str] = None
    id_presupuesto_anual: Optional[int] = None


class BudgetRequestCreate(BudgetRequestBase):
    detalles: List[BudgetDetailCreate]


class AgregarRecursosRequest(BaseModel):
    detalles: List[BudgetDetailCreate]


class BudgetRequestResponse(BaseModel):
    id_presupuesto: int
    codigo: str
    id_user: Optional[int] = None
    id_cargo: Optional[int] = None
    id_cargo: Optional[int] = None
    id_subarea: Optional[int] = None
    id_colegio: Optional[int] = None
    id_presupuesto_anual: Optional[int] = None
    presupuesto_anual_nombre: Optional[str] = None
    presupuesto_anual_year: Optional[int] = None
    fecha: datetime
    comentario: Optional[str] = None
    monto_total: float = 0
    estado: str = "Pendiente"
    activo: bool = True
    id_area: Optional[int] = None
    area_nombre: Optional[str] = None
    area_jefe_nombre: Optional[str] = None
    cargo_nombre: Optional[str] = None
    subarea_nombre: Optional[str] = None
    user_nombre: Optional[str] = None
    colegio_nombre: Optional[str] = None
    detalles: List[BudgetDetailResponse]

    class Config:
        from_attributes = True


# ── Presupuesto anual (agrupador de solicitudes por año) ──────────────────────

class PresupuestoAnualCreate(BaseModel):
    year: int
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    id_colegio: Optional[int] = None   # colegio destino (roles con gestión multi-colegio)


class PresupuestoAnualUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[Literal["activo", "cerrado"]] = None


class PresupuestoAnualResponse(BaseModel):
    id_presupuesto_anual: int
    id_colegio: int
    year: int
    nombre: str
    descripcion: Optional[str] = None
    estado: str = "activo"
    creado_por: Optional[int] = None
    creado_en: Optional[datetime] = None
    # Datos enriquecidos para la UI
    colegio_nombre: Optional[str] = None
    creado_por_nombre: Optional[str] = None
    solicitudes_count: int = 0
    monto_total: float = 0

    class Config:
        from_attributes = True


class AsignarPresupuestoAnualRequest(BaseModel):
    """Enlaza (o desenlaza con null) una solicitud a un presupuesto anual."""
    id_presupuesto_anual: Optional[int] = None


class ContabilidadBase(BaseModel):
    codigo: str
    centro_costo: str
    presupuesto_asignado: float = 0.0


class ContabilidadCreate(ContabilidadBase):
    id_colegio: Optional[int] = None


class ContabilidadResponse(ContabilidadBase):
    id_contabilidad: int
    id_colegio: int
    ejecutado: float = 0.0
    disponible: float = 0.0

    class Config:
        from_attributes = True


class ResolverCodigoRequest(BaseModel):
    id_recurso: int
    destino_uso: Optional[str] = None
    tipo_transaccion: Optional[str] = None
    subvencion: Optional[str] = None


class ResolverCodigoResponse(BaseModel):
    codigo_cuenta: Optional[str] = None
    nombre_cuenta: Optional[str] = None
    advertencias: List[str] = []


class SugerirRecursoRequest(BaseModel):
    nombre: str
    descripcion_solicitud: str
    tipo: str  # "BIEN" o "SERVICIO"
    id_cat_recurso: Optional[int] = None
    id_grupo_recurso: Optional[int] = None


class AprobarRecursoRequest(BaseModel):
    codigo_cuenta: str
    destino_uso: str
    tipo_transaccion: str
    subvencion: Optional[str] = None


class SugerirCuentaRequest(BaseModel):
    id_cat_recurso: int
    destino_uso: str
    tipo_transaccion: Optional[str] = 'COMPRA'
    subvencion: Optional[str] = 'GENERAL'


class CatCodigoCreate(BaseModel):
    categoria_pilar: Optional[str] = 'GENERAL'
    codigo_cuenta: str
    subvencion: Optional[str] = 'GENERAL'


class CatCodigoResponse(BaseModel):
    id: int
    categoria_pilar: Optional[str] = None
    codigo_cuenta: str
    subvencion: Optional[str]
    nombre_cuenta: Optional[str] = None

    model_config = {"from_attributes": True}





class ResolucionSubcategoriaResponse(BaseModel):
    codigo_cuenta: str
    nombre: str

    class Config:
        from_attributes = True


class SubvencionResponse(BaseModel):
    id_subvencion: int
    nombre_corto: str
    nombre_completo: str
    estado: str

    class Config:
        from_attributes = True


class SubvencionCreate(BaseModel):
    nombre_corto: str
    nombre_completo: str
    estado: str = "ACTIVO"


class AsignarCodigoDetalleRequest(BaseModel):
    """Asignar/actualizar el código contable y subvención de un detalle de presupuesto."""
    codigo_cuenta: str
    id_subvencion: Optional[int] = None


class ActividadCodigoContableUpsert(BaseModel):
    """Datos para asignar/actualizar un código contable de una actividad."""
    codigo_cuenta: str
    id_subvencion: Optional[int] = None
    es_principal: bool = False
    comentario: Optional[str] = None
    estado: str = "Pendiente"


class ActividadCodigosBatchUpsert(BaseModel):
    """Lista completa de códigos contables a asociar a una actividad."""
    codigos: List[ActividadCodigoContableUpsert]


class ActividadCodigoContableResponse(BaseModel):
    id_actividad_codigo: int
    id_actividad: int
    codigo_cuenta: str
    id_subvencion: Optional[int] = None
    es_principal: bool = False
    fecha: Optional[datetime] = None
    comentario: Optional[str] = None
    estado: str
    # Datos enriquecidos para la UI
    nombre_cuenta: Optional[str] = None
    nombre_subvencion: Optional[str] = None
    nombre_actividad: Optional[str] = None

    class Config:
        from_attributes = True


class ImportarPresupuestoItem(BaseModel):
    """Una fila de la planilla: mismos campos que captura el formulario
    "Agregar Recursos" de una solicitud (ambos escriben en pre_detalle).
    La categoría se resuelve por nombre contra el catálogo existente
    (pre_categoria_recurso); precio es el valor unitario CON IVA, igual que
    en ese formulario."""
    categoria_nombre: str
    # Resueltos en la pantalla de revisión: si vienen, mandan sobre el nombre
    # (permiten reutilizar un recurso concreto o una categoría recién creada).
    id_cat_recurso: Optional[int] = None
    id_recurso: Optional[int] = None
    nombre_producto: str
    descripcion: Optional[str] = None
    cantidad: float = 1
    # Opcional a propósito: una celda de precio vacía llega como null y debe
    # omitir SOLO esa fila (el endpoint la reporta), no rechazar toda la planilla.
    precio: Optional[float] = None
    formato_unidad: Optional[str] = None
    codigo_cuenta: Optional[str] = None
    motivo: Optional[str] = None
    # Fecha ya resuelta por el importador: un mes del año ("mensual", día 1) o una
    # fecha exacta ("fecha_especifica"). Si no viene, se usa el mes por defecto de la hoja.
    fecha_ejecucion: Optional[date] = None
    tipo_fecha: Optional[Literal['mensual', 'fecha_especifica']] = None
    id_actividad: Optional[int] = None   # vínculo opcional a una Actividad PME
    # Overrides opcionales por fila del valor por defecto de la hoja (área).
    destino_gasto: Optional[Literal['clases(alumno)', 'oficinas(administracion)', 'premio/beneficio', 'mantencion/servicio']] = None
    subvencion_nombre: Optional[str] = None  # nombre_corto de Subvencion
    # Subvención elegida por fila en la pantalla de revisión; manda sobre el nombre.
    id_subvencion: Optional[int] = None
    subarea_nombre: Optional[str] = None     # subárea solicitante del ítem (por defecto, la de la hoja)


class RecursoSugerido(BaseModel):
    """Recurso del catálogo parecido al nombre de la planilla (no idéntico).
    Sirve para no duplicar 'Agua con gas' cuando ya existe 'Agua'."""
    id_recurso: int
    nombre: str
    descripcion: Optional[str] = None
    categoria_nombre: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    formato: Optional[str] = None


class AnalisisFilaResultado(BaseModel):
    """Diagnóstico de una fila de la planilla contra la base, para revisarla
    antes de escribir nada. `problemas` lista lo que impide importarla tal cual."""
    fila: int
    nombre_producto: str
    # Recurso resuelto por nombre exacto (case-insensitive) contra el catálogo.
    id_recurso: Optional[int] = None
    recurso_existente: bool = False
    recurso_descripcion_catalogo: Optional[str] = None
    recurso_categoria_catalogo: Optional[str] = None
    # Solo cuando NO hay coincidencia exacta: candidatos parecidos del catálogo.
    sugerencias: List[RecursoSugerido] = []
    # Categoría indicada en el Excel.
    id_cat_recurso: Optional[int] = None
    categoria_encontrada: bool = False
    # Código contable contra el Manual de Cuentas.
    codigo_cuenta_valido: bool = False
    codigo_cuenta_nombre: Optional[str] = None
    problemas: List[str] = []


class AnalizarPlanillaRequest(BaseModel):
    items: List[ImportarPresupuestoItem]


class AnalizarPlanillaResponse(BaseModel):
    filas: List[AnalisisFilaResultado]


class ImportarSolicitudCreate(BaseModel):
    """Cabecera de una solicitud creada desde el importador, a nombre de un
    usuario del área. Equivale al formulario /presupuesto/crear, pero pudiendo
    elegir el solicitante y el presupuesto anual de destino."""
    id_presupuesto_anual: int
    id_subarea: int
    id_user: int
    comentario: Optional[str] = None


class ImportarRecursosRequest(BaseModel):
    """Carga de los recursos de UNA solicitud ya creada (una hoja del Excel).
    Destino del gasto, subvención, motivo por defecto y mes por defecto se
    eligen una vez desde la UI, pero cada fila puede traer su propio override
    (columnas "Destino" / "Subvención") igual que en Agregar Recursos."""
    id_presupuesto: int
    # Respaldo para las filas que no traigan el suyo: desde la pantalla de revisión
    # cada fila manda su propio destino, subvención y fecha.
    destino_gasto: Optional[Literal['clases(alumno)', 'oficinas(administracion)', 'premio/beneficio', 'mantencion/servicio']] = None
    id_subvencion: Optional[int] = None
    motivo_default: Optional[str] = None
    mes_ejecucion_default: Optional[int] = None  # 1-12
    items: List[ImportarPresupuestoItem]


class ImportarPresupuestoFilaOmitida(BaseModel):
    fila: int
    motivo: str


class ImportarRecursosResponse(BaseModel):
    id_presupuesto: int
    codigo: str
    subarea_nombre: str
    solicitante_nombre: str
    filas_importadas: int = 0
    filas_omitidas: List[ImportarPresupuestoFilaOmitida] = []
    recursos_creados: int = 0
    recursos_reutilizados: int = 0


class MapeoRecursoSubcategoriaCreate(BaseModel):
    id_subcat_recurso: int
    id_subvencion: Optional[int] = None
    destino_gasto: Literal['clases(alumno)', 'oficinas(administracion)', 'premio/beneficio', 'mantencion/servicio']


class MapeoRecursoSubcategoriaResponse(BaseModel):
    id_mapeo: int
    id_recurso: int
    id_subcat_recurso: int
    codigo_cuenta: str
    nombre_subcategoria: str
    id_subvencion: Optional[int] = None
    nombre_subvencion: Optional[str] = None
    destino_gasto: str
    critico_fiscalizacion: Optional[bool] = None

    class Config:
        from_attributes = True


# ── Actas de Entrega Oficiales ───────────────────────────────────────────────

class ActaEntregaItemCreate(BaseModel):
    id_pre_detalle: Optional[int] = None
    nombre_producto: str
    descripcion: Optional[str] = None
    cantidad: float
    formato_unidad: Optional[str] = 'UNIDAD'
    solicitud_codigo: Optional[str] = None
    cargo_area: Optional[str] = None


class ActaEntregaCreate(BaseModel):
    id_colegio: int
    id_presupuesto: Optional[int] = None
    numero_correlativo: Optional[int] = None
    codigo_acta: Optional[str] = None
    fecha: Optional[date] = None
    ciudad: Optional[str] = "ALTO HOSPICIO"
    para_nombre: str
    para_cargo: Optional[str] = None
    de_emisor: Optional[str] = "GERENCIA DE OPERACIONES"
    asunto: str
    numero_factura: Optional[str] = None
    observacion: Optional[str] = None
    items: List[ActaEntregaItemCreate]
    actualizar_estado_items: Optional[str] = "Comprado"  # Comprado | En camino | Aprobado


class ActaEntregaUpdate(BaseModel):
    codigo_acta: Optional[str] = None
    fecha: Optional[date] = None
    ciudad: Optional[str] = None
    para_nombre: Optional[str] = None
    para_cargo: Optional[str] = None
    de_emisor: Optional[str] = None
    asunto: Optional[str] = None
    numero_factura: Optional[str] = None
    observacion: Optional[str] = None


class ActaEntregaDetalleResponse(BaseModel):
    id_acta_detalle: int
    id_pre_detalle: Optional[int] = None
    nombre_producto: str
    descripcion: Optional[str] = None
    cantidad: float
    formato_unidad: Optional[str] = None
    solicitud_codigo: Optional[str] = None
    cargo_area: Optional[str] = None

    class Config:
        from_attributes = True


class ActaEntregaResponse(BaseModel):
    id_acta: int
    id_colegio: int
    colegio_nombre: Optional[str] = None
    numero_correlativo: int
    codigo_acta: str
    fecha: date
    ciudad: str
    para_nombre: str
    para_cargo: Optional[str] = None
    de_emisor: str
    asunto: str
    numero_factura: Optional[str] = None
    observacion: Optional[str] = None
    id_usuario_emisor: Optional[int] = None
    created_at: datetime
    detalles: List[ActaEntregaDetalleResponse] = []

    class Config:
        from_attributes = True



