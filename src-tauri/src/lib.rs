// lib.rs — Entry point de Tauri para POS Paulín Premium Fruits

mod db;
mod commands;
mod server;
mod sync;

use commands::auth::{AppState, login_pin, login_password, logout, verificar_pin_dueno, resolver_dueno_por_pin, crear_usuario_inicial};
use commands::productos::{
    listar_productos, obtener_producto_por_codigo, generar_codigo_interno,
    crear_producto, actualizar_producto, eliminar_producto, ajustar_stock,
    listar_productos_stock_bajo,
    listar_categorias, listar_proveedores,
    listar_clientes, crear_cliente, actualizar_cliente, toggle_cliente_activo,
    obtener_config_descuentos,
    obtener_config_negocio, actualizar_config_negocio,
    historial_precios_producto,
};
use commands::ventas::{
    crear_venta, listar_ventas_dia, obtener_estadisticas_dia, anular_venta,
    buscar_ventas, obtener_detalle_venta,
};
use commands::devoluciones::{
    crear_devolucion, listar_devoluciones, obtener_detalle_devolucion,
};
use commands::usuarios::{
    listar_usuarios, listar_roles, crear_usuario, actualizar_usuario, toggle_usuario_activo,
};
use commands::bitacora::listar_bitacora;
use commands::cortes::{
    crear_movimiento_caja, listar_movimientos_sin_corte,
    calcular_datos_corte, crear_corte,
    listar_cortes, obtener_detalle_corte,
    verificar_corte_dia_pendiente, obtener_inicio_proximo_cierre,
    crear_apertura_caja, obtener_apertura_hoy, obtener_fondo_sugerido,
};
use commands::respaldos::{
    crear_respaldo, listar_respaldos, restaurar_respaldo,
    respaldo_auto_si_necesario, obtener_info_bd,
};
use commands::print::imprimir_html;
use commands::print_termico::{imprimir_ticket_termico, listar_impresoras};
use commands::importar::importar_catalogo_csv;
use commands::conexion::{
    obtener_info_servidor, generar_qr_emparejamiento,
    listar_dispositivos, revocar_dispositivo,
};
use commands::sync_remoto::{
    obtener_estado_sync, configurar_sync, desactivar_sync, probar_conexion_sync,
    backfill_outbox,
};
use commands::exportar::escribir_archivo;
use commands::merma::{registrar_merma, listar_mermas, reporte_merma};
use commands::entradas::{registrar_entrada, listar_entradas};
use db::connection::init_database;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// Slot compartido donde se publica el ServerState cuando el servidor móvil
/// termina de arrancar. Los comandos de conexión lo leen con `.read()`.
pub type ServerSlot = Arc<std::sync::RwLock<Option<server::ServerState>>>;

fn gen_secret() -> Vec<u8> {
    use rand::RngCore;
    let mut bytes = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("No se pudo obtener el directorio de datos de la app");
            std::fs::create_dir_all(&app_data_dir)
                .expect("No se pudo crear el directorio de datos");

            let db_path = app_data_dir.join("pos_fruteria.db");
            log::info!("Inicializando BD en: {:?}", db_path);

            let conn = init_database(&db_path)
                .expect("Error al inicializar la base de datos");

            // Respaldo automático de arranque
            let app_handle = app.handle().clone();
            if let Ok(backup_dir) = commands::respaldos::obtener_backups_dir(&app_handle) {
                if let Err(e) = commands::respaldos::respaldo_auto_startup(&app_handle, &conn, &backup_dir) {
                    log::warn!("Respaldo automático de arranque falló: {}", e);
                }
            }

            let db_arc = Arc::new(Mutex::new(conn));
            app.manage(AppState { db: db_arc.clone() });

            // ========== Servidor LAN ==========
            let secret_path = app_data_dir.join("jwt.secret");
            let jwt_secret: Vec<u8> = if secret_path.exists() {
                std::fs::read(&secret_path).unwrap_or_else(|_| gen_secret())
            } else {
                let s = gen_secret();
                let _ = std::fs::write(&secret_path, &s);
                s
            };
            let cert_dir = app_data_dir.join("certs");
            let pwa_dist_dir = {
                app.path().resolve("resources/mobile-dist", tauri::path::BaseDirectory::Resource).ok()
            };

            let server_slot: ServerSlot = Arc::new(std::sync::RwLock::new(None));
            app.manage(server_slot.clone());

            // ========== Worker de sync remoto ==========
            sync::worker::arrancar(db_arc.clone());

            let db_for_server = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                match server::start_server(
                    db_for_server,
                    jwt_secret,
                    cert_dir,
                    pwa_dist_dir,
                    8787,
                ).await {
                    Ok(info) => {
                        log::info!("Servidor móvil activo en puerto {}", info.port);
                        if let Ok(mut slot) = server_slot.write() {
                            *slot = Some(info.state);
                        }
                    }
                    Err(e) => log::error!("No se pudo iniciar el servidor móvil: {}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            login_pin,
            login_password,
            logout,
            verificar_pin_dueno,
            resolver_dueno_por_pin,
            crear_usuario_inicial,
            // Productos
            listar_productos,
            obtener_producto_por_codigo,
            generar_codigo_interno,
            crear_producto,
            actualizar_producto,
            eliminar_producto,
            ajustar_stock,
            listar_productos_stock_bajo,
            historial_precios_producto,
            listar_categorias,
            listar_proveedores,
            // Clientes (simplificado — sin CRUD de clientes dedicado)
            listar_clientes,
            crear_cliente,
            actualizar_cliente,
            toggle_cliente_activo,
            // Config
            obtener_config_descuentos,
            obtener_config_negocio,
            actualizar_config_negocio,
            // Ventas
            crear_venta,
            listar_ventas_dia,
            obtener_estadisticas_dia,
            anular_venta,
            buscar_ventas,
            obtener_detalle_venta,
            // Devoluciones
            crear_devolucion,
            listar_devoluciones,
            obtener_detalle_devolucion,
            // Usuarios
            listar_usuarios,
            listar_roles,
            crear_usuario,
            actualizar_usuario,
            toggle_usuario_activo,
            // Bitácora
            listar_bitacora,
            // Cortes de caja
            crear_movimiento_caja,
            listar_movimientos_sin_corte,
            calcular_datos_corte,
            crear_corte,
            listar_cortes,
            obtener_detalle_corte,
            verificar_corte_dia_pendiente,
            obtener_inicio_proximo_cierre,
            // Apertura de caja
            crear_apertura_caja,
            obtener_apertura_hoy,
            obtener_fondo_sugerido,
            // Respaldos
            crear_respaldo,
            listar_respaldos,
            restaurar_respaldo,
            respaldo_auto_si_necesario,
            obtener_info_bd,
            // Impresión
            imprimir_html,
            imprimir_ticket_termico,
            listar_impresoras,
            // Importación
            importar_catalogo_csv,
            // Exportación
            escribir_archivo,
            // Conexión móvil
            obtener_info_servidor,
            generar_qr_emparejamiento,
            listar_dispositivos,
            revocar_dispositivo,
            // Sync remoto
            obtener_estado_sync,
            configurar_sync,
            desactivar_sync,
            probar_conexion_sync,
            backfill_outbox,
            // Merma
            registrar_merma,
            listar_mermas,
            reporte_merma,
            // Entradas de mercancía
            registrar_entrada,
            listar_entradas,
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar el POS");
}
