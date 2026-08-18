/**
 * Exporta exclusivamente la hora visible histórica de RegistroCitas.
 * No modifica Google Sheets ni se conecta a Supabase.
 *
 * @return {Object} Resumen y referencia al archivo creado en Drive.
 */
function exportarHorasTextoOriginalCitasSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error('No se pudo acceder al archivo de Google Sheets.');
  }

  const hoja = ss.getSheetByName('RegistroCitas');

  if (!hoja) {
    throw new Error('No se encuentra la hoja "RegistroCitas".');
  }

  const mapa = obtenerMapaEncabezados_(hoja);
  const columnaTimestamp = obtenerColumnaObligatoria_(mapa, 'Timestamp');
  const columnaHora = obtenerColumnaObligatoria_(mapa, 'HORA');
  const ultimaFila = hoja.getLastRow();
  const zonaHoraria = Session.getScriptTimeZone();
  const fechaExportacion = new Date();
  const registros = [];
  const errores = [];
  let filasConHoraVisible = 0;

  if (ultimaFila >= 2) {
    const cantidadFilas = ultimaFila - 1;
    const rangoTimestamp = hoja.getRange(
      2,
      columnaTimestamp,
      cantidadFilas,
      1
    );
    const valoresTimestamp = rangoTimestamp.getValues();
    const visiblesTimestamp = rangoTimestamp.getDisplayValues();
    const horasVisibles = hoja.getRange(
      2,
      columnaHora,
      cantidadFilas,
      1
    ).getDisplayValues();

    for (let indice = 0; indice < cantidadFilas; indice++) {
      const filaOrigen = indice + 2;
      const timestamp = interpretarFechaHojaSupabase_(
        valoresTimestamp[indice][0],
        visiblesTimestamp[indice][0],
        zonaHoraria,
        true
      );

      if (timestamp.error || !timestamp.valor) {
        errores.push({
          fila_origen: filaOrigen,
          mensaje: 'Timestamp inválido; no se pudo construir source_record_key.'
        });
        continue;
      }

      const horaTextoOriginal = String(horasVisibles[indice][0] || '');

      if (horaTextoOriginal !== '') {
        filasConHoraVisible++;
      }

      registros.push({
        source_record_key:
          'REGISTROCITAS:' + ss.getId() + ':' + filaOrigen + ':' +
          timestamp.valor,
        hora_texto_original: horaTextoOriginal
      });
    }
  }

  const marcaTiempo = Utilities.formatDate(
    fechaExportacion,
    zonaHoraria,
    'yyyyMMdd_HHmmss'
  );
  const nombreArchivo =
    'horas_texto_original_citas_' + marcaTiempo + '.json';
  const resultado = {
    metadata: {
      tipo: 'BACKFILL_HORA_TEXTO_ORIGINAL_CITAS',
      version: '1.0',
      exportado_en: formatearFechaHoraIsoSupabase_(
        fechaExportacion,
        zonaHoraria
      ),
      spreadsheet_id: ss.getId(),
      hoja: 'RegistroCitas',
      zona_horaria: zonaHoraria
    },
    resumen: {
      filas_revisadas: Math.max(ultimaFila - 1, 0),
      citas_exportadas: registros.length,
      citas_con_hora_visible: filasConHoraVisible,
      filas_sin_source_record_key: errores.length,
      nombre_archivo: nombreArchivo,
      url_archivo: null
    },
    registros: registros,
    errores: errores
  };
  const archivo = DriveApp.createFile(
    Utilities.newBlob(
      JSON.stringify(resultado, null, 2),
      'application/json',
      nombreArchivo
    )
  );

  resultado.resumen.url_archivo = archivo.getUrl();
  archivo.setContent(JSON.stringify(resultado, null, 2));

  Logger.log('BACKFILL HORA TEXTO ORIGINAL - EXPORTACIÓN');
  Logger.log('CITAS EXPORTADAS: ' + registros.length);
  Logger.log('CON HORA VISIBLE: ' + filasConHoraVisible);
  Logger.log('SIN SOURCE RECORD KEY: ' + errores.length);
  Logger.log('ARCHIVO: ' + nombreArchivo);

  return resultado.resumen;
}
