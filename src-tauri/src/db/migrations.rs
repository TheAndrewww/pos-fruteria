// db/migrations.rs — Migraciones incrementales usando PRAGMA user_version
// Adaptadas para POS Paulín Premium Fruits (sin proveedores, clientes, presupuestos, etc.)

use rusqlite::{Connection, Result};

type MigrationFn = fn(&Connection) -> Result<()>;

const MIGRATIONS: &[MigrationFn] = &[
    migracion_001_noop,
    migracion_002_noop,
    migracion_003_respaldo_auto_config,
    migracion_004_sync_remoto,
    migracion_005_triggers_outbox,
    migracion_006_impresora_termica,
    migracion_007_uuid_auto_y_backfill,
    migracion_008_reparar_esquema_sync,
    migracion_009_noop,
    migracion_010_noop,
    migracion_011_audit_log_sync,
    migracion_012_asegurar_impresora_termica,
];

pub fn aplicar_migraciones(conn: &Connection) -> Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let target = MIGRATIONS.len() as i64;

    if version >= target {
        log::info!("BD en versión {version}, al día (target {target})");
        return Ok(());
    }

    for (idx, m) in MIGRATIONS.iter().enumerate() {
        let v = (idx + 1) as i64;
        if v <= version { continue; }
        log::info!("Aplicando migración v{v}...");
        m(conn)?;
        conn.execute_batch(&format!("PRAGMA user_version = {v}"))?;
    }
    Ok(())
}

// No-ops: migraciones que referenciaban tablas eliminadas en frutería
fn migracion_001_noop(_conn: &Connection) -> Result<()> { Ok(()) }
fn migracion_002_noop(_conn: &Connection) -> Result<()> { Ok(()) }
fn migracion_009_noop(_conn: &Connection) -> Result<()> { Ok(()) }
fn migracion_010_noop(_conn: &Connection) -> Result<()> { Ok(()) }

// ─── Migración 003 ────────────────────────────────────────
fn migracion_003_respaldo_auto_config(conn: &Connection) -> Result<()> {
    let _ = conn.execute(
        "ALTER TABLE config_negocio ADD COLUMN respaldo_auto_activo INTEGER NOT NULL DEFAULT 1",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE config_negocio ADD COLUMN respaldo_auto_hora TEXT NOT NULL DEFAULT '23:00'",
        [],
    );
    Ok(())
}

