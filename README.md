# dsh-dsbal

[中文](./README.zh.md)

A minimal, single-purpose DeepSeek API balance widget for the DSH web
sidebar — it shows one number and nothing else.

- Shows your **CNY balance** on a button in the sidebar footer, **above Settings**
  (wallet icon on the left, `¥xx.xx` on the right), aligned with the Settings
  button.
- **30s auto refresh**; click the button to refresh immediately and reset the
  cycle.
- **Hover** opens a usage-notes card: the balance warning legend
  (< 50 yellow · < 30 orange · < 10 red → dashed border on the button), the
  peak/off-peak billing rule (two rows: peak/off-peak hours), and a merged
  refresh rule + refresh time on one line.
- **Peak/off-peak pricing hint**: periods are defined in Beijing time (peak
  09:00-12:00 & 14:00-18:00, off-peak otherwise; **weekends are off-peak all
  day from 2026-08-23**). A hollow badge sits at the right of the balance —
  red 「梁文峰」 during peak, brand-blue 「梁文谷」 off-peak (right-aligned, never
  wider than the sidebar).
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
  default) and calls `GET {baseURL}/user/balance` through the shell — the
  `web.fetch` seam cannot carry an `Authorization` header:
  - **POSIX**: `curl` with `${DEEPSEEK_API_KEY}` expansion.
  - **Windows**: `node -e` (OpenSSL-based fetch). The sandboxed PowerShell
    shell cannot complete any schannel TLS (curl and .NET both fail with
    `SEC_E_NO_CREDENTIALS`), while Node's fetch is unaffected. The request
    explicitly runs unconfined (`danger-full-access`): the Windows ACL sandbox
    runner breaks for wide deployment workspaces (e.g. starting `dsh web` from
    a home directory), which would otherwise make balance fetching depend on
    the host's start directory. The command is fixed and plugin-authored (URL
    from settings, key from credentials), so this is safe; POSIX stays
    confined.
  - The key and URL ride the shell spec's explicit `env` layer, so the secret
    never appears in the command string or logs.
- The **client half** mounts the Remote, renders the sidebar button and the
  hover card, and owns the refresh loop.

### Configuration

The plugin honours the `llm-deepseek` settings section, exactly like the
DeepSeek model adapter:

- `apiKeyEnv` — credential reference (default `DEEPSEEK_API_KEY`).
- `baseURL` — API base (default `https://api.deepseek.com`).

### Requirements

- POSIX: `curl` on the host. Windows: `node` on the host.
- A configured DeepSeek API key in DSH credentials.

## Limitations

- Shows **only the DeepSeek API balance** — the account behind the configured
  key (`DEEPSEEK_API_KEY` by default), queried via `GET /user/balance`. It
  does not show other providers' or other accounts' balances, and it cannot
  combine or convert between accounts.
- **Read-only**: it displays the balance and nothing else. No top-up, key
  management, or billing operations.
- The refresh interval is fixed at 30 seconds and is not configurable.
- The balance is displayed in CNY, which is how the DeepSeek API reports it.
- Host dependencies: `curl` on POSIX, `node` on Windows (see Requirements).

## Publish to the plugin market

Not listed yet. The list is maintained in
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
as one YAML file per plugin.

To add this plugin:

1. Make sure the repository meets the requirements:
   - at least 1 day old,
   - 10 or more commits,
   - the `dsh-plugin` topic added on GitHub (repo **Settings → General →
     Topics**; CI checks it).
2. Fork `awesome-dsh-plugin`.
3. Add `data/plugins/flyingfishzxf__dsh-dsbal.yml`:

   ```yaml
   url: https://github.com/flyingfishzxf/dsh-dsbal
   name: flyingfishzxf/dsh-dsbal
   category: ui
   description:
     en: 'Shows the DeepSeek API account balance in the DSH Web sidebar with 30s auto-refresh, click-to-refresh, hover details, and low-balance threshold warnings.'
     zh: '在 DSH Web 侧边栏显示 DeepSeek API 账户余额：30 秒自动刷新、点击刷新、悬停查看明细、余额不足阈值告警。'
   ```

   The market description must state what the plugin does without superlatives
   (they get sent back) — the "minimal" positioning lives in this README, not
   in the market entry.

4. Regenerate the READMEs and commit them along with the YAML file:

   ```sh
   npm ci
   node scripts/generate-readme.mjs
   ```

5. Open a pull request.

The market (dshmarket) picks it up automatically after the PR is merged.

## License

MIT
