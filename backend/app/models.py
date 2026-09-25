from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Float, JSON, Numeric, Date, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, date

Base = declarative_base()

# --- MÓDULO INSTITUCIONAL (org_) ---

class Colegio(Base):
    __tablename__ = "org_colegio"
    id_colegio = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    sigla = Column(String(10))
    direccion = Column(String(255))
    rut = Column(String(20), unique=True, index=True)
    correo = Column(String(255))
    celular = Column(String(20))
    url_img = Column(String(500))
    rbd = Column(String(50))
    id_director = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=True)

    users = relationship("User", back_populates="colegio", foreign_keys="User.id_colegio")
    users_m2m = relationship("User", secondary="auth_usuario_colegio", back_populates="colegios")
    pmes = relationship("PME", back_populates="colegio")
    contabilidades = relationship("Contabilidad", back_populates="colegio")
    solicitudes = relationship("SolicitudPresupuesto", back_populates="colegio")
    director = relationship("User", foreign_keys=[id_director])

class Rol(Base):
    __tablename__ = "auth_rol"
    id_rol = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    codigo = Column(String(50), unique=True, index=True)
    prefijo = Column(String(20))
    permisos = Column(JSON, default=list)

    users = relationship("User", back_populates="rol")

class Area(Base):
    __tablename__ = "org_area"
    id_area = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    prefijo = Column(String(50))

    cargos = relationship("Cargo", back_populates="area")

    @property
    def subareas(self):
        return self.cargos

