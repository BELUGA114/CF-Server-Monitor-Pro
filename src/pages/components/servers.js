import { formatBytes } from '../shared.js';

export function renderServerCardsAndTable(groups, sys, now, offlineThresMs) {
  let cardContentHtml = ''; let tableBodyHtml = '';
  const getColor = (ping) => { const p = parseInt(ping); if (p === 0 || isNaN(p)) return '#9ca3af'; if (p < 100) return '#10b981'; if (p < 200) return '#f59e0b'; return '#ef4444'; };
  const getLossColor = (loss) => { const l = parseFloat(loss); if (isNaN(l) || l < 0) return '#9ca3af'; if (l === 0) return '#10b981'; if (l < 5) return '#f59e0b'; return '#ef4444'; };
  const lossText = (loss) => { const l = parseFloat(loss); return (isNaN(l) || l < 0) ? '--' : (Math.round(l * 10) / 10) + '%'; };
  // 计算 24 小时内某序列的平均丢包(history 满 288 点即 24h);-1 与 null 是无效采样(ICMP 不可用或该时段未采集),排除后求均值,无有效样本返回 -1
  const avgLoss = (arr) => {
    if (!Array.isArray(arr)) return -1;
    let sum = 0, cnt = 0;
    for (const v of arr) {
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      if (isNaN(n) || n < 0) continue;
      sum += n; cnt++;
    }
    return cnt === 0 ? -1 : sum / cnt;
  };

  if (Object.keys(groups).length === 0) {
    cardContentHtml = '<p style="text-align:center; width: 100%; color:#888;">暂无公开服务器</p>';
  } else {
    for (const [grpName, grpServers] of Object.entries(groups)) {
      cardContentHtml += `<div class="group-header">${grpName}</div><div class="grid-container">`;
      for (const server of grpServers) {
        const isOnline = (now - server.last_updated) < offlineThresMs;
        const statusColor = isOnline ? '#10b981' : '#ef4444';

        const cpu = parseFloat(server.cpu || '0').toFixed(1);
        const ram = parseFloat(server.ram || '0').toFixed(1);
        const disk = parseFloat(server.disk || '0').toFixed(1);
        const netInSpeedRaw = parseFloat(server.net_in_speed) || 0;
        const netOutSpeedRaw = parseFloat(server.net_out_speed) || 0;

        const cCode = (server.country || 'xx').toLowerCase();
        const flagHtml = cCode !== 'xx' ? `<img src="https://flagcdn.com/24x18/${cCode}.png" alt="${cCode}" style="vertical-align: sub; margin-right: 5px; border-radius: 2px;">` : '🏳️';

        let metaHtml = '';
        if (sys.show_price === 'true') {
          let priceHtml = `价格: ${server.price || '免费'}`;
          if (server._amount > 0) priceHtml += ` <span style="color:#8b5cf6;font-weight:600;margin-left:8px;">剩余价值: ${server._remValue.toFixed(2)}${sys.asset_currency || '元'}</span>`;
          metaHtml += `<div class="card-meta" style="margin-top:8px;">${priceHtml}</div>`;
        }
        if (sys.show_expire === 'true') {
          let expireText = '永久';
          if (server.expire_date) {
            const expTime = new Date(server.expire_date).getTime();
            if (!isNaN(expTime)) {
              const diff = expTime - now; expireText = diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) + ' 天' : '已过期';
            }
          }
          metaHtml += `<div class="card-meta" style="${sys.show_price !== 'true' ? 'margin-top:8px;' : ''}">剩余天数: ${expireText}</div>`;
        }

        const rx_val_str = formatBytes(sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_rx || 0) : parseFloat(server.net_rx || 0));
        const tx_val_str = formatBytes(sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_tx || 0) : parseFloat(server.net_tx || 0));
        metaHtml += `<div class="card-meta" style="${sys.show_price !== 'true' && sys.show_expire !== 'true' ? 'margin-top:8px;' : ''}">流量: <span style="color:#10b981">↓</span> ${rx_val_str} | <span style="color:#3b82f6">↑</span> ${tx_val_str}</div>`;

        const diffSec = Math.round((now - server.last_updated) / 1000);
        let upTimeFormat = (server.uptime || '-').replace('days', '天').replace('day', '天');
        metaHtml += `<div class="card-meta" style="margin-top:2px;">在线: ${upTimeFormat} | 更新: ${diffSec}s前</div>`;

        let badgesHtml = '';
        if (sys.show_bw === 'true' && server.bandwidth) badgesHtml += `<span class="badge badge-bw">${server.bandwidth}</span>`;
        if (sys.show_tf === 'true' && server.traffic_limit) badgesHtml += `<span class="badge badge-tf">${server.traffic_limit}</span>`;
        if (server.ip_v4 === '1') badgesHtml += `<span class="badge badge-v4">IPv4</span>`;
        if (server.ip_v6 === '1') badgesHtml += `<span class="badge badge-v6">IPv6</span>`;

        // 卡片丢包显示 24 小时平均值(取自 history),而非最近一次上报
        let cardHist = {};
        try { cardHist = JSON.parse(server.history || '{}'); } catch(e) {}
        const pingCell = (label, ping, loss) => `<span>${label} <span style="color:${getColor(ping)}; font-weight:bold;">${ping === '0' ? '超时' : ping + 'ms'}</span><span style="color:${getLossColor(loss)}; font-weight:bold;" title="24 小时平均丢包">·${lossText(loss)}</span></span>`;
        const pingHtml = `<div class="ping-box">${pingCell('电信', server.ping_ct, avgLoss(cardHist.loss_ct))}${pingCell('联通', server.ping_cu, avgLoss(cardHist.loss_cu))}${pingCell('移动', server.ping_cm, avgLoss(cardHist.loss_cm))}${pingCell('字节', server.ping_bd, avgLoss(cardHist.loss_bd))}</div>`;

        const ramUsedStr = formatBytes((parseFloat(server.ram_used || 0) * 1048576).toString());
        const ramTotalStr = formatBytes((parseFloat(server.ram_total || 0) * 1048576).toString());
        const diskUsedStr = formatBytes((parseFloat(server.disk_used || 0) * 1048576).toString());
        const diskTotalStr = formatBytes((parseFloat(server.disk_total || 0) * 1048576).toString());

        cardContentHtml += `
              <a href="/?id=${server.id}" class="vps-card" data-id="${server.id}" data-country="${cCode}">
                <div class="card-left">
                  <div class="card-title">
                    <div class="status-dot" style="background:${statusColor};"></div>
                    ${flagHtml} <span style="font-size:15px;" class="card-title-text">${server.name}</span>
                  </div>
                  ${metaHtml}
                  <div class="card-badges">${badgesHtml}</div>
                  ${pingHtml}
                </div>
                
                <div class="card-right">
                  <div class="stat-group">
                    <div class="stat-header"><span>CPU</span><span style="color: ${cpu > 80 ? '#ef4444' : 'inherit'};">${cpu}%</span></div>
                    <div class="stat-bar-full"><div style="width:${cpu}%; background: ${cpu > 80 ? '#ef4444' : '#3b82f6'};"></div></div>
                    <div class="stat-subtext" title="${server.cpu_info || '-'}">${server.cpu_info || '-'}</div>
                  </div>
                  
                  <div class="stat-group">
                    <div class="stat-header"><span>内存</span><span style="color: ${ram > 80 ? '#ef4444' : 'inherit'};">${ram}%</span></div>
                    <div class="stat-bar-full"><div style="width:${ram}%; background: ${ram > 80 ? '#ef4444' : '#10b981'};"></div></div>
                    <div class="stat-subtext">${ramUsedStr} / ${ramTotalStr}</div>
                  </div>

                  <div class="stat-group">
                    <div class="stat-header"><span>存储</span><span style="color: ${disk > 80 ? '#ef4444' : 'inherit'};">${disk}%</span></div>
                    <div class="stat-bar-full"><div style="width:${disk}%; background: ${disk > 80 ? '#ef4444' : '#10b981'};"></div></div>
                    <div class="stat-subtext">${diskUsedStr} / ${diskTotalStr}</div>
                  </div>
                  
                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 2px;">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 5px;" title="${server.os || '-'} | ${server.arch || '-'} | ${server.virt || '-'}">${server.os || '-'} | ${server.arch || '-'} | ${server.virt || '-'}</div>
                    <div style="white-space: nowrap; flex-shrink: 0;">TCP/UDP: ${server.tcp_conn || '0'} / ${server.udp_conn || '0'}</div>
                  </div>
                  
                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 4px; white-space: nowrap; gap: 8px;">
                    <div style="overflow: hidden; text-overflow: ellipsis;"><span style="color:#10b981">↓</span> <span class="speed-anim" data-id="c-in-${server.id}" data-val="${netInSpeedRaw}">0 B/s</span></div>
                    <div style="overflow: hidden; text-overflow: ellipsis;"><span style="color:#3b82f6">↑</span> <span class="speed-anim" data-id="c-out-${server.id}" data-val="${netOutSpeedRaw}">0 B/s</span></div>
                  </div>
                </div>
              </a>
            `;

        tableBodyHtml += `
              <tr onclick="window.location.href='/?id=${server.id}'" style="cursor:pointer;" data-country="${cCode}">
                <td style="text-align:center;"><div class="status-dot" style="background:${statusColor}; display:inline-block; margin:0;"></div></td>
                <td><b>${server.name}</b></td>
                <td>${flagHtml}</td>
                <td><span class="os-text">${server.os || '-'} / ${server.arch || '-'} / ${server.virt || '-'}</span></td>
                <td style="min-width:100px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="stat-bar" style="width:50px; margin:0;"><div style="width:${cpu}%; background:#3b82f6;"></div></div>
                    <span>${cpu}%</span>
                  </div>
                </td>
                <td style="min-width:100px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="stat-bar" style="width:50px; margin:0;"><div style="width:${ram}%; background:#10b981;"></div></div>
                    <span>${ram}%</span>
                  </div>
                </td>
                <td style="min-width:100px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="stat-bar" style="width:50px; margin:0;"><div style="width:${disk}%; background:#10b981;"></div></div>
                    <span>${disk}%</span>
                  </div>
                </td>
                <td style="color:#64748b; font-size:12px; white-space: nowrap;">${rx_val_str} | ${tx_val_str}</td>
                <td style="white-space: nowrap;"><span class="speed-anim" data-id="t-in-${server.id}" data-val="${netInSpeedRaw}">0 B/s</span></td>
                <td style="white-space: nowrap;"><span class="speed-anim" data-id="t-out-${server.id}" data-val="${netOutSpeedRaw}">0 B/s</span></td>
                <td style="color:#64748b; font-size:12px; white-space: nowrap;">${Math.round((now - server.last_updated)/1000)} 秒前</td>
              </tr>
            `;
      }
      cardContentHtml += `</div>`;
    }
  }
  return { cardContentHtml, tableBodyHtml };
}
