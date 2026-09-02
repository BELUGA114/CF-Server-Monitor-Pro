# 三网丢包监控设计

日期:2026-09-03
状态:已确认,待实现
参考实现:komari(`E:\Code\go\komari`)

## 1. 背景与现状

当前项目只有三网延迟,没有丢包:

- Linux/Alpine agent 的 `get_http_ping()` 用 `curl -o /dev/null -m 2 -w "%{time_total}"` 取单次 HTTP 耗时(当前 `src/index.js:1292`)。
- Windows agent 的 `Get-HttpPing` 用 `WebRequest` 发一次 HEAD,秒表计时(当前 `src/index.js:1076`)。
- 每 6 个上报周期探测一次,默认间隔 5 秒即约 30 秒一轮(当前 `src/index.js:1319`)。
- 落库字段只有 `ping_ct / ping_cu / ping_cm / ping_bd`,失败写 `0`,前台显示"超时"。

komari 的丢包口径:agent 每个任务周期上报一个整数延迟,失败样本记为负值,丢包率在查询和展示时按窗口统计 `count(value < 0) / count(total)`(`internal/metricstore/ping_records.go`、`web/rpc/jsonrpc/common.record.go`)。本方案沿用它"负值表示无效样本"的约定,但丢包率改为 agent 侧单轮 ICMP 统计,因为本项目的历史是 5 分钟一个点,窗口统计的分辨率不够。

## 2. 目标

- 三网(电信、联通、移动)加字节节点,采集真实 ICMP 丢包率。
- 延迟口径统一为 ICMP 平均 RTT。
- 丢包当前值入库,并进 24 小时历史,详情页出图。
- 能区分"真丢包 100%"和"本机测不了 ICMP"。

## 3. 非目标

- 不做丢包告警(Telegram)。
- 不新增构建工具、依赖或测试框架。
- 不改 `/update` 的动态配置协议,探测包数写死在 agent 脚本变量里。
- 不在安装脚本里装 `iputils-ping` 等系统包,缺失时走回退。

## 4. 前置实测结论

三条结论决定了下面的设计,均为本机实测:

1. ICMP 可用性:`nodes.json` 中 93 个三网节点,79 个 3/3 回 ICMP,14 个完全不回。不回的包含**北京电信**(`bj-ct-dualstack.ip.zstaticcdn.com`)和**北京联通**(`bj-cu-dualstack.ip.zstaticcdn.com`),而这两个正是当前实际生效的默认节点。上海三节点全部 3/3 通。
2. 节点轮换是死代码:`LOOP_COUNT % 6 == 0` 成立时 `LOOP_COUNT % 3` 必然为 0,所以 `idx` 恒为 0,默认节点永远是北京。Linux 与 Windows agent 同一问题。
3. 串行探测会打成离线:`offline_threshold` 默认 30 秒(`src/index.js:124`),4 个目标串行 `ping -c 5` 需 16 到 24 秒,叠加上报间隔会超阈值。探测必须并行。

## 5. 测量方案

### Linux / Alpine

四个目标**并行**执行 `ping -c 5 -w 6 -q`,各自输出写 `/tmp/cf-probe-icmp-{ct,cu,cm,bd}`,`wait` 后统一解析,解析完删除临时文件。最坏耗时约 6 秒(全部超时),典型约 4 秒。

解析需同时兼容两种输出:

- iputils(Debian 系):`5 packets transmitted, 5 received, 0% packet loss, time 4006ms` + `rtt min/avg/max/mdev = 25.1/25.4/25.9/0.3 ms`
- busybox(Alpine):`5 packets transmitted, 5 packets received, 0% packet loss` + `round-trip min/avg/max = 25.1/25.4/25.7 ms`

取值规则:丢包取 `packet loss` 行中带 `%` 的字段,非整数按四舍五入取整;延迟取 `min/avg/max` 行 `=` 之后按 `/` 分割的第二个值,两种格式下平均值都在该位置。awk 需在 busybox awk 下可用。若某些老版本 busybox 不认 `-w` 参数,标准输出为空,按第 6 节第三种情况处理。

### Windows

用 `System.Net.NetworkInformation.Ping` 的 `SendPingAsync`,每目标并发 5 包、单包超时 1000ms,统计 `Status -eq 'Success'` 数量与平均 RTT。目标之间串行,每目标约 1 秒。不使用 `ping.exe`,因为其统计行是本地化文本(中文系统输出"丢失 = 0 (0% 丢失)"),解析不可靠。

包数固定 5,写成脚本顶部 `PING_COUNT` 变量。

## 6. 三态回退规则

