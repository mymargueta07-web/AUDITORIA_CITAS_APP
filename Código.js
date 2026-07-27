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

    const mapaAsesores =
      obtenerMapaEncabezados_(hojaAsesores);

    [
      'Sucursal',
      'Activo'
    ].forEach(function(nombreEncabezado) {
      obtenerColumnaObligatoria_(
        mapaAsesores,
        nombreEncabezado
      );
    });

    const datosAsesores = hojaAsesores
      .getDataRange()
      .getDisplayValues();

    datosAsesores.shift();

    const asesoresActivos = datosAsesores.filter(row => {

      const estado = (
        row[mapaAsesores.Activo - 1] || ''
      )
        .toString()
        .trim()
        .toUpperCase();

      return estado === 'SÍ' || estado === 'SI';

    });

    const sucursalesOrigen = [
      ...new Set(
        asesoresActivos
          .map(row => (
            row[mapaAsesores.Sucursal - 1] || ''
          ).toString().trim())
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

    const mapaSucursales =
      obtenerMapaEncabezados_(hojaSucursales);

    const columnaSucursal =
      obtenerColumnaObligatoria_(
        mapaSucursales,
        'Sucursal'
      );

    const ultimaFilaSucursales =
      hojaSucursales.getLastRow();

    let sucursalesDestino = [];

    if (ultimaFilaSucursales >= 2) {
      sucursalesDestino =
        hojaSucursales
          .getRange(
            2,
            columnaSucursal,
            ultimaFilaSucursales - 1,
            1
          )
          .getDisplayValues()
          .flat()
          .map(function(valor) {
            return String(valor || '').trim();
          })
          .filter(function(valor) {
            return valor !== '';
          });
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

    const mapaProcesos =
      obtenerMapaEncabezados_(hojaProcesos);

    const columnaProceso =
      obtenerColumnaObligatoria_(
        mapaProcesos,
        'Proceso'
      );

    const ultimaFilaProcesos =
      hojaProcesos.getLastRow();

    let procesos = [];

    if (ultimaFilaProcesos >= 2) {
      procesos =
        hojaProcesos
          .getRange(
            2,
            columnaProceso,
            ultimaFilaProcesos - 1,
            1
          )
          .getDisplayValues()
          .flat()
          .map(function(valor) {
            return String(valor || '').trim();
          })
          .filter(function(valor) {
            return valor !== '';
          });
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

    const mapaOrigenes =
      obtenerMapaEncabezados_(hojaOrigenes);

    const columnaOrigen =
      obtenerColumnaObligatoria_(
        mapaOrigenes,
        'Origen'
      );

    const ultimaFilaOrigenes =
      hojaOrigenes.getLastRow();

    let origenes = [];

    if (ultimaFilaOrigenes >= 2) {
      origenes =
        hojaOrigenes
          .getRange(
            2,
            columnaOrigen,
            ultimaFilaOrigenes - 1,
            1
          )
          .getDisplayValues()
          .flat()
          .map(function(valor) {
            return String(valor || '').trim();
          })
          .filter(function(valor) {
            return valor !== '';
          });
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
  const mapaAsesores =
    obtenerMapaEncabezados_(hojaAsesores);

  [
    'Asesor',
    'Sucursal',
    'Activo'
  ].forEach(function(nombreEncabezado) {
    obtenerColumnaObligatoria_(
      mapaAsesores,
      nombreEncabezado
    );
  });

  const datos = hojaAsesores.getDataRange().getValues();
  datos.shift();
  const asesores = datos
    .filter(row =>
      row[mapaAsesores.Sucursal - 1] === sucursal &&
      row[mapaAsesores.Activo - 1] === 'SÍ'
    )
    .map(function(row) {
      return row[mapaAsesores.Asesor - 1];
    })
    .sort();
  return asesores;
}

function normalizarNumeroDuplicado_(numero) {
  const texto = String(numero || '').trim();
  let digitos = texto.replace(/\D/g, '');

  if (/^\+503(?:\D|$)/.test(texto) && digitos.indexOf('503') === 0) {
    digitos = digitos.slice(3);
  }

  if (digitos.length === 11 && digitos.indexOf('503') === 0) {
    digitos = digitos.slice(-8);
  }

  return digitos;
}

function normalizarProcesoDuplicado_(proceso) {
  return String(proceso || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizarFechaDuplicado_(valor, zonaHoraria) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, zonaHoraria, 'yyyy-MM-dd');
  }

  const texto = String(valor || '').trim();

  if (texto.toLowerCase() === 'cita abierta') {
    return 'CITA ABIERTA';
  }

  let partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (partes) {
    return partes[3] + '-' + partes[2].padStart(2, '0') + '-' + partes[1].padStart(2, '0');
  }

  partes = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (partes) {
    return partes[1] + '-' + partes[2].padStart(2, '0') + '-' + partes[3].padStart(2, '0');
  }

  return '';
}

function buscarCitasDuplicadas_(hoja, datosCita) {
  const numero = normalizarNumeroDuplicado_(datosCita.numero);

  if (!numero || hoja.getLastRow() < 2) {
    return [];
  }

  const mapa = obtenerMapaEncabezados_(hoja);
  const encabezadosObligatorios = [
    'ID',
    'Cliente',
    'Numero',
    'Proceso',
    'Fecha',
    'SucursalOrigen',
    'SucursalDestino',
    'Asesor',
    'ESTADO'
  ];

  encabezadosObligatorios.forEach(function(nombreEncabezado) {
    obtenerColumnaObligatoria_(mapa, nombreEncabezado);
  });

  const rango = hoja.getDataRange();
  const valores = rango.getValues();
  const mostrados = rango.getDisplayValues();
  const coincidencias = [];

  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    const telefonoExistente = normalizarNumeroDuplicado_(
      fila[mapa.Numero - 1]
    );

    if (telefonoExistente === numero) {
      const visible = mostrados[i];
      coincidencias.push({
        id: visible[mapa.ID - 1] || '',
        cliente: visible[mapa.Cliente - 1] || '',
        numero: visible[mapa.Numero - 1] || '',
        proceso: visible[mapa.Proceso - 1] || '',
        fecha: visible[mapa.Fecha - 1] || '',
        sucursalOrigen: visible[mapa.SucursalOrigen - 1] || '',
        sucursalDestino: visible[mapa.SucursalDestino - 1] || '',
        asesor: visible[mapa.Asesor - 1] || '',
        estado: visible[mapa.ESTADO - 1] || ''
      });
    }
  }

  return coincidencias;
}

function guardarCita(datosCita) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

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
        'ESTADO', 'FECHA DE VENTA', 'HORA'
      ];
      hojaDestino.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    }

    let mapa = obtenerMapaEncabezados_(hojaDestino);
    const columnaID = obtenerColumnaObligatoria_(mapa, 'ID');
    const columnaEstado = obtenerColumnaObligatoria_(mapa, 'ESTADO');
    const columnaFechaVenta = obtenerColumnaObligatoria_(
      mapa,
      'FECHA DE VENTA'
    );

    const totalFilasHoja = hojaDestino.getMaxRows();

    hojaDestino
      .getRange(1, columnaID, totalFilasHoja, 1)
      .setNumberFormat('@');

    hojaDestino
      .getRange(1, columnaEstado, totalFilasHoja, 1)
      .setNumberFormat('@');

    hojaDestino
      .getRange(1, columnaFechaVenta, totalFilasHoja, 1)
      .setNumberFormat('@');

    // Aplicar validación a ESTADO desde la fila 2 en adelante.
    hojaDestino
      .getRange(2, columnaEstado, totalFilasHoja - 1, 1)
      .setDataValidation(reglaValidacion);

    if (!Object.prototype.hasOwnProperty.call(mapa, 'HORA')) {
      hojaDestino
        .getRange(1, hojaDestino.getLastColumn() + 1)
        .setValue('HORA');

      mapa = obtenerMapaEncabezados_(hojaDestino);
    }

    const encabezadosObligatorios = [
      'ID',
      'Timestamp',
      'Cliente',
      'Proceso',
      'Numero',
      'Precio',
      'Extras',
      'Fecha',
      'SucursalDestino',
      'Asesor',
      'Nota',
      'Origen',
      'SucursalOrigen',
      'ESTADO',
      'FECHA DE VENTA',
      'HORA'
    ];

    encabezadosObligatorios.forEach(function(nombreEncabezado) {
      obtenerColumnaObligatoria_(mapa, nombreEncabezado);
    });

    if (datosCita.forzarDuplicado !== true) {
      const coincidencias = buscarCitasDuplicadas_(hojaDestino, datosCita);

      if (coincidencias.length > 0) {
        return {
          exito: false,
          duplicado: true,
          mensaje: 'Ya existe una posible cita duplicada',
          coincidencias: coincidencias
        };
      }
    }

    // Obtener último ID
    let ultimoID = 0;
    const ultimaFila = hojaDestino.getLastRow();
    if (ultimaFila >= 2) {
      const idsRange = hojaDestino.getRange(
        2,
        mapa.ID,
        ultimaFila - 1,
        1
      );
      const ids = idsRange.getValues().flat().filter(val => val && val.toString().trim() !== '');
      for (let id of ids) {
        let num = parseInt(id.toString(), 10);
        if (!isNaN(num) && num > ultimoID) ultimoID = num;
      }
    }
    const nuevoID = ultimoID + 1;
    const idFormateado = String(nuevoID).padStart(4, "0");

    // Crear fila
    const fila = new Array(hojaDestino.getLastColumn()).fill('');

    fila[mapa.ID - 1] = idFormateado;
    fila[mapa.Timestamp - 1] = new Date();
    fila[mapa.Cliente - 1] = datosCita.cliente;
    fila[mapa.Proceso - 1] = datosCita.proceso;
    fila[mapa.Numero - 1] = datosCita.numero;
    fila[mapa.Precio - 1] = datosCita.precio;
    fila[mapa.Extras - 1] = datosCita.extras || '';
    fila[mapa.Fecha - 1] = datosCita.fecha;
    fila[mapa.SucursalDestino - 1] = datosCita.sucursalDestino;
    fila[mapa.Asesor - 1] = datosCita.asesor;
    fila[mapa.Nota - 1] = datosCita.nota || '';
    fila[mapa.Origen - 1] = datosCita.origen;
    fila[mapa.SucursalOrigen - 1] = datosCita.sucursalOrigen;
    fila[mapa.ESTADO - 1] = 'EN ESPERA DE CITA';
    fila[mapa['FECHA DE VENTA'] - 1] = '';
    fila[mapa.HORA - 1] = datosCita.hora || '';

    hojaDestino.appendRow(fila);
    // Reaplicar validación por si la nueva fila no la heredó.
    hojaDestino
      .getRange(2, mapa.ESTADO, hojaDestino.getMaxRows() - 1, 1)
      .setDataValidation(reglaValidacion);

    return { exito: true, mensaje: 'Cita registrada correctamente', id: idFormateado };
  } catch (error) {
    return { exito: false, mensaje: error.toString() };
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function obtenerMapaEncabezados_(hoja) {
  const ultimaColumna = hoja.getLastColumn();

  if (ultimaColumna < 1) {
    return {};
  }

  const encabezados = hoja
    .getRange(1, 1, 1, ultimaColumna)
    .getDisplayValues()[0];

  const mapa = {};

  encabezados.forEach(function(valor, indice) {
    const nombre = String(valor || '').trim();

    if (!nombre) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(mapa, nombre)) {
      throw new Error(
        'Encabezado duplicado: ' + nombre
      );
    }

    mapa[nombre] = indice + 1;
  });

  return mapa;
}

