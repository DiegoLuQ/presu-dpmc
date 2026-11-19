-- Migración: módulo Órdenes de Pago de Servicio (OPS) · GO-Contralor
-- MCDP-PPA · mcdp_db (MySQL 8)
--
-- Las tablas también las crea Base.metadata.create_all() al arrancar el backend
-- (modelos Ops* en app/models.py); este script es el equivalente manual.
-- Reutiliza: org_colegio (entidad emisora), org_area (área solicitante),
-- auth_usuario (quien crea / emite) y org_config (configuración 'ops.*').
-- Montos en pesos enteros (BIGINT).

CREATE TABLE IF NOT EXISTS ops_proveedor (
    id_proveedor   INT AUTO_INCREMENT PRIMARY KEY,
    rut            VARCHAR(12)  NOT NULL,           -- normalizado: 77287761-7
    nombre         VARCHAR(200) NOT NULL,
    telefono       VARCHAR(30)  NULL,
    direccion      VARCHAR(250) NULL,
    correo         VARCHAR(150) NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en      DATETIME NULL,
    actualizado_en DATETIME NULL,
    UNIQUE KEY uq_ops_proveedor_rut (rut)
);

CREATE TABLE IF NOT EXISTS ops_proveedor_cuenta (
    id_cuenta      INT AUTO_INCREMENT PRIMARY KEY,
    id_proveedor   INT NOT NULL,
    banco          VARCHAR(80)  NOT NULL,
    tipo_cuenta    VARCHAR(40)  NOT NULL,           -- Corriente | Vista | Ahorro | RUT
    numero_cuenta  VARCHAR(40)  NOT NULL,
    rut_titular    VARCHAR(12)  NOT NULL,
    nombre_titular VARCHAR(150) NULL,
    correo         VARCHAR(150) NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    KEY ix_ops_cuenta_proveedor (id_proveedor),
    CONSTRAINT fk_ops_cuenta_proveedor FOREIGN KEY (id_proveedor)
        REFERENCES ops_proveedor(id_proveedor) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_orden_pago (
    id_ops           INT AUTO_INCREMENT PRIMARY KEY,
    id_colegio       INT NOT NULL,                  -- entidad emisora
    numero_ops       INT NOT NULL,                  -- "N° G/O": correlativo por colegio, no se reinicia
    fecha_emision    DATE NOT NULL,
    id_proveedor     INT NOT NULL,
    id_area          INT NULL,
    tipo_orden       VARCHAR(20) NOT NULL DEFAULT 'SERVICIO',   -- SERVICIO | COMPRA
    tipo_documento   VARCHAR(20) NOT NULL,                      -- FACTURA | BOLETA
    monto_base       BIGINT NOT NULL DEFAULT 0,     -- TOTAL NETO (factura) / TOTAL BRUTO (boleta)
    descuento_monto  BIGINT NOT NULL DEFAULT 0,
    iva_pct          DECIMAL(5,2) NULL,             -- % vigente al guardar (factura)
    iva_monto        BIGINT NOT NULL DEFAULT 0,
    retencion_pct    DECIMAL(5,2) NULL,             -- % vigente al guardar (boleta honorarios)
    retencion_monto  BIGINT NOT NULL DEFAULT 0,
    total_pagar      BIGINT NOT NULL DEFAULT 0,
    forma_pago       VARCHAR(20) NULL,              -- CONTADO | ANTICIPO
    observacion      VARCHAR(300) NULL,
    id_cuenta        INT NULL,                      -- cuenta elegida; sus datos se copian abajo
    cta_titular      VARCHAR(150) NULL,
    cta_rut          VARCHAR(12)  NULL,
    cta_banco        VARCHAR(80)  NULL,
    cta_tipo         VARCHAR(40)  NULL,
    cta_numero       VARCHAR(40)  NULL,
    cta_correo       VARCHAR(150) NULL,
    estado           VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',   -- BORRADOR | EMITIDA | ANULADA
    motivo_anulacion VARCHAR(300) NULL,
    firmante_nombre  VARCHAR(150) NULL,
    firmante_cargo   VARCHAR(100) NULL,
    id_user_crea     INT NULL,
    id_user_emite    INT NULL,
    fecha_emitida    DATETIME NULL,
    fecha_anulada    DATETIME NULL,
    creado_en        DATETIME NULL,
    actualizado_en   DATETIME NULL,
    UNIQUE KEY uq_ops_colegio_numero (id_colegio, numero_ops),
    KEY ix_ops_fecha (fecha_emision),
    KEY ix_ops_proveedor (id_proveedor),
    CONSTRAINT fk_ops_colegio   FOREIGN KEY (id_colegio)    REFERENCES org_colegio(id_colegio),
    CONSTRAINT fk_ops_proveedor FOREIGN KEY (id_proveedor)  REFERENCES ops_proveedor(id_proveedor),
    CONSTRAINT fk_ops_area      FOREIGN KEY (id_area)       REFERENCES org_area(id_area) ON DELETE SET NULL,
    CONSTRAINT fk_ops_cuenta    FOREIGN KEY (id_cuenta)     REFERENCES ops_proveedor_cuenta(id_cuenta) ON DELETE SET NULL,
    CONSTRAINT fk_ops_user_crea FOREIGN KEY (id_user_crea)  REFERENCES auth_usuario(id_user) ON DELETE SET NULL,
    CONSTRAINT fk_ops_user_emite FOREIGN KEY (id_user_emite) REFERENCES auth_usuario(id_user) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ops_item (
    id_item        INT AUTO_INCREMENT PRIMARY KEY,
    id_ops         INT NOT NULL,
    linea          INT NOT NULL,
    cantidad       DECIMAL(12,2) NULL,
    detalle        TEXT NOT NULL,
    valor_unitario BIGINT NOT NULL DEFAULT 0,
    valor_total    BIGINT NOT NULL DEFAULT 0,
    KEY ix_ops_item_ops (id_ops),
    CONSTRAINT fk_ops_item_ops FOREIGN KEY (id_ops) REFERENCES ops_orden_pago(id_ops) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_pago (
    id_pago     INT AUTO_INCREMENT PRIMARY KEY,
    id_ops      INT NOT NULL,
    nro_cuota   INT NOT NULL,
    monto       BIGINT NOT NULL,
    fecha_pago  DATE NULL,
    porcentaje  DECIMAL(5,2) NULL,                  -- 50.00
    medio       VARCHAR(20) NOT NULL DEFAULT 'CHEQUE',  -- CHEQUE | TRANSFERENCIA | EFECTIVO | OTRO
    nro_cheque  VARCHAR(20) NULL,
    KEY ix_ops_pago_ops (id_ops),
    CONSTRAINT fk_ops_pago_ops FOREIGN KEY (id_ops) REFERENCES ops_orden_pago(id_ops) ON DELETE CASCADE
);

-- Configuración por colegio (editable en GO-Contralor › Órdenes de Pago › Configuración)
INSERT INTO org_config (id_colegio, clave, valor)
SELECT c.id_colegio, k.clave, k.valor
FROM org_colegio c
CROSS JOIN (
    SELECT 'ops.iva_pct' AS clave, '19' AS valor
    UNION ALL SELECT 'ops.retencion_pct', '15.25'
    UNION ALL SELECT 'ops.siguiente_numero', '1'
) k
WHERE NOT EXISTS (
    SELECT 1 FROM org_config oc WHERE oc.id_colegio = c.id_colegio AND oc.clave = k.clave
);
