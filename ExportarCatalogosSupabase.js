/**
 * Exporta los catálogos actuales de Google Sheets a un archivo JSON
 * para preparar una migración posterior de Supabase.
 */
function exportarCatalogosSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'No se pudo acceder al archivo de Google Sheets.'
    );
  }

  const hojaSucursales =
    obtenerHojaCatalogoSupabase_(ss, 'Sucursales');
  const hojaAsesores =
    obtenerHojaCatalogoSupabase_(ss, 'Asesores');
  const hojaProcesos =
    obtenerHojaCatalogoSupabase_(ss, 'Procesos');
  const hojaOrigenes =
    obtenerHojaCatalogoSupabase_(ss, 'Origenes');

  const mapaSucursales =
    obtenerMapaEncabezados_(hojaSucursales);
  const columnaSucursal =
    obtenerColumnaObligatoria_(
      mapaSucursales,
      'Sucursal'
    );

  const mapaAsesores =
    obtenerMapaEncabezados_(hojaAsesores);
  const columnaAsesor =
    obtenerColumnaObligatoria_(
      mapaAsesores,
      'Asesor'
    );
  const columnaSucursalAsesor =
    obtenerColumnaObligatoria_(
      mapaAsesores,
      'Sucursal'
    );
  const columnaActivo =
    obtenerColumnaObligatoria_(
      mapaAsesores,
      'Activo'
    );

  const mapaProcesos =
    obtenerMapaEncabezados_(hojaProcesos);
  const columnaProceso =
    obtenerColumnaObligatoria_(
      mapaProcesos,
      'Proceso'
    );

  const mapaOrigenes =
    obtenerMapaEncabezados_(hojaOrigenes);
  const columnaOrigen =
    obtenerColumnaObligatoria_(
      mapaOrigenes,
      'Origen'
    );

  const sucursales =
    obtenerValoresUnicosCatalogoSupabase_(
      hojaSucursales,
      columnaSucursal
    ).map(function(nombre) {
      return {
        nombre: nombre
      };
    });

  const nombresAsesores =
    leerColumnaCatalogoSupabase_(
      hojaAsesores,
      columnaAsesor
    );
  const sucursalesAsesores =
    leerColumnaCatalogoSupabase_(
      hojaAsesores,
      columnaSucursalAsesor
    );
  const activosAsesores =
    leerColumnaCatalogoSupabase_(
      hojaAsesores,
      columnaActivo
    );

  const asesores = [];

  for (let i = 0; i < nombresAsesores.length; i++) {
    const nombre = nombresAsesores[i];
    const sucursal = sucursalesAsesores[i];
    const activoOriginal = activosAsesores[i];

    if (!nombre || !sucursal) {
      continue;
    }

    const activoNormalizado =
      activoOriginal.toUpperCase();

    asesores.push({
      nombre: nombre,
      sucursal: sucursal,
      activoOriginal: activoOriginal,
      activo:
        activoNormalizado === 'SÍ' ||
        activoNormalizado === 'SI'
    });
  }

  const procesos =
    obtenerValoresUnicosCatalogoSupabase_(
      hojaProcesos,
      columnaProceso
    )
      .filter(function(nombre) {
        return nombre !== 'Otro';
      })
      .map(function(nombre) {
        return {
          nombre: nombre
        };
      });

  const origenes =
    obtenerValoresUnicosCatalogoSupabase_(
      hojaOrigenes,
      columnaOrigen
    )
      .filter(function(nombre) {
        return nombre !== 'Otro';
      })
      .map(function(nombre) {
        return {
          nombre: nombre
        };
      });

  const fechaGeneracion = new Date();
  const resultado = {
    generadoEn: fechaGeneracion.toISOString(),
    sucursales: sucursales,
    asesores: asesores,
    procesos: procesos,
    origenes: origenes
  };

  const contenido =
    JSON.stringify(resultado, null, 2);
  const marcaTiempo =
    Utilities.formatDate(
      fechaGeneracion,
      Session.getScriptTimeZone(),
      'yyyyMMdd_HHmmss'
    );
  const nombreArchivo =
    'catalogos_supabase_' +
    marcaTiempo +
    '.json';
  const blob =
    Utilities.newBlob(
      contenido,
      'application/json',
      nombreArchivo
    );
  const archivo = DriveApp.createFile(blob);

  return {
    ok: true,
    nombreArchivo: archivo.getName(),
    url: archivo.getUrl(),
    totalSucursales: sucursales.length,
    totalAsesores: asesores.length,
    totalProcesos: procesos.length,
    totalOrigenes: origenes.length
  };
}

/**
 * Ejecuta manualmente la exportación y registra su resultado.
 */
function probarExportacionCatalogosSupabase() {
  const resultado =
    exportarCatalogosSupabase();

  Logger.log(
    JSON.stringify(resultado, null, 2)
  );

  return resultado;
}

/**
 * Obtiene una hoja requerida con un error descriptivo.
 */
function obtenerHojaCatalogoSupabase_(ss, nombreHoja) {
  const hoja = ss.getSheetByName(nombreHoja);

  if (!hoja) {
    throw new Error(
      'No se encuentra la hoja "' +
      nombreHoja +
      '".'
    );
  }

  return hoja;
}

/**
 * Lee una columna desde la fila 2 y limpia sus textos.
 */
function leerColumnaCatalogoSupabase_(hoja, columna) {
  const ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return [];
  }

  return hoja
    .getRange(
      2,
      columna,
      ultimaFila - 1,
      1
    )
    .getDisplayValues()
    .flat()
    .map(function(valor) {
      return String(valor || '').trim();
    });
}

/**
 * Lee valores no vacíos y elimina duplicados exactos,
 * conservando el orden de primera aparición.
 */
function obtenerValoresUnicosCatalogoSupabase_(
  hoja,
  columna
) {
  const valores =
    leerColumnaCatalogoSupabase_(
      hoja,
      columna
    );
  const vistos = new Set();
  const unicos = [];

  valores.forEach(function(valor) {
    if (!valor || vistos.has(valor)) {
      return;
    }

    vistos.add(valor);
    unicos.push(valor);
  });

  return unicos;
}
