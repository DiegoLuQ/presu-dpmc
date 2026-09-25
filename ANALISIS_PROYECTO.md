# Análisis del Proyecto MCDP-PPA (ERP Escolar)

## Descripción General

**MCDP-PPA** es un sistema ERP (Enterprise Resource Planning) diseñado para la gestión de dos colegios. El sistema está construido con una arquitectura de **tres capas**: base de datos MySQL, backend API FastAPI y frontend Next.js.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Base de Datos | MySQL 8.0 + phpMyAdmin (Docker) |
| Backend | Python 3.12 + FastAPI + SQLAlchemy + Alembic |
| Frontend | Next.js 15 (App Router) + TypeScript + TailwindCSS |
| Autenticación | JWT (JSON Web Tokens) |

---

## Arquitectura del Sistema

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Frontend       │────▶│  Backend API    │────▶│  MySQL DB       │
│  Next.js        │     │  FastAPI        │     │  Docker         │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Backend (FastAPI)

### Estructura de Directorios

```
backend/
├── main.py                 # Punto de entrada de la API
├── alembic.ini            # Configuración de migraciones
├── seed.py                # Datos iniciales
├── app/
│   ├── models.py          # Modelos SQLAlchemy (ORM)
│   ├── core/
│   │   ├── config.py      # Configuración y variables de entorno
│   │   ├── security.py    # Hash de contraseñas y JWT
│   │   ├── permissions.py # Sistema de permisos
│   │   └── roles_seeder.py # Semilla de roles
│   ├── db/
│   │   └── session.py     # Conexión a base de datos
│   ├── api/
│   │   ├── auth.py        # Autenticación y login
│   │   ├── inventory.py   # CRUD de inventario
│   │   ├── budget.py      # CRUD de presupuesto
│   │   ├── users.py       # CRUD de usuarios
│   │   ├── roles.py       # CRUD de roles
│   │   └── catalogos.py   # Catálogos (colegios, áreas)
│   └── schemas/
│       ├── auth.py        # Esquemas Pydantic para auth
│       ├── inventory.py   # Esquemas para inventario
│       ├── budget.py      # Esquemas para presupuesto
│       └── rol.py         # Esquemas para roles
└── migrations/            # Migraciones Alembic
```

### Modelos de Base de Datos (SQLAlchemy)

#### Módulo Institucional (`org_*`)
| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| `Colegio` | `org_colegio` | Información de colegios |
| `Rol` | `auth_rol` | Roles de usuario con permisos JSON |
| `Area` | `org_area` | Áreas del colegio |
| `Subarea` | `org_subarea` | Subáreas dentro de áreas |
| `User` | `auth_usuario` | Usuarios del sistema |

#### Módulo PME y Presupuesto (`pre_*`)
| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| `Contabilidad` | `pre_contabilidad` | Centro de costos |
| `Recurso` | `pre_recurso` | Recursos presupuestarios |
| `PME` | `pre_pme` | Plan de Mejoramiento Educativo |
| `Accion` | `pre_accion` | Acciones del PME |
| `Actividad` | `pre_actividad` | Actividades de acciones |
| `SolicitudPresupuesto` | `pre_solicitud` | Solicitudes de presupuesto |
| `PresupuestoDetalle` | `pre_detalle` | Detalle de solicitudes |

#### Módulo Fotocopias/Inventario (`inv_*`)
| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| `Proveedor` | `inv_proveedor` | Proveedores de papel |
| `PapelCatalogo` | `inv_catalogo_papel` | Catálogo de tipos de papel |
| `InventarioStock` | `inv_stock` | Stock actual por colegio |
| `InventarioMovimiento` | `inv_movimiento` | Movimientos (entradas/salidas) |

### Sistema de Autenticación

- **JWT Tokens**: Generados con `python-jose` y `passlib`
- **Login**: Endpoint `/auth/login` (acepta RUT o correo)
- **Validación**: Middleware `get_current_user` en cada endpoint protegido
- **Permisos**: Sistema RBAC con permisos almacenados en JSON por rol

### API Endpoints

```
/auth
├── POST /login          # Autenticación
├── GET  /me             # Datos del usuario actual
└── GET  /permisos       # Permisos del usuario

/inventory
├── GET    /proveedores           # Listar proveedores
├── POST   /proveedores           # Crear proveedor
├── GET    /catalogo              # Listar tipos de papel
├── POST   /catalogo              # Crear tipo de papel
├── GET    /stock                 # Ver stock actual
├── GET    /movimientos           # Historial de movimientos
├── POST   /movimientos           # Registrar movimiento
└── DELETE /movimientos/{id}      # Eliminar movimiento

/catalogos
├── GET /colegios        # Listar colegios
└── GET /areas           # Listar áreas

/budget
├── GET    /contabilidad         # Listar centros de costo
├── POST   /contabilidad         # Crear centro de costo
├── GET    /recursos             # Listar recursos
└── GET    /solicitudes          # Listar solicitudes

/users
└── GET /                # Listar usuarios

/roles
├── GET  /               # Listar roles
└── POST /               # Crear rol
```

---

## Frontend (Next.js)

### Estructura de Directorios