class AreaColegioJefe(Base):
    """Jefes de un área en un colegio. Un área puede tener varios jefes:
    la PK incluye id_jefe, así que hay una fila por cada jefe asignado.
    "Sin jefe" = ausencia de filas para ese (área, colegio)."""
    __tablename__ = "org_area_colegio_jefe"
    id_area = Column(Integer, ForeignKey("org_area.id_area", ondelete="CASCADE"), primary_key=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio", ondelete="CASCADE"), primary_key=True)
    id_jefe = Column(Integer, ForeignKey("auth_usuario.id_user", ondelete="CASCADE"), primary_key=True)

    area = relationship("Area")
    colegio = relationship("Colegio")
    jefe = relationship("User")

class UserCargo(Base):
    __tablename__ = "auth_usuario_cargo"
    id_user = Column(Integer, ForeignKey("auth_usuario.id_user", ondelete="CASCADE"), primary_key=True)
    id_cargo = Column(Integer, ForeignKey("org_cargo.id_cargo", ondelete="CASCADE"), primary_key=True)

UserSubarea = UserCargo

class UserColegio(Base):
    """Colegios a los que pertenece un usuario (además de su colegio principal id_colegio)."""
    __tablename__ = "auth_usuario_colegio"
    id_user = Column(Integer, ForeignKey("auth_usuario.id_user", ondelete="CASCADE"), primary_key=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio", ondelete="CASCADE"), primary_key=True)

class SeccionAcceso(Base):
    """Lista blanca de usuarios con acceso a una sección restringida.
    `seccion` es la clave de la sección (ej. 'presupuesto.solicitudes').
    Si no hay filas para una sección, se usa el permiso del rol (comportamiento
    legado); si hay al menos una, el acceso queda restringido a esos usuarios."""
    __tablename__ = "auth_seccion_acceso"
    seccion = Column(String(100), primary_key=True)
    id_user = Column(Integer, ForeignKey("auth_usuario.id_user", ondelete="CASCADE"), primary_key=True)

    user = relationship("User")

class AreaCargo(Base):
    """Áreas adicionales a las que pertenece un cargo (además de su área principal)."""
    __tablename__ = "org_area_cargo"
    id_area = Column(Integer, ForeignKey("org_area.id_area", ondelete="CASCADE"), primary_key=True)
    id_cargo = Column(Integer, ForeignKey("org_cargo.id_cargo", ondelete="CASCADE"), primary_key=True)

AreaSubarea = AreaCargo

class Cargo(Base):
    __tablename__ = "org_cargo"
    id_cargo = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    id_area = Column(Integer, ForeignKey("org_area.id_area"))

    area = relationship("Area", back_populates="cargos")
    # Áreas adicionales (el cargo puede pertenecer a varias áreas).
    areas_adicionales = relationship("Area", secondary="org_area_cargo")
    users = relationship("User", back_populates="cargo")
    users_m2m = relationship("User", secondary="auth_usuario_cargo", back_populates="cargos")
    solicitudes = relationship("SolicitudPresupuesto", back_populates="cargo")

    @property
    def id_subarea(self):
        return self.id_cargo

Subarea = Cargo

class User(Base):
    __tablename__ = "auth_usuario"
    id_user = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"))
    id_cargo = Column(Integer, ForeignKey("org_cargo.id_cargo"), nullable=True)
    id_rol = Column(Integer, ForeignKey("auth_rol.id_rol"))
    rut = Column(String(20), unique=True, index=True)
    nombre = Column(String(255), nullable=False)
    correo = Column(String(255), unique=True, index=True)
    celular = Column(String(20))
    password = Column(String(255), nullable=False)
    status = Column(String(20), default="ACTIVE")

    colegio = relationship("Colegio", back_populates="users", foreign_keys=[id_colegio])
    colegios = relationship("Colegio", secondary="auth_usuario_colegio", back_populates="users_m2m")
    cargo = relationship("Cargo", back_populates="users")
    cargos = relationship("Cargo", secondary="auth_usuario_cargo", back_populates="users_m2m")
    rol = relationship("Rol", back_populates="users")
    solicitudes = relationship("SolicitudPresupuesto", back_populates="user")

    @property
    def id_subarea(self):
        return self.id_cargo

    @id_subarea.setter
    def id_subarea(self, val):
        self.id_cargo = val

    @property
    def subarea(self):
        return self.cargo

    @subarea.setter
    def subarea(self, val):
        self.cargo = val

    @property
    def subareas(self):
        return self.cargos

    @subareas.setter
    def subareas(self, val):
        self.cargos = val


class OrgConfig(Base):
    """Configuración genérica por colegio (clave/valor JSON). Reutilizable para
    distintas preferencias compartidas, p.ej. columnas visibles por defecto."""
    __tablename__ = "org_config"
    id = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False, index=True)
    clave = Column(String(100), nullable=False)
    valor = Column(Text, nullable=True)  # JSON serializado
    __table_args__ = (UniqueConstraint('id_colegio', 'clave', name='uq_config_colegio_clave'),)

# --- MÓDULO PME Y PRESUPUESTO (pre_) ---

class Contabilidad(Base):
    __tablename__ = "pre_contabilidad"
    id_contabilidad = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False, default=1)
    codigo = Column(String(50), unique=True)
    centro_costo = Column(String(100))
    presupuesto_asignado = Column(Float, default=0.0)

    colegio = relationship("Colegio", back_populates="contabilidades")

class CategoriaRecurso(Base):
    __tablename__ = "pre_categoria_recurso"
    id_cat_recurso = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    codigo_contable = Column(String(50))
    descripcion = Column(Text)
    estado = Column(String(20), default="Activo")
    # Destino(s) del gasto, separados por coma: Alumnos | Funcionarios | Premio / Beneficio | Mantención / Servicio
    destino_gasto = Column(String(255), nullable=False, default="Alumnos")

    recursos = relationship("Recurso", back_populates="categoria")
    subcategorias = relationship("SubcategoriaRecurso", back_populates="categoria")


class SubcategoriaRecurso(Base):
    __tablename__ = "pre_subcategoria_recurso"
    id_subcat_recurso = Column(Integer, primary_key=True, index=True)
    id_cat_recurso = Column(Integer, ForeignKey("pre_categoria_recurso.id_cat_recurso"), nullable=False)
    nombre = Column(String(255), nullable=False)
    codigo_cuenta = Column(String(6), nullable=False)
    destino_gasto = Column(String(50), nullable=False)

    categoria = relationship("CategoriaRecurso", back_populates="subcategorias")
    mapeos = relationship("MapeoRecursoSubcategoria", back_populates="subcategoria")


