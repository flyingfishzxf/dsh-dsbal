# dsh-dsbal

[English](./README.md)

DSH Web 侧边栏的 DeepSeek API 余额插件。

- 侧边栏底部**设置按钮上方**显示**人民币余额**（左侧钱包图标，右侧 `¥xx.xx`），与设置按钮对齐。
- **30 秒自动刷新**；点击按钮立即手动刷新并重置自动周期。
- **hover** 弹出功能说明卡：余额告警阈值说明（< 50 黄 / < 30 橙 / < 10 红 → 按钮虚线边框）、刷新说明与最近刷新时间。
- **余额不足告警**：< 10 红色、< 30 橙色、< 50 黄色、≥ 50 正常（按钮加对应颜色的虚线边框；橙、黄两色做了视觉区分）。
- **跟随界面语言**：全部文本随 DSH 语言设置（zh / en）动态切换。

## 安装

直接从 GitHub 安装（当前推荐方式）：

```sh
dsh plugin --profile web add github:flyingfishzxf/dsh-dsbal
```

或者发布到 npm 后：

```sh
dsh plugin --profile web add dsh-dsbal
```

本地开发时也可以从本地路径安装：

```sh
dsh plugin --profile web add file:/path/to/dsh-dsbal
```

> 安装后需要重启 `dsh web` 并强制刷新浏览器，新的 bundle 才会生效。

## 工作原理

- **宿主端**注册 `dsBalance` Remote 服务：`fetch` 通过凭据通道解析 DeepSeek API Key（默认 `DEEPSEEK_API_KEY`），用 `curl` 调用 `GET {baseURL}/user/balance`（`web.fetch` 无法携带 `Authorization` 头）。
- **客户端**挂载 Remote、渲染侧边栏按钮与 hover 卡片，并负责刷新循环。

### 配置

与 DeepSeek 模型适配器一致，插件尊重 `llm-deepseek` 设置段：

- `apiKeyEnv` — 凭据引用（默认 `DEEPSEEK_API_KEY`）。
- `baseURL` — API 基地址（默认 `https://api.deepseek.com`）。

### 依赖

- 宿主需要 `curl`（用于携带 Authorization 头）。
- DSH 凭据中需配置 DeepSeek API Key。

## 推送到插件市场

目前尚未收录。插件列表由 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 维护，每个插件对应一个 YAML 文件。

要收录本插件：

1. 确保仓库满足要求：
   - 创建满 1 天；
   - 提交数 ≥ 10；
   - 在 GitHub 仓库添加 `dsh-plugin` topic。
2. Fork `awesome-dsh-plugin`。
3. 新增 `data/plugins/flyingfishzxf__dsh-dsbal.yml`：

   ```yaml
   url: https://github.com/flyingfishzxf/dsh-dsbal
   name: flyingfishzxf/dsh-dsbal
   category: ui
   description:
     en: 'DeepSeek API balance sidebar widget for DSH Web — CNY balance above Settings, 30s auto refresh, click to refresh, hover details, threshold warnings.'
     zh: 'DSH 侧边栏 DeepSeek 余额插件：设置按钮上方显示人民币余额，30 秒自动刷新，点击刷新，hover 查看明细，余额不足阈值告警。'
   ```

4. 重新生成 README 并与 YAML 一起提交：

   ```sh
   npm ci
   node scripts/generate-readme.mjs
   ```

5. 发起 Pull Request。

PR 合并后，dshmarket 会自动收录。

## 许可证

MIT
