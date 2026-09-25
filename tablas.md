# Documentación de Tablas de Base de Datos

## Módulo Institucional (`org_`)

### org_colegio

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_colegio | Integer | PK | No | Identificador único del colegio |
| nombre | String(255) | | No | Nombre del colegio |
| direccion | String(255) | | Sí | Dirección del colegio |
| rut | String(20) | UK | No | RUT del colegio |
| correo | String(255) | | Sí | Correo electrónico |
| celular | String(20) | | Sí | Número de celular |

**Relaciones:** 
- `users` → `auth_usuario` (uno a muchos)
- `pmes` → `pre_pme` (uno a muchos)
- `contabilidades` → `pre_contabilidad` (uno a muchos)

---

### org_area

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_area | Integer | PK | No | Identificador único del área |
| nombre | String(255) | | No | Nombre del área |
| prefijo | String(50) | | Sí | Prefijo identificador |

**Relaciones:**
- `subareas` → `org_subarea` (uno a muchos)

---

### org_subarea

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_subarea | Integer | PK | No | Identificador único de la subárea |
| nombre | String(255) | | No | Nombre de la subárea |
| id_area | Integer | FK | No | Referencia a `org_area` |

**Relaciones:**
- `area` → `org_area` (muchos a uno)
- `users` → `auth_usuario` (uno a muchos)
- `solicitudes` → `pre_solicitud` (uno a muchos)

---

### auth_rol

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_rol | Integer | PK | No | Identificador único del rol |
| nombre | String(100) | | No | Nombre del rol |
| codigo | String(50) | UK | No | Código único del rol |
| prefijo | String(20) | | Sí | Prefijo identificador |
| permisos | JSON | | Sí | Lista de permisos del rol |

**Relaciones:**
- `users` → `auth_usuario` (uno a muchos)

---

### auth_usuario

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_user | Integer | PK | No | Identificador único del usuario |
| id_colegio | Integer | FK | Sí | Referencia a `org_colegio` |
| id_subarea | Integer | FK | Sí | Referencia a `org_subarea` |
| id_rol | Integer | FK | Sí | Referencia a `auth_rol` |
| rut | String(20) | UK | No | RUT del usuario |
| nombre | String(255) | | No | Nombre del usuario |
| correo | String(255) | UK | No | Correo electrónico |
| celular | String(20) | | Sí | Número de celular |
| password | String(255) | | No | Contraseña encriptada |
| status | String(20) | | Sí | Estado del usuario (default: ACTIVE) |

**Relaciones:**
- `colegio` → `org_colegio` (muchos a uno)
- `subarea` → `org_subarea` (muchos a uno)
- `rol` → `auth_rol` (muchos a uno)
- `solicitudes` → `pre_solicitud` (uno a muchos)

---

## Módulo PME y Presupuesto (`pre_`)

### pre_contabilidad

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_contabilidad | Integer | PK | No | Identificador único |
| id_colegio | Integer | FK | No | Referencia a `org_colegio` (default: 1) |
| codigo | String(50) | UK | No | Código único de contabilidad |
| centro_costo | String(100) | | Sí | Centro de costo |
| presupuesto_asignado | Float | | Sí | Presupuesto asignado (default: 0.0) |

**Relaciones:**
- `colegio` → `org_colegio` (muchos a uno)
- `recursos` → `pre_recurso` (uno a muchos)

---

### pre_recurso

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_recurso | Integer | PK | No | Identificador único del recurso |
| nombre | String(255) | | No | Nombre del recurso |
| descripcion | Text | | Sí | Descripción del recurso |
| formato | String(100) | | Sí | Formato del recurso |
| id_contabilidad | Integer | FK | Sí | Referencia a `pre_contabilidad` |

**Relaciones:**
- `contabilidad` → `pre_contabilidad` (muchos a uno)
- `presupuesto_detalles` → `pre_detalle` (uno a muchos)

---

### pre_pme

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_pme | Integer | PK | No | Identificador único del PME |
| id_colegio | Integer | FK | Sí | Referencia a `org_colegio` |
| year | Integer | | No | Año del PME |

**Relaciones:**
- `colegio` → `org_colegio` (muchos a uno)
- `acciones` → `pre_accion` (uno a muchos)

---

### pre_accion

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_accion | Integer | PK | No | Identificador único de la acción |
| id_pme | Integer | FK | Sí | Referencia a `pre_pme` |
| nombre_accion | String(255) | | No | Nombre de la acción |
| descripcion | Text | | Sí | Descripción de la acción |
| verificacion | String(255) | | Sí | Método de verificación |
| responsable | String(255) | | Sí | Responsable de la acción |
| estado | String(50) | | Sí | Estado de la acción |

**Relaciones:**
- `pme` → `pre_pme` (muchos a uno)
- `actividades` → `pre_actividad` (uno a muchos)

---