class GrupoRecurso(Base):
    __tablename__ = "pre_grupo_recurso"
    id_grupo_recurso = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)

    recursos = relationship("Recurso", back_populates="grupo")


class Recurso(Base):
    __tablename__ = "pre_recurso"
    id_recurso = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text)
    formato = Column(Text, nullable=True)
    id_grupo_recurso = Column(Integer, ForeignKey("pre_grupo_recurso.id_grupo_recurso"), nullable=True)
    id_cat_recurso = Column(Integer, ForeignKey("pre_categoria_recurso.id_cat_recurso"), nullable=True)
    estado = Column(String(50), default="ACTIVO")  # "ACTIVO", "PENDIENTE_APROBACION"
    id_solicitante = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=True)
    descripcion_solicitud = Column(Text, nullable=True)

    solicitante = relationship("User")
    grupo = relationship("GrupoRecurso", back_populates="recursos")
    categoria = relationship("CategoriaRecurso", back_populates="recursos")
    presupuesto_detalles = relationship("PresupuestoDetalle", back_populates="recurso")
    mapeos_subcategorias = relationship("MapeoRecursoSubcategoria", back_populates="recurso", cascade="all, delete-orphan")


class Subvencion(Base):
    __tablename__ = "pre_subvencion"
    id_subvencion = Column(Integer, primary_key=True, index=True)
    nombre_corto = Column(String(50), nullable=False)
    nombre_completo = Column(String(255), nullable=False)
    estado = Column(String(20), default="ACTIVO")

    mapeos = relationship("MapeoRecursoSubcategoria", back_populates="subvencion")


class MapeoRecursoSubcategoria(Base):
    __tablename__ = "pre_mapeo_recurso_subcategoria"
    id_mapeo = Column(Integer, primary_key=True, index=True)
    id_recurso = Column(Integer, ForeignKey("pre_recurso.id_recurso"), nullable=False)
    id_subcat_recurso = Column(Integer, ForeignKey("pre_subcategoria_recurso.id_subcat_recurso"), nullable=False)
    id_subvencion = Column(Integer, ForeignKey("pre_subvencion.id_subvencion"), nullable=True)
    destino_gasto = Column(String(50), nullable=False)

    recurso = relationship("Recurso", back_populates="mapeos_subcategorias")
    subcategoria = relationship("SubcategoriaRecurso", back_populates="mapeos")
    subvencion = relationship("Subvencion", back_populates="mapeos")


class PME(Base):
    __tablename__ = "pre_pme"
    id_pme = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"))
    year = Column(Integer, nullable=False)

    colegio = relationship("Colegio", back_populates="pmes")
    acciones = relationship("Accion", back_populates="pme")

class Accion(Base):
    __tablename__ = "pre_accion"
    id_accion = Column(Integer, primary_key=True, index=True)
    id_pme = Column(Integer, ForeignKey("pre_pme.id_pme"))
    nombre_accion = Column(String(255), nullable=False)
    descripcion = Column(Text)
    verificacion = Column(String(255))
    responsable = Column(String(255))
    estado = Column(String(50))
    activo = Column(Boolean, default=True, nullable=False)
    dimension = Column(String(150))
    subdimensiones = Column(String(255))
    objetivo_estrategico = Column(Text)
    estrategia = Column(Text)
    planes_asociados = Column(Text)
    medios_verificacion = Column(Text)
    recursos_necesarios = Column(Text)
    monto_sep = Column(Numeric(15, 2))
    monto_total = Column(Numeric(15, 2))
    nivel_ejecucion = Column(String(100))
    justificacion_nivel = Column(Text)
    fecha_inicio = Column(String(50))
    fecha_termino = Column(String(50))
    programa_asociado = Column(String(100))
    ate = Column(String(50))
    tic = Column(String(150))
    monto_general = Column(Numeric(15, 2))

    pme = relationship("PME", back_populates="acciones")
    actividades = relationship("Actividad", back_populates="accion")