// ─── Migración 004 ────────────────────────────────────────
// Sync remoto (solo tablas que existen en frutería)
fn migracion_004_sync_remoto(conn: &Connection) -> Result<()> {
    // Sucursales
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS sucursales (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid        TEXT NOT NULL UNIQUE,
            nombre      TEXT NOT NULL,
            direccion   TEXT,
            telefono    TEXT,
            activa      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at  TEXT
        );
    "#)?;
    conn.execute(
        "INSERT OR IGNORE INTO sucursales (id, uuid, nombre, direccion, telefono) \
         VALUES (1, '00000000-0000-7000-8000-000000000001', 'Principal', '', '')",
        [],
    )?;

    // Stock por sucursal
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS stock_sucursal (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid          TEXT NOT NULL UNIQUE,
            producto_id   INTEGER NOT NULL REFERENCES productos(id),
            sucursal_id   INTEGER NOT NULL REFERENCES sucursales(id),
            stock_actual  REAL NOT NULL DEFAULT 0,
            stock_minimo  REAL NOT NULL DEFAULT 0,
            updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(producto_id, sucursal_id)
        );
        CREATE INDEX IF NOT EXISTS idx_stock_suc_producto ON stock_sucursal(producto_id);
        CREATE INDEX IF NOT EXISTS idx_stock_suc_sucursal ON stock_sucursal(sucursal_id);
    "#)?;
    conn.execute(
        "INSERT OR IGNORE INTO stock_sucursal (uuid, producto_id, sucursal_id, stock_actual, stock_minimo) \
         SELECT lower(hex(randomblob(16))), id, 1, stock_actual, stock_minimo FROM productos",
        [],
    )?;

    // sucursal_id en tablas operacionales que existen
    for tabla in &["ventas", "cortes", "movimientos_caja", "aperturas_caja", "devoluciones"] {
        if !tabla_existe(conn, tabla) { continue; }
        let sql = format!(
            "ALTER TABLE {} ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1 REFERENCES sucursales(id)",
            tabla
        );
        let _ = conn.execute(&sql, []);
    }

    // uuid + updated_at + deleted_at en tablas sincronizables
    let tablas_sync: &[&str] = &[
        "productos", "usuarios", "categorias",
        "ventas", "venta_detalle",
        "cortes", "corte_denominaciones", "corte_vendedores",
        "movimientos_caja", "aperturas_caja", "devoluciones", "devolucion_detalle",
    ];
    for tabla in tablas_sync {
        if !tabla_existe(conn, tabla) { continue; }
        let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN uuid TEXT", tabla), []);
        let _ = conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))", tabla),
            [],
        );
        let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN deleted_at TEXT", tabla), []);
    }

    // Poblar uuids
    for tabla in tablas_sync {
        if !tabla_existe(conn, tabla) { continue; }
        let sql = format!(
            "UPDATE {} SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL",
            tabla
        );
        conn.execute(&sql, [])?;
        let _ = conn.execute(
            &format!("CREATE UNIQUE INDEX IF NOT EXISTS idx_{}_uuid ON {}(uuid)", tabla, tabla),
            [],
        );
    }

    // Infraestructura de sync
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS sync_outbox (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tabla       TEXT NOT NULL,
            uuid        TEXT NOT NULL,
            operacion   TEXT NOT NULL CHECK(operacion IN ('INSERT', 'UPDATE', 'DELETE')),
            payload     TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            synced_at   TEXT,
            intentos    INTEGER NOT NULL DEFAULT 0,
            ultimo_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_outbox_pendiente ON sync_outbox(synced_at) WHERE synced_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_outbox_tabla_uuid ON sync_outbox(tabla, uuid);

        CREATE TABLE IF NOT EXISTS sync_state (
            id                INTEGER PRIMARY KEY CHECK(id = 1),
            device_uuid       TEXT NOT NULL,
            sucursal_id       INTEGER NOT NULL DEFAULT 1 REFERENCES sucursales(id),
            remote_url        TEXT,
            remote_token      TEXT,
            last_push_at      TEXT,
            last_pull_cursor  TEXT,
            last_pull_at      TEXT,
            activo            INTEGER NOT NULL DEFAULT 0,
            updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO sync_state (id, device_uuid, sucursal_id, activo)
            VALUES (1, lower(hex(randomblob(16))), 1, 0);
    "#)?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_pending_unique \
         ON sync_outbox(tabla, uuid) WHERE synced_at IS NULL",
        [],
    )?;

    // Transferencias (stub)
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS transferencias (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid                  TEXT NOT NULL UNIQUE,
            folio                 TEXT NOT NULL UNIQUE,
            sucursal_origen_id    INTEGER NOT NULL REFERENCES sucursales(id),
            sucursal_destino_id   INTEGER NOT NULL REFERENCES sucursales(id),
            usuario_id            INTEGER NOT NULL REFERENCES usuarios(id),
            estado                TEXT NOT NULL DEFAULT 'PENDIENTE'
                                  CHECK(estado IN ('PENDIENTE', 'EN_TRANSITO', 'RECIBIDA', 'CANCELADA')),
            notas                 TEXT,
            fecha_envio           TEXT,
            fecha_recepcion       TEXT,
            created_at            TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at            TEXT
        );
        CREATE TABLE IF NOT EXISTS transferencia_detalle (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid             TEXT NOT NULL UNIQUE,
            transferencia_id INTEGER NOT NULL REFERENCES transferencias(id),
            producto_id      INTEGER NOT NULL REFERENCES productos(id),
            cantidad         REAL NOT NULL
        );
    "#)?;

    Ok(())
}

