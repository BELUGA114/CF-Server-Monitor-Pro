import { checkAuth, authResponse } from '../auth.js';
import { listAdminServers, deleteServer, editServer } from '../db/servers.js';
import { addServer } from '../services/servers.js';
import { saveSettings } from '../services/settings.js';
import { getNodeCatalog, refreshNodeCatalog } from '../services/catalog.js';
import { configureTelegram } from '../services/telegram.js';
import { renderAdminPage } from '../pages/admin.js';

export async function handleAdminPage(request, env, sys) {
  if (!checkAuth(request, env.API_SECRET)) return authResponse(sys.admin_title);
  const { results } = await listAdminServers(env.DB);
  const { cachedNodes, availableThemes } = getNodeCatalog(sys);
  return new Response(renderAdminPage(results, sys, cachedNodes, availableThemes, new URL(request.url).origin, env.API_SECRET), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function handleAdminApi(request, env, sys) {
  if (!checkAuth(request, env.API_SECRET)) return authResponse(sys.admin_title);
  const host = new URL(request.url).origin;
  try {
    const data = await request.json();
    if (data.action === 'save_settings') {
      await saveSettings(env.DB, data.settings);
      if (data.settings.tg_bot_token) {
        try { await configureTelegram(data.settings.tg_bot_token, host); } catch(e) {}
      }
    } else if (data.action === 'add') {
      await addServer(env.DB, data.name || 'New Server', data.agent_os || 'debian');
    } else if (data.action === 'delete') {
      await deleteServer(env.DB, data.id);
    } else if (data.action === 'edit') {
      await editServer(env.DB, data);
    } else if (data.action === 'pull_github') {
      if (!await refreshNodeCatalog(env.DB)) return new Response(JSON.stringify({ error: 'fetch failed' }), { status: 400 });
    } else {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
}
