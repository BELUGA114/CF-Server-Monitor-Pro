export function renderDetailStyles(themeStyles) {
  return `          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f5f7; color: #333; margin: 0; padding: 0; }
            ${themeStyles}
            .stat-label { color: #888; margin-bottom: 5px; font-size: 12px; }
            .stat-val { font-weight: bold; font-size: 14px; color: inherit; }
            .header-card .stat-label { color: inherit; opacity: 0.7; }
            .theme2 .stat-label, .theme5 .stat-label, .theme4 .stat-label, .theme8 .stat-label { color: rgba(255,255,255,0.6); }
            .theme2 .stat-val, .theme5 .stat-val, .theme4 .stat-val, .theme8 .stat-val { color: #fff; }
            .chart-full canvas { max-height: 250px !important; }
            .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 30px; }
          </style>`;
}
