import { listSettings, saveSetting, listAgentSettings } from '../db/settings.js';

export async function loadSettings(db) {
  let sys = {
    site_title: '⚡ Server Monitor Pro', admin_title: '⚙️ 探针管理后台', theme: 'theme1',
    custom_bg: '', custom_css: '', custom_head: '', custom_script: '',
    is_public: 'true', show_price: 'true', show_expire: 'true', show_bw: 'true', show_tf: 'true', show_admin_btn: 'true',
    admin_path: '/admin', asset_currency: '元', tg_notify: 'false', tg_bot_token: '', tg_chat_id: '',
    auto_reset_traffic: 'false', report_interval: '5', ping_node_ct: 'default', ping_node_cu: 'default', ping_node_cm: 'default',
    offline_threshold: '30', alert_threshold: '120',
    enable_popup: 'false', popup_content: '<h3>📢 公告</h3><p>欢迎来到 Server Monitor Pro！<br>这是自定义弹窗内容，支持 HTML 排版。</p>'
  };

  try {
    const { results } = await listSettings(db);
    if (results && results.length > 0) results.forEach(r => sys[r.key] = r.value);
  } catch (e) {}

  if (!sys.admin_path) sys.admin_path = '/admin';
  if (!sys.admin_path.startsWith('/')) sys.admin_path = '/' + sys.admin_path;
  return sys;
}

export async function updateSetting(db, sys, key, value) {
  await saveSetting(db, key, value);
  sys[key] = value;
}

export async function saveSettings(db, settings) {
  for (const [key, value] of Object.entries(settings)) {
    await saveSetting(db, key, value);
  }
}

export const getAgentConfig = async (db) => {
  let reportInterval = '5'; let pingCt = 'default'; let pingCu = 'default'; let pingCm = 'default';
  try {
    const res = await listAgentSettings(db);
    if (res && res.results) {
      res.results.forEach(r => {
          if (r.key === 'report_interval') reportInterval = r.value || '5';
          if (r.key === 'ping_node_ct') pingCt = r.value || 'default';
          if (r.key === 'ping_node_cu') pingCu = r.value || 'default';
          if (r.key === 'ping_node_cm') pingCm = r.value || 'default';
      });
    }
  } catch(e) {}
  return { reportInterval, pingCt, pingCu, pingCm };
}
