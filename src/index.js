import { handleIconRequest } from './assets/icons.js';
import { createDatabaseInitializer } from './db/schema.js';
import { loadSettings } from './services/settings.js';
import { handleAdminPage, handleAdminApi } from './routes/admin.js';
import { handleServerApi, handlePublicPage } from './routes/public.js';
import { handleUpdate } from './routes/update.js';
import { handleTelegramWebhook } from './routes/telegram.js';
import { handleWindowsInstall, handleLinuxInstall } from './routes/install.js';

const initializeDatabase = createDatabaseInitializer();

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const icon = handleIconRequest(pathname);
    if (icon) return icon;

    await initializeDatabase(env.DB);
    const sys = await loadSettings(env.DB);

    if (request.method === 'GET' && pathname === '/api/server') return handleServerApi(request, env, sys);
    if (request.method === 'POST' && pathname === '/api/tg_webhook') return handleTelegramWebhook(request, env, sys);
    if (request.method === 'POST' && pathname === sys.admin_path + '/api') return handleAdminApi(request, env, sys);
    if (request.method === 'GET' && pathname === sys.admin_path) return handleAdminPage(request, env, sys);
    if (request.method === 'GET' && pathname === '/install.ps1') return handleWindowsInstall(request, env);
    if (request.method === 'GET' && pathname === '/install.sh') return handleLinuxInstall(request, env);
    if (request.method === 'POST' && pathname === '/update') return handleUpdate(request, env, ctx, sys);
    if (request.method === 'GET' && pathname === '/') return handlePublicPage(request, env, ctx, sys);

    return new Response('Not Found', { status: 404 });
  },
};
