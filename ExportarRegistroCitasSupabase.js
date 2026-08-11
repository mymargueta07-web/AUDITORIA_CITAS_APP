/**
 * Exporta RegistroCitas a un JSON de preparación para Supabase.
 * No modifica hojas ni se conecta a servicios externos.
 *
 * @return {Object} Resumen de la exportación.
 */
function exportarRegistroCitasSupabase() {
  const resultado =
    prepararExportacionRegistroCitasSupabase_({
      limiteRegistros: null,
      crearArchivo: true
    });

  Logger.log(
    JSON.stringify(
      {
        total_exportado:
          resultado.resumen.total_exportadas,
        nombre_archivo:
          resultado.resumen.nombre_archivo,
        url_archivo:
          resultado.resumen.url_archivo,
        filas_con_errores:
          resultado.resumen.filas_con_errores,
        filas_con_advertencias:
          resultado.resumen
            .filas_con_advertencias
      },
      null,
      2
    )
  );

  return resultado.resumen;
}

/**
 * Procesa las primeras 10 filas no vacías sin crear archivos.
 *
 * @return {Object} Metadata, resumen y registros de prueba.
 */
function probarExportacionRegistroCitasSupabase() {
  const pruebaPrecioMultiple =
    interpretarPrecioSupabase_('$350  $450');

  if (
    pruebaPrecioMultiple.monto !== null ||
    pruebaPrecioMultiple.multiple !== true
  ) {
    throw new Error(
      'Falló la prueba de precio con múltiples montos.'
    );
  }

  const pruebasHora = [
    { entrada: '8:30 AM', esperada: '08:30:00', error: false },
    { entrada: '2:15 PM', esperada: '14:15:00', error: false },
    { entrada: '14:45', esperada: '14:45:00', error: false },
    { entrada: '14:45:30', esperada: '14:45:30', error: false },
    { entrada: '12:00 AM', esperada: '00:00:00', error: false },
    { entrada: '12:00 PM', esperada: '12:00:00', error: false },
    { entrada: '25:00', esperada: null, error: true }
  ];
  const resultadosHora = pruebasHora.map(function(prueba) {
    const resultadoHora = interpretarHoraHojaSupabase_(
      null,
      prueba.entrada,
      Session.getScriptTimeZone()
    );

    if (
      resultadoHora.valor !== prueba.esperada ||
      resultadoHora.error !== prueba.error
    ) {
      throw new Error(
        'Falló la prueba de hora para: ' + prueba.entrada
      );
    }

    return {
      entrada: prueba.entrada,
      hora_cita: resultadoHora.valor,
      error: resultadoHora.error
    };
  });

  Logger.log(
    'PRUEBA PARSER HORA:\n' +
    JSON.stringify(resultadosHora, null, 2)
  );

  const resultado =
    prepararExportacionRegistroCitasSupabase_({
      limiteRegistros: 10,
      crearArchivo: false
    });

  Logger.log(
    'METADATA:\n' +
    JSON.stringify(resultado.metadata, null, 2)
  );
  Logger.log(
    'RESUMEN:\n' +
    JSON.stringify(resultado.resumen, null, 2)
  );
  Logger.log(
    'REGISTROS DE PRUEBA:\n' +
    JSON.stringify(
      resultado.registros.map(function(registro) {
        return {
          id_legacy: registro.id_legacy,
          fecha_cita: registro.fecha_cita,
          hora_cita: registro.hora_cita,
          sucursal_destino_texto:
            registro.sucursal_destino_texto,
          destinos_candidatos:
            registro.destinos_candidatos,
          numero_original: registro.numero_original,
          numero_normalizado:
            registro.numero_normalizado,
          advertencias: registro.advertencias
        };
      }),
      null,
      2
    )
  );

  return resultado;
}

/**
 * Prepara el objeto exportable y crea el JSON solo cuando se solicita.
 *
 * @param {Object} opciones Opciones de límite y escritura.
 * @return {Object} Resultado completo de la preparación.
 */
