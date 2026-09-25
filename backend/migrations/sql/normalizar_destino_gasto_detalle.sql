-- Unifica pre_detalle.destino_gasto al vocabulario canónico, que es el que usa
-- pre_mapeo_recurso_subcategoria (2.235 filas, 100% consistente).
--
-- Motivo: build_detalle_response resuelve el código contable comparando
-- detalle.destino_gasto contra mapeo.destino_gasto. Las filas guardadas con la
-- etiqueta del formulario ("Funcionarios", "Alumnos") no calzan con ningún mapeo,
-- así que ese fallback quedaba muerto para ellas.
--
-- No toca pre_categoria_recurso.destino_gasto ni pre_subcategoria_recurso.destino_gasto:
-- esos campos tienen otra semántica (en qué destinos aplica una categoría, admitiendo
-- varios separados por coma) y su propio vocabulario.

UPDATE pre_detalle SET destino_gasto = 'clases(alumno)'
 WHERE destino_gasto IN ('Alumnos', 'alumnos', 'Alumno', 'Estudiantes', 'estudiantes');

UPDATE pre_detalle SET destino_gasto = 'oficinas(administracion)'
 WHERE destino_gasto IN ('Funcionarios', 'funcionarios', 'Funcionario', 'Oficina');

UPDATE pre_detalle SET destino_gasto = 'premio/beneficio'
 WHERE destino_gasto IN ('Premio / Beneficio', 'Premio/Beneficio', 'Premio', 'Beneficio', 'Actividad');

UPDATE pre_detalle SET destino_gasto = 'mantencion/servicio'
 WHERE destino_gasto IN ('Mantención / Servicio', 'Mantencion / Servicio', 'Mantención/Servicio',
                         'Mantencion/Servicio', 'Mantención', 'Mantencion', 'Servicio');

-- Verificación: debe devolver solo los 4 valores canónicos.
SELECT destino_gasto, COUNT(*) AS filas FROM pre_detalle GROUP BY destino_gasto;