class Actividad(Base):
    __tablename__ = "pre_actividad"
    id_actividad = Column(Integer, primary_key=True, index=True)
    id_accion = Column(Integer, ForeignKey("pre_accion.id_accion"))
    nombre_actividad = Column(Text, nullable=False)
    descripcion = Column(Text)
    dimension = Column(String(100))
    subdimension = Column(String(255))
    responsable = Column(String(255))
    medios_verificacion = Column(Text)
    lista_recursos = Column(Text)
    costo_estimado = Column(Numeric(15, 2))

    accion = relationship("Accion", back_populates="actividades")
    presupuesto_detalles = relationship("PresupuestoDetalle", back_populates="actividad")
    codigos_contables = relationship(
        "ActividadCodigoContable",
        back_populates="actividad",
        cascade="all, delete-orphan"
    )

    @property
    def codigo_contable(self):
        """Retorna el código contable principal (o el primero) para retrocompatibilidad."""
        if not self.codigos_contables:
            return None
        for c in self.codigos_contables:
            if getattr(c, 'es_principal', False):
                return c
        return self.codigos_contables[0]


class ActividadCodigoContable(Base):
    """Código contable asignado a una actividad del PME (1 principal y X secundarios)."""
    __tablename__ = "pre_actividad_codigo_contable"
    id_actividad_codigo = Column(Integer, primary_key=True, index=True)
    id_actividad = Column(Integer, ForeignKey("pre_actividad.id_actividad", ondelete="CASCADE"), nullable=False, index=True)
    codigo_cuenta = Column(String(6), ForeignKey("pre_cuenta_matriz_reglas.codigo"), nullable=False)
    id_subvencion = Column(Integer, ForeignKey("pre_subvencion.id_subvencion"), nullable=True)
    es_principal = Column(Boolean, default=False, nullable=False)
    fecha = Column(DateTime, default=datetime.utcnow)
    comentario = Column(Text, nullable=True)
    estado = Column(String(20), default="Pendiente")

    __table_args__ = (UniqueConstraint('id_actividad', 'codigo_cuenta', name='uq_actividad_codigo_cuenta'),)

    actividad = relationship("Actividad", back_populates="codigos_contables")
    cuenta = relationship("CuentaMatrizReglas")
    subvencion = relationship("Subvencion")

class PresupuestoAnual(Base):
    """Presupuesto anual explícito (p.ej. "Presupuesto 2027"). Agrupa las
    solicitudes que se planifican para un año determinado. El presupuesto de un
    año N se planifica el año anterior, por lo que las solicitudes creadas en
    N-1 se enlazan al presupuesto del año N."""
    __tablename__ = "pre_presupuesto_anual"
    id_presupuesto_anual = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    estado = Column(String(20), default="activo")  # activo | cerrado
    creado_por = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=True)
    creado_en = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint('id_colegio', 'year', name='uq_presupuesto_anual_colegio_year'),)

    colegio = relationship("Colegio", foreign_keys=[id_colegio])
    creador = relationship("User", foreign_keys=[creado_por])
    solicitudes = relationship("SolicitudPresupuesto", back_populates="presupuesto_anual")


