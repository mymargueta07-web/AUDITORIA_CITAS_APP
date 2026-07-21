/**
 * ==========================================================
 * MENÚ PRINCIPAL - SISTEMA DE CITAS (REDISEÑO NIVEL 3)
 * ==========================================================
 */

function onOpen() {
  crearMenuPrincipal();
}

/**
 * Crea el menú principal del sistema
 */
function crearMenuPrincipal() {
  SpreadsheetApp.getUi()
    .createMenu("📅 Sistema de Citas")
    .addItem("Registrar citas", "abrirRegistroCitas")
    .addSeparator()
    .addItem("🔎 Consultar citas", "abrirModuloCitas")
    .addItem("🔍 Recuperar cita","abrirRecuperarCita")
    .addSeparator()
    .addItem("📅Reporte Diario", "abrirReporteDiario")
    .addSeparator()
    .addItem("📂 Citas Abiertas", "abrirReporteCitasAbiertas")
    .addSeparator()
    .addItem("📅Reporte Mensual por Sucursal", "abrirReporteMensualSucursal")
    .addSeparator()
    .addItem("ℹ️ Acerca del sistema", "mostrarInfoSistema")
    .addToUi();
}

/**
 * Abre el módulo principal de citas
 */
function abrirModuloCitas() {
  const html = HtmlService
    .createTemplateFromFile("Dialogo")
    .evaluate()
    .setWidth(900)
    .setHeight(1000);

  SpreadsheetApp.getUi().showModalDialog(html, "📅 Consulta de citas");
}

/**
 * Abre el módulo de reporte de citas abiertas
 */
function abrirReporteCitasAbiertas() {
  const html = HtmlService
    .createTemplateFromFile("CitasAbiertas")
    .evaluate()
    .setWidth(1200)
    .setHeight(1000);

  SpreadsheetApp.getUi().showModalDialog(html, "📂 Reporte de Citas Abiertas");
}
/**
 * Información del sistema (extensible)
 */
function mostrarInfoSistema() {
  SpreadsheetApp.getUi().alert(
    "Sistema de Citas\n\n" +
    "Versión: 3.0 (Rediseño)\n" +
    "Arquitectura: Modular\n" +
    "Autor: Apps Script System"
  );
}

/**
 * Include de archivos HTML (CSS / JS / componentes)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function abrirReporteDiario() {

  const html = HtmlService
    .createTemplateFromFile("ReporteDiario")
    .evaluate()
    .setWidth(1200)
    .setHeight(1000);

  SpreadsheetApp.getUi().showModalDialog(html, "Reporte Diario");

}
function abrirRegistroCitas() {

  const html = HtmlService
    .createTemplateFromFile("index")
    .evaluate()
    .setWidth(1200)
    .setHeight(1000);

  SpreadsheetApp.getUi().showModalDialog(html, "Registrar cita");

}

function abrirRecuperarCita() {

  const html = HtmlService
    .createTemplateFromFile('RecuperarCitaModal')
    .evaluate()
    .setWidth(950)
    .setHeight(850);

  SpreadsheetApp
    .getUi()
    .showModalDialog(
      html,
      "🔍 Recuperar cita"
    );

}

function abrirReporteMensualSucursal() {
  const html = HtmlService
    .createTemplateFromFile("ReporteMensualSucursal")
    .evaluate()
    .setWidth(1200)
    .setHeight(1000);

  SpreadsheetApp.getUi().showModalDialog(
    html,
    "Reporte Mensual de Sucursal"
  );
}
