export function createDatabaseInitializer() {
  // 初始化状态属于当前 Worker 实例，失败后保留下一次请求重试的行为。
  let initialized = false;
  return async (db) => {
    if (initialized) return;
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
      await db.prepare(`
          CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT, cpu TEXT, ram TEXT, disk TEXT, load_avg TEXT, uptime TEXT, last_updated INTEGER,
            ram_total TEXT, net_rx TEXT, net_tx TEXT, net_in_speed TEXT, net_out_speed TEXT,
            os TEXT, cpu_info TEXT, arch TEXT, boot_time TEXT, ram_used TEXT, swap_total TEXT, 
            swap_used TEXT, disk_total TEXT, disk_used TEXT, processes TEXT, tcp_conn TEXT, udp_conn TEXT, 
            country TEXT, ip_v4 TEXT, ip_v6 TEXT,
            server_group TEXT DEFAULT '默认分组', price TEXT DEFAULT '', expire_date TEXT DEFAULT '', 
            bandwidth TEXT DEFAULT '', traffic_limit TEXT DEFAULT '', agent_os TEXT DEFAULT 'debian'
          )
        `).run();

      const { results: columns } = await db.prepare(`PRAGMA table_info(servers)`).all();
      const existingCols = columns.map(c => c.name);

      const newCols = {
        ping_ct: "TEXT DEFAULT '0'", ping_cu: "TEXT DEFAULT '0'", ping_cm: "TEXT DEFAULT '0'", ping_bd: "TEXT DEFAULT '0'",
        loss_ct: "TEXT DEFAULT '-1'", loss_cu: "TEXT DEFAULT '-1'", loss_cm: "TEXT DEFAULT '-1'", loss_bd: "TEXT DEFAULT '-1'",
        monthly_rx: "TEXT DEFAULT '0'", monthly_tx: "TEXT DEFAULT '0'", last_rx: "TEXT DEFAULT '0'", last_tx: "TEXT DEFAULT '0'", reset_month: "TEXT DEFAULT ''",
        agent_os: "TEXT DEFAULT 'debian'",
        history: "TEXT DEFAULT '{}'",
        is_hidden: "TEXT DEFAULT 'false'",
        virt: "TEXT DEFAULT ''",
        reset_day: "TEXT DEFAULT '1'"
      };

      for (const [colName, colDef] of Object.entries(newCols)) {
        if (!existingCols.includes(colName)) {
          await db.prepare(`ALTER TABLE servers ADD COLUMN ${colName} ${colDef}`).run();
        }
      }

      const checkNodes = await db.prepare("SELECT value FROM settings WHERE key = 'cached_nodes_data'").first();
      if (!checkNodes) {
        try {
          const res = await fetch('https://raw.githubusercontent.com/BELUGA114/CF-Server-Monitor-Pro/refs/heads/main/nodes.json');
          if (res.ok) {
            const dataText = await res.text();
            await db.prepare("INSERT INTO settings (key, value) VALUES ('cached_nodes_data', ?)").bind(dataText).run();
          }
        } catch(e) {}
      }
      initialized = true;
    } catch (e) {}
  };
}