function prepararExportacionRegistroCitasSupabase_(opciones) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'No se pudo acceder al archivo de Google Sheets.'
    );
  }

  const hoja = ss.getSheetByName('RegistroCitas');

  if (!hoja) {
    throw new Error(
      'No se encuentra la hoja "RegistroCitas".'
    );
  }

  const mapa = obtenerMapaEncabezados_(hoja);
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
    'FECHA DE VENTA'
  ];

  encabezadosObligatorios.forEach(function(nombre) {
    obtenerColumnaObligatoria_(mapa, nombre);
  });

  const zonaHoraria =
    Session.getScriptTimeZone();
  const catalogos =
    cargarCatalogosRegistroCitasSupabase_(ss);
  const fechaExportacion = new Date();
  const metadata = {
    exportado_en:
      formatearFechaHoraIsoSupabase_(
        fechaExportacion,
        zonaHoraria
      ),
    spreadsheet_id: ss.getId(),
    hoja: 'RegistroCitas',
    zona_horaria: zonaHoraria,
    version_exportador: '1.1'
  };
  const resumen =
    crearResumenRegistroCitasSupabase_();
  const registros = [];
  const idsLegacy = {};
  const limite =
    opciones &&
    Number(opciones.limiteRegistros) > 0
      ? Number(opciones.limiteRegistros)
      : null;

  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();

  if (ultimaFila >= 2 && ultimaColumna >= 1) {
    const rango = hoja.getRange(
      1,
      1,
      ultimaFila,
      ultimaColumna
    );
    const valores = rango.getValues();
    const visibles = rango.getDisplayValues();
    const encabezados = visibles[0].map(function(valor) {
      return String(valor || '').trim();
    });

    for (let i = 1; i < visibles.length; i++) {
      if (
        limite !== null &&
        registros.length >= limite
      ) {
        break;
      }

      const filaVisible = visibles[i];
      resumen.total_filas_leidas++;

      if (
        filaVisible.every(function(valor) {
          return String(valor || '').trim() === '';
        })
      ) {
        resumen.filas_vacias_ignoradas++;
        continue;
      }

      const registro =
        construirRegistroCitaSupabase_({
          filaOrigen: i + 1,
          valores: valores[i],
          visibles: filaVisible,
          encabezados: encabezados,
          mapa: mapa,
          zonaHoraria: zonaHoraria,
          catalogos: catalogos,
          resumen: resumen
        });

      registros.push(registro);

      if (registro.id_legacy) {
        if (!idsLegacy[registro.id_legacy]) {
          idsLegacy[registro.id_legacy] = [];
        }

        idsLegacy[registro.id_legacy].push(
          registro.fila_origen
        );
      }
    }
  }

  resumen.total_exportadas = registros.length;
  resumen.ids_legacy_repetidos =
    detectarIdsLegacyRepetidosSupabase_(
      idsLegacy,
      registros
    );
  resumen.filas_con_errores =
    registros.filter(function(registro) {
      return registro.errores.length > 0;
    }).length;
  resumen.filas_con_advertencias =
    registros.filter(function(registro) {
      return registro.advertencias.length > 0;
    }).length;

  const resultado = {
    metadata: metadata,
    resumen: resumen,
    registros: registros
  };

  if (opciones && opciones.crearArchivo === true) {
    crearArchivoRegistroCitasSupabase_(
      resultado,
      fechaExportacion,
      zonaHoraria
    );
  }

  return resultado;
}

/**
 * Construye una cita normalizada y conserva los valores visibles en raw.
 *
 * @param {Object} contexto Datos y configuración de la fila.
 * @return {Object} Registro exportable.
 */
