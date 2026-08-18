/**
 * ==========================================================
 * MÓDULO: RECUPERAR CITA
 * ==========================================================
 */

/**
 * Busca todas las citas registradas con un número de contacto.
 */
function buscarCitasPorNumero(numeroBuscado) {
  const fuente = obtenerFuenteRecuperarCita_();

  if (fuente === 'SUPABASE') {
    return buscarCitasPorNumeroSupabase_(numeroBuscado);
  }

  return buscarCitasPorNumeroSheets_(numeroBuscado);
}

function obtenerFuenteRecuperarCita_() {
  const valorConfigurado = PropertiesService
    .getScriptProperties()
    .getProperty('FUENTE_RECUPERAR_CITA');
  const fuente = valorConfigurado === null
    ? 'SHEETS'
    : String(valorConfigurado).trim().toUpperCase();

  if (fuente !== 'SHEETS' && fuente !== 'SUPABASE') {
    throw new Error(
      'Valor inválido para FUENTE_RECUPERAR_CITA: ' + fuente +
      '. Valores permitidos: SHEETS o SUPABASE.'
    );
  }

  return fuente;
}

function probarFuenteRecuperarCita() {
  Logger.log(
    'FUENTE RECUPERAR CITA: ' + obtenerFuenteRecuperarCita_()
  );
}

function buscarCitasPorNumeroSheets_(numeroBuscado) {
  try {

    const numeroConsulta = normalizarNumeroCita_(numeroBuscado);

    if (!numeroConsulta) {
      throw new Error('Debe ingresar un número de contacto.');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName('RegistroCitas');

    if (!hoja) {
      throw new Error(
        'No se encuentra la hoja "RegistroCitas".'
      );
    }

    const datos = hoja
      .getDataRange()
      .getDisplayValues();

    if (datos.length <= 1) {
      return {
        ok: true,
        total: 0,
        resultados: []
      };
    }

    const encabezados = datos[0];

    const indices =
      obtenerIndicesRecuperarCita_(encabezados);

    validarColumnasRecuperarCita_(indices);

    const resultados = [];

    datos.slice(1).forEach(function(fila) {

      const numeroRegistro =
        normalizarNumeroCita_(
          fila[indices.Numero]
        );

      if (
        !numerosCitaCoinciden_(
          numeroConsulta,
          numeroRegistro
        )
      ) {
        return;
      }

      const cita = {
        id: fila[indices.ID] || '',
        cliente: fila[indices.Cliente] || '',
        proceso: fila[indices.Proceso] || '',
        numero: fila[indices.Numero] || '',
        precio: fila[indices.Precio] || '',
        extras: fila[indices.Extras] || '',
        fecha: fila[indices.Fecha] || '',
        sucursalDestino:
          fila[indices.SucursalDestino] || '',
        asesor: fila[indices.Asesor] || '',
        nota: fila[indices.Nota] || '',
        origen: fila[indices.Origen] || '',
        sucursalOrigen:
          fila[indices.SucursalOrigen] || '',
        estado:
          indices.ESTADO !== -1
            ? fila[indices.ESTADO] || ''
            : '',
        fechaVenta:
          indices.FECHA_DE_VENTA !== -1
            ? fila[indices.FECHA_DE_VENTA] || ''
            : '',
        hora:
          indices.HORA !== -1
            ? fila[indices.HORA] || ''
            : ''
      };

      cita.resumen =
        construirResumenCitaRecuperada_(cita);

      resultados.push(cita);

    });

    return {
      ok: true,
      total: resultados.length,
      numeroBuscado: numeroBuscado,
      resultados: resultados
    };

  } catch (error) {

    console.error(
      'Error en buscarCitasPorNumero:',
      error
    );

    return {
      ok: false,
      mensaje:
        error.message || error.toString()
    };

  }
}


/**
 * Localiza las columnas por sus encabezados.
 */
function obtenerIndicesRecuperarCita_(encabezados) {

  return {
    ID: encabezados.indexOf('ID'),
    Cliente: encabezados.indexOf('Cliente'),
    Proceso: encabezados.indexOf('Proceso'),
    Numero: encabezados.indexOf('Numero'),
    Precio: encabezados.indexOf('Precio'),
    Extras: encabezados.indexOf('Extras'),
    Fecha: encabezados.indexOf('Fecha'),
    SucursalDestino:
      encabezados.indexOf('SucursalDestino'),
    Asesor: encabezados.indexOf('Asesor'),
    Nota: encabezados.indexOf('Nota'),
    Origen: encabezados.indexOf('Origen'),
    SucursalOrigen:
      encabezados.indexOf('SucursalOrigen'),
    ESTADO: encabezados.indexOf('ESTADO'),
    FECHA_DE_VENTA:
      encabezados.indexOf('FECHA DE VENTA'),
    HORA: encabezados.indexOf('HORA')
  };

}


/**
 * Confirma que existan las columnas principales.
 */
function validarColumnasRecuperarCita_(indices) {

  const obligatorias = [
    'ID',
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
    'SucursalOrigen'
  ];

  const faltantes =
    obligatorias.filter(function(nombre) {
      return indices[nombre] === -1;
    });

  if (faltantes.length > 0) {
    throw new Error(
      'Faltan columnas en RegistroCitas: ' +
      faltantes.join(', ')
    );
  }

}


/**
 * Elimina espacios, guiones, +503 y otros caracteres.
 * Conserva solamente los dígitos.
 */
function normalizarNumeroCita_(numero) {

  return String(numero || '')
    .replace(/\D/g, '');

}


/**
 * Compara el número completo y también los últimos 8 dígitos.
 */
function numerosCitaCoinciden_(
  numeroConsulta,
  numeroRegistro
) {

  if (!numeroConsulta || !numeroRegistro) {
    return false;
  }

  if (numeroConsulta === numeroRegistro) {
    return true;
  }

  if (
    numeroConsulta.length >= 8 &&
    numeroRegistro.length >= 8
  ) {

    return (
      numeroConsulta.slice(-8) ===
      numeroRegistro.slice(-8)
    );

  }

  return false;

}

/**
 * Reconstruye el resumen original de la cita.
 */
function construirResumenCitaRecuperada_(cita) {

  const id = cita.id || 'SIN ID';

  return `CITA AGENDADA - ${id}
CLIENTE: ${cita.cliente || ''}
PROCESO: ${cita.proceso || ''}
PRECIO: ${cita.precio || ''}
EXTRAS: ${cita.extras || 'Ninguno'}
FECHA: ${cita.fecha || ''}
HORA: ${cita.hora || 'No especificada'}
SUCURSAL: ${cita.sucursalDestino || ''}
ASESOR: ${cita.asesor || ''}
NOTA: ${cita.nota || 'Ninguna'}
ORIGEN: ${cita.origen || ''}
SUCURSAL ORIGEN: ${cita.sucursalOrigen || ''}`;

}
