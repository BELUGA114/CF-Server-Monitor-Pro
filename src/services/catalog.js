import { saveSetting } from '../db/settings.js';

export function getNodeCatalog(sys) {
  let cachedNodes = null; let availableThemes = [];
  try {
    if (sys.cached_nodes_data) {
      cachedNodes = JSON.parse(sys.cached_nodes_data);
      if (cachedNodes.themes && Array.isArray(cachedNodes.themes)) availableThemes = cachedNodes.themes;
    }
  } catch(e) {}

  if (availableThemes.length === 0) {
    availableThemes = [
      { id: "theme1", name: "1. 默认清爽白 (Classic White)", is_dark: false, css: "" },
      { id: "theme6", name: "完全自定义 CSS (Custom Theme)", is_dark: true, has_custom_css: true, css: "" }
    ];
  }
  return { cachedNodes, availableThemes };
}

export async function refreshNodeCatalog(db) {
  const response = await fetch('https://raw.githubusercontent.com/BELUGA114/CF-Server-Monitor-Pro/refs/heads/main/nodes.json');
  if (!response.ok) return false;
  await saveSetting(db, 'cached_nodes_data', await response.text());
  return true;
}