function construirRegistroCitaSupabase_(contexto) {
  const mapa = contexto.mapa;
  const visibles = contexto.visibles;
  const valores = contexto.valores;
  const errores = [];
  const advertencias = [];
  const resumen = contexto.resumen;
  let fechaInvalida = false;

  const visible = function(nombre) {
    return String(
      visibles[mapa[nombre] - 1] || ''
    );
  };
  const valorReal = function(nombre) {
    return valores[mapa[nombre] - 1];
  };
  const texto = function(nombre) {
    return visible(nombre).trim();
  };
  const tieneEncabezado = function(nombre) {
    return Object.prototype.hasOwnProperty.call(mapa, nombre);
  };

  const idLegacy = texto('ID');
  const cliente = texto('Cliente');
  const proceso = texto('Proceso');
  const numeroOriginal = visible('Numero');
  const numeroNormalizado =
    normalizarTelefonoDiagnosticoSupabase_(
      numeroOriginal
    );
  const precioTexto = visible('Precio');
  const extras = texto('Extras');
  const fechaVisible = texto('Fecha');
  const sucursalDestino =
    texto('SucursalDestino');
  const asesor = texto('Asesor');
  const nota = texto('Nota');
  const origen = texto('Origen');
  const sucursalOrigen =
    texto('SucursalOrigen');
  const estado =
    texto('ESTADO')
      .replace(/\s+/g, ' ')
      .toUpperCase();
  const fechaVentaVisible =
    texto('FECHA DE VENTA');
  const horaVisible =
    tieneEncabezado('HORA')
      ? visible('HORA')
      : '';
  const esCitaAbierta =
    fechaVisible
      .replace(/\s+/g, ' ')
      .toUpperCase() === 'CITA ABIERTA';

  const fechaRegistroResultado =
    interpretarFechaHojaSupabase_(
      valorReal('Timestamp'),
      visible('Timestamp'),
      contexto.zonaHoraria,
      true
    );

  if (fechaRegistroResultado.error) {
    errores.push(
      'Timestamp inválido: ' +
      fechaRegistroResultado.original
    );
    fechaInvalida = true;
  }

  let fechaCitaResultado = {
    valor: null,
    error: false,
    original: fechaVisible
  };

  if (!esCitaAbierta) {
    fechaCitaResultado =
      interpretarFechaHojaSupabase_(
        valorReal('Fecha'),
        visible('Fecha'),
        contexto.zonaHoraria,
        false
      );

    if (fechaCitaResultado.error) {
      errores.push(
        'Fecha de cita inválida: ' +
        fechaCitaResultado.original
      );
      fechaInvalida = true;
    }
  }

  const fechaVentaResultado =
    interpretarFechaHojaSupabase_(
      valorReal('FECHA DE VENTA'),
      visible('FECHA DE VENTA'),
      contexto.zonaHoraria,
      false
    );

  if (
    fechaVentaVisible &&
    fechaVentaResultado.error
  ) {
    errores.push(
      'Fecha de venta inválida: ' +
      fechaVentaResultado.original
    );
    fechaInvalida = true;
  }

  if (fechaInvalida) {
    resumen.fechas_invalidas++;
  }

  let horaCita = null;

  if (!esCitaAbierta && horaVisible.trim()) {
    const horaResultado = interpretarHoraHojaSupabase_(
      tieneEncabezado('HORA')
        ? valorReal('HORA')
        : null,
      horaVisible,
      contexto.zonaHoraria
    );

    horaCita = horaResultado.valor;

    if (horaResultado.error) {
      resumen.horas_invalidas++;
      advertencias.push(
        'Hora de cita inválida: ' +
        horaResultado.original
      );
    }
  }

  if (horaCita) {
    resumen.citas_con_hora++;
  } else {
    resumen.citas_sin_hora++;
  }

  const precioResultado =
    interpretarPrecioSupabase_(precioTexto);

  if (precioResultado.multiple) {
    resumen.precios_multiples++;
    advertencias.push(
      'El precio contiene múltiples montos y requiere revisión'
    );
  } else if (!precioResultado.valido) {
    resumen.precios_invalidos++;

    advertencias.push(
      precioTexto.trim()
        ? 'Precio no convertible a monto: ' + precioTexto
        : 'Precio vacío.'
    );
  }

  if (!numeroNormalizado) {
    resumen.telefonos_vacios++;
    advertencias.push(
      'El teléfono no contiene dígitos normalizables.'
    );
  }

  validarTextosObligatoriosSupabase_(
    {
      Cliente: cliente,
      Proceso: proceso,
      SucursalDestino: sucursalDestino,
      Asesor: asesor,
      Origen: origen,
      SucursalOrigen: sucursalOrigen,
      ESTADO: estado
    },
    errores
  );

  if (
    estado === 'VENTA CERRADA'
  ) {
    resumen.ventas_cerradas++;
  }

  if (esCitaAbierta) {
    resumen.citas_abiertas++;
  }

  if (
    estado &&
    !contexto.catalogos.estados.has(estado)
  ) {
    resumen.estados_no_reconocidos++;
    advertencias.push(
      'Estado no reconocido: ' + estado
    );
  }

  const sucursalOrigenCanonica =
    sucursalOrigen.toUpperCase() === 'BANK'
      ? 'CALL CENTER / CENTRAL'
      : sucursalOrigen;

  if (
    sucursalOrigen &&
    sucursalOrigen.toUpperCase() !== 'BANK' &&
    !contexto.catalogos.sucursales.has(
      sucursalOrigen
    )
  ) {
    resumen.sucursales_origen_no_reconocidas++;
    advertencias.push(
      'Sucursal origen no reconocida: ' +
      sucursalOrigen
    );
  }

  const destinosCandidatos =
    extraerDestinosCandidatosSupabase_(
      sucursalDestino
    );

  if (destinosCandidatos.length > 1) {
    resumen.destinos_multiples++;
  }

  const destinosNoReconocidos =
    obtenerDestinosNoReconocidosSupabase_(
      destinosCandidatos,
      contexto.catalogos.sucursales
    );

  if (destinosNoReconocidos.length > 0) {
    resumen.sucursales_destino_no_reconocidas++;
    resumen.destinos_candidatos_no_reconocidos +=
      destinosNoReconocidos.length;
    advertencias.push(
      'Sucursales destino no reconocidas: ' +
      destinosNoReconocidos.join(', ')
    );
  }

  if (
    asesor &&
    !contexto.catalogos.asesores.has(asesor)
  ) {
    resumen.asesores_no_reconocidos++;
    advertencias.push(
      'Asesor no reconocido: ' + asesor
    );
  }

  if (
    proceso &&
    !contexto.catalogos.procesos.has(proceso)
  ) {
    resumen.procesos_no_reconocidos++;
    advertencias.push(
      'Proceso no reconocido: ' + proceso
    );
  }

  if (
    origen &&
    !contexto.catalogos.origenes.has(origen)
  ) {
    resumen.origenes_no_reconocidos++;
    advertencias.push(
      'Origen no reconocido: ' + origen
    );
  }

  return {
    fila_origen: contexto.filaOrigen,
    id_legacy: idLegacy,
    fecha_registro:
      fechaRegistroResultado.valor,
    cliente: cliente,
    proceso_texto: proceso,
    numero_original: numeroOriginal,
    numero_normalizado: numeroNormalizado,
    precio_texto: precioTexto,
    precio_monto: precioResultado.monto,
    extras_texto: extras || null,
    fecha_cita:
      esCitaAbierta
        ? null
        : fechaCitaResultado.valor,
    hora_cita: horaCita,
    sucursal_destino_texto:
      sucursalDestino,
    destinos_candidatos: destinosCandidatos,
    asesor_texto: asesor,
    nota: nota || null,
    origen_texto: origen,
    sucursal_origen_texto:
      sucursalOrigen,
    sucursal_origen_canonica:
      sucursalOrigenCanonica || null,
    estado_texto: estado,
    fecha_venta:
      fechaVentaVisible
        ? fechaVentaResultado.valor
        : null,
    es_cita_abierta: esCitaAbierta,
    errores: errores,
    advertencias: advertencias,
    raw: construirRawRegistroCitasSupabase_(
      contexto.encabezados,
      visibles
    )
  };
}