// ─── Migración 005 ────────────────────────────────────────
// Triggers para sync outbox (solo tablas existentes)
fn migracion_005_triggers_outbox(conn: &Connection) -> Result<()> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS sync_suppress_flag (
            id INTEGER PRIMARY KEY CHECK(id = 1)
        );
    "#)?;

    let tablas_sync: &[&str] = &[
        "productos", "usuarios", "categorias",
        "sucursales", "stock_sucursal",
        "ventas", "cortes", "devoluciones", "transferencias",
        "movimientos_caja", "aperturas_caja",
    ];

    for tabla in tablas_sync {
        if !tabla_existe(conn, tabla) { continue; }
        // AFTER INSERT
        let trig_ins = format!(
            r#"
            CREATE TRIGGER IF NOT EXISTS trg_{tabla}_outbox_ins
            AFTER INSERT ON {tabla}
            WHEN NEW.uuid IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
            BEGIN
                INSERT INTO sync_outbox (tabla, uuid, operacion)
                VALUES ('{tabla}', NEW.uuid, 'UPDATE')
                ON CONFLICT(tabla, uuid) WHERE synced_at IS NULL
                DO UPDATE SET created_at = datetime('now'), intentos = 0, ultimo_error = NULL;
            END;
            "#, tabla = tabla
        );
        let _ = conn.execute_batch(&trig_ins);

        // AFTER UPDATE
        let trig_upd = format!(
            r#"
            CREATE TRIGGER IF NOT EXISTS trg_{tabla}_outbox_upd
            AFTER UPDATE ON {tabla}
            WHEN NEW.uuid IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
            BEGIN
                INSERT INTO sync_outbox (tabla, uuid, operacion)
                VALUES ('{tabla}', NEW.uuid, 'UPDATE')
                ON CONFLICT(tabla, uuid) WHERE synced_at IS NULL
                DO UPDATE SET created_at = datetime('now'), intentos = 0, ultimo_error = NULL;
            END;
            "#, tabla = tabla
        );
        let _ = conn.execute_batch(&trig_upd);

        // AFTER DELETE
        let trig_del = format!(
            r#"
            CREATE TRIGGER IF NOT EXISTS trg_{tabla}_outbox_del
            AFTER DELETE ON {tabla}
            WHEN OLD.uuid IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
            BEGIN
                INSERT INTO sync_outbox (tabla, uuid, operacion)
                VALUES ('{tabla}', OLD.uuid, 'DELETE')
                ON CONFLICT(tabla, uuid) WHERE synced_at IS NULL
                DO UPDATE SET operacion = 'DELETE', created_at = datetime('now'), intentos = 0, ultimo_error = NULL;
            END;
            "#, tabla = tabla
        );
        let _ = conn.execute_batch(&trig_del);
    }

    // bump updated_at triggers
    for tabla in tablas_sync {
        if !tabla_existe(conn, tabla) { continue; }
        if !columna_existe(conn, tabla, "updated_at") { continue; }
        let trig = format!(
            r#"
            CREATE TRIGGER IF NOT EXISTS trg_{tabla}_bump_updated
            AFTER UPDATE ON {tabla}
            WHEN NEW.updated_at = OLD.updated_at
             AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
            BEGIN
                UPDATE {tabla} SET updated_at = datetime('now') WHERE id = NEW.id;
            END;
            "#, tabla = tabla
        );
        let _ = conn.execute_batch(&trig);
    }

    Ok(())
}

// ─── Migración 006 ────────────────────────────────────────
fn migracion_006_impresora_termica(conn: &Connection) -> Result<()> {
    let _ = conn.execute(
        "ALTER TABLE config_negocio ADD COLUMN impresora_termica TEXT NOT NULL DEFAULT ''",
        [],
    );
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────

fn tabla_existe(conn: &Connection, tabla: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?1",
        [tabla],
        |_| Ok(()),
    )
    .is_ok()
}

fn columna_existe(conn: &Connection, tabla: &str, columna: &str) -> bool {
    let sql = format!("PRAGMA table_info({})", tabla);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let rows = stmt.query_map([], |r| r.get::<_, String>(1));
    if let Ok(it) = rows {
        for nombre in it.flatten() {
            if nombre == columna {
                return true;
            }
        }
    }
    false
}

