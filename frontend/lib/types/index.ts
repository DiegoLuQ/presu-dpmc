export interface Rol {
  id_rol: number;
  nombre: string;
  codigo: string;
  prefijo?: string;
}

export interface Cargo {
  id_cargo: number;
  nombre: string;
  id_area: number;
  id_subarea?: number; // compatibilidad
  area?: Area;
  areas_adicionales?: Area[];
}

export type Subarea = Cargo;

export interface User {
  id_user: number;
  rut: string;
  nombre: string;
  correo: string;
  celular?: string;
  id_colegio: number;
  id_cargo?: number;
  id_subarea?: number;
  id_rol?: number;
  status: string;
  rol?: Rol;
  cargo?: Cargo;
  cargos?: Cargo[];
  subarea?: Cargo;
  subareas?: Cargo[];
  colegio?: Colegio;
  colegios?: Colegio[];
}

export interface Area {
  id_area: number;
  nombre: string;
  prefijo?: string;
}

export interface PermisosResponse {
  codigo_rol: string;
  nombre_rol: string;
  permisos: string[];
  // Secciones restringidas (lista blanca) a las que el usuario tiene acceso.
  secciones?: string[];
}

export interface LoginRequest {
  rut: string;
  password: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

export type CodigoRol =
  | 'ADM' | 'DIR' | 'DOC' | 'CRA' | 'PIE' | 'INS'
  | 'CDP' | 'EXT' | 'UTP' | 'CON' | 'ORI' | 'TEC'
  | 'FIN' | 'OPE' | 'SOS' | 'GES' | 'GERENTE' | 'ASE';

export interface Colegio {
  id_colegio: number;
  nombre: string;
  direccion?: string;
  rut?: string;
  correo?: string;
  celular?: string;
  url_img?: string;
  id_director?: number;
  director_nombre?: string;
}

export interface MenuItem {
  label: string;
  href: string;
  icon: string;
  permisos?: string[];
}

export interface BudgetDetail {
  id_pre_detalle: number;
  id_presupuesto: number;
  nombre_producto: string;
  descripcion?: string;
  id_recurso?: number;
  recurso_nombre?: string;
  categoria_nombre?: string;
  id_grupo_recurso?: number;
  grupo_nombre?: string;
  codigo_cuenta?: string;
  formato_unidad: string;
  cantidad: number;
  cantidad_real?: number | null;
  valor_unitario?: number;
  valor_unitario_iva: number;
  valor_real_iva?: number | null;
  total_iva: number;
  text_ejecucion?: string; // para compatibilidad
  fecha_ejecucion: string;
  fecha_termino?: string;
  tipo_fecha: 'mensual' | 'bimestral' | 'semestral' | 'anual' | 'fecha_especifica';
  motivo: string;
  estado_aprobacion: 'Pendiente' | 'Aprobado' | 'Rechazado' | string;
  estado_compra?: 'Pendiente' | 'En camino' | 'Comprado' | 'En revisión' | string;
  comentario_revision?: string | null;
  id_actividad?: number;
  actividad_nombre?: string;
  actividad_dimension?: string | null;
  dimension?: string | null;
  accion_nombre?: string;
  id_subvencion?: number;
  destino_gasto?: string;
  id_cargo?: number;
  id_subarea?: number;
  cargo_nombre?: string;
  subarea_nombre?: string;
  centro_costos?: string | null;
  observacion?: string | null;
}

export interface BudgetRequest {
  id_presupuesto: number;
  codigo?: string;
  id_user: number;
  id_cargo?: number;
  id_subarea?: number;
  id_colegio: number;
  id_presupuesto_anual?: number | null;
  presupuesto_anual_nombre?: string | null;
  presupuesto_anual_year?: number | null;
  fecha: string;
  comentario?: string;
  monto_total: number;
  estado: 'Pendiente' | 'Enviado' | 'Aceptado' | 'Revisar' | 'Aprobado' | 'Rechazado';
  activo?: boolean;
  id_area?: number;
  area_nombre?: string;
  cargo_nombre?: string;
  subarea_nombre?: string;
  user_nombre?: string;
  colegio_nombre?: string;
  detalles: BudgetDetail[];
}

export interface PresupuestoAnual {
  id_presupuesto_anual: number;
  id_colegio: number;
  year: number;
  nombre: string;
  descripcion?: string | null;
  estado: 'activo' | 'cerrado';
  creado_por?: number | null;
  creado_por_nombre?: string | null;
  creado_en?: string | null;
  colegio_nombre?: string | null;
  solicitudes_count: number;
  monto_total: number;
}

export interface GrupoRecurso {
  id_grupo_recurso: number;
  id_cat_recurso?: number;
  nombre: string;
  descripcion?: string;
}

export interface Recurso {
  id_recurso: number;
  nombre: string;
  descripcion?: string;
  formato?: string;
  id_grupo_recurso?: number;
  grupo_nombre?: string;
  id_cat_recurso?: number;
  categoria_nombre?: string;
  categoria_descripcion?: string;
  codigos_contables?: string[];
}

export interface ActividadBuscar {
  id: number;
  nombre: string;
  lista_recursos?: string;
  dimension?: string;
  subdimension?: string;
  ano_pme?: number;
  colegio_nombre?: string;
  nombre_accion?: string;
}

export type DestinoGasto = 'Alumnos' | 'Funcionarios' | 'Premio / Beneficio' | 'Mantención / Servicio';

export interface CategoriaRecurso {
  id_cat_recurso: number;
  nombre: string;
  codigo_contable?: string;
  descripcion?: string;
  estado: string;
  destino_gasto: DestinoGasto[];
}

export interface RecursoOption {
  id_recurso: number;
  nombre: string;
  categoria_nombre?: string;
  id_cat_recurso: number;
  formato?: string;
  id_grupo_recurso?: number | null;
  grupo_nombre?: string | null;
}

export interface DetallePresupuestoForm {
  id_pre_detalle?: number;
  nombre_producto: string;
  descripcion?: string;
  id_recurso?: number;
  codigo_cuenta?: string;
  formato_unidad: string;
  cantidad: number;
  valor_unitario_iva: number;
  total_iva: number;
  fecha_ejecucion: string;
  fecha_termino?: string;
  mes_ejecucion?: string;
  tipo_fecha: 'mensual' | 'bimestral' | 'semestral' | 'anual' | 'fecha_especifica' | 'mes' | string;
  motivo: string;
  dimension_pme?: string | null;
  id_actividad?: number;
  id_subarea?: number | null;
  recurso_estado?: string;
  actividad_seleccionada?: any;
  destino_gasto?: string;
  id_subvencion?: number | null;
  categoria_nombre?: string;
  id_grupo_recurso?: number | null;
  grupo_nombre?: string | null;
  _esNuevo?: boolean;
  _isClassifying?: boolean;
  _idCategoria?: number | null;
  _idGrupo?: number | null;
}

export const FORMATOS_UNIDAD = [
  { value: 'unidad',  label: 'Unidad' },
  { value: 'par',     label: 'Par' },
  { value: 'docena',  label: 'Docena' },
  { value: 'caja',    label: 'Caja' },
  { value: 'pack',    label: 'Pack' },
  { value: 'set',     label: 'Set' },
  { value: 'kit',     label: 'Kit' },
  { value: 'lote',    label: 'Lote' },
  { value: 'resma',   label: 'Resma' },
  { value: 'rollo',   label: 'Rollo' },
  { value: 'bolsa',   label: 'Bolsa' },
  { value: 'sobre',   label: 'Sobre' },
  { value: 'frasco',  label: 'Frasco' },
  { value: 'botella', label: 'Botella' },
  { value: 'tubo',    label: 'Tubo' },
  { value: 'litro',   label: 'Litro (L)' },
  { value: 'ml',      label: 'Mililitro (ml)' },
  { value: 'kg',      label: 'Kilogramo (kg)' },
  { value: 'g',       label: 'Gramo (g)' },
  { value: 'metro',   label: 'Metro (m)' },
  { value: 'cm',      label: 'Centímetro (cm)' },
  { value: 'global',  label: 'Global' },
  { value: 'otros',   label: 'Otros' },
];

export const TIPOS_FECHA = [
  { value: 'mensual', label: 'Mensual' },
];

export const MESES = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export interface Convocatoria {
  id_convocatoria: number;
  id_presupuesto: number;
  solicitud_codigo?: string;
  presupuesto_anual_nombre?: string | null;
  colegio_nombre?: string | null;
  id_subarea: number;
  subarea_nombre?: string;
  area_nombre?: string;
  token: string;
  tiene_pin?: boolean;
  fecha_expiracion: string;
  estado: 'activo' | 'cerrado' | 'expirado';
  creado_en?: string;
  total_pedidos: number;
  pedidos_pendientes: number;
  pedidos_aceptados: number;
  url_publica?: string;
}

export interface PedidoExterno {
  id_pedido: number;
  id_convocatoria: number;
  nombre_recurso: string;
  descripcion?: string;
  formato_unidad: string;
  cantidad: number;
  precio_estimado: number;
  total: number;
  fecha_ejecucion: string;
  tipo_fecha: string;
  motivo: string;
  actividad_evento?: string;
  destino?: string;
  id_actividad_pme?: number;
  actividad_pme_nombre?: string;
  estado_jefe: 'pendiente' | 'aceptado' | 'rechazado' | 'importado';
  comentario_jefe?: string;
  id_cat_recurso?: number;
  categoria_nombre_ia?: string;
  clasificado_ia: boolean;
  creado_en?: string;
}

export interface Contabilidad {
  id_contabilidad: number;
  id_colegio: number;
  codigo: string;
  centro_costo: string;
  presupuesto_asignado: number;
  ejecutado: number;
  disponible: number;
}

export interface EstadoDetalle {
  id_estado: number;
  nombre: string;
}

export interface DetalleRequerimiento {
  id_detalle: number;
  id_requerimiento: number;
  lugar?: string;
  descripcion?: string;
  fecha_hora?: string;
  justificacion?: string;
  estado: string;
  precio: number;
  cantidad: number;
  id_estado?: number;
  estado_detalle?: EstadoDetalle;
}

export interface Requerimiento {
  id_requerimiento: number;
  numero: string;
  id_usuario: number;
  id_actividad?: number;
  fecha: string;
  para?: string;
  estado: string;
  usuario_nombre?: string;
  actividad_nombre?: string;
  detalles: DetalleRequerimiento[];
  imagenes: ReqImagen[];
}

export interface ReqImagen {
  id_imagen: number;
  id_requerimiento: number;
  url_img: string;
}

export interface PME {
  id_pme: number;
  id_colegio: number;
  year: number;
  acciones?: Accion[];
  acciones_count?: number;
  actividades_count?: number;
  colegio_nombre?: string;
}

export interface Accion {
  id_accion: number;
  id_pme: number;
  nombre_accion: string;
  descripcion?: string;
  verificacion?: string;
  responsable?: string;
  estado: string;
  activo?: boolean;
  dimension?: string;
  subdimensiones?: string;
  objetivo_estrategico?: string;
  estrategia?: string;
  planes_asociados?: string;
  medios_verificacion?: string;
  recursos_necesarios?: string;
  monto_sep?: number;
  monto_total?: number;
  nivel_ejecucion?: string;
  justificacion_nivel?: string;
  fecha_inicio?: string;
  fecha_termino?: string;
  programa_asociado?: string;
  ate?: string;
  tic?: string;
  monto_general?: number;
  actividades?: Actividad[];
  pme_year?: number;
  colegio_nombre?: string;
}

export interface ActividadCodigoItem {
  id_actividad_codigo?: number;
  id_actividad?: number;
  codigo_cuenta: string;
  id_subvencion?: number;
  es_principal: boolean;
  nombre_cuenta?: string;
  nombre_subvencion?: string;
  comentario?: string;
  estado?: string;
}

export interface Actividad {
  id_actividad: number;
  id_accion: number;
  accion_nombre?: string;
  accion_descripcion?: string;
  accion_activa?: boolean;
  nombre_actividad: string;
  descripcion?: string;
  dimension?: string;
  subdimension?: string;
  responsable?: string;
  medios_verificacion?: string;
  lista_recursos?: string;
  costo_estimado?: number;
  colegio_nombre?: string;
  colegio_nombre_completo?: string;
  colegio_direccion?: string;
  colegio_celular?: string;
  colegio_rut?: string;
  colegio_rbd?: string;
  colegio_url_img?: string;
  pme_year?: number;
  id_pme?: number;
  id_colegio?: number;
  director_nombre?: string;
  codigo_principal?: string;
  nombre_codigo_principal?: string;
  codigos_contables?: ActividadCodigoItem[];
}