// commands/entradas.rs — Registro de entradas de mercancía para Paulín Premium Fruits

use serde::{Deserialize, Serialize};
use tauri::State;
use super::auth::AppState;

#[derive(Serialize, Clone, Debug)]
pub struct EntradaMercancia {
    pub id: i64,
    pub producto_id: i64,
    pub producto_nombre: String,
    pub cantidad: f64,
    pub unidad: String,
    pub precio_costo: Option<f64>,
    pub proveedor: Option<String>,
    pub notas: Option<String>,
    pub usuario_id: i64,
    pub usuario_nombre: String,
    pub fecha: String,
}

#[derive(Deserialize)]
pub struct NuevaEntrada {
    pub producto_id: i64,
    pub cantidad: f64,
    pub unidad: Option<String>,
    pub precio_costo: Option<f64>,
    pub proveedor: Option<String>,
    pub notas: Option<String>,
}

/// Registrar entrada de mercancía — suma automáticamente al stock
#[tauri::command]
pub fn registrar_entrada(
    entrada: NuevaEntrada,
    usuario_id: i64,
    state: State<'_, AppState>,
) -> Result<EntradaMercancia, String> {
    if entrada.cantidad <= 0.0 {
        return Err("La cantidad debe ser mayor a 0".to_string());
    }

    let db = state.db.lock().unwrap();

    // Obtener datos del producto
    let (nombre, stock, unidad_prod): (String, f64, String) = db.query_row(
        "SELECT nombre, stock_actual, unidad FROM productos WHERE id = ?",
        rusqlite::params![entrada.producto_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| format!("Producto no encontrado: {}", e))?;

    let unidad = entrada.unidad.unwrap_or(unidad_prod);

    // Sumar al stock
    let nuevo_stock = stock + entrada.cantidad;
    db.execute(
        "UPDATE productos SET stock_actual = ?, updated_at = datetime('now') WHERE id = ?",
        rusqlite::params![nuevo_stock, entrada.producto_id],
    ).map_err(|e| e.to_string())?;

    // Si se proporcionó precio de costo, actualizar el costo del producto
    if let Some(costo) = entrada.precio_costo {
        if costo > 0.0 {
            db.execute(
                "UPDATE productos SET precio_costo = ?, updated_at = datetime('now') WHERE id = ?",
                rusqlite::params![costo, entrada.producto_id],
            ).map_err(|e| e.to_string())?;
        }
    }

    // Insertar registro
    db.execute(
        r#"INSERT INTO entradas_mercancia
           (producto_id, cantidad, unidad, precio_costo, proveedor, notas, usuario_id, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))"#,
        rusqlite::params![
            entrada.producto_id, entrada.cantidad, unidad,
            entrada.precio_costo, entrada.proveedor, entrada.notas, usuario_id
        ],
    ).map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();

    let usuario_nombre: String = db.query_row(
        "SELECT nombre_completo FROM usuarios WHERE id = ?",
        rusqlite::params![usuario_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "Desconocido".to_string());

    // Bitácora
    let _ = db.execute(
        r#"INSERT INTO audit_log (usuario_id, accion, tabla_afectada, registro_id, descripcion_legible, origen)
           VALUES (?, 'ENTRADA_REGISTRADA', 'entradas_mercancia', ?, ?, 'POS')"#,
        rusqlite::params![
            usuario_id, id,
            format!("Entrada: {:.2}{} de {} (proveedor: {})",
                entrada.cantidad, unidad, nombre,
                entrada.proveedor.as_deref().unwrap_or("N/A"))
        ],
    );

    let fecha: String = db.query_row(
        "SELECT fecha FROM entradas_mercancia WHERE id = ?",
        rusqlite::params![id],
        |row| row.get(0),
    ).unwrap_or_default();

    Ok(EntradaMercancia {
        id,
        producto_id: entrada.producto_id,
        producto_nombre: nombre,
        cantidad: entrada.cantidad,
        unidad,
        precio_costo: entrada.precio_costo,
        proveedor: entrada.proveedor,
        notas: entrada.notas,
        usuario_id,
        usuario_nombre,
        fecha,
    })
}

/// Listar entradas con filtros opcionales
#[tauri::command]
pub fn listar_entradas(
    fecha_inicio: Option<String>,
    fecha_fin: Option<String>,
    producto_id: Option<i64>,
    state: State<'_, AppState>,
) -> Vec<EntradaMercancia> {
    let db = state.db.lock().unwrap();

    let mut sql = String::from(
        r#"SELECT e.id, e.producto_id, p.nombre, e.cantidad, e.unidad,
                  e.precio_costo, e.proveedor, e.notas,
                  e.usuario_id, u.nombre_completo, e.fecha
           FROM entradas_mercancia e
           LEFT JOIN productos p ON p.id = e.producto_id
           LEFT JOIN usuarios u ON u.id = e.usuario_id
           WHERE e.deleted_at IS NULL"#
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref fi) = fecha_inicio {
        sql.push_str(" AND e.fecha >= ?");
        params.push(Box::new(fi.clone()));
    }
    if let Some(ref ff) = fecha_fin {
        sql.push_str(" AND e.fecha <= ?");
        params.push(Box::new(format!("{} 23:59:59", ff)));
    }
    if let Some(pid) = producto_id {
        sql.push_str(" AND e.producto_id = ?");
        params.push(Box::new(pid));
    }
    sql.push_str(" ORDER BY e.fecha DESC LIMIT 500");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = db.prepare(&sql).unwrap();
    stmt.query_map(param_refs.as_slice(), |row| {
        Ok(EntradaMercancia {
            id: row.get(0)?,
            producto_id: row.get(1)?,
            producto_nombre: row.get(2)?,
            cantidad: row.get(3)?,
            unidad: row.get(4)?,
            precio_costo: row.get(5)?,
            proveedor: row.get(6)?,
            notas: row.get(7)?,
            usuario_id: row.get(8)?,
            usuario_nombre: row.get(9)?,
            fecha: row.get(10)?,
        })
    }).unwrap()
    .filter_map(|r| r.ok())
    .collect()
}
