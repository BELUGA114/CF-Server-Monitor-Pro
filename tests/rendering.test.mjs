import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { loadSettings } from '../src/services/settings.js';
import { getNodeCatalog } from '../src/services/catalog.js';
import { aggregateDashboard } from '../src/services/dashboard.js';
import { getThemeStyles } from '../src/pages/shared.js';
import { renderAdminPage } from '../src/pages/admin.js';
import { renderDashboardPage } from '../src/pages/dashboard.js';
import { renderDetailPage } from '../src/pages/detail.js';
import { renderLinuxInstaller } from '../src/agents/linux.js';
import { renderWindowsInstaller } from '../src/agents/windows.js';
import { handleServerApi, handlePublicPage } from '../src/routes/public.js';
import { handleAdminApi, handleAdminPage } from '../src/routes/admin.js';

const sys = await loadSettings({ prepare: () => ({ all: async () => ({ results: [] }) }) });
const server = { id: 'sample-id', name: '测试节点', agent_os: 'debian', last_updated: Date.now(), history: '{}' };

test('节点缓存损坏时保留内置主题和自定义 CSS 回退', () => {
  const { cachedNodes, availableThemes } = getNodeCatalog({ cached_nodes_data: 'invalid' });
  assert.equal(cachedNodes, null);
  assert.deepEqual(availableThemes.map(t => t.id), ['theme1', 'theme6']);
  assert.match(getThemeStyles({ ...sys, theme: 'theme6', custom_css: 'body{color:blue}' }, availableThemes), /body\{color:blue\}/);
});

test('三种页面都能独立渲染，内嵌浏览器脚本语法有效', () => {
  const { cachedNodes, availableThemes } = getNodeCatalog(sys);
  const themeStyles = getThemeStyles(sys, availableThemes);
  const pages = [
    renderAdminPage([server], sys, cachedNodes, availableThemes, 'https://monitor.test', 'test-secret'),
    renderDashboardPage(sys, themeStyles, aggregateDashboard([server], sys), '192.0.2.1'),
    renderDetailPage(server, sys, themeStyles, server.id),
  ];
  for (const html of pages) {
    assert.match(html, /测试节点/);
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (!match[0].includes('application/json')) assert.doesNotThrow(() => new Script(match[1]));
    }
  }
  assert.match(pages[2], /const serverId = "sample-id"/);
  assert.ok(!pages[1].includes('test-secret'));
  assert.ok(!pages[2].includes('test-secret'));
});

test('私有页面与管理接口在查询数据库之前要求认证，隐藏节点返回 404', async () => {
  const request = new Request('https://monitor.test/api/server?id=hidden');
  let queried = false;
  const env = { API_SECRET: 'test-secret', DB: { prepare() { queried = true; throw new Error('认证失败时不应查询'); } } };
  const settings = { ...sys, is_public: 'false', site_title: 'Monitor', admin_title: 'Admin' };
  for (const handler of [
    () => handleServerApi(request, env, settings),
    () => handlePublicPage(request, env, {}, settings),
    () => handleAdminPage(request, env, settings),
    () => handleAdminApi(request, env, settings),
  ]) assert.equal((await handler()).status, 401);
  assert.equal(queried, false);
  env.DB = { prepare: () => ({ bind: () => ({ first: async () => ({ ...server, is_hidden: 'true' }) }) }) };
  assert.equal((await handleServerApi(request, env, sys)).status, 404);
  assert.equal((await handlePublicPage(new Request('https://monitor.test/?id=hidden'), env, {}, sys)).status, 404);
});

test('Linux、Alpine、Windows 安装响应保留 Base64 包装与动态配置', () => {
  const cfg = { reportInterval: '12', pingCt: 'ct.test', pingCu: 'cu.test', pingCm: 'cm.test' };
  for (const os of ['debian', 'alpine']) {
    const wrapper = renderLinuxInstaller(os, 'https://monitor.test', cfg);
    const payload = Buffer.from(wrapper.match(/echo "([A-Za-z0-9+/=]+)" \| base64/)[1], 'base64').toString('utf8');
    assert.match(payload, /WORKER_URL="https:\/\/monitor.test\/update"/);
    assert.match(payload, /REPORT_INTERVAL="12"/);
    assert.match(payload, /PING_NODE_CT="ct.test"/);
    assert.match(payload, os === 'alpine' ? /rc-service cf-probe restart/ : /systemctl restart cf-probe.service/);
    assert.match(payload, /NEW_INV=/);
  }
  const wrapper = renderWindowsInstaller(server.id, 'test-secret', 'https://monitor.test', cfg);
  const payload = Buffer.from(wrapper.match(/\$b64 = "([A-Za-z0-9+/=]+)"/)[1], 'base64').toString('utf8');
  assert.match(payload, /\$SERVER_ID = "sample-id"/);
  assert.match(payload, /\$REPORT_INTERVAL = 12/);
  assert.match(payload, /\$PING_NODE_CT = "ct.test"/);
  assert.match(payload, /Invoke-RestMethod/);
});
