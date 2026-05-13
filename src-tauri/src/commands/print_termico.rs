// commands/print_termico.rs — Impresión térmica ESC/POS real
//
// Estrategia: genera bytes ESC/POS crudos y los envía al spooler del SO.
// - Windows: FFI directo a winspool.drv (WritePrinter) — instantáneo
// - macOS/Linux: `lp -d <printer> -o raw <file>`
//
// No depende de crates externos — ESC/POS es un protocolo muy estable.

use serde::{Deserialize, Serialize};
use tauri::State;
use super::auth::AppState;
use std::io::Write;
use std::process::Command;
use base64::Engine as _;

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

// ─── Win32 RAW Printing (FFI directo, sin PowerShell) ───────
#[cfg(target_os = "windows")]
mod win_raw_print {
    use std::ptr;

    /// DOC_INFO_1W — estructura que describe el documento a imprimir.
    #[repr(C)]
    struct DocInfo1W {
        doc_name:    *const u16,
        output_file: *const u16,
        datatype:    *const u16,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(printer: *const u16, handle: *mut isize, default: *const u8) -> i32;
        fn ClosePrinter(handle: isize) -> i32;
        fn StartDocPrinterW(handle: isize, level: u32, doc_info: *const DocInfo1W) -> u32;
        fn EndDocPrinter(handle: isize) -> i32;
        fn StartPagePrinter(handle: isize) -> i32;
        fn EndPagePrinter(handle: isize) -> i32;
        fn WritePrinter(handle: isize, buf: *const u8, count: u32, written: *mut u32) -> i32;
    }

    /// Convierte &str a wide string (UTF-16 null-terminated).
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Envía bytes RAW directamente al spooler de Windows (~1ms).
    pub fn send(printer_name: &str, data: &[u8]) -> Result<(), String> {
        let printer_w = wide(printer_name);
        let doc_name_w = wide("POS Ticket");
        let datatype_w = wide("RAW");

        unsafe {
            // Abrir impresora
            let mut handle: isize = 0;
            if OpenPrinterW(printer_w.as_ptr(), &mut handle, ptr::null()) == 0 {
                let err = std::io::Error::last_os_error();
                return Err(format!("No se pudo abrir '{}': {}", printer_name, err));
            }

            // StartDoc
            let doc_info = DocInfo1W {
                doc_name: doc_name_w.as_ptr(),
                output_file: ptr::null(),
                datatype: datatype_w.as_ptr(),
            };
            if StartDocPrinterW(handle, 1, &doc_info) == 0 {
                let err = std::io::Error::last_os_error();
                ClosePrinter(handle);
                return Err(format!("StartDocPrinter falló: {}", err));
            }

            // StartPage
            if StartPagePrinter(handle) == 0 {
                let err = std::io::Error::last_os_error();
                EndDocPrinter(handle);
                ClosePrinter(handle);
                return Err(format!("StartPagePrinter falló: {}", err));
            }

            // Escribir bytes
            let mut written: u32 = 0;
            if WritePrinter(handle, data.as_ptr(), data.len() as u32, &mut written) == 0 {
                let err = std::io::Error::last_os_error();
                EndPagePrinter(handle);
                EndDocPrinter(handle);
                ClosePrinter(handle);
                return Err(format!("WritePrinter falló: {}", err));
            }

            // Cerrar todo
            EndPagePrinter(handle);
            EndDocPrinter(handle);
            ClosePrinter(handle);
        }

        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn enviar_bytes_a_impresora(bytes: &[u8], impresora: &str) -> Result<(), String> {
    win_raw_print::send(impresora, bytes)
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

/// Imprime una imagen PNG (renderizada desde HTML via html2canvas) como
/// bitmap raster ESC/POS. Esto permite tickets con diseño HTML completo
/// (logo, fuentes, CSS) sin abrir ninguna ventana de navegador.
#[tauri::command]
pub fn imprimir_ticket_imagen(
    imagen_base64: String,
    impresora: String,
) -> Result<(), String> {
    if impresora.trim().is_empty() {
        return Err("Debes especificar una impresora".into());
    }

    // 1) Decodificar base64 → bytes PNG
    let png_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &imagen_base64,
    ).map_err(|e| format!("Error decodificando base64: {}", e))?;

    // 2) Cargar PNG con image crate
    let img = image::load_from_memory_with_format(&png_bytes, image::ImageFormat::Png)
        .map_err(|e| format!("Error cargando imagen: {}", e))?;

    // 3) Redimensionar a 576px de ancho (80mm a 203 DPI)
    let target_width = 576u32;
    let aspect = img.height() as f64 / img.width() as f64;
    let target_height = (target_width as f64 * aspect) as u32;
    let resized = image::imageops::resize(
        &img.to_luma8(),
        target_width,
        target_height,
        image::imageops::FilterType::Lanczos3,
    );

    // 4) Floyd-Steinberg dithering para simular escala de grises
    //    Esto convierte grises a patrones de puntos que la impresora
    //    térmica reproduce como tonos intermedios.
    let width_bytes = (target_width + 7) / 8;
    let height = resized.height();
    let w = target_width as usize;
    let h = height as usize;

    // Copiar pixels a buffer f32 para acumular error de difusión
    let mut pixels: Vec<f32> = resized.pixels().map(|p| p.0[0] as f32).collect();

    // Floyd-Steinberg: distribuir error de cuantización a vecinos
    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            let old_val = pixels[idx].clamp(0.0, 255.0);
            let new_val: f32 = if old_val < 128.0 { 0.0 } else { 255.0 };
            let error = old_val - new_val;
            pixels[idx] = new_val;

            // Distribuir error: →7/16, ↙3/16, ↓5/16, ↘1/16
            if x + 1 < w {
                pixels[idx + 1] += error * 7.0 / 16.0;
            }
            if y + 1 < h {
                if x > 0 {
                    pixels[(y + 1) * w + (x - 1)] += error * 3.0 / 16.0;
                }
                pixels[(y + 1) * w + x] += error * 5.0 / 16.0;
                if x + 1 < w {
                    pixels[(y + 1) * w + (x + 1)] += error * 1.0 / 16.0;
                }
            }
        }
    }

    let mut esc_bytes: Vec<u8> = Vec::with_capacity((width_bytes * height + 256) as usize);

    // ESC @ — reset impresora
    esc_bytes.extend_from_slice(&[ESC, b'@']);

    // GS v 0 — raster bit image
    esc_bytes.extend_from_slice(&[GS, b'v', b'0', 0]);
    esc_bytes.push((width_bytes & 0xFF) as u8);
    esc_bytes.push(((width_bytes >> 8) & 0xFF) as u8);
    esc_bytes.push((height & 0xFF) as u8);
    esc_bytes.push(((height >> 8) & 0xFF) as u8);

    // Datos: pixel dithered < 128 → negro (bit=1)
    for y in 0..h {
        for x_byte in 0..(width_bytes as usize) {
            let mut byte: u8 = 0;
            for bit in 0..8usize {
                let x = x_byte * 8 + bit;
                if x < w {
                    if pixels[y * w + x] < 128.0 {
                        byte |= 0x80 >> bit;
                    }
                }
            }
            esc_bytes.push(byte);
        }
    }

    // Alimentar papel + cortar
    esc_bytes.extend_from_slice(b"\n\n\n");
    cortar_papel(&mut esc_bytes);

    // 5) Enviar a la impresora
    enviar_bytes_a_impresora(&esc_bytes, impresora.trim())?;
    log::info!(
        "Ticket imagen impreso en '{}' ({}x{} px, {} bytes ESC/POS)",
        impresora, target_width, height, esc_bytes.len()
    );
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
