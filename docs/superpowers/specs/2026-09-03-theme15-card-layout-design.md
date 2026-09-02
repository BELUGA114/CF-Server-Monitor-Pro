# 主题 15（ISFR 赛博玻璃态）卡片数据排布重构 · 设计

日期：2026-09-03

## 背景

主题 15 的服务器卡片当前隐藏了四类数据：

- 三网延迟与丢包（`.ping-box { display: none }`）
- CPU 型号、内存已用/总量、存储已用/总量（`.stat-subtext { display: none }`）

丢包文本挂在 ping 格子内部（`电信 533ms·12%`，见 `src/index.js:2140`），因此延迟一恢复，丢包随之回来。

另有三处既存缺陷：

1. `.card-meta` 被设成 `display:flex; justify-content:space-between`，而「流量: ↓ x | ↑ y」在 DOM 里是「文本节点 + span」混排，flex 会把它拆成 5 个匿名 flex item 撑向两端。
2. `.stat-header span:last-child` 上的 `color:#fff !important` 压掉了行内的 `#ef4444`，导致 CPU/内存/存储 超过 80% 时不再变红告警。
3. `.group-header { display:none }` 隐藏了分组标题，多分组时无法分辨节点归属。

## 目标

借鉴主题 1（默认分栏）的数据排布，把上述数据放回主题 15 的卡片，并保持现有配色不变。

## 非目标

- 不改 `src/index.js`（卡片 DOM 与基础样式由所有主题共用）
- 不改 `workers.js`（历史副本）
- 不改表格视图与详情页（`.ping-box` / `.stat-subtext` / `.stat-group` 仅首页卡片使用，详情页走 `.stat-label` / `.stat-val`）
- 不补 `.badge-v6`（主题 15 无该规则，IPv6 标签现为白字白框；本次保持原样）

## 落点

`nodes.json` → `themes[14].css`（`theme15`）。运行时由 `src/index.js:82` 从 GitHub main 拉取，缓存进 `settings.cached_nodes_data`。

该 css 由三段拼接而成：

1. 原始主题（单行）
2. 暗色补全（提交 `1fdab69`）
3. 详情页 `.header-card` / `.chart-card`

第 2 段已定死卡片全部颜色（`#f8fafc` / `#aab7cc` / `rgba(148,163,184,.2)` / 进度条 `rgba(51,65,85,.68)`）。**本次只改第 1 段的几何与显隐，并在整串末尾追加移动端规则；第 2、3 段不动** —— 这是「配色不变」的结构性保证。

## 选定方案

左右分栏 + 右栏保留主题 15 的行内进度条 + 延迟丢包通栏到卡片底部。

- 左栏 195px：名称 / 价格 / 剩余天数 / 流量 / 在线·更新 / 标签
- 右栏（内容宽约 346px）：CPU·内存·存储 三行「标签 ─ 长条 ─ 数值」，每行下方一行明细；末尾 OS·TCP/UDP 与上下行速度
- 延迟丢包：`position:absolute` 提到卡片底部通栏，`grid-template-columns: repeat(4,1fr)` 四格一行

以下尺寸均按 1200px 容器下两列网格的卡片实测：卡片边框盒 592px，`padding:16px` + 1px 边框，内容区 558px（页面无 `box-sizing` 重置，一律 content-box）。

### 为什么延迟行要通栏

一格「电信 533ms·12%」在 11px 加粗下约 85px，丢包升到三位数（100%）约 95px。

左栏 210px 时 `.ping-box` 内宽 192px（210 − 16 padding − 2 border）：2×2 需 180px，余量仅 12px；一旦某条线路丢包到 100%，两格需 200px 便跳成 4 行，卡片高度当场与同行其它卡片错开。

通栏后 `.ping-box` 内宽 540px，四格加 3×8px 间隙，每格约 129px —— 即使全部 100% 也只用掉 95px。左栏还能收回到 195px，右栏内容宽由 331px 增至 346px，CPU 型号那行更不易被截断。

代价：卡片需固定留出 `padding-bottom: 50px`（延迟行高约 27px + `bottom:16px` + 约 7px 间隙），高度比不通栏方案多约 14px；延迟行必须锁死单行，已由四列网格保证。

## 第 1 段的逐条改动