class SolicitudPresupuesto(Base):
    __tablename__ = "pre_solicitud"
    id_presupuesto = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(30), unique=True, index=True)
    id_user = Column(Integer, ForeignKey("auth_usuario.id_user"))
    id_cargo = Column(Integer, ForeignKey("org_cargo.id_cargo"), nullable=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"))
    id_presupuesto_anual = Column(Integer, ForeignKey("pre_presupuesto_anual.id_presupuesto_anual"), nullable=True, index=True)
    fecha = Column(DateTime, default=datetime.utcnow)
    comentario = Column(Text)
    estado = Column(String(20), default="Pendiente")
    activo = Column(Boolean, default=True, nullable=False)

    user = relationship("User", back_populates="solicitudes")
    cargo = relationship("Cargo", back_populates="solicitudes")

    @property
    def id_subarea(self):
        return self.id_cargo

    @id_subarea.setter
    def id_subarea(self, val):
        self.id_cargo = val

    @property
    def subarea(self):
        return self.cargo
    colegio = relationship("Colegio", back_populates="solicitudes")
    presupuesto_anual = relationship("PresupuestoAnual", back_populates="solicitudes")
    detalles = relationship("PresupuestoDetalle", back_populates="solicitud")

class PresupuestoDetalle(Base):
    __tablename__ = "pre_detalle"
    id_pre_detalle = Column(Integer, primary_key=True, index=True)
    id_presupuesto = Column(Integer, ForeignKey("pre_solicitud.id_presupuesto"))
    nombre_producto = Column(String(255), nullable=False)
    descripcion = Column(String(500), nullable=True)
    id_recurso = Column(Integer, ForeignKey("pre_recurso.id_recurso"), nullable=True)
    codigo_cuenta = Column(String(6), ForeignKey("pre_cuenta_matriz_reglas.codigo"), nullable=True)
    formato_unidad = Column(Text, nullable=False)
    cantidad = Column(Numeric(15, 2), nullable=False)
    cantidad_real = Column(Numeric(15, 2), nullable=True)
    valor_unitario = Column(Numeric(15, 2), nullable=False)
    valor_unitario_iva = Column(Numeric(15, 2), nullable=False)
    valor_real_iva = Column(Numeric(15, 2), nullable=True)
    total_iva = Column(Numeric(15, 2), nullable=False)
    id_subvencion = Column(Integer, ForeignKey("pre_subvencion.id_subvencion"), nullable=True)
    destino_gasto = Column(String(50), nullable=False)
    fecha_ejecucion = Column(Date, nullable=False)
    fecha_termino = Column(Date, nullable=True)
    tipo_fecha = Column(String(20), nullable=False)
    motivo = Column(String(255), nullable=False)
    estado_aprobacion = Column(String(50), default="Sin Revisar")
    estado_compra = Column(String(50), default="Pendiente")
    comentario_revision = Column(Text, nullable=True)  # motivo de rechazo escrito por el revisor
    observacion = Column(String(500), nullable=True)
    centro_costos = Column(String(100), nullable=True)
    id_actividad = Column(Integer, ForeignKey("pre_actividad.id_actividad"), nullable=True)
    id_cargo = Column(Integer, ForeignKey("org_cargo.id_cargo"), nullable=True)
    # Categoría directa: usada cuando el detalle no está enlazado a un recurso
    # del catálogo (p.ej. importado de convocatoria, donde la IA sugirió la categoría).
    id_cat_recurso = Column(Integer, ForeignKey("pre_categoria_recurso.id_cat_recurso"), nullable=True)

    solicitud = relationship("SolicitudPresupuesto", back_populates="detalles")
    recurso = relationship("Recurso", back_populates="presupuesto_detalles")
    actividad = relationship("Actividad", back_populates="presupuesto_detalles")
    cuenta = relationship("CuentaMatrizReglas")
    subvencion = relationship("Subvencion")
    cargo_detalle = relationship("Cargo", foreign_keys=[id_cargo])

    @property
    def id_subarea(self):
        return self.id_cargo

    @id_subarea.setter
    def id_subarea(self, val):
        self.id_cargo = val

    @property
    def subarea_detalle(self):
        return self.cargo_detalle
    categoria_directa = relationship("CategoriaRecurso", foreign_keys=[id_cat_recurso])



CATEGORIA_PILAR_VALUES = ['clases(alumno)', 'oficinas(administracion)', 'premio/beneficio', 'mantencion/servicio']

class CuentaMatrizReglas(Base):
    __tablename__ = "pre_cuenta_matriz_reglas"
    id_matriz = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(6), unique=True, index=True, nullable=False)
    nombre = Column(String(255), nullable=False)
    grupo = Column(String(6), index=True, nullable=False)
    libro_rendicion = Column(String(100), nullable=False)
    documentos_habilitados = Column(JSON, nullable=False)
    subvenciones_reglas = Column(JSON, nullable=False)
    categoria_pilar = Column(String(50), nullable=True)
    descripcion_breve = Column(String(500), nullable=True)


