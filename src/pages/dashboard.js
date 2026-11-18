import { formatBytes, getFooterHtml } from './shared.js';
import { renderServerCardsAndTable } from './components/servers.js';
import { renderDashboardStyles } from './styles/dashboard.js';
import { renderDashboardScript } from './scripts/dashboard.js';

export function renderDashboardPage(sys, themeStyles, data, clientIP) {
  const { now, offlineThresMs, globalOnline, globalOffline, globalSpeedIn, globalSpeedOut, globalNetTx, globalNetRx, visibleAsset, visibleRemAsset, visibleServersCount, groups, countryStats } = data;
  let filterTagsHtml = `<span class="filter-tag" data-code="all" onclick="setFilter('all')">全部 ${visibleServersCount}</span>`;
  for (const [code, count] of Object.entries(countryStats)) {
    filterTagsHtml += `<span class="filter-tag" data-code="${code.toLowerCase()}" onclick="setFilter('${code.toLowerCase()}')"><img src="https://flagcdn.com/16x12/${code.toLowerCase()}.png" alt="${code}"> ${code} ${count}</span>`;
  }
  const { cardContentHtml, tableBodyHtml } = renderServerCardsAndTable(groups, sys, now, offlineThresMs);
  const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${sys.site_title}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <link rel="icon" href="/favicon.ico" sizes="32x32">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
        <script id="map-data" type="application/json">${JSON.stringify(countryStats)}</script>
        ${sys.custom_head || ''}
${renderDashboardStyles(themeStyles)}
      </head>
      <body class="${sys.theme || 'theme1'}">
        <div class="container" id="app-container">
          
          <div class="header" style="flex-wrap: wrap; gap: 15px;">
            <h1 style="margin:0;">${sys.site_title}</h1>
            
            <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
              <div class="view-controls">
                <button class="toggle-btn active" id="btn-card" onclick="switchView('card')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> 卡片
                </button>
                <button class="toggle-btn" id="btn-table" onclick="switchView('table')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg> 表格
                </button>
                <button class="toggle-btn" id="btn-map" onclick="switchView('map')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg> 地图
                </button>
              </div>
              ${sys.show_admin_btn === 'true' ? `<a href="${sys.admin_path}" class="admin-btn">${sys.admin_title}</a>` : ''}
            </div>
          </div>

          <div class="filter-bar" id="ajax-filters">
            ${filterTagsHtml}
          </div>

          <div class="global-stats" id="ajax-stats">
            <div class="stats-row top-row">
              <div class="g-item">
                <div class="g-label">本机服务器总数</div>
                <div class="g-val">${visibleServersCount}</div>
                <div class="g-sub">在线 <span style="color:#10b981">${globalOnline}</span> | 离线 <span style="color:#ef4444">${globalOffline}</span></div>
              </div>

              <div class="g-item">
                <div class="g-label">本机可见数字资产 (${sys.asset_currency || '元'})</div>
                <div class="g-val">${visibleAsset.toFixed(2)} <span style="font-size:16px;color:#888;">总</span> | ${visibleRemAsset.toFixed(2)} <span style="font-size:16px;color:#888;">余</span></div>
              </div>
            </div>
            
            <div class="stats-row bottom-row">
              <div class="g-item">
                <div class="g-label">实时网速 (入 | 出)</div>
                <div class="g-val"><span style="color:#10b981">↓</span> <span class="speed-anim" data-id="g-in" data-val="${globalSpeedIn}">0 B/s</span> | <span style="color:#3b82f6">↑</span> <span class="speed-anim" data-id="g-out" data-val="${globalSpeedOut}">0 B/s</span></div>
              </div>

              <div class="g-item">
                <div class="g-label">本机流量 (入 | 出) ${sys.auto_reset_traffic === 'true' ? '<span style="font-size:10px; color:#c2410c;">(按期)</span>' : ''}</div>
                <div class="g-val">${formatBytes(globalNetRx)} | ${formatBytes(globalNetTx)}</div>
              </div>
            </div>
          </div>

          <div id="view-card" class="view-panel active">
             <div id="ajax-cards">${cardContentHtml}</div>
          </div>

          <div id="view-table" class="view-panel">
            <div class="table-responsive">
              <table class="custom-table">
                <thead>
                  <tr><th>状态</th><th>节点名称</th><th>地区</th><th>系统/架构/虚拟化</th><th>CPU</th><th>内存</th><th>磁盘</th><th>流量(入|出)</th><th>下行</th><th>上行</th><th>更新</th></tr>
                </thead>
                <tbody id="ajax-table">
                  ${tableBodyHtml || '<tr><td colspan="11" style="text-align:center;">暂无数据</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div id="view-map" class="view-panel">
            <div id="map-container"></div>
          </div>

          ${sys.enable_popup === 'true' ? `
          <div id="welcome-popup" class="modal" style="z-index: 9999;">
            <div class="modal-content" style="max-width: 550px; padding: 30px; text-align: center; border-radius: 16px;">
              <div style="text-align: left; line-height: 1.6; font-size: 15px; color: inherit; max-height: 60vh; overflow-y: auto; padding-right: 5px;">
                  ${sys.popup_content || ''}
              </div>
              <div style="margin-top: 25px; text-align: center;">
                <button onclick="closeWelcomePopup()" class="btn btn-blue" style="padding: 10px 30px; font-size: 16px; border-radius: 8px;">我已知晓</button>
              </div>
            </div>
          </div>
          <script>
            document.addEventListener('DOMContentLoaded', () => {
              const currentIP = "${clientIP}";
              const lastSeenIP = localStorage.getItem('popup_seen_ip');
              if (lastSeenIP !== currentIP) {
                 document.getElementById('welcome-popup').style.display = 'block';
              }
            });
            function closeWelcomePopup() {
              localStorage.setItem('popup_seen_ip', "${clientIP}");
              document.getElementById('welcome-popup').style.display = 'none';
            }
          </script>
          ` : ''}
          
          ${getFooterHtml(sys)}
        </div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
        
${renderDashboardScript()}
        ${sys.custom_script || ''}
      </body>
      </html>`;
  return html;
}
