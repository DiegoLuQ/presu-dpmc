import * as XLSX from 'xlsx';

export function descargarPlantillaPresupuesto(
    actividadesPME: { id?: number; id_actividad?: number; nombre: string; dimension?: string }[] = [],
    categorias: { id_cat_recurso?: number; id?: number; nombre: string; descripcion?: string }[] = []
) {
    const act1 = actividadesPME[0];
    const act2 = actividadesPME[1];
    const act1Id = act1?.id ?? act1?.id_actividad ?? 1;
    const act2Id = act2?.id ?? act2?.id_actividad ?? 2;

    // 1. Hoja de Datos / Plantilla principal
    const dataEjemplo = [
        {
            'Nombre del Insumo *': 'Papel Fotocopia Carta 75g',
            'Detalle / Especificaciones *': 'Resma de papel blanco alcalino 75g tamaño carta para guías e impresiones docentes',
            'ID Categoría (Opcional)': 1,
            'Cantidad *': 20,
            'Formato de Unidad': 'Resma',
            'Valor Unitario con IVA *': 4500,
            'Mes de Ejecución': 'Marzo',
            'Destino del Gasto *': 'Estudiantes',
            'Justificación / Motivo *': 'Material básico para la elaboración de guías de aprendizaje y evaluaciones escritas',
            'Dimensión PME (Opcional)': act1?.dimension || 'Gestión Pedagógica',
            'ID Actividad (Opcional)': act1Id,
            'Actividad PME (Opcional)': act1?.nombre || 'Planes de lectura y material impreso',
            'Código Contable (Sala Clases)': '410902',
            'Código Contable (Administración)': '410902',
            'Código Contable (Premios)': '',
            'Código Contable (Mantención)': '',
            'Subvención Aplicable': 'SEP'
        },
        {
            'Nombre del Insumo *': 'Silla Ergonómica Ejecutiva',
            'Detalle / Especificaciones *': 'Silla de oficina negra con ruedas, respaldo de malla transpirable y regulación de altura',
            'ID Categoría (Opcional)': 2,
            'Cantidad *': 2,
            'Formato de Unidad': 'Unidad',
            'Valor Unitario con IVA *': 45000,
            'Mes de Ejecución': 'Abril',
            'Destino del Gasto *': 'Funcionarios',
            'Justificación / Motivo *': 'Renovación de mobiliario dañado en la oficina administrativa de inspectoría',
            'Dimensión PME (Opcional)': 'Liderazgo',
            'ID Actividad (Opcional)': '',
            'Actividad PME (Opcional)': '',
            'Código Contable (Sala Clases)': '410902',
            'Código Contable (Administración)': '410902',
            'Código Contable (Premios)': '',
            'Código Contable (Mantención)': '',
            'Subvención Aplicable': 'GENERAL'
        },
        {
            'Nombre del Insumo *': 'Medallas de Honor Ceremonia',
            'Detalle / Especificaciones *': 'Medallas metálicas doradas 50mm con cinta azul estampada con logo del colegio',
            'ID Categoría (Opcional)': 3,
            'Cantidad *': 50,
            'Formato de Unidad': 'Unidad',
            'Valor Unitario con IVA *': 1800,
            'Mes de Ejecución': 'Noviembre',
            'Destino del Gasto *': 'Actividad',
            'Justificación / Motivo *': 'Premio y reconocimiento al rendimiento académico destacado de los alumnos',
            'Dimensión PME (Opcional)': act2?.dimension || 'Convivencia Escolar',
            'ID Actividad (Opcional)': act2Id,
            'Actividad PME (Opcional)': act2?.nombre || 'Premiación y reconocimiento de estudiantes',
            'Código Contable (Sala Clases)': '',
            'Código Contable (Administración)': '',
            'Código Contable (Premios)': '410905',
            'Código Contable (Mantención)': '',
            'Subvención Aplicable': 'GENERAL'
        }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataEjemplo);

    // Configurar anchos de columna para mejor visualización
    ws['!cols'] = [
        { wch: 30 }, // Nombre del Insumo
        { wch: 45 }, // Detalle
        { wch: 22 }, // ID Categoría (Opcional)
        { wch: 12 }, // Cantidad
        { wch: 18 }, // Formato
        { wch: 22 }, // Valor Unitario
        { wch: 18 }, // Mes
        { wch: 22 }, // Destino
        { wch: 45 }, // Justificación
        { wch: 28 }, // Dimensión PME (Opcional)
        { wch: 22 }, // ID Actividad (Opcional)
        { wch: 40 }, // Actividad PME (Opcional)
        { wch: 30 }, // Código Contable (Sala Clases)
        { wch: 32 }, // Código Contable (Administración)
        { wch: 28 }, // Código Contable (Premios)
        { wch: 30 }, // Código Contable (Mantención)
        { wch: 22 }  // Subvención Aplicable
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto');

    // 2. Hoja de Instrucciones y Guía de llenado
    const instrucciones = [
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': 'CAMPOS OBLIGATORIOS (marcados con *)' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Nombre del Insumo: Nombre comercial o técnico del recurso.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Detalle / Especificaciones: Marca, modelo, características, medidas o color.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Cantidad: Número entero mayor a 0.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Valor Unitario con IVA: Precio unitario estimado en CLP (ejemplo: 4500 sin puntos ni signo $).' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Destino del Gasto: OBLIGATORIO. Uno de los 4 destinos. Se acepta singular o plural,' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '  con o sin tildes y en mayúsculas. Cualquier otro valor marca la fila con error.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '     1) Estudiantes  (Clases, eventos, actividades pedagógicas)' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '        también sirve: Estudiante · Alumno · Alumnos · Sala de clases' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '     2) Funcionarios (Oficina, docentes, administración)' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '        también sirve: Funcionario · Oficina · Administración' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '     3) Actividad    (Premios, medallas, reconocimientos estudiantes)' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '        también sirve: Premio · Beneficio · Actividad / Beneficio' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '     4) Mantención   (Servicios, reparación, conservación e infraestructura)' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '        también sirve: Servicio · Mantención / Servicio' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Justificación / Motivo: Explique por qué se necesita el recurso.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': 'CATEGORÍA DEL RECURSO (OPCIONAL):' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• ID Categoría: Número identificador oficial de la categoría (ver hoja "Categorias_Disponibles"). También se acepta el nombre de la categoría en la columna "Categoría".' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': 'DIMENSIÓN Y ACTIVIDADES PME (OPCIONALES):' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• ID Actividad: Número identificador oficial de la actividad PME institucional (ver hoja "Actividades_PME_Referencia"). Si se ingresa el ID, el sistema enlaza la actividad de forma exacta.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Actividad PME: Nombre o fragmento de la actividad del Plan PME institucional (si no se especifica el ID).' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Dimensión PME: Escriba "Gestión Pedagógica", "Convivencia Escolar", "Liderazgo" o "Gestión de Recursos" para preseleccionar la dimensión.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': 'CÓDIGOS CONTABLES POR DESTINO (OPCIONALES):' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Código Contable (Sala Clases): Cuenta contable asignada para insumos usados por estudiantes en aula (ej: 410902).' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Código Contable (Administración): Cuenta contable asignada para insumos de oficina y funcionarios (ej: 410902).' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Código Contable (Premios): Cuenta contable asignada para premios, beneficios y reconocimientos.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Código Contable (Mantención): Cuenta contable asignada para servicios y repuestos de infraestructura.' },
        { 'GUÍA DE LLENADO DE PLANTILLA DE PRESUPUESTO': '• Subvención Aplicable: Escriba SEP, GENERAL, PIE, etc. Si se omite, se asignará automáticamente según el Área y Destino.' }
    ];

    const wsInst = XLSX.utils.json_to_sheet(instrucciones);
    wsInst['!cols'] = [{ wch: 95 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

    // 3. Hoja de Categorías Disponibles
    if (categorias.length > 0) {
        const catData = categorias.map(c => ({
            'ID Categoría': c.id_cat_recurso ?? c.id ?? '',
            'Nombre de la Categoría': c.nombre,
            'Descripción': c.descripcion || ''
        }));
        const wsCat = XLSX.utils.json_to_sheet(catData);
        wsCat['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 55 }];
        XLSX.utils.book_append_sheet(wb, wsCat, 'Categorias_Disponibles');
    }

    // 4. Hoja con Actividades PME de Referencia (si existen)
    if (actividadesPME.length > 0) {
        const pmeData = actividadesPME.map(a => ({
            'ID Actividad': a.id ?? a.id_actividad ?? '',
            'Nombre Actividad PME': a.nombre,
            'Dimensión PME': a.dimension || 'General'
        }));
        const wsPME = XLSX.utils.json_to_sheet(pmeData);
        wsPME['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, wsPME, 'Actividades_PME_Referencia');
    }

    // Descargar archivo
    XLSX.writeFile(wb, 'Plantilla_Carga_Presupuesto.xlsx');
}
