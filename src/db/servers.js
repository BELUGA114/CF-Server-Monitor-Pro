export function listServers(db) {
  return db.prepare('SELECT * FROM servers').all();
}

export function listServerStatus(db) {
  return db.prepare('SELECT id, name, last_updated FROM servers').all();
}

export function listAdminServers(db) {
  return db.prepare('SELECT id, name, last_updated, server_group, price, expire_date, bandwidth, traffic_limit, agent_os, is_hidden, reset_day FROM servers').all();
}

export function findServer(db, id) {
  return db.prepare('SELECT * FROM servers WHERE id = ?').bind(id).first();
}

export function deleteServer(db, id) {
  return db.prepare('DELETE FROM servers WHERE id = ?').bind(id).run();
}

export function renameServer(db, id, name, group) {
  return db.prepare('UPDATE servers SET name = ?, server_group = ? WHERE id = ?').bind(name, group, id).run();
}

export function insertServer(db, id, name, agentOs) {
  return db.prepare(`
            INSERT INTO servers 
            (id, name, cpu, ram, disk, load_avg, uptime, last_updated, ram_total, net_rx, net_tx, net_in_speed, net_out_speed, os, cpu_info, arch, boot_time, ram_used, swap_total, swap_used, disk_total, disk_used, processes, tcp_conn, udp_conn, country, ip_v4, ip_v6, server_group, price, expire_date, bandwidth, traffic_limit, ping_ct, ping_cu, ping_cm, ping_bd, monthly_rx, monthly_tx, last_rx, last_tx, reset_month, agent_os, history, is_hidden, reset_day) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(id, name, '0', '0', '0', '0', '0', 0, '0', '0', '0', '0', '0', '', '', '', '', '0', '0', '0', '0', '0', '0', '0', '0', '', '0', '0', '默认分组', '免费', '', '', '', '0', '0', '0', '0', '0', '0', '0', '0', '', agentOs, '{}', 'false', '1').run();
}

export function editServer(db, data) {
  return db.prepare(`
            UPDATE servers SET name = ?, server_group = ?, price = ?, expire_date = ?, bandwidth = ?, traffic_limit = ?, agent_os = ?, is_hidden = ?, reset_day = ? WHERE id = ?
          `).bind(data.name || 'Unnamed', data.server_group || '默认分组', data.price || '', data.expire_date || '', data.bandwidth || '', data.traffic_limit || '', data.agent_os || 'debian', data.is_hidden || 'false', data.reset_day || '1', data.id).run();
}

export function saveServerMetrics(db, id, metrics, countryCode, traffic, historyStr) {
  const { monthly_rx, monthly_tx, last_rx, last_tx, reset_month } = traffic;
  return db.prepare(`
          UPDATE servers 
          SET cpu = ?, ram = ?, disk = ?, load_avg = ?, uptime = ?, last_updated = ?,
              ram_total = ?, net_rx = ?, net_tx = ?, net_in_speed = ?, net_out_speed = ?,
              os = ?, cpu_info = ?, arch = ?, boot_time = ?, ram_used = ?, swap_total = ?, 
              swap_used = ?, disk_total = ?, disk_used = ?, processes = ?, tcp_conn = ?, udp_conn = ?, 
              country = ?, ip_v4 = ?, ip_v6 = ?, ping_ct = ?, ping_cu = ?, ping_cm = ?, ping_bd = ?,
              loss_ct = ?, loss_cu = ?, loss_cm = ?, loss_bd = ?,
              monthly_rx = ?, monthly_tx = ?, last_rx = ?, last_tx = ?, reset_month = ?, history = ?, virt = ?
          WHERE id = ?
        `).bind(
    metrics.cpu, metrics.ram, metrics.disk, metrics.load, metrics.uptime, Date.now(),
    metrics.ram_total || '0', metrics.net_rx || '0', metrics.net_tx || '0',
    metrics.net_in_speed || '0', metrics.net_out_speed || '0',
    metrics.os || '', metrics.cpu_info || '', metrics.arch || '', metrics.boot_time || '',
    metrics.ram_used || '0', metrics.swap_total || '0', metrics.swap_used || '0',
    metrics.disk_total || '0', metrics.disk_used || '0', metrics.processes || '0',
    metrics.tcp_conn || '0', metrics.udp_conn || '0', countryCode,
    metrics.ip_v4 || '0', metrics.ip_v6 || '0',
    metrics.ping_ct || '0', metrics.ping_cu || '0', metrics.ping_cm || '0', metrics.ping_bd || '0',
    metrics.loss_ct, metrics.loss_cu, metrics.loss_cm, metrics.loss_bd,
    monthly_rx.toString(), monthly_tx.toString(), last_rx.toString(), last_tx.toString(), reset_month, historyStr, metrics.virt || '',
    id
  ).run();
}
