# 三网丢包监控实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 agent 用 ICMP 采集三网加字节节点的真实丢包率与平均 RTT,入库、进 24 小时历史,并在卡片和详情页展示。

**Architecture:** agent 侧并行 ping 四个目标,单轮统计丢包百分比与平均 RTT;ICMP 不可用或全丢时延迟回退到现有 HTTP 探测,丢包字段用 `-1` 表示"测不了"。服务端新增 4 个 `loss_*` 列与 4 个 history 数组,前台卡片追加丢包、详情页新增丢包图表。

**Tech Stack:** Cloudflare Workers、D1、原生 JavaScript、内嵌 POSIX sh 与 PowerShell agent 脚本、Chart.js

**Spec:** `docs/superpowers/specs/2026-09-03-packet-loss-spec.md`

---

## 前置说明:两层转义规则

`src/index.js` 里的 agent 脚本嵌在 JS 模板字符串中,写错转义会直接产出坏脚本。规则如下,改动时必须遵守:

- **Linux/Alpine agent 正文**(在 `cat << EOF > /usr/local/bin/cf-probe.sh` 这个未加引号的 heredoc 里):最终脚本要的 `$VAR`,在 `src/index.js` 里写 `\\$VAR`。JS 把 `\\` 变成 `\`,heredoc 再把 `\$` 变成 `$`。awk 的 `$1`、正则里的 `$` 同理。
- 最终脚本要的 `${VAR}` 形式,必须写 `\\\${VAR}`。直接写 `\\${` 会被 JS 当成插值,语法错误。本计划的代码已避开 `${}`,不需要这种写法。
- **外层安装脚本**(不在 heredoc 里,如 `SERVER_ID=\$1`):写 `\$VAR`。
- **Windows agent 正文**(在 PowerShell 单引号 here-string `@'...'@` 里):`$VAR` 直接写,因为 `$V` 不是 JS 插值起始。但**禁止**出现 `${`。最终脚本要的单个反斜杠写 `\\`。

每次改完先跑 `node --check src/index.js`,再按任务里的验证步骤取出脚本查语法。

---

## Task 1: D1 新增 loss 列并在 /update 落库

**Files:**
- Modify: `src/index.js:62-70`(`newCols`)
- Modify: `src/index.js:1549`(插入归一化辅助函数)
- Modify: `src/index.js:1589-1610`(`UPDATE servers` 语句与 bind 参数)

- [ ] **Step 1: 加列定义**

把 `newCols` 里 `ping_bd` 那一行下面加一行:

```js
        const newCols = {
          ping_ct: "TEXT DEFAULT '0'", ping_cu: "TEXT DEFAULT '0'", ping_cm: "TEXT DEFAULT '0'", ping_bd: "TEXT DEFAULT '0'",
          loss_ct: "TEXT DEFAULT '-1'", loss_cu: "TEXT DEFAULT '-1'", loss_cm: "TEXT DEFAULT '-1'", loss_bd: "TEXT DEFAULT '-1'",
          monthly_rx: "TEXT DEFAULT '0'", monthly_tx: "TEXT DEFAULT '0'", last_rx: "TEXT DEFAULT '0'", last_tx: "TEXT DEFAULT '0'", reset_month: "TEXT DEFAULT ''",
```

两处 `INSERT INTO servers`(`src/index.js:457`、`src/index.js:571`)**不要改**:未列出的列走列默认值,现有 `virt` 就是这个模式。

- [ ] **Step 2: 加归一化辅助函数**

在 `/update` 分支里 `let history = {};`(约 `src/index.js:1549`)这一行**之前**插入:

```js
        // 丢包归一:-1 表示 agent 侧 ICMP 不可用,合法范围 0-100
        const lossNum = (v) => { const n = parseInt(v, 10); return (isNaN(n) || n < -1 || n > 100) ? -1 : n; };
```

- [ ] **Step 3: UPDATE 语句加字段**

把 `UPDATE servers` 里这一行:

```js
              country = ?, ip_v4 = ?, ip_v6 = ?, ping_ct = ?, ping_cu = ?, ping_cm = ?, ping_bd = ?,
```

改成:

```js
              country = ?, ip_v4 = ?, ip_v6 = ?, ping_ct = ?, ping_cu = ?, ping_cm = ?, ping_bd = ?,
              loss_ct = ?, loss_cu = ?, loss_cm = ?, loss_bd = ?,
```

- [ ] **Step 4: bind 参数按顺序补 4 个**

把这一行:

```js
          metrics.ping_ct || '0', metrics.ping_cu || '0', metrics.ping_cm || '0', metrics.ping_bd || '0', 
```

改成:

```js
          metrics.ping_ct || '0', metrics.ping_cu || '0', metrics.ping_cm || '0', metrics.ping_bd || '0', 
          String(lossNum(metrics.loss_ct)), String(lossNum(metrics.loss_cu)), String(lossNum(metrics.loss_cm)), String(lossNum(metrics.loss_bd)), 
```

bind 顺序必须和 SQL 里 `?` 的顺序完全一致,`loss_*` 四个紧跟在 `ping_bd` 之后。

- [ ] **Step 5: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出即通过

- [ ] **Step 6: 起本地环境并造一条数据**

本地需要 `API_SECRET`。仓库没有 `.dev.vars`(已被 gitignore),先建一个只用于本地的:

```bash
printf 'API_SECRET=devsecret\n' > .dev.vars
```

另开一个终端跑 `npx wrangler dev`,等它监听 `127.0.0.1:8787`。先访问一次首页让 schema 初始化:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/
```
Expected: `200`

- [ ] **Step 7: 确认列已建出来**

```bash
npx wrangler d1 execute monitor_db --local --command "PRAGMA table_info(servers)" | grep -E "loss_(ct|cu|cm|bd)"
```
Expected: 四行,分别是 `loss_ct`、`loss_cu`、`loss_cm`、`loss_bd`,默认值 `'-1'`

- [ ] **Step 8: 手工上报一次,验证落库与归一化**

先取一个已存在的节点 id(没有节点就先在后台加一个),然后:

```bash
curl -s -X POST http://127.0.0.1:8787/update -H 'Content-Type: application/json' \
  -d '{"id":"<节点ID>","secret":"devsecret","metrics":{"cpu":"1","ram":"1","disk":"1","load":"0","uptime":"1","ping_ct":"25","loss_ct":"20","loss_cu":"-1","loss_cm":"abc","loss_bd":"999"}}'
```
Expected: 返回 `INTERVAL=5|CT=default|CU=default|CM=default`

```bash
npx wrangler d1 execute monitor_db --local --command "SELECT loss_ct, loss_cu, loss_cm, loss_bd FROM servers LIMIT 1"
```
Expected: `20`、`-1`、`-1`(非数字归一)、`-1`(超出 0-100 归一)

- [ ] **Step 9: 提交**

```bash
git add src/index.js
git commit -m "feat: D1 新增三网丢包字段并在 /update 落库"
```

---

## Task 2: 丢包进 24 小时历史

**Files:**
- Modify: `src/index.js:1579-1583`(history 数组更新)

- [ ] **Step 1: 加四个 history 数组**

在 `history.ping_bd = ...` 那一行后面插入:

```js
            history.ping_bd = updateArr(history.ping_bd, parseInt(metrics.ping_bd) || 0);
            history.loss_ct = updateArr(history.loss_ct, lossNum(metrics.loss_ct));
            history.loss_cu = updateArr(history.loss_cu, lossNum(metrics.loss_cu));
            history.loss_cm = updateArr(history.loss_cm, lossNum(metrics.loss_cm));
            history.loss_bd = updateArr(history.loss_bd, lossNum(metrics.loss_bd));
```

这里必须用 `lossNum` 而不是 `parseInt(...) || 0`,否则 `-1` 会被当成假值以外的问题不说,缺失值会错写成 `0`,把"测不了"变成"零丢包"。

- [ ] **Step 2: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出

- [ ] **Step 3: 清空一个节点的历史,让下次上报立即落点**

history 只在距上次落点满 5 分钟或 `history.time` 不存在时才写,所以先清空:

```bash
npx wrangler d1 execute monitor_db --local --command "UPDATE servers SET history = '{}' WHERE id = '<节点ID>'"
```

- [ ] **Step 4: 上报一次并检查历史内容**

```bash
curl -s -X POST http://127.0.0.1:8787/update -H 'Content-Type: application/json' \
  -d '{"id":"<节点ID>","secret":"devsecret","metrics":{"cpu":"1","ram":"1","disk":"1","load":"0","uptime":"1","ping_ct":"25","loss_ct":"20","loss_bd":"0"}}'
npx wrangler d1 execute monitor_db --local --command "SELECT history FROM servers WHERE id = '<节点ID>'"
```
Expected: JSON 里含 `"loss_ct":[20]`、`"loss_cu":[-1]`、`"loss_cm":[-1]`、`"loss_bd":[0]`

- [ ] **Step 5: 提交**

```bash
git add src/index.js
git commit -m "feat: 三网丢包写入 24 小时历史"
```

---

## Task 3: Linux/Alpine agent 改用 ICMP 探测

**Files:**
- Modify: `src/index.js:1292`(探测函数区,新增 ICMP 相关函数)
- Modify: `src/index.js:1306`(`LOSS_*` 初值)
- Modify: `src/index.js:1319-1339`(探测块,含默认节点与死代码清理)
- Modify: `src/index.js:1416`(上报 payload)

先读本文档开头的"两层转义规则"。下面代码块里的 `\\$` 是写进 `src/index.js` 的字面内容,不是最终脚本内容。

- [ ] **Step 1: 先验证 awk 解析,用真实 ping 输出样本(测试先行)**

这一步不改代码,只确认解析表达式对四种输入都正确。样本用最终脚本形态(单层 `$`):

```bash
mkdir -p /tmp/pl
cat > /tmp/pl/iputils.txt <<'TXT'
PING sh-ct-dualstack.ip.zstaticcdn.com (180.153.1.1) 56(84) bytes of data.

--- sh-ct-dualstack.ip.zstaticcdn.com ping statistics ---
5 packets transmitted, 4 received, 20% packet loss, time 4006ms
rtt min/avg/max/mdev = 25.123/25.456/25.789/0.201 ms
TXT
cat > /tmp/pl/busybox.txt <<'TXT'
PING sh-cm-dualstack.ip.zstaticcdn.com (211.136.25.153): 56 data bytes

--- sh-cm-dualstack.ip.zstaticcdn.com ping statistics ---
5 packets transmitted, 5 packets received, 0% packet loss
round-trip min/avg/max = 31.1/31.4/31.9 ms
TXT
cat > /tmp/pl/alllost.txt <<'TXT'
PING bj-ct-dualstack.ip.zstaticcdn.com (106.37.68.13) 56(84) bytes of data.

--- bj-ct-dualstack.ip.zstaticcdn.com ping statistics ---
5 packets transmitted, 0 received, 100% packet loss, time 4102ms
TXT
: > /tmp/pl/empty.txt
```

```bash
icmp_loss() { awk '/packet loss/ { for (i = 1; i <= NF; i++) if ($i ~ /%$/) { sub(/%$/, "", $i); printf "%.0f", $i + 0; exit } }' "$1"; }
icmp_avg() { awk -F'=' '/min\/avg\/max/ { split($2, a, "/"); printf "%.0f", a[2] + 0; exit }' "$1"; }
for f in iputils busybox alllost empty; do printf '%s loss=[%s] avg=[%s]\n' "$f" "$(icmp_loss /tmp/pl/$f.txt)" "$(icmp_avg /tmp/pl/$f.txt)"; done
```
Expected:

```
iputils loss=[20] avg=[25]
busybox loss=[0] avg=[31]
alllost loss=[100] avg=[]
empty loss=[] avg=[]
```

`alllost` 的 `avg` 为空对应"ping 跑通但全丢",`empty` 两项都空对应"ICMP 不可用",这正是第 6 节三态回退的判定依据。若输出不符,先修表达式再往下做。

- [ ] **Step 2: 新增 ICMP 探测与解析函数**

在 `get_http_ping() { ... }` 那一行(当前 `src/index.js:1292`)**后面**插入下列内容,注意 `\\$`:

```js
PING_COUNT=5
ICMP_OK=0
command -v ping >/dev/null 2>&1 && ICMP_OK=1
# 四个目标并行探测,统计输出按目标后缀落临时文件,解析统一放在 wait 之后
icmp_probe() { ping -c \\$PING_COUNT -w 6 -q "\\$1" > "/tmp/cf-probe-icmp-\\$2" 2>/dev/null; }
# 丢包百分比;输出为空表示 ICMP 不可用(命令缺失、无权限或 DNS 失败)
icmp_loss() { awk '/packet loss/ { for (i = 1; i <= NF; i++) if (\\$i ~ /%\\$/) { sub(/%\\$/, "", \\$i); printf "%.0f", \\$i + 0; exit } }' "/tmp/cf-probe-icmp-\\$1" 2>/dev/null; }
# 平均 RTT;输出为空表示一个回包都没有
icmp_avg() { awk -F'=' '/min\\/avg\\/max/ { split(\\$2, a, "/"); printf "%.0f", a[2] + 0; exit }' "/tmp/cf-probe-icmp-\\$1" 2>/dev/null; }
```

`\\$PING_COUNT` 最终会变成 `$PING_COUNT`;awk 里的 `\\$i`、`/%\\$/` 分别变成 `$i` 和 `/%$/`;`min\\/avg\\/max` 变成 `min\/avg\/max`。

- [ ] **Step 3: 加 LOSS_* 初值**

把这一行:

```js
PING_CT="0"; PING_CU="0"; PING_CM="0"; PING_BD="0"
```

改成两行:

```js
PING_CT="0"; PING_CU="0"; PING_CM="0"; PING_BD="0"
LOSS_CT="-1"; LOSS_CU="-1"; LOSS_CM="-1"; LOSS_BD="-1"
```

- [ ] **Step 4: 替换整个探测块**

把当前 `src/index.js:1319-1339`(从 `if [ \\$((LOOP_COUNT % 6)) -eq 0 ]; then` 到它的 `fi`,含 `case \\$idx in` 那段城市轮换和四次 `get_http_ping`)整段替换为:

```js
  if [ \\$((LOOP_COUNT % 6)) -eq 0 ]; then
    CT_NODE="\\$PING_NODE_CT"
    CU_NODE="\\$PING_NODE_CU"
    CM_NODE="\\$PING_NODE_CM"
    BD_NODE="lf3-ips.zstaticcdn.com"

    [ "\\$CT_NODE" = "default" ] && CT_NODE="sh-ct-dualstack.ip.zstaticcdn.com"
    [ "\\$CU_NODE" = "default" ] && CU_NODE="sh-cu-dualstack.ip.zstaticcdn.com"
    [ "\\$CM_NODE" = "default" ] && CM_NODE="sh-cm-dualstack.ip.zstaticcdn.com"

    if [ "\\$ICMP_OK" = "1" ]; then
      icmp_probe "\\$CT_NODE" ct &
      icmp_probe "\\$CU_NODE" cu &
      icmp_probe "\\$CM_NODE" cm &
      icmp_probe "\\$BD_NODE" bd &
      wait
    fi

    LOSS_CT=\\$(icmp_loss ct); PING_CT=\\$(icmp_avg ct)
    [ -z "\\$LOSS_CT" ] && LOSS_CT="-1"
    [ -z "\\$PING_CT" ] && PING_CT=\\$(get_http_ping "\\$CT_NODE")

    LOSS_CU=\\$(icmp_loss cu); PING_CU=\\$(icmp_avg cu)
    [ -z "\\$LOSS_CU" ] && LOSS_CU="-1"
    [ -z "\\$PING_CU" ] && PING_CU=\\$(get_http_ping "\\$CU_NODE")

    LOSS_CM=\\$(icmp_loss cm); PING_CM=\\$(icmp_avg cm)
    [ -z "\\$LOSS_CM" ] && LOSS_CM="-1"
    [ -z "\\$PING_CM" ] && PING_CM=\\$(get_http_ping "\\$CM_NODE")

    LOSS_BD=\\$(icmp_loss bd); PING_BD=\\$(icmp_avg bd)
    [ -z "\\$LOSS_BD" ] && LOSS_BD="-1"
    [ -z "\\$PING_BD" ] && PING_BD=\\$(get_http_ping "\\$BD_NODE")

    rm -f /tmp/cf-probe-icmp-ct /tmp/cf-probe-icmp-cu /tmp/cf-probe-icmp-cm /tmp/cf-probe-icmp-bd
  fi
```

要点:并行加 `wait` 把四个目标的最坏耗时从 24 秒压到 6 秒左右,低于默认 30 秒离线阈值;`idx`/`D_CT`/`D_CU`/`D_CM` 那套轮换整段删掉,默认节点直接写死上海;`rm -f` 防止下一轮在 ICMP 变不可用时读到上一轮的旧统计。

- [ ] **Step 5: payload 加四个字段**

`PAYLOAD=` 那一行(当前 `src/index.js:1416`)很长,只改结尾部分。把:

```js
\\"ping_bd\\": \\"\\$PING_BD\\", \\"virt\\": \\"\\$VIRT\\" }}"
```

改成:

```js
\\"ping_bd\\": \\"\\$PING_BD\\", \\"loss_ct\\": \\"\\$LOSS_CT\\", \\"loss_cu\\": \\"\\$LOSS_CU\\", \\"loss_cm\\": \\"\\$LOSS_CM\\", \\"loss_bd\\": \\"\\$LOSS_BD\\", \\"virt\\": \\"\\$VIRT\\" }}"
```

- [ ] **Step 6: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出

- [ ] **Step 7: 取出最终 agent 脚本查语法**

`npx wrangler dev` 在跑的前提下,两种系统各查一次:

```bash
for os in debian alpine; do
  curl -s "http://127.0.0.1:8787/install.sh?os=$os" | grep -oE '[A-Za-z0-9+/=]{200,}' | base64 -d > /tmp/pl/inst-$os.sh
  sed -n '/^cat << EOF > \/usr\/local\/bin\/cf-probe.sh$/,/^EOF$/p' /tmp/pl/inst-$os.sh | sed '1d;$d' | sed 's/\\\$/$/g' > /tmp/pl/agent-$os.sh
  printf '%s: ' "$os"
  bash -n /tmp/pl/agent-$os.sh && sh -n /tmp/pl/agent-$os.sh && echo SYNTAX_OK
done
```
Expected: `debian: SYNTAX_OK` 和 `alpine: SYNTAX_OK` 两行

- [ ] **Step 8: 确认转义正确落地**

```bash
grep -c 'icmp_probe' /tmp/pl/agent-debian.sh
grep -n 'sh-ct-dualstack\|sh-cu-dualstack\|sh-cm-dualstack' /tmp/pl/agent-debian.sh
grep -n 'idx\|bj-ct-dualstack' /tmp/pl/agent-debian.sh
grep -o 'printf "%.0f", \$i + 0' /tmp/pl/agent-debian.sh
grep -o 'loss_ct\\": \\"\$LOSS_CT' /tmp/pl/agent-debian.sh
```
Expected: 第一条输出 `5`(一处定义加四处调用);第二条三行,分别命中三个上海节点;第三条**无输出**(轮换和北京默认节点都已删除);第四条输出 `printf "%.0f", $i + 0`(说明 awk 的 `$i` 没被 heredoc 吃掉);第五条有输出(payload 字段落地)。

- [ ] **Step 9: 用真实 ping 输出跑一遍解析函数**

把最终脚本里的三个函数拿出来直接喂 Step 1 的样本文件,确认在真脚本形态下也对:

```bash
cp /tmp/pl/iputils.txt /tmp/cf-probe-icmp-ct
sed -n '/^icmp_loss()/p;/^icmp_avg()/p' /tmp/pl/agent-debian.sh > /tmp/pl/fn.sh
. /tmp/pl/fn.sh && printf 'loss=[%s] avg=[%s]\n' "$(icmp_loss ct)" "$(icmp_avg ct)"
rm -f /tmp/cf-probe-icmp-ct
```
Expected: `loss=[20] avg=[25]`

- [ ] **Step 10: 提交**

```bash
git add src/index.js
git commit -m "feat: Linux/Alpine agent 改用 ICMP 采集三网丢包与延迟"
```

---

## Task 4: Windows agent 改用 ICMP 探测

**Files:**
- Modify: `src/index.js:1074`(`$LOSS_*` 初值)
- Modify: `src/index.js:1076-1093`(`Get-HttpPing` 之后新增 `Get-IcmpStat`)
- Modify: `src/index.js:1100-1114`(探测块)
- Modify: `src/index.js:1210`(payload)

Windows agent 在 PowerShell 单引号 here-string 里,`$VAR` 直接写,但**不能出现 `${`**,单个反斜杠要写 `\\`。下面代码可直接照抄。

- [ ] **Step 1: 加初值**

把这一行:

```js
$PING_CT = "0"; $PING_CU = "0"; $PING_CM = "0"; $PING_BD = "0"
```

改成两行:

```js
$PING_CT = "0"; $PING_CU = "0"; $PING_CM = "0"; $PING_BD = "0"
$LOSS_CT = -1; $LOSS_CU = -1; $LOSS_CM = -1; $LOSS_BD = -1
```

- [ ] **Step 2: 新增 Get-IcmpStat**

在 `function Get-HttpPing { ... }` 的收尾 `}` 之后插入。不用 `ping.exe`,因为中文系统输出的是"丢失 = 0 (0% 丢失)",解析不可靠:

```js
$PING_COUNT = 5

function Get-IcmpStat {
    param([string]$node)
    # 返回 @(丢包百分比, 平均RTT);丢包 -1 表示无法测量,RTT -1 表示一个回包都没有
    try {
        $tasks = @()
        for ($i = 0; $i -lt $PING_COUNT; $i++) {
            $p = New-Object System.Net.NetworkInformation.Ping
            $tasks += $p.SendPingAsync($node, 1000)
        }
        try { [Threading.Tasks.Task]::WaitAll($tasks, 4000) | Out-Null } catch { }
        $done = 0; $ok = 0; $sum = 0
        foreach ($t in $tasks) {
            if ($t.Status -ne "RanToCompletion") { continue }
            $done++
            if ($t.Result.Status -eq "Success") { $ok++; $sum += $t.Result.RoundtripTime }
        }
        if ($done -eq 0) { return @(-1, -1) }
        $loss = [math]::Round(($done - $ok) * 100 / $done)
        if ($ok -eq 0) { return @($loss, -1) }
        return @($loss, [math]::Round($sum / $ok))
    } catch {
        return @(-1, -1)
    }
}
```

`$done` 必须单独统计:任务 faulted(DNS 解析失败等)和任务完成但超时是两回事,前者是"测不了"要报 -1,后者是真丢包要报 100。少了这个区分,DNS 失败会被误报成 100% 丢包。函数收尾的 `}` 要在行首,后面的验证步骤靠它定位函数。

- [ ] **Step 3: 替换探测块**

把 `if ($LOOP_COUNT % 6 -eq 0) { ... }` 整块(含 `$idx`、`$D_CT`、`$D_CU`、`$D_CM` 和四次 `Get-HttpPing`)替换为:

```js
    if ($LOOP_COUNT % 6 -eq 0) {
        $c_ct = if ($PING_NODE_CT -eq "default") { "sh-ct-dualstack.ip.zstaticcdn.com" } else { $PING_NODE_CT }
        $c_cu = if ($PING_NODE_CU -eq "default") { "sh-cu-dualstack.ip.zstaticcdn.com" } else { $PING_NODE_CU }
        $c_cm = if ($PING_NODE_CM -eq "default") { "sh-cm-dualstack.ip.zstaticcdn.com" } else { $PING_NODE_CM }
        $c_bd = "lf3-ips.zstaticcdn.com"

        $r = Get-IcmpStat $c_ct
        $LOSS_CT = $r[0]
        $PING_CT = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_ct }

        $r = Get-IcmpStat $c_cu
        $LOSS_CU = $r[0]
        $PING_CU = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_cu }

        $r = Get-IcmpStat $c_cm
        $LOSS_CM = $r[0]
        $PING_CM = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_cm }

        $r = Get-IcmpStat $c_bd
        $LOSS_BD = $r[0]
        $PING_BD = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_bd }
    }
```

- [ ] **Step 4: payload 加四个字段**

把:

```js
            ping_bd = "$PING_BD"
```

改成:

```js
            ping_bd = "$PING_BD"
            loss_ct = "$LOSS_CT"
            loss_cu = "$LOSS_CU"
            loss_cm = "$LOSS_CM"
            loss_bd = "$LOSS_BD"
```

- [ ] **Step 5: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出

- [ ] **Step 6: 取出最终 PowerShell agent 脚本并解析语法**

`npx wrangler dev` 在跑的前提下,用 PowerShell 执行:

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\pl" | Out-Null
$w = (Invoke-WebRequest "http://127.0.0.1:8787/install.ps1?id=test&secret=test" -UseBasicParsing).Content
$b64 = [regex]::Match($w, '"([A-Za-z0-9+/=]{200,})"').Groups[1].Value
$inst = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
$agent = [regex]::Match($inst, "(?s)\@'\r?\n(.*?)\r?\n'\@").Groups[1].Value
Set-Content "$env:TEMP\pl\agent.ps1" -Value $agent -Encoding UTF8
$errs = $null
$null = [System.Management.Automation.Language.Parser]::ParseInput($agent, [ref]$null, [ref]$errs)
"agent 脚本长度 {0},语法错误 {1} 个" -f $agent.Length, $errs.Count
$agent -match 'sh-ct-dualstack'
$agent -match 'bj-ct-dualstack'
```
Expected: 语法错误 `0` 个;第一个 `-match` 为 `True`,第二个为 `False`(北京默认节点已删除)

- [ ] **Step 7: 直接跑取出来的 Get-IcmpStat,核对三种状态**

```powershell
$agent = Get-Content -Raw "$env:TEMP\pl\agent.ps1"
$fn = [regex]::Match($agent, "(?s)function Get-IcmpStat \{.*?\r?\n\}").Value
$PING_COUNT = 5
Invoke-Expression $fn
foreach ($h in @("sh-ct-dualstack.ip.zstaticcdn.com", "bj-cu-dualstack.ip.zstaticcdn.com", "this-host-does-not-exist-xyz.invalid")) {
  $r = Get-IcmpStat $h
  "{0,-42} loss={1,-5} avg={2}" -f $h, $r[0], $r[1]
}
```
Expected: 上海电信 `loss=0` 且 `avg` 是 20 到 60 之间的数;北京联通 `loss=100 avg=-1`(该节点不回 ICMP);不存在的域名 `loss=-1 avg=-1`

若不存在的域名拿到 100 而不是 -1,说明 `$done` 判定写错或本机 DNS 劫持了 NXDOMAIN,回 Step 2 核对。

- [ ] **Step 8: 提交**

```bash
git add src/index.js
git commit -m "feat: Windows agent 改用 ICMP 采集三网丢包与延迟"
```

---

## Task 5: 卡片显示丢包

**Files:**
- Modify: `src/index.js:1992`(配色辅助函数)
- Modify: `src/index.js:2043`(`pingHtml`)

- [ ] **Step 1: 加丢包配色与文案函数**

在 `const getColor = (ping) => ...` 那一行后面插入:

```js
      const getLossColor = (loss) => { const l = parseInt(loss); if (isNaN(l) || l < 0) return '#9ca3af'; if (l === 0) return '#10b981'; if (l < 5) return '#f59e0b'; return '#ef4444'; };
      const lossText = (loss) => { const l = parseInt(loss); return (isNaN(l) || l < 0) ? '--' : l + '%'; };
```

- [ ] **Step 2: 用一个单元格函数替掉四段重复模板**

把 `const pingHtml = ...` 那一整行(四段几乎相同的 `<span>`)替换为:

```js
            const pingCell = (label, ping, loss) => `<span>${label} <span style="color:${getColor(ping)}; font-weight:bold;">${ping === '0' ? '超时' : ping + 'ms'}</span><span style="color:${getLossColor(loss)}; font-weight:bold;">·${lossText(loss)}</span></span>`;
            const pingHtml = `<div class="ping-box">${pingCell('电信', server.ping_ct, server.loss_ct)}${pingCell('联通', server.ping_cu, server.loss_cu)}${pingCell('移动', server.ping_cm, server.loss_cm)}${pingCell('字节', server.ping_bd, server.loss_bd)}</div>`;
```

延迟为 `'0'` 显示"超时"的既有行为保持不变。`.ping-box` 已有 `flex-wrap: wrap` 和 `gap`,追加一段 `<span>` 不需要改 CSS,18 套主题也不用动。

- [ ] **Step 3: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出

- [ ] **Step 4: 看首页渲染**

先造三种状态的数据(节点 ID 换成本地真实的):

```bash
npx wrangler d1 execute monitor_db --local --command "UPDATE servers SET ping_ct='25', loss_ct='0', ping_cu='31', loss_cu='3', ping_cm='45', loss_cm='40', ping_bd='0', loss_bd='-1', last_updated=$(date +%s)000"
curl -s http://127.0.0.1:8787/ | grep -o 'ping-box.\{0,400\}'
```
Expected: 依次出现 `电信 ... 25ms ... ·0%`(绿)、`联通 ... 31ms ... ·3%`(橙)、`移动 ... 45ms ... ·40%`(红)、`字节 ... 超时 ... ·--`(灰)

- [ ] **Step 5: 提交**

```bash
git add src/index.js
git commit -m "feat: 首页卡片显示三网丢包"
```

---

## Task 6: 详情页丢包图表

**Files:**
- Modify: `src/index.js:1810-1815`(新增图表容器)
- Modify: `src/index.js:1869-1895`(`initPingChart` 加参数)
- Modify: `src/index.js:1903`(注册图表)
- Modify: `src/index.js:1937-1947`(history 默认值与图表更新)

- [ ] **Step 1: 加图表容器**

在"三网延迟 (ms)"那个 `chart-card` 的 `</div>` 之后、外层 `</div>` 之前插入:

```js
              <div class="chart-card chart-full" style="padding: 20px; border-radius: 12px; position: relative; grid-column: 1 / -1;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                   <span class="card-title" style="font-weight:bold;">三网丢包 (%)</span>
                 </div>
                 <div style="height: 250px;"><canvas id="chart-loss"></canvas></div>
              </div>
```

- [ ] **Step 2: 让 initPingChart 可复用**

把 `function initPingChart() {` 改成:

```js
            function initPingChart(ctxId, yMax) {
```

同一函数体内把:

```js
              const ctx = document.getElementById('chart-ping').getContext('2d');
```

改成:

```js
              const ctx = document.getElementById(ctxId).getContext('2d');
```

并把 y 轴那一行:

```js
                    y: { grid: { color: gridColor }, ticks: { color: fontColor }, beginAtZero: true }
```

改成:

```js
                    y: { grid: { color: gridColor }, ticks: { color: fontColor }, beginAtZero: true, max: yMax }
```

延迟图传 `undefined`,Chart.js 会忽略 `max`,行为和现在一致;丢包图传 `100`,y 轴锁定 0 到 100,不会因为一直 0% 把刻度压成一条线。四条线的 label(电信、联通、移动、字节)两张图共用,不用改。

- [ ] **Step 3: 注册两张图**

把:

```js
               charts.ping = initPingChart();
```

改成:

```js
               charts.ping = initPingChart('chart-ping');
               charts.loss = initPingChart('chart-loss', 100);
```

- [ ] **Step 4: history 默认值补四个数组**

把 `let history = { time: [], ... ping_bd: [] };` 改成:

```js
                  let history = { time: [], cpu: [], ram: [], proc: [], net_in: [], net_out: [], tcp: [], udp: [], ping_ct: [], ping_cu: [], ping_cm: [], ping_bd: [], loss_ct: [], loss_cu: [], loss_cm: [], loss_bd: [] };
```

- [ ] **Step 5: 喂数据**

在 `updateChart(charts.ping, ...)` 那一行后面插入:

```js
                     updateChart(charts.loss, labels, [history.loss_ct, history.loss_cu, history.loss_cm, history.loss_bd]);
```

- [ ] **Step 6: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出

- [ ] **Step 7: 验证详情页**

```bash
curl -s "http://127.0.0.1:8787/?id=<节点ID>" | grep -o 'chart-loss' | wc -l
curl -s "http://127.0.0.1:8787/?id=<节点ID>" | grep -o '三网丢包 (%)'
```
Expected: 第一条输出 `2`(一个 canvas 容器加一处 `initPingChart` 调用);第二条输出 `三网丢包 (%)`

再用浏览器打开该详情页,确认两张图都渲染、丢包图 y 轴上限是 100、且切换暗色主题后网格和字色跟延迟图一致。

- [ ] **Step 8: 提交**

```bash
git add src/index.js
git commit -m "feat: 详情页新增三网丢包图表"
```

---

## Task 7: 后台节点选择加 ICMP 提示

**Files:**
- Modify: `src/index.js:800-803`(三网节点选择区)

- [ ] **Step 1: 改标题并加提示**

把:

```js
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #8b5cf6;">📡 三网延迟测试节点选择 (动态下发更新)</label>
```

改成:

```js
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #8b5cf6;">📡 三网延迟与丢包测试节点选择 (动态下发更新)</label>
```

并在"移动 (CM) 测速节点"那个 `form-group` 之后插入:

```js
              <div style="font-size: 12px; color: #888; margin-top: -4px;">丢包依赖 ICMP。少数节点不回 ICMP(如北京电信、北京联通),选中后丢包会恒显示 100%,默认节点已改为上海。</div>
```

- [ ] **Step 2: 语法检查**

Run: `node --check src/index.js`
Expected: 无输出

- [ ] **Step 3: 验证后台页面**

```bash
curl -s -u "admin:devsecret" http://127.0.0.1:8787/<admin_path> | grep -o '丢包依赖 ICMP[^<]*'
```

`admin_path` 取自 `settings` 表,默认值见 `sys` 初始化;Basic 认证密码是 `API_SECRET`。
Expected: 输出提示文案

- [ ] **Step 4: 提交**

```bash
git add src/index.js
git commit -m "feat: 后台节点选择提示 ICMP 丢包限制"
```

---

## Task 8: 端到端验证与收尾

**Files:** 无代码改动

- [ ] **Step 1: 复查完整 diff**

```bash
git log --oneline -7
git diff 35789d4 --stat
```
Expected: 只有 `src/index.js` 和 `docs/` 两份文档被改;`workers.js` **没有**出现(历史副本按 CLAUDE.md 不同步)

- [ ] **Step 2: 三种状态走一遍完整链路**

```bash
for c in '{"loss_ct":"0","loss_cu":"3","loss_cm":"40","loss_bd":"-1","ping_ct":"25","ping_cu":"31","ping_cm":"45","ping_bd":"0"}'; do
  curl -s -X POST http://127.0.0.1:8787/update -H 'Content-Type: application/json' \
    -d "{\"id\":\"<节点ID>\",\"secret\":\"devsecret\",\"metrics\":$c}"
  echo
done
npx wrangler d1 execute monitor_db --local --command "SELECT ping_ct, loss_ct, ping_bd, loss_bd FROM servers WHERE id='<节点ID>'"
```
Expected: 上报返回 `INTERVAL=...`;查询得到 `25 / 0 / 0 / -1`

浏览器打开首页与该节点详情页,确认卡片四段丢包配色正确、详情页两张图都有线。

- [ ] **Step 3: 清理临时文件**

```bash
rm -rf /tmp/pl /tmp/cf-probe-icmp-ct /tmp/cf-probe-icmp-cu /tmp/cf-probe-icmp-cm /tmp/cf-probe-icmp-bd
```

`.dev.vars` 保留还是删掉都行,它在 `.gitignore` 里;确认 `git status --short` 干净。

- [ ] **Step 4: 确认存量 agent 需要重装**

`/update` 只下发 `INTERVAL`、`CT`、`CU`、`CM`,没有脚本自更新通道。已经装在机器上的旧 agent 不会上报 `loss_*`,面板会一直显示 `--`,延迟也还是 HTTP 口径。要拿到丢包必须在每台机器上重跑一键安装命令。这条要在交付说明里写清楚,不要当成 bug 排查。

- [ ] **Step 5: 部署由用户决定**

按项目部署方式,push 到 `main` 会触发 Workers Builds 自动发布生产。是否 push 由用户决定,不要自动执行。











