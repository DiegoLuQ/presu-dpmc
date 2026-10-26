-- Sincroniza pre_recurso.nombre de los recursos sugeridos (PENDIENTE_APROBACION)
-- con el nombre_producto del único detalle que los usa.
--
-- Motivo: hasta ahora, al editar el nombre de un ítem en "Agregar recursos" solo
-- se actualizaba pre_detalle.nombre_producto; el recurso sugerido conservaba el
-- primer nombre y 'Recursos Sugeridos' del contralor lo mostraba desactualizado.
-- update_detalle ya los renombra juntos; esto corrige los que quedaron desfasados.
--
-- Mismas condiciones que el backend: solo recursos pendientes, usados por un único
-- detalle, y sin otro recurso que ya tenga el nombre nuevo. Idempotente.

-- Se calcula primero en una tabla temporal: MySQL no deja leer pre_recurso en
-- la misma sentencia que la actualiza (error 1093).
DROP TEMPORARY TABLE IF EXISTS tmp_recurso_renombrar;
CREATE TEMPORARY TABLE tmp_recurso_renombrar AS
SELECT r.id_recurso, r.nombre AS nombre_actual, TRIM(d.nombre_producto) AS nombre_nuevo, d.id_presupuesto
  FROM pre_recurso r
  JOIN pre_detalle d ON d.id_recurso = r.id_recurso
 WHERE r.estado = 'PENDIENTE_APROBACION'
   AND TRIM(d.nombre_producto) <> ''
   AND BINARY r.nombre <> BINARY TRIM(d.nombre_producto)
   AND (SELECT COUNT(*) FROM pre_detalle d2 WHERE d2.id_recurso = r.id_recurso) = 1
   AND NOT EXISTS (SELECT 1 FROM pre_recurso r2
                    WHERE r2.id_recurso <> r.id_recurso
                      AND LOWER(r2.nombre) = LOWER(TRIM(d.nombre_producto)));

-- Vista previa: recursos que se van a renombrar.
SELECT * FROM tmp_recurso_renombrar;

UPDATE pre_recurso r
  JOIN tmp_recurso_renombrar x ON x.id_recurso = r.id_recurso
   SET r.nombre = x.nombre_nuevo;

DROP TEMPORARY TABLE tmp_recurso_renombrar;