// ─── Migración 007 ────────────────────────────────────────
// UUID auto-generation y backfill (solo tablas existentes)
fn migracion_007_uuid_auto_y_backfill(conn: &Connection) -> Result<()> {
    let tablas: &[&str] = &[
        "productos", "usuarios", "categorias",
        "sucursales", "stock_sucursal",
        "ventas", "venta_detalle",
        "cortes", "corte_denominaciones", "corte_vendedores",
        "movimientos_caja", "aperturas_caja", "devoluciones", "devolucion_detalle",
    ];

    // Reparar columnas faltantes
    for tabla in tablas {
        if !tabla_existe(conn, tabla) { continue; }
        if !columna_existe(conn, tabla, "uuid") {
            let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN uuid TEXT", tabla), []);
        }
        if !columna_existe(conn, tabla, "updated_at") {
            let _ = conn.execute(
                &format!("ALTER TABLE {} ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''", tabla),
                [],
            );
            let _ = conn.execute(
                &format!("UPDATE {} SET updated_at = datetime('now') WHERE updated_at = ''", tabla),
                [],
            );
        }
        if !columna_existe(conn, tabla, "deleted_at") {
            let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN deleted_at TEXT", tabla), []);
        }
    }

    // Backfill uuids
    for tabla in tablas {
        if !tabla_existe(conn, tabla) { continue; }
        let _ = conn.execute(
            &format!("UPDATE {} SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL", tabla),
            [],
        );
    }

    // Trigger uuid auto
    for tabla in tablas {
        if !tabla_existe(conn, tabla) { continue; }
        let trig = format!(
            r#"
            DROP TRIGGER IF EXISTS trg_{tabla}_uuid_auto;
            CREATE TRIGGER trg_{tabla}_uuid_auto
            AFTER INSERT ON {tabla}
            FOR EACH ROW
            WHEN NEW.uuid IS NULL
            BEGIN
                UPDATE {tabla} SET uuid = lower(hex(randomblob(16))) WHERE rowid = NEW.rowid;
            END;
            "#, tabla = tabla
        );
        conn.execute_batch(&trig)?;
    }

    // Re-encolar en outbox
    let tablas_outbox: &[&str] = &[
        "productos", "usuarios", "categorias",
        "sucursales", "stock_sucursal",
        "ventas", "cortes", "devoluciones", "transferencias",
        "movimientos_caja", "aperturas_caja",
    ];
    for tabla in tablas_outbox {
        if !tabla_existe(conn, tabla) { continue; }
        let sql = format!(
            r#"
            INSERT INTO sync_outbox (tabla, uuid, operacion)
            SELECT '{tabla}', uuid, 'UPDATE'
              FROM {tabla}
             WHERE uuid IS NOT NULL
            ON CONFLICT(tabla, uuid) WHERE synced_at IS NULL
            DO UPDATE SET created_at = datetime('now'), intentos = 0, ultimo_error = NULL
            "#, tabla = tabla
        );
        let _ = conn.execute(&sql, []);
    }

    Ok(())
}

// ─── Migración 008 ────────────────────────────────────────
fn migracion_008_reparar_esquema_sync(conn: &Connection) -> Result<()> {
    let tablas: &[&str] = &[
        "productos", "usuarios", "categorias",
        "sucursales", "stock_sucursal",
        "ventas", "venta_detalle",
        "cortes", "corte_denominaciones", "corte_vendedores",
        "movimientos_caja", "aperturas_caja", "devoluciones", "devolucion_detalle",
        "transferencias", "transferencia_detalle",
    ];

    for tabla in tablas {
        if !tabla_existe(conn, tabla) { continue; }
        if !columna_existe(conn, tabla, "uuid") {
            let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN uuid TEXT", tabla), []);
        }
        if !columna_existe(conn, tabla, "updated_at") {
            let _ = conn.execute(
                &format!("ALTER TABLE {} ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''", tabla),
                [],
            );
            let _ = conn.execute(
                &format!("UPDATE {} SET updated_at = datetime('now') WHERE updated_at = ''", tabla),
                [],
            );
        }
        if !columna_existe(conn, tabla, "deleted_at") {
            let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN deleted_at TEXT", tabla), []);
        }
    }

    for tabla in tablas {
        if !tabla_existe(conn, tabla) { continue; }
        let _ = conn.execute(
            &format!("UPDATE {} SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL", tabla),
            [],
        );
    }

    let con_updated_auto: &[&str] = &[
        "productos", "usuarios", "categorias",
        "sucursales", "stock_sucursal",
        "ventas", "cortes", "devoluciones", "transferencias",
        "movimientos_caja", "aperturas_caja",
    ];
    for tabla in con_updated_auto {
        if !tabla_existe(conn, tabla) { continue; }
        if !columna_existe(conn, tabla, "updated_at") { continue; }
        let trig = format!(
            r#"
            DROP TRIGGER IF EXISTS trg_{tabla}_bump_updated;
            CREATE TRIGGER trg_{tabla}_bump_updated
            AFTER UPDATE ON {tabla}
            WHEN NEW.updated_at = OLD.updated_at
             AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
            BEGIN
                UPDATE {tabla} SET updated_at = datetime('now') WHERE id = NEW.id;
            END;
            "#, tabla = tabla
        );
        let _ = conn.execute_batch(&trig);
    }

    let tablas_uuid_auto: &[&str] = &[
        "productos", "usuarios", "categorias",
        "sucursales", "stock_sucursal",
        "ventas", "venta_detalle",
        "cortes", "corte_denominaciones", "corte_vendedores",
        "movimientos_caja", "aperturas_caja", "devoluciones", "devolucion_detalle",
    ];
    for tabla in tablas_uuid_auto {
        if !tabla_existe(conn, tabla) { continue; }
        if !columna_existe(conn, tabla, "uuid") { continue; }
        let trig = format!(
            r#"
            DROP TRIGGER IF EXISTS trg_{tabla}_uuid_auto;
            CREATE TRIGGER trg_{tabla}_uuid_auto
            AFTER INSERT ON {tabla}
            FOR EACH ROW
            WHEN NEW.uuid IS NULL
            BEGIN
                UPDATE {tabla} SET uuid = lower(hex(randomblob(16))) WHERE rowid = NEW.rowid;
            END;
            "#, tabla = tabla
        );
        let _ = conn.execute_batch(&trig);
    }

    Ok(())
}

