**Actúa como un desarrollador Full-Stack Senior experto en Python, FastAPI, Next.js (App Router), TailwindCSS y bases de datos relacionales (MySQL).**

Estamos construyendo un sistema ERP para la gestión de dos colegios. El sistema completo manejará Usuarios, Plan de Mejoramiento Educativo (PME), Presupuestos e Inventario. 

**Objetivo de esta iteración:**
1. Crear la infraestructura base de la base de datos (Docker Compose con MySQL y phpMyAdmin).
2. Crear TODOS los modelos de la base de datos en el backend (FastAPI) usando **SQLAlchemy** y configurar **Alembic** para poder editar/actualizar las tablas en el futuro sin perder datos.
3. Desarrollar la API (Backend) y el Frontend (Next.js) **ÚNICAMENTE para el módulo de Inventario de Fotocopias** (las tablas base quedarán listas para los futuros módulos).

---

### 🛠️ STACK TECNOLÓGICO:
*   **Base de datos:** MySQL + phpMyAdmin levantados con `docker-compose`.
*   **Backend:** FastAPI, SQLAlchemy (ORM), Alembic (Migraciones), Pydantic (Esquemas).
*   **Frontend:** Next.js (App Router, React), Tailwind CSS, Axios o Fetch para peticiones.

---

### 🗄️ ESTRUCTURA DE LA BASE DE DATOS (SQLAlchemy Models):
Debes generar los modelos de SQLAlchemy para TODAS estas tablas, respetando las relaciones (Foreign Keys).

**MÓDULO INSTITUCIONAL:**
*   `colegio`: id_colegio (PK), nombre, direccion, rut, correo, celular.
*   `area`: id_area (PK), nombre.
*   `subarea`: id_subarea (PK), nombre, id_area (FK).
*   `user`: id_user (PK), id_colegio (FK), id_subarea (FK), rut, nombre, correo, celular, contraseña, role, status.

**MÓDULO PME Y PRESUPUESTO (Dejar modelos creados, pero sin CRUD por ahora):**
*   `contabilidad`: id_contabilidad (PK), codigo, centro_costo.
*   `recursos`: id_recurso (PK), nombre, descripcion, formato, id_contabilidad (FK).
*   `pme`: id_pme (PK), id_colegio (FK), year.
*   `acciones`: id_accion (PK), id_pme (FK), nombre_accion, descripcion, verificacion, responsable, estado.
*   `actividades`: id_actividad (PK), id_accion (FK), nombre_actividad, descripcion, dimension, subdimension.
*   `solicitud_presupuesto`: id_presupuesto (PK), id_user (FK), id_subarea (FK), fecha, comentario.
*   `presupuesto_detalle`: id_pre_detalle (PK), id_presupuesto (FK), id_recurso (FK), id_actividad (FK), cantidad, precio_unitario.

**MÓDULO FOTOCOPIAS (Desarrollar CRUD completo Backend y Frontend):**
*   `proveedor`: id_proveedor (PK), rut, nombre_empresa, contacto_telefono, correo.
*   `papel_catalogo`: id_papel (PK), tipo_tamano, marca, hojas_por_resma.
*   `inventario_stock`: id_stock (PK), id_colegio (FK), id_papel (FK), cantidad_resmas (Integer).
*   `inventario_movimientos`: id_movimiento (PK), id_colegio (FK), id_user (FK), id_papel (FK), tipo_movimiento (Enum: 'ENTRADA', 'SALIDA'), cantidad_resmas (Integer), fecha_hora (DateTime), id_proveedor (FK, nullable), motivo (Text).

---

### 🚀 TAREAS A REALIZAR (Paso a paso):

**PASO 1: Infraestructura**
*   Crea el archivo `docker-compose.yml` para levantar MySQL y phpMyAdmin en los puertos estándar. Pon las variables de entorno necesarias.

