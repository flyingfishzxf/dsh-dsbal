# dsh-plugin-deepseek-balance

[中文](./README.zh.md)

A DeepSeek API balance widget for the DSH web sidebar.

- Shows your **CNY balance** on a button in the sidebar footer, **above Settings**
  (wallet icon on the left, `¥xx.xx` on the right), aligned with the Settings
  button.
- **30s auto refresh**; click the button to refresh immediately and reset the
  cycle.
- **Hover** opens a usage-notes card: the balance warning legend
  (< 50 yellow · < 30 orange · < 10 red → dashed border on the button), the
  refresh hint, and the last refresh time.
- **Balance warning borders**: < 10 → red, < 30 → orange, < 50 → yellow,
  ≥ 50 → normal (dashed border of the tier colour; orange/yellow are kept
  visually distinct).
- **UI language aware**: all texts follow the DSH language setting (zh / en),
  switching live.

## Install

Once published (npm or GitHub), install from **Settings → Plugin Market**,
or manually:

```sh
dsh plugin --profile web add dsh-plugin-deepseek-balance
```

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

1. Publish the package (or host it on GitHub).
2. Open a PR in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
   adding one entry, e.g.:

   ```json
   {
     "name": "dsh-plugin-deepseek-balance",
     "owner": "<your-github-username>",
     "url": "https://github.com/<your-github-username>/dsh-plugin-deepseek-balance",
     "category": "ui",
     "description": {
       "en": "DeepSeek API balance sidebar widget — CNY balance above Settings, 30s auto refresh, hover details, threshold warnings.",
       "zh": "DSH 侧边栏 DeepSeek 余额插件：设置按钮上方显示人民币余额，30 秒自动刷新，hover 查看明细，余额不足阈值告警。"
     },
     "npm": "dsh-plugin-deepseek-balance"
   }
   ```

The market (dshmarket) picks it up automatically, usually within a day.

## License

MIT
