import { findServer, saveServerMetrics } from '../db/servers.js';
import { calculateTraffic, updateHistory, normalizeMetrics } from '../services/metrics.js';
import { checkOfflineNodes } from '../services/alerts.js';

export async function handleUpdate(request, env, ctx, sys) {
  try {
    const data = await request.json();
    const { id, secret, metrics } = data;

    if (secret !== env.API_SECRET) return new Response('Unauthorized', { status: 401 });

    let countryCode = request.cf && request.cf.country ? request.cf.country : 'XX';
    if (countryCode.toUpperCase() === 'TW') countryCode = 'CN';

    const serverExists = await findServer(env.DB, id);
    if (!serverExists) return new Response('Server not found', { status: 404 });
    const traffic = calculateTraffic(serverExists, metrics, sys);
    const historyStr = updateHistory(serverExists, metrics);
    await saveServerMetrics(env.DB, id, normalizeMetrics(metrics), countryCode, traffic, historyStr);
    ctx.waitUntil(checkOfflineNodes(env.DB, sys));

    return new Response(`INTERVAL=${sys.report_interval || '5'}|CT=${sys.ping_node_ct || 'default'}|CU=${sys.ping_node_cu || 'default'}|CM=${sys.ping_node_cm || 'default'}`, { status: 200 });
  } catch (e) {
    return new Response('Error', { status: 400 });
  }
}
