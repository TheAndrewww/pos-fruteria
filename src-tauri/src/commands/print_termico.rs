// commands/print_termico.rs — Impresión térmica ESC/POS real
//
// Estrategia: genera bytes ESC/POS crudos y los envía al spooler del SO.
// - macOS/Linux: `lp -d <printer> -o raw <file>`
// - Windows: `copy /B <file> \\localhost\<printer>` (o PowerShell Out-Printer)
//
// No depende de crates externos — ESC/POS es un protocolo muy estable.

use serde::{Deserialize, Serialize};
use tauri::State;
use super::auth::AppState;
use std::io::Write;
use std::process::Command;

// ─── Constantes ESC/POS ─────────────────────────────────────
const ESC: u8 = 0x1B;
const GS: u8 = 0x1D;

// ─── Structs ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DatosTicketTermico {
    pub negocio_nombre: String,
    pub negocio_direccion: String,
    pub negocio_telefono: String,
    pub negocio_rfc: String,
    pub mensaje_pie: String,
    pub folio: String,
    pub fecha: String,
    pub usuario: String,
    pub cliente: Option<String>,
    pub items: Vec<ItemTicket>,
    pub subtotal: f64,
    pub descuento: f64,
    /// Monto agregado por redondeo al peso siguiente (>= 0). Opcional para
    /// retrocompatibilidad con tickets viejos que no lo enviaban.
    #[serde(default)]
    pub redondeo: f64,
    pub total: f64,
    pub metodo_pago: String,
}

#[derive(Deserialize)]
pub struct ItemTicket {
    pub cantidad: f64,
    pub nombre: String,
    pub precio_unitario: f64,
    pub subtotal: f64,
}

#[derive(Serialize)]
pub struct ImpresoraInfo {
    pub nombre: String,
    pub default: bool,
}

// ─── Helpers ─────────────────────────────────────────────────

fn centrado(b: &mut Vec<u8>) {
    b.extend_from_slice(&[ESC, b'a', 1]);
}
fn izquierda(b: &mut Vec<u8>) {
    b.extend_from_slice(&[ESC, b'a', 0]);
}
fn negrita_on(b: &mut Vec<u8>) {
    b.extend_from_slice(&[ESC, b'E', 1]);
}
fn negrita_off(b: &mut Vec<u8>) {
    b.extend_from_slice(&[ESC, b'E', 0]);
}
fn doble_tamano(b: &mut Vec<u8>) {
    b.extend_from_slice(&[GS, b'!', 0x11]); // doble ancho + alto
}
fn tamano_normal(b: &mut Vec<u8>) {
    b.extend_from_slice(&[GS, b'!', 0x00]);
}
fn cortar_papel(b: &mut Vec<u8>) {
    b.extend_from_slice(&[GS, b'V', 0x42, 0]); // corte parcial
}
fn init(b: &mut Vec<u8>) {
    b.extend_from_slice(&[ESC, b'@']); // reset
}

fn linea_divisoria(b: &mut Vec<u8>, ancho: usize) {
    let linea = "-".repeat(ancho);
    let _ = writeln!(b, "{}", linea);
}

fn linea_kv(b: &mut Vec<u8>, etiqueta: &str, valor: &str, ancho: usize) {
    let espacio = ancho.saturating_sub(etiqueta.len() + valor.len());
    let _ = writeln!(b, "{}{}{}", etiqueta, " ".repeat(espacio), valor);
}

/// Trunca un nombre de producto si excede ancho (con ellipsis).
fn truncar(s: &str, max: usize) -> String {
    if s.chars().count() <= max { s.to_string() }
    else {
        let recortado: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{}…", recortado)
    }
}

// ─── Generación del ticket ───────────────────────────────────