class CuentaDestino(Base):
    """Matriz de destinos por cuenta contable (importada desde el Excel
    Cuentas_Contables_x_Destino). Indica, para cada código, en qué destinos
    aplica y cuál es su destino principal. Valores de cada destino:
    'PRINCIPAL', 'APLICA' o None (no aplica)."""
    __tablename__ = "pre_cuenta_destino"
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(6), ForeignKey("pre_cuenta_matriz_reglas.codigo"), unique=True, index=True, nullable=False)
    grupo = Column(String(6), index=True, nullable=True)
    estudiante = Column(String(20), nullable=True)   # Sala de Clases (Alumnos)
    funcionario = Column(String(20), nullable=True)  # Oficina / Admin (Funcionarios)
    premio = Column(String(20), nullable=True)       # Premio / Beneficio
    mantencion = Column(String(20), nullable=True)   # Mantención / Servicio
    destino_principal = Column(String(20), nullable=True)  # ESTUDIANTE/FUNCIONARIO/PREMIO/MANTENCION

    cuenta = relationship("CuentaMatrizReglas")


class CuentaDescripcion(Base):
    __tablename__ = "pre_cuenta_descripcion"
    id_descripcion = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(6), unique=True, index=True, nullable=False)
    nombre = Column(String(255), nullable=False)
    caracteristicas = Column(Text, nullable=True)
    diferenciacion_publico = Column(Text, nullable=True)
    ejemplos_compra = Column(JSON, nullable=False)
    advertencias_sistema = Column(JSON, nullable=False)





class CategoriaCodigoContable(Base):
    """Accounting codes per category per propósito (sala de clases, admin, etc.)."""
    __tablename__ = "pre_categoria_codigo_contable"
    id = Column(Integer, primary_key=True, index=True)
    id_cat_recurso = Column(Integer, ForeignKey("pre_categoria_recurso.id_cat_recurso"), nullable=False, index=True)
    categoria_pilar = Column(String(50), nullable=True, default='GENERAL')
    codigo_cuenta = Column(String(6), ForeignKey("pre_cuenta_matriz_reglas.codigo"), nullable=False)
    subvencion = Column(String(50), nullable=True, default='GENERAL')

    __table_args__ = (UniqueConstraint('id_cat_recurso', 'categoria_pilar', 'codigo_cuenta', name='uq_cat_pilar_codigo'),)


class RolContextoDefault(Base):
    """Default context mapping per role for auto-suggestion of accounting codes."""
    __tablename__ = "pre_rol_contexto_default"
    id = Column(Integer, primary_key=True, index=True)
    rol_codigo = Column(String(20), unique=True, nullable=False, index=True)
    destino_uso = Column(String(50), nullable=False, default='ESTUDIANTE')
    tipo_transaccion = Column(String(50), nullable=False, default='COMPRA')
    subvencion = Column(String(50), nullable=False, default='GENERAL')


class CuentaOcultaColegio(Base):
    __tablename__ = "pre_cuenta_oculta_colegio"
    id = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False, index=True)
    codigo_cuenta = Column(String(6), ForeignKey("pre_cuenta_matriz_reglas.codigo"), nullable=False)
    fecha_oculto = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint('id_colegio', 'codigo_cuenta', name='uq_cuenta_oculta_colegio'),)


# --- MÓDULO CONVOCATORIAS (pre_convocatoria / pre_pedido_externo) ---