/**
 * Interpreta Date reales, DD/MM/YYYY y YYYY-MM-DD sin Date.parse.
 *
 * @param {*} valor Valor devuelto por getValues().
 * @param {string} visible Valor devuelto por getDisplayValues().
 * @param {string} zonaHoraria Zona horaria del proyecto.
 * @param {boolean} incluirHora Si debe producir ISO con hora y zona.
 * @return {Object} Valor normalizado y estado de validación.
 */
function interpretarFechaHojaSupabase_(
  valor,
  visible,
  zonaHoraria,
  incluirHora
) {
  const original = String(visible || '').trim();

  if (
    Object.prototype.toString.call(valor) ===
      '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return {
      valor: incluirHora
        ? formatearFechaHoraIsoSupabase_(
            valor,
            zonaHoraria
          )
        : Utilities.formatDate(
            valor,
            zonaHoraria,
            'yyyy-MM-dd'
          ),
      error: false,
      original: original
    };
  }

  if (!original) {
    return {
      valor: null,
      error: true,
      original: original
    };
  }

  const partes =
    extraerPartesFechaSupabase_(original);

  if (!partes) {
    return {
      valor: null,
      error: true,
      original: original
    };
  }

  if (!incluirHora) {
    return {
      valor:
        String(partes.anio).padStart(4, '0') +
        '-' +
        String(partes.mes).padStart(2, '0') +
        '-' +
        String(partes.dia).padStart(2, '0'),
      error: false,
      original: original
    };
  }

  try {
    const textoNormalizado =
      String(partes.dia).padStart(2, '0') +
      '/' +
      String(partes.mes).padStart(2, '0') +
      '/' +
      String(partes.anio).padStart(4, '0') +
      ' ' +
      String(partes.hora).padStart(2, '0') +
      ':' +
      String(partes.minuto).padStart(2, '0') +
      ':' +
      String(partes.segundo).padStart(2, '0');
    const fecha =
      Utilities.parseDate(
        textoNormalizado,
        zonaHoraria,
        'dd/MM/yyyy HH:mm:ss'
      );

    return {
      valor:
        formatearFechaHoraIsoSupabase_(
          fecha,
          zonaHoraria
        ),
      error: false,
      original: original
    };
  } catch (error) {
    return {
      valor: null,
      error: true,
      original: original
    };
  }
}