**PASO 2: Backend (FastAPI + SQLAlchemy + Alembic)**
*   Configura la conexión a MySQL.
*   Crea el archivo `models.py` con las 15 tablas mencionadas y sus relaciones (`relationship` de SQLAlchemy).
*   Dame las instrucciones exactas para iniciar **Alembic** (`alembic init`), configurar el `env.py` y generar la primera migración para que las tablas se creen en MySQL.
*   Crea los endpoints CRUD (Routers) **solo para el módulo de fotocopias** (`proveedor`, `papel_catalogo`, `inventario_stock`, `inventario_movimientos`).
*   **Lógica de negocio del Backend:** Al hacer un POST a `inventario_movimientos` (una entrada o salida), el endpoint debe actualizar automáticamente la cantidad correspondiente en la tabla `inventario_stock`.

** PASO 3: 🔐 AUTENTICACIÓN JWT **
Backend (FastAPI):
1. Instalar python-jose[cryptography] y passlib[bcrypt]
2. Crear modelos Pydantic: Token, LoginRequest, UserResponse
3. Crear endpoint POST /auth/login - valida credenciales y retorna JWT con id_user, nombre, role
4. Crear endpoint GET /auth/me - retorna datos del usuario autenticado
5. Crear dependencia get_current_user - extrae y valida token JWT de Authorization header
6. Proteger todos los endpoints existentes agregando la dependencia Depends(get_current_user)





**PASO 4: Frontend (Next.js + Tailwind)**
Frontend (Next.js):
1. Crear AuthContext que maneje estado de autenticación y token
2. Crear hook useAuth() - exponga user, login, logout, isAuthenticated
3. Crear página /login con formulario (rut + contraseña)
4. Middleware de protección:
   - Si usuario autenticado accede a /login → redirect('/dashboard')
   - Si usuario NO autenticado accede a cualquier ruta protegida → redirect('/login')
5. Configurar Axios interceptor para incluir Authorization: Bearer <token> en todas las peticiones
Flujo de redirección:
- Login → Dashboard: Si ya tiene token válido → redirigir a Dashboard
- Dashboard → Login: Si no tiene token válido → redirigir a Login

*   Crea la estructura base para el módulo de fotocopias. Simula que el `id_colegio` y `id_user` vienen de un contexto de autenticación (puedes dejarlos hardcodeados temporalmente en un archivo de constantes).
*   Crea un **Dashboard** que muestre una tabla con el `inventario_stock` actual del colegio logueado.
*   Crea un **Formulario de ENTRADA (Compra)**: Debe pedir el Proveedor, Tipo de papel, y debe tener dos campos de texto: "Cantidad de Cajas" y "Resmas por caja". **En el Frontend (JavaScript)** se debe multiplicar (Cajas * Resmas) y enviar el total de `cantidad_resmas` al backend.
*   Crea un **Formulario de SALIDA (Consumo)**: Pide Tipo de papel, Cantidad de resmas a sacar y Motivo.
*   Crea una vista de **Kardex/Historial** que muestre la tabla `inventario_movimientos` del colegio.






Por favor, entrégame el código dividido de forma ordenada. Empieza por el Paso 1 (Docker), el Paso 2 (Modelos de base de datos y Alembic) por ultimo paso 3.




---

### 💡 ¿Por qué está redactado así?
1. Al decirle que use **Alembic**, la IA te dará los comandos como `alembic revision --autogenerate -m "crear tablas"`. Si mañana quieres agregarle un campo nuevo a la tabla colegio, solo cambias el código de Python, corres ese comando de nuevo, y la base de datos se actualiza sola sin perder información.
2. Limita el enfoque del código: Le dice a la IA que aunque haga *todas* las tablas, no pierda "tokens" ni tiempo haciéndote el frontend del PME todavía, enfocándose 100% en que el sistema de fotocopias funcione excelente.
3. Tiene explícita la regla de multiplicar las Cajas por las Resmas en el Frontend antes de enviarlo a la API.