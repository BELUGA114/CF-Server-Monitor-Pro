export function renderAdminScript(sys) {
  return `        <script>
          async function pullGithubNodes(event) {
            const btn = event.target;
            const originalText = btn.innerText;
            btn.innerText = '正在拉取...';
            btn.disabled = true;
            try {
              const res = await fetch('${sys.admin_path}/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pull_github' }) });
              if (res.ok) {
                alert('✅ Github 最新主题及测速节点拉取成功！页面将自动刷新加载新主题。');
                location.reload();
              } else {
                alert('❌ 拉取失败，请检查网络或稍后重试');
              }
            } catch (e) {
              alert('❌ 请求发生错误: ' + e.message);
            }
            btn.innerText = originalText;
            btn.disabled = false;
          }

          function toggleCustomCss() {
            const select = document.getElementById('cfg_theme');
            const selectedOption = select.options[select.selectedIndex];
            const isCustom = selectedOption.getAttribute('data-custom') === 'true' || select.value === 'theme6';
            document.getElementById('custom_css_group').style.display = isCustom ? 'flex' : 'none';
          }

          function uploadBg(input) {
            const file = input.files[0];
            if(!file) return;
            if(file.size > 800 * 1024) alert('图片有点大，为保证大盘秒开加载，建议使用 500KB 以下的图片或直接填写图片外部URL！');
            const reader = new FileReader();
            reader.onload = function(e) {
              document.getElementById('cfg_custom_bg').value = e.target.result;
              document.getElementById('bg_preview').src = e.target.result;
              document.getElementById('bg_preview').style.display = 'block';
            };
            reader.readAsDataURL(file);
          }
          async function saveSettings() {
            const data = {
              action: 'save_settings',
              settings: {
                theme: document.getElementById('cfg_theme').value,
                custom_bg: document.getElementById('cfg_custom_bg').value,
                custom_css: document.getElementById('cfg_custom_css').value,
                custom_head: document.getElementById('cfg_custom_head').value,
                custom_script: document.getElementById('cfg_custom_script').value,
                site_title: document.getElementById('cfg_site_title').value,
                admin_title: document.getElementById('cfg_admin_title').value,
                is_public: document.getElementById('cfg_is_public').checked ? 'true' : 'false',
                auto_reset_traffic: document.getElementById('cfg_auto_reset_traffic').checked ? 'true' : 'false',
                show_price: document.getElementById('cfg_show_price').checked ? 'true' : 'false',
                show_expire: document.getElementById('cfg_show_expire').checked ? 'true' : 'false',
                show_bw: document.getElementById('cfg_show_bw').checked ? 'true' : 'false',
                show_tf: document.getElementById('cfg_show_tf').checked ? 'true' : 'false',
                show_admin_btn: document.getElementById('cfg_show_admin_btn').checked ? 'true' : 'false',
                admin_path: document.getElementById('cfg_admin_path').value || '/admin',
                asset_currency: document.getElementById('cfg_asset_currency').value || '元',
                tg_notify: document.getElementById('cfg_tg_notify').value,
                tg_bot_token: document.getElementById('cfg_tg_bot_token').value,
                tg_chat_id: document.getElementById('cfg_tg_chat_id').value,
                report_interval: document.getElementById('cfg_report_interval').value || '5',
                offline_threshold: document.getElementById('cfg_offline_threshold').value || '30',
                alert_threshold: document.getElementById('cfg_alert_threshold').value || '120',
                enable_popup: document.getElementById('cfg_enable_popup').checked ? 'true' : 'false',
                popup_content: document.getElementById('cfg_popup_content').value,
                ping_node_ct: document.getElementById('cfg_ping_node_ct').value,
                ping_node_cu: document.getElementById('cfg_ping_node_cu').value,
                ping_node_cm: document.getElementById('cfg_ping_node_cm').value
              }
            };
            const res = await fetch('${sys.admin_path}/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) { 
              alert('✅ 设置已保存！如果您配置了机器人，现在可以前往 Telegram 发送 /menu 测试，或查看左下角是否有 Menu 快捷菜单。'); 
              const newPath = document.getElementById('cfg_admin_path').value || '/admin';
              window.location.href = newPath.startsWith('/') ? newPath : '/' + newPath; 
            } else alert('保存失败');
          }
          async function addServer() {
            const name = document.getElementById('newName').value;
            const agentOs = document.getElementById('newOs').value;
            if (!name) return alert('请输入名称');
            const res = await fetch('${sys.admin_path}/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', name: name, agent_os: agentOs }) });
            if (res.ok) location.reload(); else alert('添加失败');
          }
          async function deleteServer(id) {
            if (!confirm('确定要删除这个节点吗？')) return;
            const res = await fetch('${sys.admin_path}/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
            if (res.ok) location.reload(); else alert('删除失败');
          }
          function copyCmd(id) {
            const input = document.getElementById('cmd-' + id);
            input.select(); document.execCommand('copy');
            alert('✅ 安装命令已复制！去对应操作系统的 VPS 上执行即可。');
          }
          function copyUnCmd(id) {
            const val = document.getElementById('uncmd-' + id).value;
            const temp = document.createElement('textarea');
            temp.value = val;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            alert('✅ 卸载命令已复制！去对应 VPS 执行即可完全清理探针残留。');
          }
          function openEditModal(id, name, group, price, expire, bw, traffic, osType, isHidden, resetDay) {
            document.getElementById('editId').value = id;
            document.getElementById('editName').value = name || '';
            document.getElementById('editHidden').value = isHidden === 'true' ? 'true' : 'false';
            document.getElementById('editOs').value = osType || 'debian';
            document.getElementById('editGroup').value = group || '默认分组';
            document.getElementById('editPrice').value = price || '免费';
            document.getElementById('editExpire').value = expire || '';
            document.getElementById('editResetDay').value = resetDay || '1';
            document.getElementById('editBandwidth').value = bw || '';
            document.getElementById('editTraffic').value = traffic || '';
            document.getElementById('editModal').style.display = 'block';
          }
          function closeModal() { document.getElementById('editModal').style.display = 'none'; }
          async function saveEdit() {
            const data = {
              action: 'edit', 
              id: document.getElementById('editId').value,
              name: document.getElementById('editName').value,
              agent_os: document.getElementById('editOs').value,
              server_group: document.getElementById('editGroup').value, price: document.getElementById('editPrice').value,
              expire_date: document.getElementById('editExpire').value, bandwidth: document.getElementById('editBandwidth').value,
              traffic_limit: document.getElementById('editTraffic').value,
              reset_day: document.getElementById('editResetDay').value,
              is_hidden: document.getElementById('editHidden').value
            };
            const res = await fetch('${sys.admin_path}/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) location.reload(); else alert('保存失败');
          }
        </script>`;
}
