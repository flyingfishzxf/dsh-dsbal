# dsh-dsbal

[中文](./README.zh.md)

A DeepSeek API balance widget for the DSH web sidebar.

- Shows your **CNY balance** on a button in the sidebar footer, **above Settings**
  (wallet icon on the left, `¥xx.xx` on the right), aligned with the Settings
  button.
- **30s auto refresh**; click the button to refresh immediately and reset the
  cycle.
- **Hover** opens a usage-notes card: the balance warning legend
  (< 50 yellow · < 30 orange · < 10 red → dashed border on the button), the
  peak/off-peak definition (two rows: peak/off-peak hours), the refresh hint,
  and the last refresh time.
- **Peak/off-peak pricing hint**: periods are defined in Beijing time (peak
  09:00-12:00 & 14:00-18:00, off-peak otherwise). A hollow badge sits at the
  right of the balance — red 「梁文峰」 during peak, brand-blue 「梁文谷」 off-peak
  (right-aligned, never wider than the sidebar).
- **Balance warning borders**: < 10 → red, < 30 → orange, < 50 → yellow,
  ≥ 50 → normal (dashed border of the tier colour; orange/yellow are kept
  visually distinct).
- **UI language aware**: all texts follow the DSH language setting (zh / en),
  switching live.

## Install

Install directly from GitHub (currently recommended):

```sh
dsh plugin --profile web add github:flyingfishzxf/dsh-dsbal
```

Or, after the package is published to npm:

```sh
dsh plugin --profile web add dsh-dsbal
```

For local development, you can install from a local path:

```sh
dsh plugin --profile web add file:/path/to/dsh-dsbal
```

> After installing, restart `dsh web` and hard-refresh the browser so the new
> bundle is loaded.

## How it works

- The **host half** registers a `dsBalance` Remote service. `fetch` resolves
  the DeepSeek API key through the credential seam (`DEEPSEEK_API_KEY` by
  default) and calls `GET {baseURL}/user/balance` via `curl` — the `web.fetch`
  seam cannot carry an `Authorization` header.
- The **client half** mounts the Remote, renders the sidebar button and the
  hover card, and owns the refresh loop.

### Configuration

The plugin honours the `llm-deepseek` settings section, exactly like the
DeepSeek model adapter:

- `apiKeyEnv` — credential reference (default `DEEPSEEK_API_KEY`).
- `baseURL` — API base (default `https://api.deepseek.com`).

### Requirements

- `curl` on the host (used to carry the Authorization header).
- A configured DeepSeek API key in DSH credentials.

## Publish to the plugin market

Not listed yet. The list is maintained in
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
as one YAML file per plugin.

To add this plugin:

1. Make sure the repository meets the requirements:
   - at least 1 day old,
   - 10 or more commits,
   - the `dsh-plugin` topic added on GitHub.
2. Fork `awesome-dsh-plugin`.
3. Add `data/plugins/flyingfishzxf__dsh-dsbal.yml`:

   ```yaml
   url: https://github.com/flyingfishzxf/dsh-dsbal
   name: flyingfishzxf/dsh-dsbal
   category: ui
   description:
     en: 'DeepSeek API balance sidebar widget for DSH Web — CNY balance above Settings, 30s auto refresh, click to refresh, hover details, threshold warnings.'
     zh: 'DSH 侧边栏 DeepSeek 余额插件：设置按钮上方显示人民币余额，30 秒自动刷新，点击刷新，hover 查看明细，余额不足阈值告警。'
   ```

4. Regenerate the READMEs and commit them along with the YAML file:

   ```sh
   npm ci
   node scripts/generate-readme.mjs
   ```

5. Open a pull request.

The market (dshmarket) picks it up automatically after the PR is merged.

## License

MIT
