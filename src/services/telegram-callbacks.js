import { findServer, listServerStatus, deleteServer } from '../db/servers.js';
import { getCommands } from '../agents/commands.js';
import { updateSetting } from './settings.js';
import { mainMenuText, mainMenuKb, generateSettingsKb, generateThemeKb } from './telegram-menu.js';

export async function handleTelegramCallback({ db, sys, host, apiSecret, availableThemes, chatId, text, msgId, tgSend, tgEdit }) {
  if (text === 'cb_menu') {
    await tgEdit(chatId, msgId, mainMenuText, mainMenuKb);
  }
  else if (text === 'cb_list_nodes') {
    const { results } = await listServerStatus(db);
    let kb = { inline_keyboard: [] };
    if (results.length === 0) {
      await tgEdit(chatId, msgId, '暂无节点。请发送 <code>/add 节点名 debian</code> 来添加。', {inline_keyboard: [[{text: '🔙 返回主菜单', callback_data: 'cb_menu'}]]});
    } else {
      const now = Date.now();
      const offlineThresMs = parseInt(sys.offline_threshold || '30') * 1000;
      for (const s of results) {
        const isOnline = (now - s.last_updated) < offlineThresMs;
        const statusIcon = isOnline ? '🟢' : '🔴';
        kb.inline_keyboard.push([{text: `${statusIcon} ${s.name}`, callback_data: `cb_node_${s.id}`}]);
      }
      kb.inline_keyboard.push([{text: '🔙 返回主菜单', callback_data: 'cb_menu'}]);
      await tgEdit(chatId, msgId, '📋 <b>选择一个节点进行管理：</b>', kb);
    }
  }
  else if (text.startsWith('cb_node_')) {
    const id = text.split('_')[2];
    const s = await findServer(db, id);
    if (s) {
      const nodeText = `🖥 <b>节点详情:</b> ${s.name}\n\n<b>系统:</b> ${s.agent_os || '未知'}\n<b>分组:</b> ${s.server_group}\n<b>在线时间:</b> ${s.uptime}\n<b>最后更新:</b> ${Math.round((Date.now() - s.last_updated)/1000)}秒前\n\n请选择操作：`;
      const kb = {
        inline_keyboard: [
          [{text: '💻 安装命令', callback_data: `cb_cmd_${id}`}, {text: '🗑️ 卸载命令', callback_data: `cb_uncmd_${id}`}],
          [{text: '✏️ 快速编辑说明', callback_data: `cb_edithelp_${id}`}, {text: '❌ 删除此节点', callback_data: `cb_del_${id}`}],
          [{text: '🔙 返回列表', callback_data: 'cb_list_nodes'}]
        ]
      };
      await tgEdit(chatId, msgId, nodeText, kb);
    } else {
      await tgEdit(chatId, msgId, '❌ 节点不存在或已删除。', {inline_keyboard: [[{text: '🔙 返回', callback_data: 'cb_list_nodes'}]]});
    }
  }
  else if (text.startsWith('cb_cmd_')) {
    const id = text.split('_')[2];
    const s = await findServer(db, id);
    if (s) {
      const cmds = getCommands(s, host, apiSecret);
      await tgSend(chatId, `💻 <b>${s.name}</b> 的安装命令：\n\n<code>${cmds.cmd}</code>\n\n<i>(点击上方代码块自动复制，前往 VPS 终端执行)</i>`);
    }
  }
  else if (text.startsWith('cb_uncmd_')) {
    const id = text.split('_')[2];
    const s = await findServer(db, id);
    if (s) {
      const cmds = getCommands(s, host, apiSecret);
      await tgSend(chatId, `🗑️ <b>${s.name}</b> 的卸载命令：\n\n<code>${cmds.unCmd}</code>\n\n<i>(点击自动复制，执行后可完全清理探针残留)</i>`);
    }
  }
  else if (text.startsWith('cb_edithelp_')) {
    const id = text.split('_')[2];
    await tgSend(chatId, `✏️ <b>如何编辑节点？</b>\n\n请直接回复本机器人以下格式的命令（保留空格）：\n\n<code>/edit ${id} 新名称 新分组</code>\n\n例如：\n<code>/edit ${id} 香港CN2 生产环境</code>`);
  }
  else if (text.startsWith('cb_del_')) {
    const id = text.split('_')[2];
    await deleteServer(db, id);
    await tgEdit(chatId, msgId, '✅ 节点已成功删除！', {inline_keyboard: [[{text: '🔙 返回列表', callback_data: 'cb_list_nodes'}]]});
  }
  else if (text === 'cb_settings') {
    await tgEdit(chatId, msgId, '⚙️ <b>全局设置控制开关</b>\n点击按钮立即切换前台展示状态：', generateSettingsKb(sys));
  }
  else if (text.startsWith('cb_toggle_')) {
    const key = text.replace('cb_toggle_', '');
    const newVal = sys[key] === 'true' ? 'false' : 'true';
    await updateSetting(db, sys, key, newVal);
    await tgEdit(chatId, msgId, '⚙️ <b>全局设置控制开关</b>\n点击按钮立即切换前台展示状态：', generateSettingsKb(sys));
  }
  else if (text === 'cb_theme_menu') {
    await tgEdit(chatId, msgId, '🎨 <b>选择前端主题风格：</b>', generateThemeKb(sys, availableThemes));
  }
  else if (text.startsWith('cb_set_theme_')) {
    const themeVal = text.replace('cb_set_theme_', '');
    await updateSetting(db, sys, 'theme', themeVal);
    await tgEdit(chatId, msgId, '🎨 <b>选择前端主题风格：</b>\n✅ 主题已切换！刷新前台可见。', generateThemeKb(sys, availableThemes));
  }
}