| 选择器 | 现状 | 改为 |
|---|---|---|
| `.vps-card` | `flex-direction: column !important`；`padding: 16px !important` | 删掉 `flex-direction`；`position: relative`；`padding: 16px 16px 50px !important`；`font-variant-numeric: tabular-nums` |
| `.card-left` | `width:100%`；`margin-bottom:12px`；`border-bottom` + `padding-bottom:12px` | `flex: 0 0 195px !important; width: auto !important; border: none !important; padding: 0 !important; margin: 0 !important` |
| `.card-right` | `width:100% !important; border:none !important; padding:0 !important` | `width: auto !important; border: none !important; border-left: 1px solid rgba(148,163,184,0.16) !important; padding: 0 0 0 16px !important` |
| `.card-title` | 无 margin | 加 `margin-bottom: 8px` |
| `.card-badges` | `margin-top: 6px` | `margin-top: 9px` |
| `.card-meta` | `font-size:11px`；`font-family:monospace`；`display:flex; justify-content:space-between`；虚线下边框；`margin-top:10px !important` | `font-size: 11.5px !important; display: block !important; margin: 0 0 3px !important`（去 monospace、去 flex、去虚线） |
| `.stat-group` | `position:relative; flex-direction:row; align-items:center` | 加 `flex-wrap: wrap` |
| `.stat-header` | `flex:0 0 40px`；`color:#ccc !important` | `flex: 0 0 42px !important`；`color: #fff !important` |
| `.stat-header > span:first-child` | 无 | 新增 `color: #ccc; font-weight: 600` |
| `.stat-header span:last-child` | `font-family:monospace`；`color:#fff !important`；`text-shadow:0 0 2px #000` | 删 `color` 与 `text-shadow`；`font-weight: 700`；`font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |
| `.stat-bar-full` | `margin:0 45px 0 10px`；`height:12px`；`border-radius:6px` | `margin: 0 50px 0 10px !important`；`height: 10px !important`；`border-radius: 5px !important`（背景与阴影行原样保留，由第 2 段覆盖） |
| `.stat-bar-full > div` | `border-radius:6px !important` | `border-radius: 5px !important` |
| `.stat-subtext` | `display: none !important` | `display: block !important; flex: 0 0 100%; margin: 4px 0 0 !important; font-size: 11px !important` |
| `.ping-box` | `display: none !important` | `position: absolute; left: 16px; right: 16px; bottom: 16px; display: grid !important; grid-template-columns: repeat(4, 1fr); gap: 0 8px; margin: 0 !important; background: rgba(51,65,85,0.34) !important; border-color: rgba(148,163,184,0.16) !important` |
| `.ping-box > span` | 无 | 新增 `white-space: nowrap` |
| `.group-header` | `display: none !important` | `color: #f8fafc !important; border-left-color: rgba(96,165,250,0.58) !important` |
| `.card-right > div:nth-last-child(2), :nth-last-child(1)` | `monospace`；虚线下边框；`padding-bottom:6px`；`margin-bottom:6px !important`；`margin-top:0 !important` | 只留 `font-size: 11px !important; color: #aaa !important`（色值原样保留；行内已是 flex space-between，间距交回行内样式） |

### 颜色说明

- `.stat-header` 的两处看似改色，实际生效色不变：数值原本由 `span:last-child` 上的 `#fff !important` 指定，改为写在父级、由行内的 `color: inherit` 继承下来 —— 同一个 `#fff`，但超过 80% 时行内的 `#ef4444` 得以生效。标签仍为 `#ccc`。
- `.card-right` 分栏竖线 `rgba(148,163,184,0.16)`、`.group-header` 的 `#f8fafc` 与 `rgba(96,165,250,0.58)`，均取自第 2 段已有的色值。
- `.ping-box` 面板原本没有任何主题 15 配色（只有 `display:none`），揭开后需要定色。采用 `rgba(51,65,85,0.34)` 配 `rgba(148,163,184,0.16)`，与主题 15 的 slate 系一致；这是本次唯一新增的色值（`.34` 透明度）。
- `.stat-subtext` 与 `.card-meta` 的颜色由第 2 段的 `#aab7cc !important` 提供，无需在第 1 段指定。
- 右栏末两行（OS·TCP/UDP 与上下行速度）第 2 段没有覆盖，生效色是第 1 段的 `#aaa`，与 `.card-meta` 的 `#aab7cc` 略有出入。这是既存差异，本次原样保留。
- `.vps-card` 去掉 `flex-direction: column !important` 后，左右分栏由基础样式 `.vps-card { display: flex }` 的默认 `row` 提供，无需再写 `flex-direction: row`。

### 字体处理

不整卡换等宽字体族 —— 中英混排会变宽，会把 CPU 型号与 OS 那行挤到截断。改为：`.vps-card` 开 `font-variant-numeric: tabular-nums` 让全卡数字等宽对齐，仅三个百分比数值用 `ui-monospace` 字体栈。同时移除 `.card-meta` 与右栏末两行原有的 `monospace`。

## 移动端

第 1 段的 `!important` 会压掉基础样式 `@media (max-width: 800px)` 里的堆叠规则（`src/index.js:2270`），绝对定位的延迟行在窄屏也不合适。在 theme15 css 末尾追加：

```css
@media (max-width: 800px) {
  .theme15 .vps-card { flex-direction: column !important; padding: 16px !important; }
  .theme15 .card-left { flex: 0 0 auto !important; width: 100% !important;
    border-bottom: 1px solid rgba(148,163,184,0.14) !important;
    padding-bottom: 12px !important; margin-bottom: 12px !important; }
  .theme15 .card-right { width: 100% !important; padding-left: 0 !important;
    border-left: none !important; border-top: none !important;
    padding-top: 0 !important; margin-top: 0 !important; }
  .theme15 .ping-box { position: static !important; left: auto; right: auto; bottom: auto;
    grid-template-columns: 1fr 1fr !important; gap: 3px 8px; margin-top: 9px !important; }
}
```

基础样式在该断点给 `.card-right` 加了 `border-top: 1px solid #f0f0f0`，浅色边框在暗底上扎眼，一并关掉。

窄屏下延迟行回到左区、改 2×2：375px 视口时卡片内宽约 287px，两列各约 139px，远超单格所需 79px。

## 验证

- `node -e "JSON.parse(require('fs').readFileSync('nodes.json','utf8'))"` 确认 JSON 未损坏
- `node --check src/index.js`（本次未改该文件，作为回归确认）
- `npx wrangler dev` 检查：首页卡片三列数据齐全、延迟行底部通栏单行、窄屏堆叠、多分组时分组标题可见、CPU 超 80% 时数值变红
- 本地库若已有 `cached_nodes_data`，须先在后台点「🔄 手动更新测速/主题数据」，否则读到的仍是旧缓存

## 生效方式

`cached_nodes_data` 仅在首次初始化（`src/index.js:79`）和后台 `pull_github`（`src/index.js:587`）时写入。push 到 main 触发 Workers Builds 自动部署 Worker，**不会**刷新主题缓存 —— 上线后必须在后台点一次「🔄 手动更新测速/主题数据」。

