// Code.gs
function doGet() {

  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('Sistema de Citas')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );

}

function obtenerDatosIniciales() {
  try {

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      throw new Error(
        'No se pudo acceder al archivo de Google Sheets.'
      );
    }

    // =====================================================
    // ASESORES
    // =====================================================

    const hojaAsesores = ss.getSheetByName('Asesores');

    if (!hojaAsesores) {
      throw new Error('No se encuentra la hoja "Asesores"');
    }

    const datosAsesores = hojaAsesores
      .getDataRange()
      .getDisplayValues();

    datosAsesores.shift();

    const asesoresActivos = datosAsesores.filter(row => {

      const estado = (row[2] || '')
        .toString()
        .trim()
        .toUpperCase();

      return estado === 'SÍ' || estado === 'SI';

    });

    const sucursalesOrigen = [
      ...new Set(
        asesoresActivos
          .map(row => (row[1] || '').toString().trim())
          .filter(Boolean)
      )
    ].sort();


    // =====================================================
    // SUCURSALES DESTINO
    // =====================================================

    const hojaSucursales = ss.getSheetByName('Sucursales');

    if (!hojaSucursales) {
      throw new Error('No se encuentra la hoja "Sucursales"');
    }

    let sucursalesDestino = hojaSucursales
      .getDataRange()
      .getDisplayValues()
      .flat()
      .map(valor => valor.toString().trim())
      .filter(Boolean);

    if (
      sucursalesDestino.length > 0 &&
      sucursalesDestino[0].toLowerCase() === 'sucursal'
    ) {

      sucursalesDestino.shift();

    }

    sucursalesDestino = [
      ...new Set(sucursalesDestino)
    ];

    let sucursalesDestinoFormulario =
      sucursalesDestino.filter(sucursal => {

        const nombre = sucursal.toUpperCase();

        return (
          nombre !== 'CALL CENTER / CENTRAL' &&
          nombre !== 'CALL CENTER CHALATENANGO'
        );

      });

    if (
      !sucursalesDestinoFormulario.some(
        sucursal => sucursal.toUpperCase() === 'EN LINEA'
      )
    ) {

      sucursalesDestinoFormulario.push('EN LINEA');

    }

    sucursalesDestinoFormulario.sort();


    // =====================================================
    // PROCESOS
    // =====================================================

    const hojaProcesos = ss.getSheetByName('Procesos');

    if (!hojaProcesos) {
      throw new Error('No se encuentra la hoja "Procesos"');
    }

    let procesos = hojaProcesos
      .getDataRange()
      .getDisplayValues()
      .flat()
      .map(valor => valor.toString().trim())
      .filter(Boolean);

    if (
      procesos.length > 0 &&
      procesos[0].toLowerCase() === 'proceso'
    ) {

      procesos.shift();

    }

    procesos = [
      ...new Set(procesos)
    ];

    if (!procesos.includes('Otro')) {
      procesos.push('Otro');
    }


    // =====================================================
    // ORIGENES
    // =====================================================

    const hojaOrigenes = ss.getSheetByName('Origenes');

    if (!hojaOrigenes) {
      throw new Error('No se encuentra la hoja "Origenes"');
    }

    let origenes = hojaOrigenes
      .getDataRange()
      .getDisplayValues()
      .flat()
      .map(valor => valor.toString().trim())
      .filter(Boolean);

    if (
      origenes.length > 0 &&
      origenes[0].toLowerCase() === 'origen'
    ) {

      origenes.shift();

    }

    origenes = [
      ...new Set(origenes)
    ];

    if (!origenes.includes('Otro')) {
      origenes.push('Otro');
    }


    // =====================================================
    // ESTADOS
    // =====================================================

    asegurarHojaEstados();


    // =====================================================
    // RESPUESTA
    // =====================================================

    const respuesta = {

      sucursalesOrigen: sucursalesOrigen,

      sucursalesDestino:
        sucursalesDestinoFormulario,

      opcionesProceso: procesos,

      opcionesOrigen: origenes

    };

    console.log(
      JSON.stringify(respuesta, null, 2)
    );

    return respuesta;

  } catch (error) {

    console.error(
      'ERROR obtenerDatosIniciales:',
      error
    );

    throw new Error(
      'Error cargando listas del formulario: ' +
      error.message
    );

  }
}

// Crea la hoja "Estados" con las opciones para el desplegable
function asegurarHojaEstados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hojaEstados = ss.getSheetByName('Estados');
  if (!hojaEstados) {
    hojaEstados = ss.insertSheet('Estados');
    const opciones = [
      'EN ESPERA DE CITA',
      'REPROGRAMADA',
      'VENTA CERRADA',
      'CANCELADA',
      'SIN RESPUESTA',
      'BO'
    ];
    hojaEstados.getRange(1, 1, opciones.length, 1).setValues(opciones.map(o => [o]));
    hojaEstados.getRange('A:A').setNumberFormat('@');
    // Opcional: ocultar la hoja para que no estorbe
    // hojaEstados.hideSheet();
  }
  return hojaEstados;
}