class PreConvocatoria(Base):
    __tablename__ = "pre_convocatoria"
    id_convocatoria = Column(Integer, primary_key=True, index=True)
    id_presupuesto  = Column(Integer, ForeignKey("pre_solicitud.id_presupuesto"), nullable=False)
    id_cargo        = Column(Integer, ForeignKey("org_cargo.id_cargo"), nullable=True)
    id_colegio      = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False)
    token           = Column(String(64), unique=True, index=True, nullable=False)
    pin             = Column(String(10), nullable=True)   # PIN opcional para acceder al formulario
    fecha_expiracion = Column(Date, nullable=False)
    estado          = Column(String(20), default="activo")   # activo | cerrado
    creado_por      = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=False)
    creado_en       = Column(DateTime, default=datetime.utcnow)

    solicitud = relationship("SolicitudPresupuesto")
    cargo     = relationship("Cargo", foreign_keys=[id_cargo])
    colegio   = relationship("Colegio", foreign_keys=[id_colegio])
    creador   = relationship("User", foreign_keys=[creado_por])
    pedidos   = relationship("PrePedidoExterno", back_populates="convocatoria", cascade="all, delete-orphan")

    @property
    def id_subarea(self):
        return self.id_cargo

    @id_subarea.setter
    def id_subarea(self, val):
        self.id_cargo = val

    @property
    def subarea(self):
        return self.cargo


class PrePedidoExterno(Base):
    __tablename__ = "pre_pedido_externo"
    id_pedido        = Column(Integer, primary_key=True, index=True)
    id_convocatoria  = Column(Integer, ForeignKey("pre_convocatoria.id_convocatoria", ondelete="CASCADE"), nullable=False)
    nombre_recurso   = Column(String(255), nullable=False)
    descripcion      = Column(Text, nullable=True)
    formato_unidad   = Column(String(50), nullable=False)
    cantidad         = Column(Numeric(15, 2), nullable=False)
    precio_estimado  = Column(Numeric(15, 2), nullable=False)
    fecha_ejecucion  = Column(Date, nullable=False)
    tipo_fecha       = Column(String(20), nullable=False)
    motivo           = Column(Text, nullable=False)
    actividad_evento = Column(String(255), nullable=True)  # Actividad / evento asociado (opcional)
    destino          = Column(String(50), nullable=True)   # pilar: clases(alumno) | oficinas(administracion) | premio/beneficio | mantencion/servicio
    id_actividad_pme = Column(Integer, nullable=True)      # Actividad del PME asociada (opcional)
    actividad_pme_nombre = Column(String(500), nullable=True)  # snapshot del nombre de la actividad PME
    estado_jefe      = Column(String(20), default="pendiente")  # pendiente | aceptado | rechazado
    comentario_jefe  = Column(Text, nullable=True)
    id_cat_recurso   = Column(Integer, ForeignKey("pre_categoria_recurso.id_cat_recurso"), nullable=True)
    id_recurso       = Column(Integer, ForeignKey("pre_recurso.id_recurso"), nullable=True)
    categoria_nombre_ia = Column(String(255), nullable=True)
    clasificado_ia   = Column(Boolean, default=False)
    creado_en        = Column(DateTime, default=datetime.utcnow)

    convocatoria = relationship("PreConvocatoria", back_populates="pedidos")
    categoria    = relationship("CategoriaRecurso", foreign_keys=[id_cat_recurso])
    recurso      = relationship("Recurso", foreign_keys=[id_recurso])


# --- MÓDULO IA (ai_) ---

class AiProviderConfig(Base):
    __tablename__ = "ai_proveedor_config"
    id = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False, index=True)
    proveedor = Column(String(50), nullable=False)   # groq | nvidia | deepseek | openrouter
    api_key_encrypted = Column(Text, nullable=False)
    modelo = Column(String(150), nullable=False)
    es_default = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=datetime.utcnow)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint('id_colegio', 'proveedor', name='uq_ai_proveedor_colegio'),)


class AiUsoTokens(Base):
    __tablename__ = "ai_uso_tokens"
    id = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False, index=True)
    id_usuario = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=True)
    proveedor = Column(String(50), nullable=False)
    modelo = Column(String(150), nullable=False)
    endpoint = Column(String(100), nullable=False)   # asesorar-categoria | asesorar-cuenta | sugerir-cuenta | test-conexion
    tokens_entrada = Column(Integer, default=0)
    tokens_salida = Column(Integer, default=0)
    tokens_total = Column(Integer, default=0)
    creado_en = Column(DateTime, default=datetime.utcnow)

    usuario = relationship("User", foreign_keys=[id_usuario])


