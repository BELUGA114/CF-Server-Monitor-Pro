import { findServer, renameServer, deleteServer } from '../db/servers.js';
import { getCommands } from '../agents/commands.js';
import { addServer } from './servers.js';
import { updateSetting } from './settings.js';
import { mainMenuText, mainMenuKb } from './telegram-menu.js';

export async function handleTelegramCommand({ db, sys, host, apiSecret, chatId, text, tgSend }) {
  const cmdParts = text.trim().split(/\s+/);
  const cmd = cmdParts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/menu') {
    await tgSend(chatId, mainMenuText, mainMenuKb);
  }
  else if (cmd === '/add') {
    if (cmdParts.length < 3) {
      await tgSend(chatId, '❌ <b>格式错误</b>\n正确用法: <code>/add &lt;名称&gt; &lt;系统&gt;</code>\n系统可选: debian / alpine / windows\n\n例: <code>/add 香港VPS debian</code>');
    } else {
      const name = cmdParts[1];
      const agentOs = cmdParts[2].toLowerCase();
      const id = await addServer(db, name, agentOs);

      const newS = await findServer(db, id);
      const cmds = getCommands(newS, host, apiSecret);
      await tgSend(chatId, `✅ <b>节点添加成功！</b>\n名称: ${name}\n系统: ${agentOs}\n\n💻 <b>一键安装命令：</b>\n<code>${cmds.cmd}</code>\n\n<i>去服务器执行此命令即可上线。</i>`);
    }
  }
  else if (cmd === '/edit') {
    if (cmdParts.length < 4) {
      await tgSend(chatId, '❌ <b>格式错误</b>\n正确用法: <code>/edit &lt;ID&gt; &lt;新名称&gt; &lt;分组&gt;</code>');
    } else {
      const id = cmdParts[1];
      const newName = cmdParts[2];
      const newGroup = cmdParts[3];
      await renameServer(db, id, newName, newGroup);
      await tgSend(chatId, `✅ 节点信息已更新！\n新名称: ${newName}\n新分组: ${newGroup}`);
    }
  }
  else if (cmd === '/del') {
    if (cmdParts.length < 2) return;
    await deleteServer(db, cmdParts[1]);
    await tgSend(chatId, '✅ 节点已删除。');
  }
  else if (cmd === '/set_interval') {
    const v = parseInt(cmdParts[1]);
    if (v && v >= 1) {
      await updateSetting(db, sys, 'report_interval', v.toString());
      await tgSend(chatId, `✅ 上报间隔已修改为 ${v} 秒。(将在 Agent 下次请求时生效)`);
    }
  }
  else if (cmd === '/set_offline') {
    const v = parseInt(cmdParts[1]);
    if (v && v >= 1) {
      await updateSetting(db, sys, 'offline_threshold', v.toString());
      await tgSend(chatId, `✅ 前台离线判定时间已修改为 ${v} 秒。`);
    } else {
      await tgSend(chatId, `❌ 格式错误，例: <code>/set_offline 30</code>`);
    }
  }
  else if (cmd === '/set_alert') {
    const v = parseInt(cmdParts[1]);
    if (v && v >= 1) {
      await updateSetting(db, sys, 'alert_threshold', v.toString());
      await tgSend(chatId, `✅ TG掉线告警判定时间已修改为 ${v} 秒。`);
    } else {
      await tgSend(chatId, `❌ 格式错误，例: <code>/set_alert 120</code>`);
    }
  }
  else if (cmd === '/set_sitetitle') {
    const v = text.replace(cmdParts[0], '').trim();
    if (v) {
      await updateSetting(db, sys, 'site_title', v);
      await tgSend(chatId, `✅ 前台标题已修改为: ${v}`);
    }
  }
  else if (cmd === '/set_admintitle') {
    const v = text.replace(cmdParts[0], '').trim();
    if (v) {
      await updateSetting(db, sys, 'admin_title', v);
      await tgSend(chatId, `✅ 后台标题已修改为: ${v}`);
    }
  }
}
