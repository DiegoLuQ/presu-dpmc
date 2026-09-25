-- =====================================================
-- MIGRACIÓN: Modulo Presupuesto v2
-- Descripción: Ampliación de tablas pre_solicitud y pre_detalle
-- Fecha: 2026-04-16
-- =====================================================

-- 1. AGREGAR id_colegio a pre_solicitud
ALTER TABLE pre_solicitud 
ADD COLUMN id_colegio INT AFTER id_subarea,
ADD CONSTRAINT fk_solicitud_colegio FOREIGN KEY (id_colegio) REFERENCES org_colegio(id_colegio);

-- 2. MODIFICAR pre_detalle - Agregar nuevas columnas primero
ALTER TABLE pre_detalle 
ADD COLUMN nombre_producto VARCHAR(255) NOT NULL AFTER id_presupuesto,
ADD COLUMN descripcion VARCHAR(500) NULL AFTER nombre_producto,
ADD COLUMN formato_unidad VARCHAR(50) NOT NULL AFTER descripcion,
ADD COLUMN cantidad DECIMAL(15, 2) NOT NULL AFTER formato_unidad,
ADD COLUMN valor_unitario_iva DECIMAL(15, 2) NOT NULL AFTER cantidad,
ADD COLUMN total_iva DECIMAL(15, 2) NOT NULL AFTER valor_unitario_iva,
ADD COLUMN fecha_ejecucion DATE NOT NULL AFTER total_iva,
ADD COLUMN tipo_fecha VARCHAR(20) NOT NULL AFTER fecha_ejecucion,
ADD COLUMN motivo VARCHAR(255) NOT NULL AFTER tipo_fecha,
ADD COLUMN estado_aprobacion VARCHAR(20) DEFAULT 'Pendiente' NOT NULL AFTER motivo;

-- 3. Hacer id_recurso nullable (porque el usuario puede escribir sin buscar)
ALTER TABLE pre_detalle 
MODIFY COLUMN id_recurso INT NULL;

-- 4. Eliminar columnas antiguas (después de agregar las nuevas)
ALTER TABLE pre_detalle 
DROP COLUMN cantidad_old,
DROP COLUMN precio_unitario_old,
DROP COLUMN id_contabilidad;

-- 5. Actualizar columnas existentes (si hay datos antiguos)
UPDATE pre_detalle SET cantidad = 1, valor_unitario_iva = 0, total_iva = 0 WHERE cantidad IS NULL;
UPDATE pre_detalle SET nombre_producto = 'Producto sin nombre' WHERE nombre_producto IS NULL OR nombre_producto = '';
UPDATE pre_detalle SET formato_unidad = 'unidad' WHERE formato_unidad IS NULL OR formato_unidad = '';
UPDATE pre_detalle SET tipo_fecha = 'mensual' WHERE tipo_fecha IS NULL OR tipo_fecha = '';
UPDATE pre_detalle SET motivo = 'Sin motivo' WHERE motivo IS NULL OR motivo = '';
UPDATE pre_detalle SET estado_aprobacion = 'Pendiente' WHERE estado_aprobacion IS NULL OR estado_aprobacion = '';
UPDATE pre_detalle SET fecha_ejecucion = CURDATE() WHERE fecha_ejecucion IS NULL;

-- 6. Asignar id_colegio a solicitudes existentes basándose en el usuario
UPDATE pre_solicitud s
INNER JOIN auth_usuario u ON s.id_user = u.id_user
SET s.id_colegio = u.id_colegio
WHERE s.id_colegio IS NULL;

-- 7. Agregar índices para mejor rendimiento en búsquedas
CREATE INDEX idx_detalle_estado ON pre_detalle(estado_aprobacion);
CREATE INDEX idx_solicitud_estado ON pre_solicitud(estado);
CREATE INDEX idx_solicitud_usuario ON pre_solicitud(id_user);

-- 8. Insertar categorías iniciales si no existen
INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Cafetería', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Cafetería');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Oficina', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Oficina');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Aseo', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Aseo');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Tecnología', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Tecnología');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Material Didáctico', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Material Didáctico');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Mantenimiento', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Mantenimiento');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Uniformes', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Uniformes');

INSERT INTO pre_categoria_recurso (nombre, estado) 
SELECT 'Otro', 'Activo' FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM pre_categoria_recurso WHERE nombre = 'Otro');

-- 9. Agregar columna codigo a pre_solicitud
ALTER TABLE pre_solicitud 
ADD COLUMN codigo VARCHAR(30) NULL UNIQUE AFTER id_presupuesto;

-- 10. Generar códigos para solicitudes existentes
UPDATE pre_solicitud s
INNER JOIN org_subarea sub ON s.id_subarea = sub.id_subarea
INNER JOIN org_area ar ON sub.id_area = ar.id_area
SET s.codigo = CONCAT('SP-', COALESCE(ar.prefijo, 'XX'), '-', LPAD(s.id_presupuesto, 4, '0'))
WHERE s.codigo IS NULL;

-- 11. Agregar índice único para codigo
CREATE UNIQUE INDEX idx_solicitud_codigo ON pre_solicitud(codigo);
