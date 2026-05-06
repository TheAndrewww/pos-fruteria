// commands/merma.rs — Registro y consulta de mermas para Paulín Premium Fruits

use serde::{Deserialize, Serialize};
use tauri::State;
use super::auth::AppState;

#[derive(Serialize, Clone, Debug)]
pub struct Merma {
    pub id: i64,
    pub producto_id: i64,
    pub producto_nombre: String,
    pub cantidad: f64,
    pub unidad: String,
    pub motivo: String,
    pub notas: Option<String>,
    pub usuario_id: i64,
    pub usuario_nombre: String,
    pub fecha: String,
}

#[derive(Deserialize)]
pub struct NuevaMerma {
    pub producto_id: i64,
    pub cantidad: f64,
    pub unidad: Option<String>,
    pub motivo: String,       // maduracion | daño | robo | otro
    pub notas: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ReporteMermaItem {
    pub producto_id: i64,
    pub producto_nombre: String,
    pub total_cantidad: f64,
    pub unidad: String,
    pub total_costo_perdido: f64,
    pub num_registros: i64,
}

/// Registrar una merma — descuenta automáticamente del stock
#[tauri::command]
pub fn registrar_merma(
    merma: NuevaMerma,
    usuario_id: i64,
    state: State<'_, AppState>,
) -> Result<Merma, String> {
    if merma.cantidad <= 0.0 {
        return Err("La cantidad debe ser mayor a 0".to_string());
    }
    if merma.motivo.trim().is_empty() {
        return Err("El motivo es obligatorio".to_string());
    }

    let db = state.db.lock().unwrap();

    // Obtener datos del producto
    let (nombre, stock, unidad_prod, precio_costo): (String, f64, String, f64) = db.query_row(
        "SELECT nombre, stock_actual, unidad, precio_costo FROM productos WHERE id = ?",
        rusqlite::params![merma.producto_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|e| format!("Producto no encontrado: {}", e))?;

    let unidad = merma.unidad.unwrap_or(unidad_prod);

    // Descontar del stock
    let nuevo_stock = (stock - merma.cantidad).max(0.0);
    db.execute(
        "UPDATE productos SET stock_actual = ?, updated_at = datetime('now') WHERE id = ?",
        rusqlite::params![nuevo_stock, merma.producto_id],
    ).map_err(|e| e.to_string())?;

    // Insertar registro de merma
    db.execute(
        r#"INSERT INTO mermas (producto_id, cantidad, unidad, motivo, notas, usuario_id, fecha)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))"#,
        rusqlite::params![
            merma.producto_id, merma.cantidad, unidad,
            merma.motivo, merma.notas, usuario_id
        ],
    ).map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();

    // Obtener nombre del usuario
    let usuario_nombre: String = db.query_row(
        "SELECT nombre_completo FROM usuarios WHERE id = ?",
        rusqlite::params![usuario_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "Desconocido".to_string());

    // Bitácora
    let costo_perdido = merma.cantidad * precio_costo;
    let _ = db.execute(
        r#"INSERT INTO audit_log (usuario_id, accion, tabla_afectada, registro_id, descripcion_legible, origen)
           VALUES (?, 'MERMA_REGISTRADA', 'mermas', ?, ?, 'POS')"#,
        rusqlite::params![
            usuario_id, id,
            format!("Merma: {} {:.2}{} de {} (${:.2} perdidos) — {}",
                merma.motivo, merma.cantidad, unidad, nombre, costo_perdido, merma.notas.as_deref().unwrap_or(""))
        ],
    );

    let fecha: String = db.query_row(
        "SELECT fecha FROM mermas WHERE id = ?",
        rusqlite::params![id],
        |row| row.get(0),
    ).unwrap_or_default();

    Ok(Merma {
        id,
        producto_id: merma.producto_id,
        producto_nombre: nombre,
        cantidad: merma.cantidad,
        unidad,
        motivo: merma.motivo,
        notas: merma.notas,
        usuario_id,
        usuario_nombre,
        fecha,
    })
}

/// Listar mermas con filtros opcionales
#[tauri::command]
pub fn listar_mermas(
    fecha_inicio: Option<String>,
    fecha_fin: Option<String>,
    producto_id: Option<i64>,
    state: State<'_, AppState>,
) -> Vec<Merma> {
    let db = state.db.lock().unwrap();

    let mut sql = String::from(
        r#"SELECT m.id, m.producto_id, p.nombre, m.cantidad, m.unidad,
                  m.motivo, m.notas, m.usuario_id, u.nombre_completo, m.fecha
           FROM mermas m
           LEFT JOIN productos p ON p.id = m.producto_id
           LEFT JOIN usuarios u ON u.id = m.usuario_id
           WHERE m.deleted_at IS NULL"#
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref fi) = fecha_inicio {
        sql.push_str(" AND m.fecha >= ?");
        params.push(Box::new(fi.clone()));
    }
    if let Some(ref ff) = fecha_fin {
        sql.push_str(" AND m.fecha <= ?");
        params.push(Box::new(format!("{} 23:59:59", ff)));
    }
    if let Some(pid) = producto_id {
        sql.push_str(" AND m.producto_id = ?");
        params.push(Box::new(pid));
    }
    sql.push_str(" ORDER BY m.fecha DESC LIMIT 500");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = db.prepare(&sql).unwrap();
    stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Merma {
            id: row.get(0)?,
            producto_id: row.get(1)?,
            producto_nombre: row.get(2)?,
            cantidad: row.get(3)?,
            unidad: row.get(4)?,
            motivo: row.get(5)?,
            notas: row.get(6)?,
            usuario_id: row.get(7)?,
            usuario_nombre: row.get(8)?,
            fecha: row.get(9)?,
        })
    }).unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

/// Reporte de merma agrupado por producto
#[tauri::command]
pub fn reporte_merma(
    fecha_inicio: String,
    fecha_fin: String,
    state: State<'_, AppState>,
) -> Vec<ReporteMermaItem> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        r#"SELECT m.producto_id, p.nombre,
                  SUM(m.cantidad), p.unidad,
                  SUM(m.cantidad * p.precio_costo),
                  COUNT(*)
           FROM mermas m
           LEFT JOIN productos p ON p.id = m.producto_id
           WHERE m.deleted_at IS NULL
             AND m.fecha >= ? AND m.fecha <= ?
           GROUP BY m.producto_id
           ORDER BY SUM(m.cantidad * p.precio_costo) DESC"#,
    ).unwrap();

    let fin = format!("{} 23:59:59", fecha_fin);
    stmt.query_map(rusqlite::params![fecha_inicio, fin], |row| {
        Ok(ReporteMermaItem {
            producto_id: row.get(0)?,
            producto_nombre: row.get(1)?,
            total_cantidad: row.get(2)?,
            unidad: row.get(3)?,
            total_costo_perdido: row.get(4)?,
            num_registros: row.get(5)?,
        })
    }).unwrap()
    .filter_map(|r| r.ok())
    .collect()
}
