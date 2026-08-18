/**
 * dsh-plugin-deepseek-balance — Client half.
 *
 * Renders a balance button in `sidebar.footer.action` (its own row above the
 * cordis badge and the Settings button), backed by the host `dsBalance`
 * Remote service. 30s auto refresh, click to refresh (resets the cycle),
 * hover detail card, tier-coloured dashed borders, UI-language aware text.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-deepseek-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var react = require('react')
    var React = react

    var inject = ['slots', 'timer', 'locale', 'remote']

    // ---- dictionaries (follow the active UI language) ----
    var zh = {
      label: '余额',
      cny: '余额(¥)',
      usd: '余额($)',
      toppedUp: '充值额度',
      granted: '赠送额度',
      autoHint: '30秒自动刷新 | 点击刷新',
      refreshTime: '刷新时间：{time}',
      refreshing: '刷新中…',
      error: '获取余额失败',
      noKey: '未配置 API Key（DEEPSEEK_API_KEY）',
    }
    var en = {
      label: 'Balance',
      cny: 'Balance (¥)',
      usd: 'Balance ($)',
      toppedUp: 'Topped up',
      granted: 'Granted',
      autoHint: '30s auto refresh | Click to refresh',
      refreshTime: 'Refresh time: {time}',
      refreshing: 'Refreshing…',
      error: 'Failed to fetch balance',
      noKey: 'API key not configured (DEEPSEEK_API_KEY)',
    }

    // ---- host Remote contract (mirrors lib/index.js) ----
    var DS_BALANCE_INVOCATIONS = [
      {
        id: 'dsh-plugin-deepseek-balance#dsBalance/fetch',
        service: 'dsBalance',
        namespace: 'dsBalance',
        method: 'fetch',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'src-json' },
      },
    ]
    var DS_BALANCE_REMOTE = {
      package: 'dsh-plugin-deepseek-balance',
      descriptors: DS_BALANCE_INVOCATIONS,
    }

    // ---- wallet / refresh icons (inline SVG; the icon library has no wallet) ----
    function WalletIcon({ size }) {
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        React.createElement('rect', { x: 1.75, y: 3.25, width: 12.5, height: 9.5, rx: 2 }),
        React.createElement('path', { d: 'M1.75 6.5h12.5' }),
        React.createElement('circle', { cx: 11.2, cy: 9.5, r: 1.15, fill: 'currentColor', stroke: 'none' })
      )
    }
    function RefreshIcon({ size }) {
      return React.createElement('svg', {
        className: 'dsh-balance-icon-spin',
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        React.createElement('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.53-3.68' }),
        React.createElement('path', { d: 'M13.4 1.8v3h-3' })
      )
    }

    var REFRESH_MS = 30000
    var TIP_W = 210 // hover card width (single source for inline style, alignment and clamping)
    var TIP_DELAY_MS = 150

    function BalanceButton(props) {
      var ctx = props.ctx
      var wide = props.wide
      var fetchBalance = props.fetchBalance
      var t = props.t

      var useState = React.useState
      var useEffect = React.useEffect
      var useCallback = React.useCallback
      var useRef = React.useRef

      var dataState = useState(null)
      var data = dataState[0]
      var setData = dataState[1]
      var errorState = useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var refreshedAtState = useState(null)
      var refreshedAt = refreshedAtState[0]
      var setRefreshedAt = refreshedAtState[1]
      var loadingState = useState(false)
      var loading = loadingState[0]
      var setLoading = loadingState[1]
      var tipState = useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]

      var btnRef = useRef(null)
      var inflightRef = useRef(false)
      var armRef = useRef(null)
      var tipTimerRef = useRef(null)
      var aliveRef = useRef(true)
      var refreshRef = useRef(null)

      var refresh = useCallback(async () => {
        if (inflightRef.current) return
        inflightRef.current = true
        setLoading(true)
        if (armRef.current) { armRef.current(); armRef.current = null } // manual refresh resets the auto cycle
        try {
          var payload = await fetchBalance()
          setData(payload)
          setError(null)
        } catch (e) {
          setData(null)
          setError({ code: (e && e.code) || 'fetch', message: String((e && e.message) || e) })
        }
        setRefreshedAt(Date.now())
        inflightRef.current = false
        setLoading(false)
        if (aliveRef.current) {
          armRef.current = ctx.timeout(() => { armRef.current = null; refreshRef.current() }, REFRESH_MS)
        }
      }, [fetchBalance])
      refreshRef.current = refresh

      useEffect(() => {
        aliveRef.current = true
        refresh()
        return () => {
          aliveRef.current = false
          if (armRef.current) { armRef.current(); armRef.current = null }
          if (tipTimerRef.current) { tipTimerRef.current(); tipTimerRef.current = null }
        }
      }, [refresh])

      var cny = (data && data.balances.find((b) => b.currency === 'CNY')) || null
      var usd = (data && data.balances.find((b) => b.currency === 'USD')) || null
      var cnyTotal = cny ? cny.total : null
      var tier = (cnyTotal === null || !Number.isFinite(cnyTotal))
        ? 'ok'
        : cnyTotal < 10 ? 'red' : cnyTotal < 30 ? 'orange' : cnyTotal < 50 ? 'yellow' : 'ok'

      var fmtAmt = (v) => (v === null || v === undefined || !Number.isFinite(v))
        ? '--'
        : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      var value = (cnyTotal === null || !Number.isFinite(cnyTotal)) ? '¥--' : '¥' + fmtAmt(cnyTotal)

      var showTip = () => {
        if (tipTimerRef.current) return
        var el = btnRef.current
        if (!el) return
        var rect = el.getBoundingClientRect()
        var vw = (typeof window !== 'undefined') ? window.innerWidth : 0
        var vh = (typeof window !== 'undefined') ? window.innerHeight : 0
        // left-aligned to the button (clamped back inside the viewport)
        var pos = { left: Math.max(8, Math.min(rect.left, vw - TIP_W - 12)), bottom: vh - rect.top + 8 }
        tipTimerRef.current = ctx.timeout(() => { tipTimerRef.current = null; setTip(pos) }, TIP_DELAY_MS)
      }
      var hideTip = () => {
        if (tipTimerRef.current) { tipTimerRef.current(); tipTimerRef.current = null }
        setTip(null)
      }

      var time = ''
      if (refreshedAt !== null) {
        var d = new Date(refreshedAt)
        var pad = (n) => String(n).padStart(2, '0')
        time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
      }

      // content: 2×2 grid cards (CNY / USD / topped-up / granted), centered text, bare numbers
      var content = error
        ? [React.createElement('div', { className: 'dsh-balance-err', key: 'err' }, error.code === 'no-key' ? t('noKey') : t('error'))]
        : [
          React.createElement('div', { className: 'dsh-balance-cells', key: 'cells' },
            React.createElement('div', { className: 'dsh-balance-cell' + (tier !== 'ok' ? ' dsh-tier-' + tier : ''), key: 'cny' },
              React.createElement('span', { className: 'dsh-balance-cell-label' }, t('cny')),
              React.createElement('span', { className: 'dsh-balance-cell-val' }, fmtAmt(cnyTotal))
            ),
            React.createElement('div', { className: 'dsh-balance-cell' + (usd ? '' : ' dsh-balance-tip-dim'), key: 'usd' },
              React.createElement('span', { className: 'dsh-balance-cell-label' }, t('usd')),
              React.createElement('span', { className: 'dsh-balance-cell-val' }, fmtAmt(usd ? usd.total : null))
            ),
            React.createElement('div', { className: 'dsh-balance-cell', key: 'top' },
              React.createElement('span', { className: 'dsh-balance-cell-label' }, t('toppedUp')),
              React.createElement('span', { className: 'dsh-balance-cell-val' }, fmtAmt(cny ? cny.toppedUp : null))
            ),
            React.createElement('div', { className: 'dsh-balance-cell', key: 'grant' },
              React.createElement('span', { className: 'dsh-balance-cell-label' }, t('granted')),
              React.createElement('span', { className: 'dsh-balance-cell-val' }, fmtAmt(cny ? cny.granted : null))
            )
          ),
        ]

      var button = React.createElement('button', {
        ref: btnRef,
        type: 'button',
        className: 'dsh-balance-btn' + (wide ? '' : ' dsh-balance-rail'),
        'data-dsh-balance': true,
        'data-tier': tier,
        'data-loading': loading || undefined,
        'aria-label': t('label'),
        onClick: refresh,
        onMouseEnter: showTip,
        onMouseLeave: hideTip,
      },
        loading ? React.createElement(RefreshIcon, { size: wide ? 16 : 18 }) : React.createElement(WalletIcon, { size: wide ? 16 : 18 }),
        wide && React.createElement('span', { className: 'dsh-balance-value' }, value)
      )

      var tipEl = tip && React.createElement('div', {
        className: 'dsh-balance-tip',
        style: { left: tip.left, bottom: tip.bottom, width: TIP_W },
      },
        content,
        React.createElement('div', { className: 'dsh-balance-tip-caret', key: 'caret' }),
        React.createElement('div', { className: 'dsh-balance-tip-divider', key: 'div' }),
        React.createElement('div', { className: 'dsh-balance-tip-foot', key: 'hint' }, t('autoHint')),
        React.createElement('div', { className: 'dsh-balance-tip-foot' + (loading ? ' dsh-balance-tip-live' : ''), key: 'time' }, loading ? t('refreshing') : t('refreshTime', { time }))
      )

      return React.createElement(React.Fragment, null, button, tipEl)
    }

    var CSS =
      '.dsh-balance-btn{box-sizing:border-box;flex:none;width:calc(100% + 4px);height:42px;margin:4px -2px 0;color:var(--dsw-alias-label-primary);background:transparent;border:1px dashed transparent;border-radius:12px;align-items:center;gap:8px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;cursor:pointer;min-width:0}' +
      '.dsh-balance-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
      '.dsh-balance-btn[data-tier="red"]{border-color:#e5484d}' +
      '.dsh-balance-btn[data-tier="orange"]{border-color:#f97316}' +
      '.dsh-balance-btn[data-tier="yellow"]{border-color:#facc15}' +
      '.dsh-balance-btn[data-loading] .dsh-balance-value{opacity:.55}' +
      '.dsh-balance-btn.dsh-balance-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:0;padding:0}' +
      '.dsh-balance-value{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-variant-numeric:tabular-nums}' +
      '.dsh-balance-icon-spin{animation:dsh-balance-spin .8s linear infinite;transform-origin:center}' +
      '@keyframes dsh-balance-spin{to{transform:rotate(360deg)}}' +
      '.dsh-balance-tip{position:fixed;z-index:60;box-sizing:border-box;background:var(--dsw-alias-bg-overlay);backdrop-filter:blur(10px) saturate(1.25);-webkit-backdrop-filter:blur(10px) saturate(1.25);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:var(--dsw-shadow-lv3);padding:14px 16px 12px;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;pointer-events:none;animation:dsh-balance-tip-in .14s ease-out}' +
      '@keyframes dsh-balance-tip-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
      '@supports (background:color-mix(in srgb,red 50%,transparent)){.dsh-balance-tip{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 85%,transparent)}.dsh-balance-tip-caret{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 85%,transparent)}}' +
      '.dsh-balance-tip-caret{position:absolute;left:18px;bottom:-6px;width:10px;height:10px;background:var(--dsw-alias-bg-overlay);border-right:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);transform:rotate(45deg)}' +
      '.dsh-balance-cells{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.dsh-balance-cell{box-sizing:border-box;min-width:0;background:var(--dsw-alias-bg-layer-2);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center}' +
      '@supports (background:color-mix(in srgb,red 50%,transparent)){.dsh-balance-cell{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}}' +
      '.dsh-balance-cell-label{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.dsh-balance-cell-val{font-size:15px;line-height:20px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.dsh-balance-cell.dsh-tier-red .dsh-balance-cell-val{color:#e5484d}' +
      '.dsh-balance-cell.dsh-tier-orange .dsh-balance-cell-val{color:#f97316}' +
      '.dsh-balance-cell.dsh-tier-yellow .dsh-balance-cell-val{color:#facc15}' +
      '.dsh-balance-tip-dim .dsh-balance-cell-val{opacity:.55}' +
      '.dsh-balance-tip-divider{height:1px;background:linear-gradient(90deg,transparent,var(--dsw-alias-border-l1) 18%,var(--dsw-alias-border-l1) 82%,transparent);margin:12px 0 8px}' +
      '.dsh-balance-tip-foot{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:center}' +
      '.dsh-balance-tip-live{color:var(--dsw-alias-label-primary);font-weight:500}' +
      '.dsh-balance-err{color:var(--dsw-alias-state-error-primary);text-align:center}' +
      '@media (prefers-reduced-motion:reduce){.dsh-balance-tip{animation:none}.dsh-balance-icon-spin{animation:none}}' +
      // separate row from the cordis badge: let the footer container wrap
      '[class*="Xa_footerActions"]{flex-wrap:wrap}'

    function apply(ctx) {
      // dictionaries
      ctx.effect(function () {
        var d1 = ctx.locale.register('ds-balance', 'zh', zh)
        var d2 = ctx.locale.register('ds-balance', 'en', en)
        return function () { d1(); d2() }
      }, 'ds-balance: dictionaries')
      var t = ctx.locale.bind('ds-balance')

      // styles (cleaned up with the plugin)
      ctx.effect(function () {
        var tagId = 'dsh-plugin-deepseek-balance/styles'
        if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
          var tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-plugin-deepseek-balance'
          tag.dataset.pluginCss = tagId
          tag.textContent = CSS
          document.head.appendChild(tag)
        }
        return function () {
          if (typeof document !== 'undefined') {
            var el = document.querySelector('style[data-plugin-css="' + tagId + '"]')
            if (el && el.parentNode) el.parentNode.removeChild(el)
          }
        }
      }, 'ds-balance: styles')

      // host Remote bridge
      var remoteRef = { current: null }
      ctx.effect(async function () {
        var dispose = await ctx.remote.$mount(DS_BALANCE_REMOTE)
        var remote = ctx.reflect.get('remote.dsBalance')
        if (remote === void 0) {
          void dispose()
          throw new Error('ds-balance: the dsBalance Remote namespace did not mount')
        }
        remoteRef.current = remote
        return function () {
          remoteRef.current = null
          void dispose()
        }
      }, 'ds-balance: remote')

      var fetchBalance = async function () {
        var remote = remoteRef.current
        if (!remote) throw new Error('ds-balance: remote not ready yet')
        var result = await remote.fetch()
        if (!result || result.ok !== true) {
          var msg = (result && result.error && (result.error.message || result.error.code)) || 'fetch failed'
          var err = new Error(String(msg))
          if (msg.indexOf('API key not configured') >= 0) err.code = 'no-key'
          throw err
        }
        return result.value
      }

      // sidebar footer action: own row above the cordis badge and Settings
      ctx.effect(function () {
        return ctx.slots.inject('sidebar.footer.action', function () {
          return ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'ds-balance', order: -10, label: function () { return t('label') } },
            function (props) {
              return React.createElement(BalanceButton, { ctx: ctx, wide: props.wide, fetchBalance: fetchBalance, t: t })
            }
          )
        })
      }, 'ds-balance: sidebar action')
    }

    module.exports = { apply: apply, inject: inject }
    return module.exports
  },
})
