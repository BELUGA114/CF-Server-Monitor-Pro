export function renderDetailScript(idParam) {
  return `          <script>
            const serverId = "${idParam}";
            let charts = {};

            const formatBytesJs = (bytes) => {
               const b = parseInt(bytes);
               if (isNaN(b) || b === 0) return '0 B';
               const k = 1024;
               const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
               const i = Math.floor(Math.log(b) / Math.log(k));
               return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };

            function initChart(ctxId, label1, label2, color1, color2, isSpeed = false) {
              const ctx = document.getElementById(ctxId).getContext('2d');
              const isDark = document.body.className.includes('theme2') || document.body.className.includes('theme5') || document.body.className.includes('theme4') || document.body.className.includes('theme8') || document.body.className.includes('theme6') || document.body.className.includes('theme15');
              const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
              const fontColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
              
              const datasets = [{
                  label: label1, data: [], borderColor: color1, backgroundColor: color1.replace('1)', '0.1)'),
                  borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4
              }];
              if (label2) {
                 datasets.push({
                    label: label2, data: [], borderColor: color2, backgroundColor: 'transparent',
                    borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4
                 });
              }

              return new Chart(ctx, {
                type: 'line',
                data: { labels: [], datasets: datasets },
                options: {
                  responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(context) { let l = context.dataset.label || ''; if (l) l += ': '; if (context.parsed.y !== null) l += isSpeed ? formatBytesJs(context.parsed.y) + '/s' : context.parsed.y; return l; } } }
                  },
                  scales: {
                    x: { grid: { display: false, drawBorder: false }, ticks: { color: fontColor, maxTicksLimit: 6 } },
                    y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: fontColor, callback: function(value) { return isSpeed ? formatBytesJs(value) : value; } }, beginAtZero: true }
                  }
                }
              });
            }

            function initPingChart(ctxId, yMax) {
              const ctx = document.getElementById(ctxId).getContext('2d');
              const isDark = document.body.className.includes('theme2') || document.body.className.includes('theme5') || document.body.className.includes('theme4') || document.body.className.includes('theme8') || document.body.className.includes('theme6') || document.body.className.includes('theme15');
              const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
              const fontColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';

              return new Chart(ctx, {
                type: 'line',
                data: { 
                   labels: [], 
                   datasets: [
                     { label: '电信', data: [], borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                     { label: '联通', data: [], borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                     { label: '移动', data: [], borderColor: '#10b981', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                     { label: '字节', data: [], borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, tension: 0.4 }
                   ] 
                },
                options: {
                  responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { labels: { color: fontColor } } },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: fontColor, maxTicksLimit: 8 } },
                    y: { grid: { color: gridColor }, ticks: { color: fontColor }, beginAtZero: true, max: yMax }
                  }
                }
              });
            }

            document.addEventListener('DOMContentLoaded', () => {
               charts.cpu = initChart('chart-cpu', 'CPU (%)', null, 'rgba(59, 130, 246, 1)');
               charts.ram = initChart('chart-ram', '内存 (%)', null, 'rgba(16, 185, 129, 1)');
               charts.proc = initChart('chart-proc', '进程数', null, 'rgba(139, 92, 246, 1)');
               charts.net = initChart('chart-net', '下载', '上传', 'rgba(16, 185, 129, 1)', 'rgba(59, 130, 246, 1)', true);
               charts.conn = initChart('chart-conn', 'TCP', 'UDP', 'rgba(245, 158, 11, 1)', 'rgba(236, 72, 153, 1)');
               charts.ping = initPingChart('chart-ping');
               charts.loss = initPingChart('chart-loss', 100);
               fetchData(); setInterval(fetchData, 4000);
            });

            async function fetchData() {
               try {
                  const res = await fetch('/api/server?id=' + serverId);
                  if (!res.ok) return;
                  const data = await res.json();
                  
                  document.getElementById('d-uptime').innerText = data.uptime;
                  document.getElementById('d-os').innerText = data.os;
                  document.getElementById('d-arch').innerText = data.arch;
                  document.getElementById('d-virt').innerText = data.virt;
                  document.getElementById('d-load').innerText = data.load_avg;
                  document.getElementById('d-boot').innerText = data.boot_time;
                  document.getElementById('d-tx').innerText = formatBytesJs(data.net_tx);
                  document.getElementById('d-rx').innerText = formatBytesJs(data.net_rx);
                  document.getElementById('d-cpuinfo').innerText = data.cpu_info;

                  document.getElementById('txt-cpu').innerText = data.cpu + '%';
                  document.getElementById('txt-ram').innerText = data.ram + '%';
                  document.getElementById('txt-swap').innerText = formatBytesJs(data.swap_used * 1048576) + ' / ' + formatBytesJs(data.swap_total * 1048576);
                  document.getElementById('txt-disk').innerText = data.disk + '%';
                  document.getElementById('bar-disk').style.width = data.disk + '%';
                  document.getElementById('bar-disk').style.background = parseFloat(data.disk) > 80 ? '#ef4444' : '#3b82f6';
                  document.getElementById('txt-disk-detail').innerText = formatBytesJs(data.disk_used * 1048576) + ' / ' + formatBytesJs(data.disk_total * 1048576);
                  
                  document.getElementById('txt-proc').innerText = data.processes;
                  document.getElementById('txt-net-in').innerText = formatBytesJs(data.net_in_speed) + '/s';
                  document.getElementById('txt-net-out').innerText = formatBytesJs(data.net_out_speed) + '/s';
                  document.getElementById('txt-tcp').innerText = data.tcp_conn;
                  document.getElementById('txt-udp').innerText = data.udp_conn;

                  let history = { time: [], cpu: [], ram: [], proc: [], net_in: [], net_out: [], tcp: [], udp: [], ping_ct: [], ping_cu: [], ping_cm: [], ping_bd: [], loss_ct: [], loss_cu: [], loss_cm: [], loss_bd: [] };
                  try { if (data.history) history = JSON.parse(data.history); } catch(e) {}
                  
                  if (history.time && history.time.length > 0) {
                     const labels = history.time;
                     updateChart(charts.cpu, labels, [history.cpu]);
                     updateChart(charts.ram, labels, [history.ram]);
                     updateChart(charts.proc, labels, [history.proc]);
                     updateChart(charts.net, labels, [history.net_in, history.net_out]);
                     updateChart(charts.conn, labels, [history.tcp, history.udp]);
                     updateChart(charts.ping, labels, [history.ping_ct, history.ping_cu, history.ping_cm, history.ping_bd]);
                     updateChart(charts.loss, labels, [lossSeries(history.loss_ct), lossSeries(history.loss_cu), lossSeries(history.loss_cm), lossSeries(history.loss_bd)]);
                  }
               } catch (e) {}
            }

            // 丢包 -1 表示 agent 侧 ICMP 不可用,补齐位是 null,两者都不是真实测量值;
            // 统一转成 null 让 Chart.js 断线,否则会画成贴底的 0% 实线,并把 y 轴拉到 0 以下
            function lossSeries(arr) {
               if (!Array.isArray(arr)) return [];
               return arr.map(v => (typeof v === 'number' && v >= 0) ? v : null);
            }

            function updateChart(chart, labels, datasetsData) {
               chart.data.labels = labels;
               datasetsData.forEach((data, i) => { if (chart.data.datasets[i]) chart.data.datasets[i].data = data; });
               chart.update();
            }
          </script>`;
}
