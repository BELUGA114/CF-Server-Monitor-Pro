import { listServerStatus } from '../db/servers.js';
import { findSetting, saveSetting } from '../db/settings.js';
import { sendTelegram } from './telegram.js';

export const checkOfflineNodes = async (db, sys) => {
  if (sys.tg_notify !== 'true') return;
  try {
    const { results: allServers } = await listServerStatus(db);
    let alertState = {};
    const stateRes = await findSetting(db, 'alert_state');
    if (stateRes) alertState = JSON.parse(stateRes.value);

    let stateChanged = false;
    const now = Date.now();
    const alertThresMs = parseInt(sys.alert_threshold || '120') * 1000;

    for (const s of allServers) {
      const diff = now - s.last_updated;
      const isOffline = diff > alertThresMs;

      if (isOffline && !alertState[s.id]) {
        await sendTelegram(sys, `⚠️ <b>节点离线告警</b>\n\n<b>节点名称:</b> ${s.name}\n<b>状态:</b> 离线 (超过判定阈值未上报)\n<b>时间:</b> ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
        alertState[s.id] = true; stateChanged = true;
      } else if (!isOffline && alertState[s.id]) {
        await sendTelegram(sys, `✅ <b>节点恢复通知</b>\n\n<b>节点名称:</b> ${s.name}\n<b>状态:</b> 恢复在线\n<b>时间:</b> ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
        delete alertState[s.id]; stateChanged = true;
      }
    }
    if (stateChanged) await saveSetting(db, 'alert_state', JSON.stringify(alertState));
  } catch (e) {}
};
