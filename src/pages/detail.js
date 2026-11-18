import { formatBytes, getFooterHtml } from './shared.js';
import { renderDetailStyles } from './styles/detail.js';
import { renderDetailScript } from './scripts/detail.js';

export function renderDetailPage(server, sys, themeStyles, idParam) {
  const offlineThresMs = parseInt(sys.offline_threshold || '30') * 1000;
  const cCode = (server.country || 'xx').toLowerCase();
  const flagHtml = cCode !== 'xx' ? `<img src="https://flagcdn.com/24x18/${cCode}.png" alt="${cCode}" style="vertical-align: middle; margin-right: 8px; border-radius: 3px;">` : '🏳️';
  const isOnline = (Date.now() - server.last_updated) < offlineThresMs;
  const statusHtml = isOnline ? '<span style="background:#10b981; color:white; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:bold;">在线</span>' : '<span style="background:#ef4444; color:white; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:bold;">离线</span>';

  const detailHtml = `<!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${server.name} - ${sys.site_title}</title>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg">
          <link rel="icon" href="/favicon.ico" sizes="32x32">
          <link rel="apple-touch-icon" href="/apple-touch-icon.png">
          ${sys.custom_head || ''}
${renderDetailStyles(themeStyles)}
        </head>
        <body class="${sys.theme || 'theme1'}">
          <div class="container" style="max-width: 1200px; margin: 0 auto; padding: 20px;">
            <div style="margin-bottom: 20px;">
              <a href="/" style="color: #3b82f6; text-decoration: none; font-weight: bold; font-size: 16px; display:inline-flex; align-items:center;">← 返回大盘</a>
            </div>
            
            <div class="header-card" style="padding: 25px; border-radius: 12px; margin-bottom: 20px;">
              <div style="font-size: 24px; font-weight: bold; margin-bottom: 20px; display: flex; align-items: center;">
                ${flagHtml} ${server.name} ${statusHtml}
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px;">
                <div><div class="stat-label">运行时间</div><div class="stat-val" id="d-uptime">${server.uptime || '-'}</div></div>
                <div><div class="stat-label">架构</div><div class="stat-val" id="d-arch">${server.arch || '-'}</div></div>
                <div><div class="stat-label">系统</div><div class="stat-val" id="d-os">${server.os || '-'}</div></div>
                <div><div class="stat-label">虚拟化</div><div class="stat-val" id="d-virt">${server.virt || '-'}</div></div>
                <div><div class="stat-label">Load</div><div class="stat-val" id="d-load">${server.load_avg || '-'}</div></div>
                <div><div class="stat-label">上传 / 下载</div><div class="stat-val"><span id="d-tx">${formatBytes(server.net_tx)}</span> / <span id="d-rx">${formatBytes(server.net_rx)}</span></div></div>
                <div><div class="stat-label">启动时间</div><div class="stat-val" id="d-boot">${server.boot_time || '-'}</div></div>
                <div><div class="stat-label">CPU</div><div class="stat-val" id="d-cpuinfo">${server.cpu_info || '-'}</div></div>
              </div>
            </div>

            <div class="detail-grid">
              <div class="chart-card" style="padding: 20px; border-radius: 12px; position: relative;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">CPU</span><span id="txt-cpu" class="stat-val" style="font-weight:bold;">0%</span>
                 </div>
                 <div style="height: 180px;"><canvas id="chart-cpu"></canvas></div>
              </div>
              
              <div class="chart-card" style="padding: 20px; border-radius: 12px; position: relative;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">内存</span><span id="txt-ram" class="stat-val" style="font-weight:bold;">0%</span>
                 </div>
                 <div style="font-size: 12px; color: #888; position: absolute; top: 45px; left: 20px;">Swap: <span id="txt-swap">0 / 0</span></div>
                 <div style="height: 180px;"><canvas id="chart-ram"></canvas></div>
              </div>

              <div class="chart-card" style="padding: 20px; border-radius: 12px; position: relative;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                   <span class="card-title" style="font-weight:bold;">磁盘</span><span id="txt-disk" class="stat-val" style="font-weight:bold;">0%</span>
                 </div>
                 <div class="stat-bar-full" style="height: 24px; border-radius: 12px; background: rgba(150,150,150,0.1); border: 1px solid rgba(150,150,150,0.2); overflow: hidden;">
                    <div id="bar-disk" style="height: 100%; border-radius: 12px; background: #3b82f6; width: 0%; transition: width 0.5s;"></div>
                 </div>
                 <div style="text-align: right; font-size: 13px; color: #888; margin-top: 15px;" id="txt-disk-detail">0 / 0</div>
              </div>

              <div class="chart-card" style="padding: 20px; border-radius: 12px; position: relative;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">进程数</span><span id="txt-proc" class="stat-val" style="font-weight:bold;">0</span>
                 </div>
                 <div style="height: 180px;"><canvas id="chart-proc"></canvas></div>
              </div>

              <div class="chart-card" style="padding: 20px; border-radius: 12px; position: relative;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">网络速度</span><span class="stat-val" style="font-weight:bold;"><span style="color:#10b981;">↓</span> <span id="txt-net-in">0 B/s</span> | <span style="color:#3b82f6;">↑</span> <span id="txt-net-out">0 B/s</span></span>
                 </div>
                 <div style="height: 180px;"><canvas id="chart-net"></canvas></div>
              </div>

              <div class="chart-card" style="padding: 20px; border-radius: 12px; position: relative;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">TCP / UDP</span><span class="stat-val" style="font-weight:bold;">TCP <span id="txt-tcp">0</span> | UDP <span id="txt-udp">0</span></span>
                 </div>
                 <div style="height: 180px;"><canvas id="chart-conn"></canvas></div>
              </div>

              <div class="chart-card chart-full" style="padding: 20px; border-radius: 12px; position: relative; grid-column: 1 / -1;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">三网延迟 (ms)</span>
                 </div>
                 <div style="height: 250px;"><canvas id="chart-ping"></canvas></div>
              </div>

              <div class="chart-card chart-full" style="padding: 20px; border-radius: 12px; position: relative; grid-column: 1 / -1;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">三网丢包 (%)</span>
                 </div>
                 <div style="height: 250px;"><canvas id="chart-loss"></canvas></div>
              </div>
            </div>
            
            ${getFooterHtml(sys)}
          </div>

          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
${renderDetailScript(idParam)}
          ${sys.custom_script || ''}
        </body>
        </html>`;
  return detailHtml;
}
