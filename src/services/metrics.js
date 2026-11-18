// 丢包归一:-1 表示 agent 侧 ICMP 不可用,合法范围 0-100
// 重复响应会让 ping 报负丢包(如 -20%),那是测到了而非测不了,越界值钳制入区间,-1 只保留给缺失输入
export const lossNum = (v) => {
  const n = parseInt(v, 10);
  if (isNaN(n) || n === -1) return -1;
  return n < 0 ? 0 : (n > 100 ? 100 : n);
};

export function normalizeMetrics(metrics) {
  return {
    ...metrics,
    loss_ct: String(lossNum(metrics.loss_ct)),
    loss_cu: String(lossNum(metrics.loss_cu)),
    loss_cm: String(lossNum(metrics.loss_cm)),
    loss_bd: String(lossNum(metrics.loss_bd)),
  };
}

export function calculateTraffic(serverExists, metrics, sys, nowTime = new Date()) {
  const tzOffset = 8 * 60 * 60000;
  const localNow = new Date(nowTime.getTime() + tzOffset);

  let resetDayVal = parseInt(serverExists.reset_day) || 1;
  if (resetDayVal < 1) resetDayVal = 1;
  if (resetDayVal > 31) resetDayVal = 31;

  let y = localNow.getFullYear();
  let m = localNow.getMonth() + 1; // 1-12
  let d = localNow.getDate();

  let maxDaysThisMonth = new Date(y, m, 0).getDate();
  let actualResetDayThisMonth = Math.min(resetDayVal, maxDaysThisMonth);

  let currentCycleStr = '';
  if (d < actualResetDayThisMonth) {
    let pm = m - 1; let py = y;
    if (pm === 0) { pm = 12; py -= 1; }
    let maxDaysPrevMonth = new Date(py, pm, 0).getDate();
    let actualResetDayPrevMonth = Math.min(resetDayVal, maxDaysPrevMonth);
    currentCycleStr = `${py}-${pm}-${actualResetDayPrevMonth}`;
  } else {
    currentCycleStr = `${y}-${m}-${actualResetDayThisMonth}`;
  }

  let monthly_rx = parseFloat(serverExists.monthly_rx || '0');
  let monthly_tx = parseFloat(serverExists.monthly_tx || '0');
  let last_rx = parseFloat(serverExists.last_rx || '0');
  let last_tx = parseFloat(serverExists.last_tx || '0');
  let reset_month = serverExists.reset_month || currentCycleStr;

  if (sys.auto_reset_traffic === 'true' && currentCycleStr !== reset_month) {
    monthly_rx = 0; monthly_tx = 0; reset_month = currentCycleStr;
  }

  const current_rx = parseFloat(metrics.net_rx || '0');
  const current_tx = parseFloat(metrics.net_tx || '0');

  if (current_rx >= last_rx) monthly_rx += (current_rx - last_rx);
  else monthly_rx += current_rx;

  if (current_tx >= last_tx) monthly_tx += (current_tx - last_tx);
  else monthly_tx += current_tx;

  last_rx = current_rx; last_tx = current_tx;
  return { monthly_rx, monthly_tx, last_rx, last_tx, reset_month };
}

export function updateHistory(serverExists, metrics, nowMs = Date.now()) {
  let history = {};
  try { history = JSON.parse(serverExists.history || '{}'); } catch(e) {}

  const lastHistTime = history.last_time || 0;

  if (nowMs - lastHistTime >= 300000 || !history.time) {
    const maxPoints = 288;
    // 新增序列(如后加入的丢包)在老 history 里不存在,若从空数组开始增长会与已饱和的 time 轴按下标错位;
    // 按 time 当前长度在左侧补 null 对齐,图上呈断线表示该时段无采集
    const padTo = Array.isArray(history.time) ? history.time.length : 0;
    const updateArr = (arr, val) => {
      if (!Array.isArray(arr)) arr = [];
      while (arr.length < padTo) arr.unshift(null);
      arr.push(val);
      if (arr.length > maxPoints) arr.shift();
      return arr;
    };
    const updateLabels = (arr) => {
      if (!Array.isArray(arr)) arr = [];
      const d = new Date(nowMs + 8 * 60 * 60000);
      const timeLabel = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      arr.push(timeLabel);
      if (arr.length > maxPoints) arr.shift();
      return arr;
    };

    history.cpu = updateArr(history.cpu, parseFloat(metrics.cpu) || 0);
    history.ram = updateArr(history.ram, parseFloat(metrics.ram) || 0);
    history.proc = updateArr(history.proc, parseInt(metrics.processes) || 0);
    history.net_in = updateArr(history.net_in, parseFloat(metrics.net_in_speed) || 0);
    history.net_out = updateArr(history.net_out, parseFloat(metrics.net_out_speed) || 0);
    history.tcp = updateArr(history.tcp, parseInt(metrics.tcp_conn) || 0);
    history.udp = updateArr(history.udp, parseInt(metrics.udp_conn) || 0);
    history.ping_ct = updateArr(history.ping_ct, parseInt(metrics.ping_ct) || 0);
    history.ping_cu = updateArr(history.ping_cu, parseInt(metrics.ping_cu) || 0);
    history.ping_cm = updateArr(history.ping_cm, parseInt(metrics.ping_cm) || 0);
    history.ping_bd = updateArr(history.ping_bd, parseInt(metrics.ping_bd) || 0);
    history.loss_ct = updateArr(history.loss_ct, lossNum(metrics.loss_ct));
    history.loss_cu = updateArr(history.loss_cu, lossNum(metrics.loss_cu));
    history.loss_cm = updateArr(history.loss_cm, lossNum(metrics.loss_cm));
    history.loss_bd = updateArr(history.loss_bd, lossNum(metrics.loss_bd));
    history.time = updateLabels(history.time);
    history.last_time = nowMs;
  }
  return JSON.stringify(history);
}
