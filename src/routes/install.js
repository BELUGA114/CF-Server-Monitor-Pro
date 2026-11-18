import { getAgentConfig } from '../services/settings.js';
import { renderWindowsInstaller } from '../agents/windows.js';
import { renderLinuxInstaller } from '../agents/linux.js';

export async function handleWindowsInstall(request, env) {
  const url = new URL(request.url);
  const serverId = url.searchParams.get('id');
  const secret = url.searchParams.get('secret');
  if (!serverId || !secret) return new Response('Error: Missing id or secret params.', { status: 400 });
  const cfg = await getAgentConfig(env.DB);
  return new Response(renderWindowsInstaller(serverId, secret, url.origin, cfg), { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
}

export async function handleLinuxInstall(request, env) {
  const url = new URL(request.url);
  const cfg = await getAgentConfig(env.DB);
  const osType = url.searchParams.get('os') || 'debian';
  return new Response(renderLinuxInstaller(osType, url.origin, cfg), { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
}
