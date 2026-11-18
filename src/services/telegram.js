export const sendTelegram = async (sys, msg) => {
  if (sys.tg_notify !== 'true' || !sys.tg_bot_token || !sys.tg_chat_id) return;
  try {
    await fetch(`https://api.telegram.org/bot${sys.tg_bot_token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: sys.tg_chat_id, text: msg, parse_mode: 'HTML' })
    });
  } catch (e) {}
};

export const tgSend = async (token, chatId, text, keyboard = null) => {
  const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (keyboard) payload.reply_markup = keyboard;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
};

export const tgEdit = async (token, chatId, msgId, text, keyboard = null) => {
  const payload = { chat_id: chatId, message_id: msgId, text: text, parse_mode: 'HTML' };
  if (keyboard) payload.reply_markup = keyboard;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
};

export async function configureTelegram(token, host) {
  await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url: `${host}/api/tg_webhook` })
  });
  await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
          commands: [
            { command: "menu", description: "打开可视化管理菜单" },
            { command: "add", description: "添加节点 (例: /add HK debian)" },
            { command: "edit", description: "编辑节点 (例: /edit ID 名称 分组)" },
            { command: "del", description: "删除节点 (例: /del ID)" },
            { command: "set_interval", description: "上报间隔 (例: /set_interval 10)" },
            { command: "set_offline", description: "前台离线判定时间(秒)" },
            { command: "set_alert", description: "TG告警判定时间(秒)" },
            { command: "set_sitetitle", description: "前台标题 (例: /set_sitetitle 探针)" },
            { command: "set_admintitle", description: "后台标题 (例: /set_admintitle 管理)" }
          ]
      })
  });
}