function obtenerColumnaObligatoria_(mapa, nombreEncabezado) {
  if (!Object.prototype.hasOwnProperty.call(mapa, nombreEncabezado)) {
    throw new Error(
      'Falta la columna obligatoria: ' + nombreEncabezado
    );
  }

  return mapa[nombreEncabezado];
}

// Trigger automático: cuando se edita la hoja, actualiza la fecha de venta si el estado cambia a "VENTA CERRADA"
function onEdit(e) {
  if (!e || !e.range || typeof e.range.getSheet !== 'function') {
    return;
  }

  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== 'RegistroCitas') {
    return;
  }

  const mapa = obtenerMapaEncabezados_(sheet);
  const columnaEstado = obtenerColumnaObligatoria_(mapa, 'ESTADO');
  const columnaFechaVenta = obtenerColumnaObligatoria_(
    mapa,
    'FECHA DE VENTA'
  );

  const primeraColumna = range.getColumn();
  const ultimaColumna = primeraColumna + range.getNumColumns() - 1;

  if (
    columnaEstado < primeraColumna ||
    columnaEstado > ultimaColumna
  ) {
    return;
  }

  const primeraFilaEditada = range.getRow();
  const ultimaFilaEditada =
    primeraFilaEditada + range.getNumRows() - 1;
  const primeraFilaDatos = Math.max(2, primeraFilaEditada);

  if (primeraFilaDatos > ultimaFilaEditada) {
    return;
  }

  const valoresEditados = range.getValues();
  const indiceEstadoEnRango = columnaEstado - primeraColumna;
  const cantidadFilas = ultimaFilaEditada - primeraFilaDatos + 1;

  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2, '0');
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const yyyy = hoy.getFullYear();
  const fechaStr = `${dd}/${mm}/${yyyy}`;

  const fechasVenta = [];

  for (let fila = primeraFilaDatos; fila <= ultimaFilaEditada; fila++) {
    const indiceFilaEnRango = fila - primeraFilaEditada;
    const nuevoEstado =
      valoresEditados[indiceFilaEnRango][indiceEstadoEnRango];

    fechasVenta.push([
      nuevoEstado === 'VENTA CERRADA' ? fechaStr : ''
    ]);
  }

  sheet
    .getRange(
      primeraFilaDatos,
      columnaFechaVenta,
      cantidadFilas,
      1
    )
    .setNumberFormat('@')
    .setValues(fechasVenta);
}

// Función auxiliar para aplicar la validación a filas existentes (ejecutar una sola vez si es necesario)
function aplicarValidacionAEstado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('RegistroCitas');
  if (!hoja) return;

  const mapa = obtenerMapaEncabezados_(hoja);
  const columnaEstado =
    obtenerColumnaObligatoria_(mapa, 'ESTADO');

  const hojaEstados = asegurarHojaEstados();
  const rangoEstados = hojaEstados.getRange('A1:A' + hojaEstados.getLastRow());
  const regla = SpreadsheetApp.newDataValidation()
    .requireValueInRange(rangoEstados, true)
    .setAllowInvalid(false)
    .build();

  if (hoja.getMaxRows() < 2) {
    hoja.insertRowsAfter(hoja.getMaxRows(), 1);
  }

  hoja
    .getRange(
      2,
      columnaEstado,
      hoja.getMaxRows() - 1,
      1
    )
    .setDataValidation(regla);
}