/**
 * Interpreta una hora local de Google Sheets sin convertirla a UTC.
 *
 * @param {*} valor Valor devuelto por getValues().
 * @param {string} visible Valor devuelto por getDisplayValues().
 * @param {string} zonaHoraria Zona horaria del proyecto.
 * @return {Object} Hora HH:mm:ss o error de interpretación.
 */
function interpretarHoraHojaSupabase_(
  valor,
  visible,
  zonaHoraria
) {
  const original = String(visible || '').trim();

  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return {
      valor: Utilities.formatDate(
        valor,
        zonaHoraria,
        'HH:mm:ss'
      ),
      error: false,
      original: original
    };
  }

  const coincidencia = original.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );

  if (!coincidencia) {
    return {
      valor: null,
      error: true,
      original: original
    };
  }

  let hora = Number(coincidencia[1]);
  const minuto = Number(coincidencia[2]);
  const segundo = Number(coincidencia[3] || 0);
  const meridiano =
    String(coincidencia[4] || '').toUpperCase();

  if (minuto > 59 || segundo > 59) {
    return {
      valor: null,
      error: true,
      original: original
    };
  }

  if (meridiano) {
    if (hora < 1 || hora > 12) {
      return {
        valor: null,
        error: true,
        original: original
      };
    }

    if (hora === 12) {
      hora = 0;
    }

    if (meridiano === 'PM') {
      hora += 12;
    }
  } else if (hora > 23) {
    return {
      valor: null,
      error: true,
      original: original
    };
  }

  return {
    valor:
      String(hora).padStart(2, '0') +
      ':' +
      String(minuto).padStart(2, '0') +
      ':' +
      String(segundo).padStart(2, '0'),
    error: false,
    original: original
  };
}

/**
 * Extrae y valida componentes de fecha sin crear Date desde texto.
 *
 * @param {string} texto Fecha visible.
 * @return {?Object} Componentes válidos o null.
 */
function extraerPartesFechaSupabase_(texto) {
  let coincidencia = texto.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  let dia;
  let mes;
  let anio;
  let hora;
  let minuto;
  let segundo;

  if (coincidencia) {
    dia = Number(coincidencia[1]);
    mes = Number(coincidencia[2]);
    anio = Number(coincidencia[3]);
    hora = Number(coincidencia[4] || 0);
    minuto = Number(coincidencia[5] || 0);
    segundo = Number(coincidencia[6] || 0);
  } else {
    coincidencia = texto.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!coincidencia) {
      return null;
    }

    anio = Number(coincidencia[1]);
    mes = Number(coincidencia[2]);
    dia = Number(coincidencia[3]);
    hora = Number(coincidencia[4] || 0);
    minuto = Number(coincidencia[5] || 0);
    segundo = Number(coincidencia[6] || 0);
  }

  if (
    anio < 1 ||
    mes < 1 ||
    mes > 12 ||
    dia < 1 ||
    dia > diasEnMesSupabase_(anio, mes) ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59 ||
    segundo < 0 ||
    segundo > 59
  ) {
    return null;
  }

  return {
    dia: dia,
    mes: mes,
    anio: anio,
    hora: hora,
    minuto: minuto,
    segundo: segundo
  };
}