pub fn generar_ticket_venta(datos: &DatosTicketTermico) -> Vec<u8> {
    let ancho: usize = 48; // 80mm
    let mut b: Vec<u8> = Vec::with_capacity(2048);

    init(&mut b);

    // ─── Encabezado ────────────────────────────
    centrado(&mut b);
    negrita_on(&mut b);
    doble_tamano(&mut b);
    let _ = writeln!(b, "{}", datos.negocio_nombre);
    tamano_normal(&mut b);
    negrita_off(&mut b);

    if !datos.negocio_direccion.is_empty() {
        let _ = writeln!(b, "{}", datos.negocio_direccion);
    }
    if !datos.negocio_telefono.is_empty() {
        let _ = writeln!(b, "Tel: {}", datos.negocio_telefono);
    }
    if !datos.negocio_rfc.is_empty() {
        let _ = writeln!(b, "RFC: {}", datos.negocio_rfc);
    }

    izquierda(&mut b);
    linea_divisoria(&mut b, ancho);

    // ─── Info de venta ────────────────────────
    negrita_on(&mut b);
    let _ = writeln!(b, "Folio: {}", datos.folio);
    let _ = writeln!(b, "Fecha: {}", datos.fecha);
    let _ = writeln!(b, "Cajero: {}", datos.usuario);
    if let Some(cli) = &datos.cliente {
        let _ = writeln!(b, "Cliente: {}", cli);
    }
    linea_divisoria(&mut b, ancho);

    // ─── Items ─────────────────────────────────
    // Formato: "NN x Nombre     $$.$$"
    for item in &datos.items {
        let prefijo = format!("{} x ", item.cantidad);
        let precio_str = format!("${:.2}", item.subtotal);
        let max_nombre = ancho.saturating_sub(prefijo.len() + precio_str.len() + 1);
        let nombre = truncar(&item.nombre, max_nombre);
        let padding = ancho.saturating_sub(prefijo.len() + nombre.chars().count() + precio_str.len());
        let _ = writeln!(b, "{}{}{}{}", prefijo, nombre, " ".repeat(padding), precio_str);
        if item.cantidad > 1.0 {
            let unit = format!("  @ ${:.2} c/u", item.precio_unitario);
            let _ = writeln!(b, "{}", unit);
        }
    }
    linea_divisoria(&mut b, ancho);

    // ─── Totales ──────────────────────────────
    linea_kv(&mut b, "Subtotal:", &format!("${:.2}", datos.subtotal), ancho);
    if datos.descuento > 0.0 {
        linea_kv(&mut b, "Descuento:", &format!("-${:.2}", datos.descuento), ancho);
    }
    if datos.redondeo > 0.0 {
        linea_kv(&mut b, "Redondeo:", &format!("+${:.2}", datos.redondeo), ancho);
    }
    doble_tamano(&mut b);
    linea_kv(&mut b, "TOTAL:", &format!("${:.2}", datos.total), ancho / 2);
    tamano_normal(&mut b);
    negrita_on(&mut b);
    linea_kv(&mut b, "Pago:", &datos.metodo_pago, ancho);

    linea_divisoria(&mut b, ancho);

    // ─── Pie ──────────────────────────────────
    centrado(&mut b);
    if !datos.mensaje_pie.is_empty() {
        let _ = writeln!(b, "{}", datos.mensaje_pie);
    }
    let _ = writeln!(b, "");
    let _ = writeln!(b, "");
    let _ = writeln!(b, "");

    cortar_papel(&mut b);
    b
}

// ─── Envío al spooler ────────────────────────────────────────