function obtenerAsesoresPorSucursal(sucursal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaAsesores = ss.getSheetByName('Asesores');
  const datos = hojaAsesores.getDataRange().getValues();
  datos.shift();
  const asesores = datos
    .filter(row => row[1] === sucursal && row[2] === 'SÍ')
    .map(row => row[0])
    .sort();
  return asesores;
}

function guardarCita(datosCita) {
  const lock = LockService.getScriptLock();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hojaDestino = ss.getSheetByName('RegistroCitas');
    const hojaEstados = asegurarHojaEstados();
    const rangoEstados = hojaEstados.getRange('A1:A' + hojaEstados.getLastRow());
    const reglaValidacion = SpreadsheetApp.newDataValidation()
      .requireValueInRange(rangoEstados, true)
      .setAllowInvalid(false)
      .build();

    // Crear hoja si no existe
    if (!hojaDestino) {
      hojaDestino = ss.insertSheet('RegistroCitas');
      const encabezados = [
        'ID', 'Timestamp', 'Cliente', 'Proceso', 'Numero', 'Precio', 'Extras',
        'Fecha', 'SucursalDestino', 'Asesor', 'Nota', 'Origen', 'SucursalOrigen',
        'ESTADO', 'FECHA DE VENTA'
      ];
      hojaDestino.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      hojaDestino.getRange('A:A').setNumberFormat('@');
      hojaDestino.getRange('N:N').setNumberFormat('@');
      hojaDestino.getRange('O:O').setNumberFormat('@');
    }

    // Aplicar validación a toda la columna N (desde fila 2 en adelante)
    hojaDestino.getRange('N2:N').setDataValidation(reglaValidacion);

    lock.waitLock(30000);

    // Obtener último ID
    let ultimoID = 0;
    const ultimaFila = hojaDestino.getLastRow();
    if (ultimaFila >= 2) {
      const idsRange = hojaDestino.getRange(2, 1, ultimaFila - 1, 1);
      const ids = idsRange.getValues().flat().filter(val => val && val.toString().trim() !== '');
      for (let id of ids) {
        let num = parseInt(id.toString(), 10);
        if (!isNaN(num) && num > ultimoID) ultimoID = num;
      }
    }
    const nuevoID = ultimoID + 1;
    const idFormateado = String(nuevoID).padStart(4, "0");

    // Crear fila
    const fila = [
      idFormateado,
      new Date(),
      datosCita.cliente,
      datosCita.proceso,
      datosCita.numero,
      datosCita.precio,
      datosCita.extras || '',
      datosCita.fecha,
      datosCita.sucursalDestino,
      datosCita.asesor,
      datosCita.nota || '',
      datosCita.origen,
      datosCita.sucursalOrigen,
      'EN ESPERA DE CITA',
      ''
    ];

    hojaDestino.appendRow(fila);
    // Reaplicar validación por si la nueva fila no la heredó
    hojaDestino.getRange('N2:N').setDataValidation(reglaValidacion);

    return { exito: true, mensaje: 'Cita registrada correctamente', id: idFormateado };
  } catch (error) {
    return { exito: false, mensaje: error.toString() };
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

// Trigger automático: cuando se edita la hoja, actualiza la fecha de venta si el estado cambia a "VENTA CERRADA"
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== 'RegistroCitas') return;

  const columnaEditada = range.getColumn();
  const filaEditada = range.getRow();
  if (filaEditada < 2) return;

  // Si se editó la columna ESTADO (columna 14 = N)
  if (columnaEditada === 14) {
    const nuevoEstado = range.getValue();
    const fechaVentaCell = sheet.getRange(filaEditada, 15); // columna O
    if (nuevoEstado === 'VENTA CERRADA') {
      const hoy = new Date();
      const dd = String(hoy.getDate()).padStart(2, '0');
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const yyyy = hoy.getFullYear();
      const fechaStr = `${dd}/${mm}/${yyyy}`;
      fechaVentaCell.setValue(fechaStr);
      fechaVentaCell.setNumberFormat('@');
    } else {
      // Si se cambia a otro estado, limpiamos la fecha de venta
      fechaVentaCell.setValue('');
    }
  }
}

// Función auxiliar para aplicar la validación a filas existentes (ejecutar una sola vez si es necesario)
function aplicarValidacionAEstado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('RegistroCitas');
  if (!hoja) return;
  const hojaEstados = asegurarHojaEstados();
  const rangoEstados = hojaEstados.getRange('A1:A' + hojaEstados.getLastRow());
  const regla = SpreadsheetApp.newDataValidation()
    .requireValueInRange(rangoEstados, true)
    .setAllowInvalid(false)
    .build();
  hoja.getRange('N2:N').setDataValidation(regla);
}
