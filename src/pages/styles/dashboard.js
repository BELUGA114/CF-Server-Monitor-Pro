export function renderDashboardStyles(themeStyles) {
  return `        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f5f7; color: #333; margin: 0; padding: 20px; }
          .container { max-width: 1200px; margin: 0 auto; }
          
          .group-header { font-size: 18px; font-weight: 600; color: #444; margin: 25px 0 15px 5px; border-left: 4px solid #3b82f6; padding-left: 10px; }
          .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 15px; }
          
          .vps-card { display: flex; justify-content: space-between; align-items: stretch; background: white; padding: 18px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-decoration: none; color: inherit; border: 1px solid transparent; transition: all 0.2s ease; }
          .vps-card:hover { border-color: #e5e7eb; transform: translateY(-2px); box-shadow: 0 8px 15px rgba(0,0,0,0.08); }
          .card-left { flex: 0 0 180px; display: flex; flex-direction: column; justify-content: center; }
          .card-title { display: flex; align-items: center; margin-bottom: 4px; }
          .card-title-text { font-weight: 600; }
          .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; flex-shrink:0; }
          .card-meta { font-size: 12px; color: #6b7280; margin-bottom: 3px; }
          .card-badges { margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap; }
          .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; color: white; }
          .badge-bw { background: #3b82f6; } .badge-tf { background: #10b981; } .badge-v4 { background: #a855f7; } .badge-v6 { background: #ec4899; }
          
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .admin-btn { padding: 8px 16px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight:bold; }
          
          .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; overflow-y: auto; backdrop-filter: blur(4px); }
          .modal-content { background: white; padding: 20px; border-radius: 12px; margin: 40px auto; position: relative; max-height: 85vh; overflow-y: auto; box-sizing: border-box; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
          .theme2 .modal-content, .theme5 .modal-content, .theme4 .modal-content, .theme8 .modal-content, .theme6 .modal-content { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; }

          /* 上下两行自适应 Grid CSS */
          .g-val { font-size: 22px; font-weight: bold; color: #111; margin: 8px 0; line-height: 1.2; word-break: break-word; white-space: normal; }
          .g-label { font-size: 13px; color: #666; white-space: normal; line-height: 1.4; }
          .g-sub { font-size: 12px; color: #999; white-space: normal; line-height: 1.4; }
          
          @media (max-width: 800px) { 
            .grid-container { grid-template-columns: 1fr; } .vps-card { flex-direction: column; } .card-right { padding-left: 0; border-left: none; border-top: 1px solid #f0f0f0; margin-top: 15px; padding-top: 15px; } .header { flex-direction: column; align-items: flex-start; gap: 15px;} .header-right { width:100%; justify-content: space-between;} 
            .stats-row { flex-direction: column; gap: 15px; } 
            .stats-row .g-item { border-right: none !important; border-bottom: 1px dashed rgba(150,150,150,0.2); padding-bottom: 15px; } 
            .stats-row .g-item:last-child { border-bottom: none; padding-bottom: 0; }
            .stats-row.bottom-row { border-top: none; padding-top: 0; }
          }
          
          ${themeStyles}
        </style>`;
}