### pre_actividad

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_actividad | Integer | PK | No | Identificador único de la actividad |
| id_accion | Integer | FK | Sí | Referencia a `pre_accion` |
| nombre_actividad | String(255) | | No | Nombre de la actividad |
| descripcion | Text | | Sí | Descripción de la actividad |
| dimension | String(100) | | Sí | Dimensión de la actividad |
| subdimension | String(100) | | Sí | Subdimensión de la actividad |

**Relaciones:**
- `accion` → `pre_accion` (muchos a uno)
- `presupuesto_detalles` → `pre_detalle` (uno a muchos)

---

### pre_solicitud

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_presupuesto | Integer | PK | No | Identificador único de la solicitud |
| id_user | Integer | FK | Sí | Referencia a `auth_usuario` |
| id_subarea | Integer | FK | Sí | Referencia a `org_subarea` |
| fecha | DateTime | | Sí | Fecha de la solicitud (default: utcnow) |
| comentario | Text | | Sí | Comentario de la solicitud |
| estado | String(20) | | Sí | Estado (default: Pendiente) |

**Relaciones:**
- `user` → `auth_usuario` (muchos a uno)
- `subarea` → `org_subarea` (muchos a uno)
- `detalles` → `pre_detalle` (uno a muchos)

---

### pre_detalle

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_pre_detalle | Integer | PK | No | Identificador único del detalle |
| id_presupuesto | Integer | FK | Sí | Referencia a `pre_solicitud` |
| id_recurso | Integer | FK | Sí | Referencia a `pre_recurso` |
| id_actividad | Integer | FK | Sí | Referencia a `pre_actividad` |
| cantidad | Integer | | No | Cantidad solicitada |
| precio_unitario | Float | | No | Precio unitario |

**Relaciones:**
- `solicitud` → `pre_solicitud` (muchos a uno)
- `recurso` → `pre_recurso` (muchos a uno)
- `actividad` → `pre_actividad` (muchos a uno)

---

## Módulo Requerimientos (`req_`)

### req_estado

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_estado | Integer | PK | No | Identificador único del estado |
| nombre | String(100) | | No | Nombre del estado |

**Relaciones:**
- `detalles` → `req_detalle` (uno a muchos)

---

### req_requerimiento

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_requerimiento | Integer | PK | No | Identificador único del requerimiento |
| numero | String(50) | UK | No | Número único del requerimiento |
| id_usuario | Integer | FK | Sí | Referencia a `auth_usuario` |
| id_actividad | Integer | FK | Sí | Referencia a `pre_actividad` |
| fecha | DateTime | | Sí | Fecha del requerimiento |
| para | String(255) | | Sí | Destinatario |
| estado | String(50) | | Sí | Estado (default: Pendiente) |

**Relaciones:**
- `usuario` → `auth_usuario` (muchos a uno)
- `actividad` → `pre_actividad` (muchos a uno)
- `detalles` → `req_detalle` (uno a muchos)

---

### req_detalle

| Columna | Tipo | Clave | Nullable | Descripción |
|---------|------|-------|----------|-------------|
| id_detalle | Integer | PK | No | Identificador único del detalle |
| id_requerimiento | Integer | FK | Sí | Referencia a `req_requerimiento` |
| lugar | String(255) | | Sí | Lugar del requerimiento |
| descripcion | Text | | Sí | Descripción del item |
| fecha_hora | String(100) | | Sí | Fecha y hora programada |
| justificacion | Text | | Sí | Justificación del requerimiento |
| estado | String(50) | | Sí | Estado del detalle |
| precio | Integer | | Sí | Precio unitario (default: 0) |
| cantidad | Integer | | Sí | Cantidad (default: 1) |
| id_estado | Integer | FK | Sí | Referencia a `req_estado` |

**Relaciones:**
- `requerimiento` → `req_requerimiento` (muchos a uno)
- `estado_detalle` → `req_estado` (muchos a uno)

---

## Resumen de Tablas

| Prefijo | Tabla | Descripción |
|---------|-------|-------------|
| `org_` | org_colegio | Colegios |
| `org_` | org_area | Áreas |
| `org_` | org_subarea | Subáreas |
| `auth_` | auth_rol | Roles de usuario |
| `auth_` | auth_usuario | Usuarios |
| `pre_` | pre_contabilidad | Contabilidad/Presupuesto |
| `pre_` | pre_recurso | Recursos |
| `pre_` | pre_pme | Plan de Mejoramiento Educativo |
| `pre_` | pre_accion | Acciones del PME |
| `pre_` | pre_actividad | Actividades de las acciones |
| `pre_` | pre_solicitud | Solicitudes de presupuesto |
| `pre_` | pre_detalle | Detalles de solicitud |
| `req_` | req_estado | Estados de detalle |
| `req_` | req_requerimiento | Requerimientos |
| `req_` | req_detalle | Detalles de requerimiento |
