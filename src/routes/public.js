import { checkAuth, authResponse } from '../auth.js';
import { findServer, listServers } from '../db/servers.js';
import { saveVisits } from '../db/settings.js';
import { aggregateDashboard } from '../services/dashboard.js';
import { getNodeCatalog } from '../services/catalog.js';
import { getThemeStyles } from '../pages/shared.js';
import { renderDetailPage } from '../pages/detail.js';
import { renderDashboardPage } from '../pages/dashboard.js';

export async function handleServerApi(request, env, sys) {
  const url = new URL(request.url);
  if (sys.is_public !== 'true' && !checkAuth(request, env.API_SECRET)) return authResponse(sys.site_title);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Miss ID', { status: 400 });
  const server = await findServer(env.DB, id);
  if (!server || server.is_hidden === 'true') return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(server), { headers: { 'Content-Type': 'application/json' } });
}

export async function handlePublicPage(request, env, ctx, sys) {
  const url = new URL(request.url);
  if (sys.is_public !== 'true' && !checkAuth(request, env.API_SECRET)) return authResponse(sys.site_title);
  const { availableThemes } = getNodeCatalog(sys);
  const themeStyles = getThemeStyles(sys, availableThemes);
  const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
  const isAjax = url.searchParams.get('ajax') === '1';
  const idParam = url.searchParams.get('id');

  if (idParam && !isAjax) {
    const server = await findServer(env.DB, idParam);
    if (!server || server.is_hidden === 'true') return new Response('Server Not Found', { status: 404 });
    return new Response(renderDetailPage(server, sys, themeStyles, idParam), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
  const { results } = await listServers(env.DB);
  const data = aggregateDashboard(results, sys);
  if (!isAjax) {
    // 访问量统计
    const nowTime = new Date();
    const tzOffset = 8 * 60 * 60000;
    const localNow = new Date(nowTime.getTime() + tzOffset);
    const todayStr = `${localNow.getFullYear()}-${localNow.getMonth() + 1}-${localNow.getDate()}`;

    let vTotal = parseInt(sys.visits_total || '0') + 1;
    let vToday = parseInt(sys.visits_today || '0');
    let vDate = sys.visits_date || '';
    if (vDate !== todayStr) { vToday = 1; vDate = todayStr; } else { vToday++; }

    sys.visits_total = vTotal.toString();
    sys.visits_today = vToday.toString();
    sys.visits_date = todayStr;

    ctx.waitUntil(saveVisits(env.DB, vTotal.toString(), vToday.toString(), todayStr));
  }
  return new Response(renderDashboardPage(sys, themeStyles, data, clientIP), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
