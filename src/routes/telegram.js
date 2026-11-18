import { tgSend, tgEdit } from '../services/telegram.js';
import { getNodeCatalog } from '../services/catalog.js';
import { handleTelegramCallback } from '../services/telegram-callbacks.js';
import { handleTelegramCommand } from '../services/telegram-commands.js';

export async function handleTelegramWebhook(request, env, sys) {
  try {
    const body = await request.json();
    const message = body.message;
    const callback_query = body.callback_query;
    let chatId, text, msgId;
    if (message) {
      chatId = message.chat.id.toString(); text = message.text || ''; msgId = message.message_id;
    } else if (callback_query) {
      chatId = callback_query.message.chat.id.toString(); text = callback_query.data; msgId = callback_query.message.message_id;
    }

    if (chatId !== sys.tg_chat_id) return new Response('OK', { status: 200 });
    const { availableThemes } = getNodeCatalog(sys);
    const context = {
      db: env.DB, sys, host: new URL(request.url).origin, apiSecret: env.API_SECRET,
      availableThemes, chatId, text, msgId,
      tgSend: (id, content, keyboard = null) => tgSend(sys.tg_bot_token, id, content, keyboard),
      tgEdit: (id, messageId, content, keyboard = null) => tgEdit(sys.tg_bot_token, id, messageId, content, keyboard),
    };
    if (callback_query) await handleTelegramCallback(context);
    if (message) await handleTelegramCommand(context);
    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response('Webhook Error', { status: 200 });
  }
}