class PmeDimensionInfo(Base):
    __tablename__ = "pme_dimension_info"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)  # Gestión Pedagógica, Convivencia Escolar, Liderazgo, Gestión de Recursos
    icono = Column(String(20), default="📚")
    descripcion = Column(Text, nullable=False)
    enfoque_principal = Column(Text, nullable=False)
    ejemplos_insumos = Column(Text, nullable=False)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SolicitudModificacionDetalle(Base):
    __tablename__ = "pre_solicitud_modificacion_detalle"
    id_solicitud_mod = Column(Integer, primary_key=True, index=True)
    id_pre_detalle = Column(Integer, ForeignKey("pre_detalle.id_pre_detalle", ondelete="CASCADE"), nullable=False)
    campo_modificado = Column(String(50), nullable=False, default="motivo")
    valor_anterior = Column(Text, nullable=True)
    valor_propuesto = Column(Text, nullable=False)
    motivo_cambio = Column(Text, nullable=True)
    estado = Column(String(20), default="PENDIENTE")  # PENDIENTE | APROBADO | RECHAZADO
    id_user_solicitante = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=False)
    fecha_solicitud = Column(DateTime, default=datetime.utcnow)
    id_user_aprobador = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=True)
    fecha_respuesta = Column(DateTime, nullable=True)
    comentario_respuesta = Column(Text, nullable=True)

    detalle = relationship("PresupuestoDetalle", foreign_keys=[id_pre_detalle])
    solicitante = relationship("User", foreign_keys=[id_user_solicitante])
    aprobador = relationship("User", foreign_keys=[id_user_aprobador])


# --- MÓDULO ACTAS DE ENTREGA (com_acta_) ---

class ActaEntrega(Base):
    __tablename__ = "com_acta_entrega"
    id_acta = Column(Integer, primary_key=True, index=True)
    id_colegio = Column(Integer, ForeignKey("org_colegio.id_colegio"), nullable=False)
    id_presupuesto = Column(Integer, ForeignKey("pre_solicitud.id_presupuesto"), nullable=True)
    numero_correlativo = Column(Integer, nullable=False, index=True)
    codigo_acta = Column(String(50), nullable=False, index=True)  # Ej: CS - N°051/2026
    fecha = Column(Date, nullable=False, default=date.today)
    ciudad = Column(String(100), default="ALTO HOSPICIO")
    para_nombre = Column(String(255), nullable=False)
    para_cargo = Column(String(255), nullable=True)
    de_emisor = Column(String(255), nullable=False, default="GERENCIA DE OPERACIONES")
    asunto = Column(String(500), nullable=False)
    numero_factura = Column(String(255), nullable=True)
    observacion = Column(Text, nullable=True)
    id_usuario_emisor = Column(Integer, ForeignKey("auth_usuario.id_user"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    colegio = relationship("Colegio")
    solicitud = relationship("SolicitudPresupuesto")
    emisor_usuario = relationship("User", foreign_keys=[id_usuario_emisor])
    detalles = relationship("ActaEntregaDetalle", back_populates="acta", cascade="all, delete-orphan")


class ActaEntregaDetalle(Base):
    __tablename__ = "com_acta_entrega_detalle"
    id_acta_detalle = Column(Integer, primary_key=True, index=True)
    id_acta = Column(Integer, ForeignKey("com_acta_entrega.id_acta", ondelete="CASCADE"), nullable=False)
    id_pre_detalle = Column(Integer, ForeignKey("pre_detalle.id_pre_detalle"), nullable=True)
    nombre_producto = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    cantidad = Column(Numeric(15, 2), nullable=False)
    formato_unidad = Column(String(50), nullable=True)
    solicitud_codigo = Column(String(50), nullable=True)
    cargo_area = Column(String(150), nullable=True)

    acta = relationship("ActaEntrega", back_populates="detalles")
    presupuesto_detalle = relationship("PresupuestoDetalle")




