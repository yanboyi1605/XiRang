# 息壤 · 股票分红计算器（微信小程序）

原生 WXML / WXSS / JS 版本，复用同一套 Node 后端与模拟引擎。

发布流程与所需材料见 [docs/publish-checklist.md](../docs/publish-checklist.md)。

## 开发

1. 启动后端（仓库根目录）：

```powershell
npm start
```

2. 用微信开发者工具导入本目录 `miniprogram/`（或仓库根目录，根目录的 `project.config.json` 已指向 `miniprogram/`）。
3. 在开发者工具“详情 → 本地设置”勾选 **不校验合法域名…**。
4. 修改 `config.js` 中的 `apiBase`：

```js
module.exports = {
  apiBase: 'http://127.0.0.1:3210',
};
```

真机调试时：

- 把 `apiBase` 改成电脑局域网 IP，如 `http://192.168.1.20:3210`。
- 后端用 `$env:HOST='0.0.0.0'; npm start` 启动。
- 正式发布时后端必须使用 HTTPS，并在微信公众平台配置 request 合法域名。

## 页面

- `pages/index/index`：股票卡、日期、定投、分红税、测算结果、Canvas 图表、逐年分红明细。
- `pages/search/search`：中文名 / 拼音 / 拼音首字母 / 代码搜索，A股/港股/美股筛选。

## 引擎

`utils/simulate.js` 是自动生成的 CommonJS 版本。修改 `public/js/simulate.js` 后执行：

```bash
npm run mp:engine
```

## 注意

- AppID 默认是 `touristappid`，正式使用前换成自己的小程序 AppID。
- 小程序不能直接使用 `localhost` 真机访问；必须换成局域网 IP 或 HTTPS 域名。
- Canvas 图表使用原生 2D 绘制，不依赖 ECharts。
