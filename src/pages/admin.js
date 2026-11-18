import { getCommands } from '../agents/commands.js';
import { getFooterHtml } from './shared.js';
import { renderAdminStyles } from './styles/admin.js';
import { renderAdminScript } from './scripts/admin.js';

export function renderAdminPage(results, sys, cachedNodes, availableThemes, host, apiSecret) {
  const currentThemeObj = availableThemes.find(t => t.id === sys.theme) || availableThemes[0];
  const now = Date.now();
  const offlineThresMs = parseInt(sys.offline_threshold || '30') * 1000;

  let trs = '';
  if (results && results.length > 0) {
    for (const s of results) {
      const isOnline = (now - s.last_updated) < offlineThresMs;
      const status = isOnline ? '<span style="color:green; font-weight:bold;">在线</span>' : '<span style="color:red; font-weight:bold;">离线</span>';
      const hiddenBadge = s.is_hidden === 'true' ? '<span style="background:#64748b; color:white; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:5px;">已隐藏</span>' : '';

      const cmds = getCommands(s, host, apiSecret);
      const cmd = cmds.cmd; const unCmd = cmds.unCmd; const osType = cmds.osType;

      trs += `
            <tr>
              <td>${s.name} ${hiddenBadge}</td>
              <td>${s.server_group || '默认分组'}</td>
              <td><span style="background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; font-size:12px;">${osType}</span></td>
              <td>${status}</td>
              <td>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; align-items:center; gap:5px;">
                    <input type="text" readonly value='${cmd}' style="width:200px; padding:6px; border:1px solid #ccc; border-radius:4px;" id="cmd-${s.id}">
                    <button onclick="copyCmd('${s.id}')" class="btn btn-green" style="white-space:nowrap;">复制安装</button>
                    <input type="hidden" id="uncmd-${s.id}" value='${unCmd}'>
                    <button onclick="copyUnCmd('${s.id}')" class="btn btn-gray" style="white-space:nowrap;">一键卸载</button>
                  </div>
                  <div style="display:flex; gap:5px;">
                    <button onclick="openEditModal('${s.id}', '${s.name}', '${s.server_group||''}', '${s.price||''}', '${s.expire_date||''}', '${s.bandwidth||''}', '${s.traffic_limit||''}', '${osType}', '${s.is_hidden||'false'}', '${s.reset_day||'1'}')" class="btn btn-blue" style="white-space:nowrap;">✏️ 编辑信息</button>
                    <button onclick="deleteServer('${s.id}')" class="btn btn-red" style="white-space:nowrap;">🗑️ 删除节点</button>
                  </div>
                </div>
              </td>
            </tr>
          `;
    }
  }

  let pingOpts = { ct: [], cu: [], cm: [] };
  if (cachedNodes) {
    if (cachedNodes.ct) pingOpts.ct = cachedNodes.ct;
    if (cachedNodes.cu) pingOpts.cu = cachedNodes.cu;
    if (cachedNodes.cm) pingOpts.cm = cachedNodes.cm;
  }
  const buildOpts = (group, selectedVal) => {
    let opts = `<option value="default" ${selectedVal === 'default' ? 'selected' : ''}>默认节点 (双栈多节点轮询)</option>`;
    group.forEach(n => { opts += `<option value="${n.host}" ${selectedVal === n.host ? 'selected' : ''}>${n.name}</option>`; });
    return opts;
  };

  let themeSelectOptions = '';
  availableThemes.forEach(t => {
      themeSelectOptions += `<option value="${t.id}" data-custom="${t.has_custom_css ? 'true' : 'false'}" ${sys.theme === t.id ? 'selected' : ''}>${t.name}</option>`;
  });

  const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${sys.admin_title}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <link rel="icon" href="/favicon.ico" sizes="32x32">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
${renderAdminStyles()}
      </head>
      <body>
        <div class="card">
          <h2>🛠️ 全局设置与高级自定义</h2>
          <div class="settings-grid">
            <div>
              <div class="form-group">
                <label>🎨 前端主题风格 <button onclick="pullGithubNodes(event)" type="button" class="btn btn-green" style="margin-left:10px; font-size:12px; padding:3px 8px;">🔄 手动更新测速/主题数据</button></label>
                <select id="cfg_theme" onchange="toggleCustomCss()">
                  ${themeSelectOptions}
                </select>
              </div>
              <div class="form-group" id="custom_css_group" style="display: ${currentThemeObj.has_custom_css || sys.theme === 'theme6' ? 'flex' : 'none'};">
                <label>🧑‍💻 自定义 CSS 代码</label>
                <textarea id="cfg_custom_css" rows="5" placeholder="body.theme6 { background: #000; } ...">${sys.custom_css || ''}</textarea>
              </div>
              <div class="form-group">
                <label>🧑‍💻 自定义 &lt;head&gt; 注入 (引入字体/外部CSS等)</label>
                <textarea id="cfg_custom_head" rows="3" placeholder="&lt;link rel='stylesheet' href='...'&gt;">${sys.custom_head || ''}</textarea>
              </div>
              <div class="form-group">
                <label>🧑‍💻 自定义底部 Script 注入 (可执行任意 JS, 接管页面渲染)</label>
                <textarea id="cfg_custom_script" rows="4" placeholder="&lt;script&gt;console.log('Hello');&lt;/script&gt;">${sys.custom_script || ''}</textarea>
              </div>
              <div class="form-group">
                <label>🖼️ 自定义背景图片 (上传或填URL，开启后强制全透明)</label>
                <div style="display:flex; gap:8px;">
                   <input type="text" id="cfg_custom_bg" value="${sys.custom_bg || ''}" placeholder="粘贴图片 URL 或 点击上传" style="flex:1;">
                   <input type="file" id="bg_file" accept="image/*" style="display:none;" onchange="uploadBg(this)">
                   <button class="btn btn-gray" onclick="document.getElementById('bg_file').click()">📁 本地上传</button>
                </div>
                <img id="bg_preview" src="${sys.custom_bg || ''}" style="max-height: 120px; margin-top: 10px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); display: ${sys.custom_bg ? 'block' : 'none'}; object-fit: cover;">
              </div>
              <div class="form-group">
                <label>前台看板标题</label>
                <input type="text" id="cfg_site_title" value="${sys.site_title}">
              </div>
              <div class="form-group">
                <label>后台标签栏名称</label>
                <input type="text" id="cfg_admin_title" value="${sys.admin_title}">
              </div>
              <div class="form-group">
                <label>⏱️ Agent 上报间隔 (秒)</label>
                <input type="number" id="cfg_report_interval" value="${sys.report_interval || '5'}" min="1" max="120" placeholder="默认 5 秒">
              </div>
              <div class="form-group">
                <label>⏱️ 前台判定离线时间 (秒)</label>
                <input type="number" id="cfg_offline_threshold" value="${sys.offline_threshold || '30'}" min="5" placeholder="默认 30 秒 (即多少秒未上报判定为离线)">
              </div>
              <div class="form-group">
                <label>⏱️ TG掉线告警阈值 (秒)</label>
                <input type="number" id="cfg_alert_threshold" value="${sys.alert_threshold || '120'}" min="10" placeholder="默认 120 秒 (即超过多少秒不报才推TG)">
              </div>
              
              <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #d97706;">📢 首页弹窗公告设置</label>
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_enable_popup" ${sys.enable_popup === 'true' ? 'checked' : ''} onchange="document.getElementById('popup_content_group').style.display = this.checked ? 'block' : 'none'">
                <label for="cfg_enable_popup"><b>开启访客首次访问弹窗</b> (按IP和浏览器缓存控制)</label>
              </div>
              <div class="form-group" id="popup_content_group" style="display: ${sys.enable_popup === 'true' ? 'block' : 'none'}; margin-top: 10px;">
                <label>📝 弹窗显示内容 (支持 HTML)</label>
                <textarea id="cfg_popup_content" rows="5" placeholder="<h3>公告</h3><p>自定义内容...</p>">${sys.popup_content || ''}</textarea>
              </div>
            </div>
            <div>
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #555;">👁️ 前台展示控制</label>
              
              <div class="checkbox-group" style="background:#fefce8; padding:8px; border-radius:6px; border:1px solid #fef08a; margin-bottom:15px;">
                <input type="checkbox" id="cfg_auto_reset_traffic" ${sys.auto_reset_traffic === 'true' ? 'checked' : ''}>
                <label for="cfg_auto_reset_traffic"><b>启用流量按期重置 (全局总控开关)</b><br><span style="font-size:12px;color:#854d0e;font-weight:normal;">开启后，各节点将根据其独立设置的「重置日」自动清零流量。若关闭，则所有节点仅显示累计总流量。二者完美协同，不会冲突。</span></label>
              </div>

              <div class="checkbox-group"><input type="checkbox" id="cfg_is_public" ${sys.is_public === 'true' ? 'checked' : ''}><label for="cfg_is_public"><b>公开访问</b> (取消勾选后，访客必须输入密码才能查看探针)</label></div>
              <div class="checkbox-group"><input type="checkbox" id="cfg_show_price" ${sys.show_price === 'true' ? 'checked' : ''}><label for="cfg_show_price">在前台显示 <b>价格</b></label></div>
              <div class="checkbox-group"><input type="checkbox" id="cfg_show_expire" ${sys.show_expire === 'true' ? 'checked' : ''}><label for="cfg_show_expire">在前台显示 <b>到期时间</b></label></div>
              <div class="checkbox-group"><input type="checkbox" id="cfg_show_bw" ${sys.show_bw === 'true' ? 'checked' : ''}><label for="cfg_show_bw">在前台显示 <b>带宽徽章</b></label></div>
              <div class="checkbox-group"><input type="checkbox" id="cfg_show_tf" ${sys.show_tf === 'true' ? 'checked' : ''}><label for="cfg_show_tf">在前台显示 <b>流量配额徽章</b></label></div>
              
              <hr style="margin: 15px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #0284c7;">⚙️ 安全与路由控制</label>
              <div class="form-group" style="margin-bottom: 10px;">
                <label>后台管理路径 (默认: /admin)</label>
                <input type="text" id="cfg_admin_path" value="${sys.admin_path}" placeholder="例如: /xiaok-panel">
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_show_admin_btn" ${sys.show_admin_btn === 'true' ? 'checked' : ''}>
                <label for="cfg_show_admin_btn">在前台大盘显示 <b>探针管理后台</b> 按钮 (取消勾选即可隐藏入口)</label>
              </div>
              <div class="form-group" style="margin-left: 0px; margin-top: -5px; margin-bottom: 5px;">
                <label style="font-size: 12px;">资产货币展示单位 (默认：元)</label>
                <input type="text" id="cfg_asset_currency" value="${sys.asset_currency || '元'}" style="width: 120px; padding: 6px;">
              </div>

              <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #e63946;">✈️ Telegram 机器人管理与告警</label>
              <p style="font-size: 12px; color: #666; margin-top: -5px; margin-bottom: 10px;">填写下方信息并保存后，将在机器人内解锁<b>交互式控制面板</b> (发 <code>/menu</code>) 并自动开通节点离线通知。由于机制原因修改保存后会自动绑定 Webhook。</p>
              <div class="form-group">
                <label>开启状态</label>
                <select id="cfg_tg_notify">
                  <option value="false" ${sys.tg_notify !== 'true' ? 'selected' : ''}>关闭告警 (仅使用机器人管理功能)</option>
                  <option value="true" ${sys.tg_notify === 'true' ? 'selected' : ''}>开启告警与管理 (掉线自动推送)</option>
                </select>
              </div>
              <div class="form-group"><label>Bot Token</label><input type="text" id="cfg_tg_bot_token" value="${sys.tg_bot_token || ''}" placeholder="如: 12345678:ABCDEFG..."></div>
              <div class="form-group"><label>Chat ID</label><input type="text" id="cfg_tg_chat_id" value="${sys.tg_chat_id || ''}" placeholder="如: 123456789"></div>

              <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #8b5cf6;">📡 三网延迟与丢包测试节点选择 (动态下发更新)</label>
              <div class="form-group"><label>电信 (CT) 测速节点</label><select id="cfg_ping_node_ct">${buildOpts(pingOpts.ct, sys.ping_node_ct)}</select></div>
              <div class="form-group"><label>联通 (CU) 测速节点</label><select id="cfg_ping_node_cu">${buildOpts(pingOpts.cu, sys.ping_node_cu)}</select></div>
              <div class="form-group"><label>移动 (CM) 测速节点</label><select id="cfg_ping_node_cm">${buildOpts(pingOpts.cm, sys.ping_node_cm)}</select></div>
              <div style="font-size: 12px; color: #888; margin-top: -4px;">丢包依赖 ICMP。少数节点不回 ICMP(如北京电信、北京联通),选中后丢包会恒显示 100%,默认节点已改为上海。</div>
            </div>
          </div>
          <button onclick="saveSettings()" class="btn btn-blue" style="padding: 10px 20px; font-size: 15px;">💾 保存全局设置</button>
        </div>

        <div class="card">
          <h2>${sys.admin_title} - 节点列表</h2>
          <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
            <input type="text" id="newName" placeholder="输入新服务器名称" style="padding: 8px; width: 180px; border:1px solid #ccc; border-radius:4px;">
            <select id="newOs" style="padding: 8px; border:1px solid #ccc; border-radius:4px; margin-right:5px; background: white;">
              <option value="debian">Linux (Systemd)</option>
              <option value="alpine">Alpine (OpenRC)</option>
              <option value="windows">Windows (PowerShell)</option>
            </select>
            <button onclick="addServer()" class="btn btn-blue" style="padding: 9px 15px;">+ 添加新服务器</button>
            <a href="/" style="margin-left: auto; color: #3b82f6; text-decoration: none; font-weight:bold;">👉 前往大盘预览</a>
          </div>
          <table>
            <tr><th>节点名称</th><th>分组</th><th>系统环境</th><th>在线状态</th><th>操作 (复制命令并在 VPS 执行)</th></tr>
            ${trs || '<tr><td colspan="5" style="text-align:center; padding: 30px; color:#666;">暂无服务器，请在上方添加</td></tr>'}
          </table>
        </div>

        <div id="editModal" class="modal">
          <div class="modal-content">
            <h3 style="margin-top:0;">✏️ 编辑服务器信息</h3>
            <input type="hidden" id="editId">
            <label>节点名称</label> <input type="text" id="editName" placeholder="如：香港 CN2">
            <label>前台可见性</label> 
            <select id="editHidden" style="background: white;">
              <option value="false">显示 (默认)</option>
              <option value="true">隐藏 (不在前台大盘展示)</option>
            </select>
            <label>服务器系统环境</label> 
            <select id="editOs" style="background: white;">
              <option value="debian">Linux (Debian/Ubuntu/CentOS/Systemd)</option>
              <option value="alpine">Alpine Linux (OpenRC/Ash)</option>
              <option value="windows">Windows (PowerShell)</option>
            </select>
            <label>分组名称</label> <input type="text" id="editGroup" placeholder="如：美国 VPS">
            <label>价格 (支持外币识别如: 10USD/月, 5EUR/年)</label> <input type="text" id="editPrice" placeholder="如：10USD/Year 或 免费">
            <label>到期时间</label> <input type="date" id="editExpire">
            <label>每月流量重置日 (1-31) <span style="font-size: 12px; color: #ef4444; font-weight: normal;">(需在左侧开启全局重置总控)</span></label>
            <input type="number" id="editResetDay" placeholder="1" min="1" max="31">
            <label>带宽 (前端徽章)</label> <input type="text" id="editBandwidth" placeholder="如：1Gbps 或 200Mbps">
            <label>流量总量 (前端徽章)</label> <input type="text" id="editTraffic" placeholder="如：1TB/月">
            <div style="text-align: right; margin-top: 10px;">
              <button onclick="closeModal()" style="padding: 8px 15px; border: 1px solid #ccc; background: white; margin-right: 5px; cursor:pointer;">取消</button>
              <button onclick="saveEdit()" class="btn btn-blue" style="padding: 8px 15px;">保存更改</button>
             </div>
          </div>
        </div>
        
        ${getFooterHtml(sys)}

${renderAdminScript(sys)}
      </body>
      </html>`;
  return html;
}
