export const mainMenuText = `🖥 <b>Server Monitor Pro 管理控制台</b>\n\n欢迎使用 Telegram 快捷管理模式！请点击下方按钮进行操作，或者输入命令。\n\n<b>常用命令示例：</b>\n<code>/add 香港VPS debian</code> - 添加名为"香港VPS"的debian节点\n<code>/set_interval 10</code> - 设置节点上报间隔为 10 秒\n<code>/set_offline 30</code> - 设置前台显示离线的判定时间(秒)\n<code>/set_alert 120</code> - 设置TG掉线告警的判定时间(秒)\n<code>/set_sitetitle 我的专属探针</code> - 修改前台网站大标题\n<code>/set_admintitle 控制台</code> - 修改后台管理标签页名称\n<code>/menu</code> - 调出本管理菜单`;

export const mainMenuKb = {
  inline_keyboard: [
    [{text: '📋 节点列表与管理', callback_data: 'cb_list_nodes'}],
    [{text: '⚙️ 全局设置展示控制', callback_data: 'cb_settings'}],
    [{text: '🎨 切换前端主题', callback_data: 'cb_theme_menu'}]
  ]
};

export const generateSettingsKb = (sys) => {
  return {
    inline_keyboard: [
      [{text: `${sys.is_public === 'true' ? '✅' : '❌'} 公开访问`, callback_data: 'cb_toggle_is_public'}, {text: `${sys.show_price === 'true' ? '✅' : '❌'} 显示价格`, callback_data: 'cb_toggle_show_price'}],
      [{text: `${sys.show_expire === 'true' ? '✅' : '❌'} 显示到期`, callback_data: 'cb_toggle_show_expire'}, {text: `${sys.show_bw === 'true' ? '✅' : '❌'} 显示带宽`, callback_data: 'cb_toggle_show_bw'}],
      [{text: `${sys.show_tf === 'true' ? '✅' : '❌'} 显示流量`, callback_data: 'cb_toggle_show_tf'}, {text: `${sys.auto_reset_traffic === 'true' ? '✅' : '❌'} 流量重置`, callback_data: 'cb_toggle_auto_reset_traffic'}],
      [{text: `${sys.enable_popup === 'true' ? '✅' : '❌'} 首页弹窗`, callback_data: 'cb_toggle_enable_popup'}, {text: '🔙 返回主菜单', callback_data: 'cb_menu'}]
    ]
  };
};

export const generateThemeKb = (sys, availableThemes) => {
  let kbRows = []; let currentRow = [];
  availableThemes.forEach((t, i) => {
      const btnText = `${sys.theme === t.id ? '👉 ' : ''}${t.name.split(' ')[0]} ${t.name.split(' ')[1] || ''}`;
      currentRow.push({ text: btnText.substring(0, 18), callback_data: `cb_set_theme_${t.id}` });
      if (currentRow.length === 2 || i === availableThemes.length - 1) { kbRows.push(currentRow); currentRow = []; }
  });
  kbRows.push([{text: '🔙 返回主菜单', callback_data: 'cb_menu'}]);
  return { inline_keyboard: kbRows };
};
