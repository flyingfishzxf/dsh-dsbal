# dsh-dsbal

[English](./README.md)

极简的 DeepSeek API 余额显示插件：只在 DSH Web 侧边栏显示一个数字，不做别的事。

- 侧边栏底部**设置按钮上方**显示**人民币余额**（左侧钱包图标，右侧 `¥xx.xx`），与设置按钮对齐。
- **30 秒自动刷新**；点击按钮立即手动刷新并重置自动周期。
- **hover** 弹出功能说明卡：顶部一行大字**当前余额** `¥xx.xx`，随后是余额告警阈值说明（< 50 黄 / < 30 橙 / < 10 红 → 按钮虚线边框）、峰谷计费规则（两行：高峰/低谷时段）、合并的刷新规则与刷新时间（一行），底部右对齐显示当前插件版本（如 `dsh-dsbal v0.4.1`）。**卡片宽度跟随按钮**：展开时与按钮列等宽（上限 360px），收起时固定 240px，侧栏收展过程中宽度与位置实时跟随。
- **侧栏收起时**按钮变成 36px 圆图标：圆内放不下数字与文字，因此峰/谷改由**图标颜色**表达（高峰红 `#e5484d` / 低谷蓝 `#4d6bfe`），精确余额在 hover 卡片顶部读取。展开时图标保持中性色，峰谷只由「梁文峰／梁文谷」胶囊表达，不重复着色。
- **峰谷定价提示**：时段按北京时间定义（高峰为**周一至周五** 09:00-12:00、14:00-18:00；其余时段、**周末全天**（调休上班的周末也算）以及**中国法定节假日全天**均为低谷，低谷价格为高峰的一半）。余额右侧显示空心 badge——高峰为红色「梁文峰」、低谷为 DeepSeek 品牌蓝「梁文谷」（badge 右对齐，宽度不超过侧边栏）。法定节假日表在浏览器端静默拉取 [holiday-cn](https://github.com/NateScarlet/holiday-cn)（jsDelivr → GitHub raw 依次尝试），缓存于 `localStorage` 24 小时，离线或未拉到时回退到内置的 2025/2026 放假日表。
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

- **宿主端**注册 `dsBalance` Remote 服务：`fetch` 通过凭据通道解析 DeepSeek API Key（默认 `DEEPSEEK_API_KEY`），经 shell 调用 `GET {baseURL}/user/balance`（`web.fetch` 无法携带 `Authorization` 头）：
  - **POSIX**：`curl`，使用 `${DEEPSEEK_API_KEY}` 展开。
  - **Windows**：`node -e`（基于 OpenSSL 的 fetch）。沙箱化的 PowerShell 无法完成任何 schannel TLS（curl 与 .NET 均报 `SEC_E_NO_CREDENTIALS`），Node 的 fetch 不受影响。该请求显式以非受限方式运行（`danger-full-access`）：Windows ACL 沙箱在宽工作区部署下会失效（例如从主目录启动 `dsh web`），否则余额获取会依赖宿主的启动目录。命令是固定的、由插件自身构造（URL 来自设置、密钥来自凭据通道），因此安全；POSIX 保持受限模式。
  - 密钥与 URL 均通过 shell spec 的显式 `env` 层传递，绝不出现在命令行或日志中。
- **客户端**挂载 Remote、渲染侧边栏按钮与 hover 卡片，并负责刷新循环。

### 配置

与 DeepSeek 模型适配器一致，插件尊重 `llm-deepseek` 设置段：

- `apiKeyEnv` — 凭据引用（默认 `DEEPSEEK_API_KEY`）。
- `baseURL` — API 基地址（默认 `https://api.deepseek.com`）。

### 依赖

- POSIX：宿主需要 `curl`；Windows：宿主需要 `node`。
- DSH 凭据中需配置 DeepSeek API Key。
- DSH 宿主兼容性：宿主端使用当前的 `shell.execute(...).result()` 执行接口与 `settings.describe()` 读取配置节，并回退到 0.1.7 之前的 `shell.run()` / `settings.get()`，因此同一份插件在宿主升级前后都能工作。

## 局限

- **只显示 DeepSeek API 余额**——即配置的 API Key（默认 `DEEPSEEK_API_KEY`）对应账户通过 `GET /user/balance` 查询的余额。不显示其他提供商或其他账户的余额，也无法合并或换算多个账户。
- **只读**：仅展示余额，不含充值、密钥管理等操作。
- 刷新间隔固定为 30 秒，不可配置。
- 余额以人民币（CNY）显示（DeepSeek API 以 CNY 报告账户余额）。
- 宿主依赖：POSIX 需要 `curl`，Windows 需要 `node`（见"依赖"）。

## 推送到插件市场

目前尚未收录。插件列表由 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 维护，每个插件对应一个 YAML 文件。

要收录本插件：

1. 确保仓库满足要求：
   - 创建满 1 天；
   - 提交数 ≥ 10；
   - 在 GitHub 仓库添加 `dsh-plugin` topic（仓库 **Settings → General → Topics**，CI 会检查）。
2. Fork `awesome-dsh-plugin`。
3. 新增 `data/plugins/flyingfishzxf__dsh-dsbal.yml`：

   ```yaml
   url: https://github.com/flyingfishzxf/dsh-dsbal
   name: flyingfishzxf/dsh-dsbal
   category: usage
   description:
     en: 'Shows the DeepSeek API account balance in the DSH Web sidebar with 30s auto-refresh, click-to-refresh, hover details, and low-balance threshold warnings.'
     zh: '在 DSH Web 侧边栏显示 DeepSeek API 账户余额：30 秒自动刷新、点击刷新、悬停查看明细、余额不足阈值告警。'
   ```

   市场描述只写功能、不带营销词（最高级会被打回）——"极简"定位写在本 README 里，不写进市场条目。

4. 重新生成 README 并与 YAML 一起提交：

   ```sh
   npm ci
   node scripts/generate-readme.mjs
   ```

5. 发起 Pull Request。

PR 合并后，dshmarket 会自动收录。

## 许可证

MIT