| 情况 | 延迟取值 | 丢包字段 | 前台显示 |
| --- | --- | --- | --- |
| ping 正常且有回包 | ICMP 平均 RTT | 0 到 100 | `25ms·0%` |
| ping 跑通但全丢(目标不回 ICMP) | 回退 `get_http_ping` / `Get-HttpPing` | 100 | `48ms·100%` |
| ping 缺失、无权限或 DNS 失败 | 回退 `get_http_ping` / `Get-HttpPing` | -1 | `48ms·--` |

判定依据:解析不到 `packet loss` 行(或 Windows 侧抛异常)即为第三种情况;解析到丢包但拿不到 RTT 行即为第二种。回退探测使用同一目标主机,不换节点。

`-1` 表示不可用,与 komari 用负值表示无效样本一致。精简容器和无 CAP_NET_RAW 的环境不会被误显示成节点故障。

## 7. 默认节点与死代码清理

- `default` 由 `bj-*` 改为 `sh-*`(Linux 与 Windows agent 各一处)。
- 删除恒取 `idx=0` 的城市轮换代码。轮换即使修好也会让丢包与延迟序列在不同城市间跳变,时间序列口径反而不一致。
- 后台三个节点下拉框下方加一行提示:丢包依赖 ICMP,少数节点(如北京电信、北京联通)不回 ICMP 会显示 100%(当前 `src/index.js:801`)。

## 8. 数据模型

- `newCols` 新增 `loss_ct / loss_cu / loss_cm / loss_bd`,类型 `TEXT DEFAULT '-1'`(当前 `src/index.js:63`)。
- 两处 `INSERT INTO servers` 不需要修改:未列出的列走列默认值,现有 `virt` 就是这个模式(当前 `src/index.js:457`、`src/index.js:571`)。
- `/update` 的 `UPDATE` 语句新增 4 个字段;非数字值归一为 `-1`(当前 `src/index.js:1595`、`src/index.js:1607`)。
- agent 上报 JSON 的 `metrics` 新增 `loss_ct / loss_cu / loss_cm / loss_bd`(当前 `src/index.js:1416`)。
- `history` 新增 `loss_ct / loss_cu / loss_cm / loss_bd` 四个数组,复用 `updateArr`,保持 5 分钟一个点、288 点上限即 24 小时(当前 `src/index.js:1579`)。预计 history JSON 增加约 4.6KB,现有约 10 到 15KB。

## 9. 前台展示

- 卡片 `ping-box`:在延迟后追加丢包,格式 `电信 25ms·0%`。丢包单独配色:0 绿、小于 5% 橙、大于等于 5% 红、`-1` 灰显示 `--`。延迟为 0 时"超时"的既有逻辑保留(当前 `src/index.js:2043`)。
- 详情页在"三网延迟 (ms)"下方新增"三网丢包 (%)"图表,4 条线,y 轴 0 到 100,沿用 `initPingChart` 的写法(当前 `src/index.js:1810`、`src/index.js:1869`)。
- `fetchData()` 的 history 解析补 4 个数组(当前 `src/index.js:1937`)。

## 10. 验证方案

1. `node --check src/index.js`。
2. `npx wrangler dev` 后拉取 `/install.sh`(debian 与 alpine 两种)与 `/install.ps1`,base64 解码,对 shell 脚本跑 `sh -n` 语法检查。
3. 用 iputils 与 busybox 两种真实统计文本喂 awk 解析,核对丢包与平均 RTT 取值。
4. Windows 侧 `Get-IcmpStat` 在本机直接跑真 ICMP,核对 0% 与 100% 两种目标。
5. 手工 POST 一次 `/update`,确认落库、卡片渲染、详情页两张图。

Linux agent 的真机行为无法在 Windows 上完整覆盖。如需真机验证,可将探测函数单独拷到一台 Linux 机器执行后删除,不安装 agent。

## 11. 风险与取舍

- 延迟口径由 HTTP `time_total` 改为 ICMP 平均 RTT,升级瞬间历史曲线会出现一次台阶,ICMP RTT 通常明显低于 HTTP 耗时。这是已确认接受的取舍。
- 用户若手动选中不回 ICMP 的节点,会看到恒定 100% 丢包。用后台提示文案覆盖,不做自动探测切换。
- 探测耗时由典型 0.2 秒升至约 4 秒,上报周期在探测轮次会被拉长到约 10 秒,仍低于 30 秒离线阈值。若用户把 `offline_threshold` 调到 10 秒以下会误判离线。
- Windows 侧 5 包并发发送属于突发探测,Linux 侧 `ping` 默认 1 秒间隔,两端方法学存在细微差异,同一节点的数值不完全可横向比较。