```
frontend/
├── app/
│   ├── layout.tsx              # Layout raíz con AuthProvider
│   ├── page.tsx                # Página inicial (redirección)
│   ├── (auth)/
│   │   ├── layout.tsx          # Layout de autenticación
│   │   └── login/page.tsx      # Página de login
│   └── (protected)/             # Rutas protegidas
│       ├── layout.tsx          # Layout con Sidebar
│       ├── dashboard/page.tsx  # Dashboard principal
│       ├── inventario/
│       │   ├── movimientos/page.tsx  # Gestión de movimientos
│       │   ├── proveedores/page.tsx   # Gestión de proveedores
│       │   ├── catalogo/page.tsx      # Catálogo de papeles
│       │   └── configuracion/         # Configuración
│       ├── presupuesto/
│       │   ├── page.tsx        # Vista de presupuesto
│       │   ├── contabilidad/   # Centro de costos
│       │   ├── recursos/       # Recursos
│       │   └── solicitudes/    # Solicitudes
│       ├── pme/page.tsx        # Plan de Mejoramiento
│       ├── usuarios/page.tsx   # Gestión de usuarios
│       └── configuracion/       # Configuración del sistema
├── components/
│   ├── layout/Sidebar.tsx      # Barra lateral de navegación
│   ├── ui/Modal.tsx            # Componente modal reutilizable
│   └── ThemeSwitcher.tsx       # Cambiador de tema
├── context/
│   └── AuthContext.tsx         # Contexto de autenticación
├── lib/
│   ├── api/client.ts           # Cliente Axios configurado
│   └── types/index.ts          # Tipos TypeScript
└── middleware.ts                # Middleware de protección de rutas
```

### Sistema de Autenticación Frontend

1. **AuthContext**: Maneja estado global de autenticación
2. **Middleware**: Protege rutas y redirige no autenticados
3. **Permisos**: Función `tienePermiso(modulo, accion)` para control de acceso
4. **Persistencia**: Token en localStorage + cookie HTTP

### Módulo de Inventario (Principal)

**Funcionalidades implementadas:**

- **Dashboard con KPIs**: Stock actual, consumos mensuales
- **Formulario de ENTRADA**: Cajas × Resmas = Total (cálculo frontend)
- **Formulario de SALIDA**: Selección de área consumidora
- **Historial/Kardex**: Tabla de movimientos con filtros
- **Filtros avanzados**: Por colegio, área, papel, fechas
- **Eliminación con reversión**: Eliminar movimiento revierte el stock

### Control de Acceso por Roles

| Código | Rol | Permisos |
|--------|-----|----------|
| ADM | Administrador | Acceso total |
| DIR | Director | Acceso a su colegio |
| DOC | Docente | Solo lectura |
| CRA | CRA | Gestión inventario |
| PIE | PIE | Acceso limitado |
| ... | ... | ... |

---

## Base de Datos (MySQL)

### Configuración Docker

```yaml
services:
  db:
    image: mysql:8.0
    ports: ["3306:3306"]
  phpmyadmin:
    image: phpmyadmin:latest
    ports: ["8080:80"]
```

### Migraciones Alembic

- Comando: `alembic revision --autogenerate -m "mensaje"`
- Aplicar: `alembic upgrade head`
- Revisión inicial: `2e29bd2cffdf_initial_migration.py`

---

## Lógica de Negocio Principal

### Movimientos de Inventario

```
ENTRADA:
  1. Registra movimiento (id_papel, cantidad, proveedor)
  2. Crea/actualiza stock (cantidad_resmas += entrada)

SALIDA:
  1. Registra movimiento (id_papel, cantidad, área_consumo)
  2. Valida stock suficiente
  3. Actualiza stock (cantidad_resmas -= salida)

ELIMINACIÓN:
  1. Revierte stock según tipo de movimiento
  2. Valida que no genere stock negativo
  3. Elimina registro
```

---

## Características Destacadas

1. **Autenticación JWT**: Secure token-based auth
2. **RBAC**: Control de acceso basado en roles con permisos granulares
3. **Multi-colegio**: Soporte para múltiples colegios en una instancia
4. **Stock automático**: Actualización automática de inventario
5. **Migraciones**: Sistema de migraciones con Alembic
6. **UI moderna**: TailwindCSS con diseño responsive
7. **Protección de rutas**: Middleware Next.js + Context API

---

## Endpoints Principales por Módulo

### Inventario (Desarrollado)
- CRUD completo de proveedores, catálogo papel, stock, movimientos
- Lógica de negocio de stock automático

### Presupuesto (En desarrollo)
- Centro de costos, recursos, solicitudes

### PME (En desarrollo)
- Plan de Mejoramiento Educativo

### Usuarios (Base)
- Listado de usuarios del sistema

---

## Archivos Clave

| Archivo | Propósito |
|---------|----------|
| `backend/app/models.py` | Todos los modelos ORM |
| `backend/app/api/auth.py` | Autenticación JWT |
| `backend/app/api/inventory.py` | Lógica de inventario |
| `frontend/context/AuthContext.tsx` | Estado de autenticación |
| `frontend/middleware.ts` | Protección de rutas |
| `frontend/lib/api/client.ts` | Cliente HTTP Axios |