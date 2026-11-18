import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTraffic, normalizeMetrics, updateHistory } from '../src/services/metrics.js';

test('丢包保留不可用状态，并钳制越界采样', () => {
  const metrics = { cpu: '12', loss_ct: '-20', loss_cu: '120', loss_cm: '-1' };
  assert.deepEqual(normalizeMetrics(metrics), {
    cpu: '12', loss_ct: '0', loss_cu: '100', loss_cm: '-1', loss_bd: '-1',
  });
  assert.equal(metrics.loss_ct, '-20');
});

test('历史序列升级时补齐缺失采样，保持 288 点与时间轴对齐', () => {
  const history = { time: Array(288).fill('12:00'), cpu: Array(288).fill(1), last_time: 1 };
  const result = JSON.parse(updateHistory({ history: JSON.stringify(history) }, { cpu: '2', loss_ct: '-1', loss_cu: '10' }, 600001));
  assert.equal(result.time.length, 288);
  assert.equal(result.cpu.length, 288);
  assert.equal(result.cpu.at(-1), 2);
  assert.equal(result.loss_ct.length, 288);
  assert.equal(result.loss_ct.at(-1), -1);
  assert.equal(result.loss_cu.at(-1), 10);
  assert.ok(result.loss_cu.slice(0, -1).every(v => v === null));
});

test('五分钟内上报不会增加历史采样，损坏的 JSON 可以重新采集', () => {
  const history = { time: ['12:00'], cpu: [1], last_time: 600000 };
  assert.deepEqual(JSON.parse(updateHistory({ history: JSON.stringify(history) }, { cpu: '2' }, 899999)), history);
  const rebuilt = JSON.parse(updateHistory({ history: 'invalid' }, { cpu: '3' }, 900000));
  assert.deepEqual(rebuilt.cpu, [3]);
  assert.deepEqual(rebuilt.loss_ct, [-1]);
});

test('累计流量在网卡计数器重启后仍增加当前计数', () => {
  const result = calculateTraffic({ monthly_rx: '1000', monthly_tx: '2000', last_rx: '100', last_tx: '200', reset_month: 'existing' }, { net_rx: '130', net_tx: '20' }, { auto_reset_traffic: 'false' });
  assert.deepEqual(result, { monthly_rx: 1030, monthly_tx: 2020, last_rx: 130, last_tx: 20, reset_month: 'existing' });
});

test('31 日重置兼容短月份，跨月前仍属于上一个周期', () => {
  const server = { reset_day: '31', monthly_rx: '1000', monthly_tx: '2000', last_rx: '100', last_tx: '200', reset_month: '2026-1-31' };
  const metrics = { net_rx: '130', net_tx: '240' };
  const sys = { auto_reset_traffic: 'true' };
  // 输入时间先减八小时，计算函数再按现有协议转换为北京时间。
  const before = calculateTraffic(server, metrics, sys, new Date(2026, 1, 27, -8));
  assert.equal(before.reset_month, '2026-1-31');
  assert.equal(before.monthly_rx, 1030);
  const reset = calculateTraffic(server, metrics, sys, new Date(2026, 1, 28, -8));
  assert.equal(reset.reset_month, '2026-2-28');
  assert.equal(reset.monthly_rx, 30);
  assert.equal(reset.monthly_tx, 40);
  const nextMonth = calculateTraffic({ ...server, reset_month: '2026-2-28' }, metrics, sys, new Date(2026, 2, 1, -8));
  assert.equal(nextMonth.reset_month, '2026-2-28');
  assert.equal(nextMonth.monthly_rx, 1030);
});