/**
 * Calcula los días del mes sin depender del parseo de fechas.
 *
 * @param {number} anio Año.
 * @param {number} mes Mes de 1 a 12.
 * @return {number} Cantidad de días.
 */
function diasEnMesSupabase_(anio, mes) {
  const dias = [
    31,
    esAnioBisiestoSupabase_(anio) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  return dias[mes - 1];
}

/**
 * Determina si un año es bisiesto.
 *
 * @param {number} anio Año.
 * @return {boolean} Resultado.
 */
function esAnioBisiestoSupabase_(anio) {
  return (
    anio % 400 === 0 ||
    (anio % 4 === 0 && anio % 100 !== 0)
  );
}

/**
 * Formatea un Date como ISO 8601 con el offset de Apps Script.
 *
 * @param {Date} fecha Fecha válida.
 * @param {string} zonaHoraria Zona del proyecto.
 * @return {string} ISO con offset, por ejemplo -06:00.
 */
function formatearFechaHoraIsoSupabase_(
  fecha,
  zonaHoraria
) {
  const valor = Utilities.formatDate(
    fecha,
    zonaHoraria,
    "yyyy-MM-dd'T'HH:mm:ssZ"
  );

  return valor.replace(
    /([+-]\d{2})(\d{2})$/,
    '$1:$2'
  );
}

/**
 * Convierte precios simples a monto sin perder el texto original.
 *
 * @param {string} texto Precio procesado.
 * @return {Object} Monto y validez.
 */
function interpretarPrecioSupabase_(texto) {
  const original = String(texto || '');
  const procesado = original.trim();

  if (!procesado) {
    return {
      valido: false,
      monto: null,
      multiple: false,
      cantidadMontos: 0
    };
  }

  const patronMonto =
    /(?:\$\s*)?(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;
  const montosEncontrados =
    procesado.match(patronMonto) || [];

  if (montosEncontrados.length === 0) {
    return {
      valido: false,
      monto: null,
      multiple: false,
      cantidadMontos: 0
    };
  }

  if (montosEncontrados.length > 1) {
    return {
      valido: false,
      monto: null,
      multiple: true,
      cantidadMontos: montosEncontrados.length
    };
  }

  let montoTexto =
    montosEncontrados[0]
      .replace(/\$/g, '')
      .replace(/\s+/g, '');

  if (
    /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(
      montoTexto
    )
  ) {
    montoTexto = montoTexto.replace(/,/g, '');
  } else {
    montoTexto = montoTexto.replace(',', '.');
  }

  const monto = Number(montoTexto);

  if (!isFinite(monto)) {
    return {
      valido: false,
      monto: null,
      multiple: false,
      cantidadMontos: 1
    };
  }

  return {
    valido: true,
    monto: Number(monto.toFixed(2)),
    multiple: false,
    cantidadMontos: 1
  };
}

/**
 * Normaliza teléfonos solo para diagnóstico de la exportación. Supabase
 * recalcula este campo al insertar la cita.
 *
 * @param {string} numero Valor original de Sheets.
 * @return {?string} Dígitos, o null si no representa un teléfono utilizable.
 */
function normalizarTelefonoDiagnosticoSupabase_(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');

  if (!digitos || /^0+$/.test(digitos)) {
    return null;
  }

  return digitos;
}

/**
 * Carga catálogos para producir advertencias, no para excluir citas.
 *
 * @param {Spreadsheet} ss Spreadsheet activo.
 * @return {Object} Conjuntos de valores reconocidos.
 */
function cargarCatalogosRegistroCitasSupabase_(ss) {
  const sucursales =
    cargarColumnaCatalogoRegistroSupabase_(
      ss,
      'Sucursales',
      'Sucursal'
    );
  const procesos =
    cargarColumnaCatalogoRegistroSupabase_(
      ss,
      'Procesos',
      'Proceso'
    );
  const origenes =
    cargarColumnaCatalogoRegistroSupabase_(
      ss,
      'Origenes',
      'Origen'
    );
  const hojaAsesores =
    obtenerHojaCatalogoRegistroSupabase_(
      ss,
      'Asesores'
    );
  const mapaAsesores =
    obtenerMapaEncabezados_(hojaAsesores);

  [
    'Asesor',
    'Sucursal',
    'Activo'
  ].forEach(function(nombre) {
    obtenerColumnaObligatoria_(
      mapaAsesores,
      nombre
    );
  });

  const asesores = new Set();
  const ultimaFilaAsesores =
    hojaAsesores.getLastRow();

  if (ultimaFilaAsesores >= 2) {
    hojaAsesores
      .getRange(
        2,
        mapaAsesores.Asesor,
        ultimaFilaAsesores - 1,
        1
      )
      .getDisplayValues()
      .forEach(function(fila) {
        const nombre =
          String(fila[0] || '').trim();

        if (nombre) {
          asesores.add(nombre);
        }
      });
  }

  // EN LINEA existe en el esquema inicial aunque no esté en la hoja.
  sucursales.add('EN LINEA');

  return {
    sucursales: sucursales,
    asesores: asesores,
    procesos: procesos,
    origenes: origenes,
    estados: new Set([
      'EN ESPERA DE CITA',
      'REPROGRAMADA',
      'CANCELADA',
      'SIN RESPUESTA',
      'BO',
      'VENTA CERRADA'
    ])
  };
}

/**
 * Lee una columna de catálogo por encabezado.
 *
 * @param {Spreadsheet} ss Spreadsheet activo.
 * @param {string} nombreHoja Hoja requerida.
 * @param {string} encabezado Encabezado requerido.
 * @return {Set} Valores limpios y no vacíos.
 */
function cargarColumnaCatalogoRegistroSupabase_(
  ss,
  nombreHoja,
  encabezado
) {
  const hoja =
    obtenerHojaCatalogoRegistroSupabase_(
      ss,
      nombreHoja
    );
  const mapa = obtenerMapaEncabezados_(hoja);
  const columna =
    obtenerColumnaObligatoria_(
      mapa,
      encabezado
    );
  const valores = new Set();
  const ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return valores;
  }

  hoja
    .getRange(
      2,
      columna,
      ultimaFila - 1,
      1
    )
    .getDisplayValues()
    .forEach(function(fila) {
      const valor =
        String(fila[0] || '').trim();

      if (valor) {
        valores.add(valor);
      }
    });

  return valores;
}

/**
 * Obtiene una hoja de catálogo con un error claro.
 *
 * @param {Spreadsheet} ss Spreadsheet activo.
 * @param {string} nombreHoja Nombre requerido.
 * @return {Sheet} Hoja encontrada.
 */
function obtenerHojaCatalogoRegistroSupabase_(
  ss,
  nombreHoja
) {
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
 * Separa destinos legados por coma sin alterar sus nombres originales.
 *
 * @param {string} texto Destinos legados.
 * @return {Array<string>} Destinos únicos, en el orden recibido.
 */
function extraerDestinosCandidatosSupabase_(texto) {
  const vistos = new Set();

  return String(texto || '')
    .split(',')
    .map(function(valor) {
      return valor.trim();
    })
    .filter(function(valor) {
      if (!valor || vistos.has(valor)) {
        return false;
      }

      vistos.add(valor);
      return true;
    });
}

/**
 * Detecta destinos candidatos que no están en el catálogo.
 *
 * @param {Array<string>} destinos Destinos ya separados.
 * @param {Set} sucursales Catálogo reconocido.
 * @return {Array<string>} Destinos desconocidos.
 */
function obtenerDestinosNoReconocidosSupabase_(
  destinos,
  sucursales
) {
  return destinos.filter(function(destino) {
    return !sucursales.has(destino);
  });
}

/**
 * Construye raw con todos los valores visibles de la hoja.
 *
 * @param {Array<string>} encabezados Encabezados reales.
 * @param {Array<string>} visibles Valores visibles.
 * @return {Object} Fila original por encabezado.
 */
function construirRawRegistroCitasSupabase_(
  encabezados,
  visibles
) {
  const raw = {};

  encabezados.forEach(function(encabezado, indice) {
    if (encabezado) {
      raw[encabezado] = visibles[indice];
    }
  });

  return raw;
}

/**
 * Agrega errores por textos requeridos vacíos.
 *
 * @param {Object} campos Campos procesados.
 * @param {Array<string>} errores Lista mutable de errores.
 */
function validarTextosObligatoriosSupabase_(
  campos,
  errores
) {
  Object.keys(campos).forEach(function(nombre) {
    if (!campos[nombre]) {
      errores.push(
        'Campo obligatorio vacío: ' + nombre
      );
    }
  });
}

/**
 * Detecta IDs repetidos y agrega advertencias a sus filas.
 *
 * @param {Object} idsLegacy Índice de ID a filas.
 * @param {Array<Object>} registros Registros procesados.
 * @return {Array<Object>} IDs repetidos y filas afectadas.
 */
function detectarIdsLegacyRepetidosSupabase_(
  idsLegacy,
  registros
) {
  const repetidos = [];
  const porFila = {};

  Object.keys(idsLegacy).forEach(function(id) {
    const filas = idsLegacy[id];

    if (filas.length <= 1) {
      return;
    }

    repetidos.push({
      id_legacy: id,
      cantidad: filas.length,
      filas: filas
    });

    filas.forEach(function(fila) {
      porFila[fila] = id;
    });
  });

  registros.forEach(function(registro) {
    if (porFila[registro.fila_origen]) {
      registro.advertencias.push(
        'ID legacy repetido: ' +
        porFila[registro.fila_origen]
      );
    }
  });

  return repetidos;
}

/**
 * Crea el resumen con todos los contadores requeridos.
 *
 * @return {Object} Resumen vacío.
 */
function crearResumenRegistroCitasSupabase_() {
  return {
    total_filas_leidas: 0,
    total_exportadas: 0,
    filas_vacias_ignoradas: 0,
    citas_abiertas: 0,
    ventas_cerradas: 0,
    telefonos_vacios: 0,
    fechas_invalidas: 0,
    horas_invalidas: 0,
    citas_con_hora: 0,
    citas_sin_hora: 0,
    precios_invalidos: 0,
    precios_multiples: 0,
    estados_no_reconocidos: 0,
    sucursales_origen_no_reconocidas: 0,
    sucursales_destino_no_reconocidas: 0,
    destinos_multiples: 0,
    destinos_candidatos_no_reconocidos: 0,
    asesores_no_reconocidos: 0,
    procesos_no_reconocidos: 0,
    origenes_no_reconocidos: 0,
    ids_legacy_repetidos: [],
    filas_con_errores: 0,
    filas_con_advertencias: 0,
    nombre_archivo: null,
    url_archivo: null
  };
}

/**
 * Crea el archivo JSON y actualiza su resumen con nombre y URL.
 *
 * @param {Object} resultado Objeto completo.
 * @param {Date} fechaExportacion Fecha de generación.
 * @param {string} zonaHoraria Zona del proyecto.
 */
function crearArchivoRegistroCitasSupabase_(
  resultado,
  fechaExportacion,
  zonaHoraria
) {
  const marcaTiempo = Utilities.formatDate(
    fechaExportacion,
    zonaHoraria,
    'yyyyMMdd_HHmmss'
  );
  const nombreArchivo =
    'registro_citas_supabase_' +
    marcaTiempo +
    '.json';
  const contenidoInicial =
    JSON.stringify(resultado, null, 2);
  const blob = Utilities.newBlob(
    contenidoInicial,
    'application/json',
    nombreArchivo
  );
  const archivo = DriveApp.createFile(blob);

  resultado.resumen.nombre_archivo =
    archivo.getName();
  resultado.resumen.url_archivo =
    archivo.getUrl();

  archivo.setContent(
    JSON.stringify(resultado, null, 2)
  );
}