// ─── Migración 011 ────────────────────────────────────────
fn migracion_011_audit_log_sync(conn: &Connection) -> Result<()> {
    if !tabla_existe(conn, "audit_log") { return Ok(()); }

    if !columna_existe(conn, "audit_log", "uuid") {
        let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN uuid TEXT", []);
    }
    if !columna_existe(conn, "audit_log", "updated_at") {
        let _ = conn.execute(
            "ALTER TABLE audit_log ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
            [],
        );
    }
    if !columna_existe(conn, "audit_log", "deleted_at") {
        let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN deleted_at TEXT", []);
    }

    let _ = conn.execute(
        "UPDATE audit_log SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL",
        [],
    );
    let _ = conn.execute(
        "UPDATE audit_log SET updated_at = COALESCE(NULLIF(fecha, ''), datetime('now')) \
         WHERE updated_at IS NULL OR updated_at = ''",
        [],
    );

    let _ = conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_uuid ON audit_log(uuid)",
        [],
    );

    conn.execute_batch(r#"
        DROP TRIGGER IF EXISTS trg_audit_log_uuid_auto;
        CREATE TRIGGER trg_audit_log_uuid_auto
        AFTER INSERT ON audit_log
        FOR EACH ROW
        WHEN NEW.uuid IS NULL
        BEGIN
            UPDATE audit_log
               SET uuid = lower(hex(randomblob(16))),
                   updated_at = COALESCE(NULLIF(NEW.fecha, ''), datetime('now'))
             WHERE rowid = NEW.rowid;
        END;
    "#)?;

    conn.execute_batch(r#"
        DROP TRIGGER IF EXISTS trg_audit_log_outbox_ins;
        CREATE TRIGGER trg_audit_log_outbox_ins
        AFTER INSERT ON audit_log
        FOR EACH ROW
        WHEN NEW.uuid IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
        BEGIN
            INSERT INTO sync_outbox (tabla, uuid, operacion)
            VALUES ('audit_log', NEW.uuid, 'UPDATE')
            ON CONFLICT(tabla, uuid) WHERE synced_at IS NULL
            DO UPDATE SET created_at = datetime('now'), intentos = 0, ultimo_error = NULL;
        END;
    "#)?;

    conn.execute_batch(r#"
        DROP TRIGGER IF EXISTS trg_audit_log_outbox_upd;
        CREATE TRIGGER trg_audit_log_outbox_upd
        AFTER UPDATE ON audit_log
        FOR EACH ROW
        WHEN NEW.uuid IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM sync_suppress_flag WHERE id=1)
        BEGIN
            INSERT INTO sync_outbox (tabla, uuid, operacion)
            VALUES ('audit_log', NEW.uuid, 'UPDATE')
            ON CONFLICT(tabla, uuid) WHERE synced_at IS NULL
            DO UPDATE SET created_at = datetime('now'), intentos = 0, ultimo_error = NULL;
        END;
    "#)?;

    Ok(())
}

// ─── Migración 012 ────────────────────────────────────────
/// Red de seguridad: garantiza que la columna `impresora_termica` exista en
/// `config_negocio`, incluso si la BD fue migrada con una versión anterior del
/// código que no incluía la migración 006 original.
fn migracion_012_asegurar_impresora_termica(conn: &Connection) -> Result<()> {
    if !columna_existe(conn, "config_negocio", "impresora_termica") {
        conn.execute(
            "ALTER TABLE config_negocio ADD COLUMN impresora_termica TEXT NOT NULL DEFAULT ''",
            [],
        )?;
        log::info!("Migración 012: columna impresora_termica creada");
    }
    if !columna_existe(conn, "config_negocio", "respaldo_auto_activo") {
        let _ = conn.execute(
            "ALTER TABLE config_negocio ADD COLUMN respaldo_auto_activo INTEGER NOT NULL DEFAULT 1",
            [],
        );
    }
    if !columna_existe(conn, "config_negocio", "respaldo_auto_hora") {
        let _ = conn.execute(
            "ALTER TABLE config_negocio ADD COLUMN respaldo_auto_hora TEXT NOT NULL DEFAULT '23:00'",
            [],
        );
    }
    Ok(())
}