/// Script PowerShell que usa la API Win32 `WritePrinter` para enviar bytes
/// RAW a la impresora, sin necesidad de compartirla en red.
#[cfg(target_os = "windows")]
const PS_RAW_PRINT_SCRIPT: &str = r#"
param([string]$PrinterName, [string]$FilePath)

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendRawData(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            int err = Marshal.GetLastWin32Error();
            throw new Exception("No se pudo abrir la impresora '" + printerName + "' (Win32 error " + err + ")");
        }
        try {
            DOCINFOW di = new DOCINFOW();
            di.pDocName = "POS Ticket";
            di.pOutputFile = null;
            di.pDatatype = "RAW";
            if (!StartDocPrinter(hPrinter, 1, ref di)) {
                throw new Exception("StartDocPrinter fallo (error " + Marshal.GetLastWin32Error() + ")");
            }
            try {
                if (!StartPagePrinter(hPrinter)) {
                    throw new Exception("StartPagePrinter fallo (error " + Marshal.GetLastWin32Error() + ")");
                }
                IntPtr pBuf = Marshal.AllocCoTaskMem(data.Length);
                try {
                    Marshal.Copy(data, 0, pBuf, data.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pBuf, data.Length, out written)) {
                        throw new Exception("WritePrinter fallo (error " + Marshal.GetLastWin32Error() + ")");
                    }
                } finally {
                    Marshal.FreeCoTaskMem(pBuf);
                }
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
'@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinterHelper]::SendRawData($PrinterName, $bytes)
Write-Output "PRINT_OK"
"#;

#[cfg(target_os = "windows")]
fn enviar_bytes_a_impresora(bytes: &[u8], impresora: &str) -> Result<(), String> {
    use std::io::Write as _;

    // 1. Escribir datos ESC/POS a archivo temporal
    let mut tmp_data = std::env::temp_dir();
    tmp_data.push(format!("pos_ticket_{}.prn", chrono::Local::now().timestamp_nanos_opt().unwrap_or(0)));
    {
        let mut f = std::fs::File::create(&tmp_data).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
    }

    // 2. Escribir script PowerShell a archivo temporal
    let mut tmp_script = std::env::temp_dir();
    tmp_script.push("pos_raw_print.ps1");
    std::fs::write(&tmp_script, PS_RAW_PRINT_SCRIPT).map_err(|e| e.to_string())?;

    // 3. Ejecutar con parámetros
    let output = Command::new("powershell")
        .args([
            "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", &tmp_script.to_string_lossy(),
            "-PrinterName", impresora,
            "-FilePath", &tmp_data.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("No se pudo ejecutar PowerShell: {}", e))?;

    let _ = std::fs::remove_file(&tmp_data);
    // No borramos el script — se reutiliza

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() || !stdout.contains("PRINT_OK") {
        return Err(format!(
            "Falló la impresión RAW en '{}'. {}{}",
            impresora,
            if !stderr.trim().is_empty() { stderr.trim() } else { &stdout }.to_string(),
            if let Some(code) = output.status.code() { format!(" (exit {})", code) } else { String::new() }
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn enviar_bytes_a_impresora(bytes: &[u8], impresora: &str) -> Result<(), String> {
    // macOS / Linux: usar `lp -d <impresora> -o raw`
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("pos_ticket_{}.prn", chrono::Local::now().timestamp_nanos_opt().unwrap_or(0)));
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
    }
    let status = Command::new("lp")
        .args(["-d", impresora, "-o", "raw", tmp.to_string_lossy().as_ref()])
        .status()
        .map_err(|e| format!("No se pudo ejecutar lp: {}", e))?;
    let _ = std::fs::remove_file(&tmp);
    if !status.success() {
        return Err(format!("Falló la impresión en '{}' (code {:?})", impresora, status.code()));
    }
    Ok(())
}

// ─── Comandos Tauri ──────────────────────────────────────────

#[tauri::command]
pub fn imprimir_ticket_termico(
    datos: DatosTicketTermico,
    impresora: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    if impresora.trim().is_empty() {
        return Err("Debes especificar una impresora".into());
    }
    let bytes = generar_ticket_venta(&datos);
    enviar_bytes_a_impresora(&bytes, impresora.trim())?;
    log::info!("Ticket térmico impreso en '{}' ({} bytes)", impresora, bytes.len());
    Ok(())
}

#[tauri::command]
pub fn abrir_ticket_en_navegador(html: String) -> Result<(), String> {
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("pos_ticket_{}.html", chrono::Local::now().timestamp_millis()));
    std::fs::write(&tmp, html.as_bytes()).map_err(|e| e.to_string())?;
    let url = format!("file://{}", tmp.to_string_lossy());
    open::that(&url).map_err(|e| format!("No se pudo abrir el navegador: {}", e))?;
    Ok(())
}

/// Lista impresoras instaladas en el sistema.
#[tauri::command]
pub fn listar_impresoras() -> Result<Vec<ImpresoraInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("powershell")
            .args(["-NoProfile", "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name"])
            .output()
            .map_err(|e| format!("Get-Printer falló: {}", e))?;
        let texto = String::from_utf8_lossy(&out.stdout);
        let default_out = Command::new("powershell")
            .args(["-NoProfile", "-Command",
                "(Get-CimInstance -Class Win32_Printer | Where-Object Default).Name"])
            .output()
            .ok();
        let default_name = default_out
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let impresoras = texto.lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .map(|nombre| {
                let default = nombre == default_name;
                ImpresoraInfo { nombre, default }
            })
            .collect();
        return Ok(impresoras);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let out = Command::new("lpstat")
            .args(["-p"])
            .output()
            .map_err(|e| format!("lpstat falló: {} — ¿está CUPS instalado?", e))?;
        let texto = String::from_utf8_lossy(&out.stdout);
        let default_out = Command::new("lpstat").args(["-d"]).output().ok();
        let default_name = default_out
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.split_whitespace().last().map(|x| x.to_string()))
            .unwrap_or_default();
        let impresoras = texto.lines()
            .filter_map(|l| {
                // formato: "printer NOMBRE is idle. ..."
                let mut parts = l.split_whitespace();
                if parts.next()? == "printer" {
                    parts.next().map(|n| n.to_string())
                } else { None }
            })
            .map(|nombre| {
                let default = nombre == default_name;
                ImpresoraInfo { nombre, default }
            })
            .collect();
        Ok(impresoras)
    }
}

/// Imprime un ticket de prueba para verificar que la impresora funciona.
#[tauri::command]
pub fn probar_impresora(impresora: String) -> Result<String, String> {
    if impresora.trim().is_empty() {
        return Err("Debes especificar una impresora".into());
    }
    let ancho: usize = 48;
    let mut b: Vec<u8> = Vec::with_capacity(512);
    init(&mut b);
    centrado(&mut b);
    negrita_on(&mut b);
    doble_tamano(&mut b);
    let _ = writeln!(b, "PRUEBA");
    tamano_normal(&mut b);
    negrita_off(&mut b);
    let _ = writeln!(b, "{}", "-".repeat(ancho));
    let _ = writeln!(b, "Paulin Premium Fruits");
    let _ = writeln!(b, "Impresora: {}", impresora.trim());
    let _ = writeln!(b, "Fecha: {}", chrono::Local::now().format("%d/%m/%Y %H:%M"));
    let _ = writeln!(b, "{}", "-".repeat(ancho));
    centrado(&mut b);
    let _ = writeln!(b, "Si puedes leer esto,");
    let _ = writeln!(b, "la impresora funciona!");
    let _ = writeln!(b, "");
    let _ = writeln!(b, "");
    let _ = writeln!(b, "");
    cortar_papel(&mut b);

    enviar_bytes_a_impresora(&b, impresora.trim())?;
    Ok(format!("Ticket de prueba enviado a '{}' ({} bytes)", impresora.trim(), b.len()))
}
