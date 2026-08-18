/**
 * dsh-dsbal — Client half.
 *
 * Renders a balance button in `sidebar.footer.action` (its own row above the
 * cordis badge and the Settings button), backed by the host `dsBalance`
 * Remote service. 30s auto refresh, click to refresh (resets the cycle),
 * hover detail card, tier-coloured dashed borders, UI-language aware text.
 */
window.__ModuleLoader__.load({
  id: 'dsh-dsbal',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var react = require('react')
    var React = react

    var inject = ['slots', 'timer', 'locale', 'remote']

    // ---- dictionaries (follow the active UI language) ----
    var zh = {
      label: '余额',
      warnPre: '余额低于 ',
      warnPost: ' 时按钮显示虚线告警边框',
      autoHint: '30秒自动刷新 | 点击刷新',
      refreshTime: '刷新时间：{time}',
      refreshing: '刷新中…',
      error: '获取余额失败',
      noKey: '未配置 API Key（DEEPSEEK_API_KEY）',
    }
    var en = {
      label: 'Balance',
      warnPre: 'Warning: below ',
      warnPost: ' the button shows a dashed warning border',
      autoHint: '30s auto refresh | Click to refresh',
      refreshTime: 'Refresh time: {time}',
      refreshing: 'Refreshing…',
      error: 'Failed to fetch balance',
      noKey: 'API key not configured (DEEPSEEK_API_KEY)',
    }

    // ---- host Remote contract (mirrors lib/index.js) ----
    var DS_BALANCE_INVOCATIONS = [
      {
        id: 'dsh-dsbal#dsBalance/fetch',
        service: 'dsBalance',
        namespace: 'dsBalance',
        method: 'fetch',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'src-json' },
      },
    ]
    var DS_BALANCE_REMOTE = {
      package: 'dsh-dsbal',
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

      // content: left-aligned bullet list (warning legend / refresh hint / refresh time)
      var content = error
        ? [React.createElement('div', { className: 'dsh-balance-err', key: 'err' }, error.code === 'no-key' ? t('noKey') : t('error'))]
        : [
          React.createElement('div', { className: 'dsh-balance-list', key: 'list' },
            React.createElement('div', { className: 'dsh-balance-item', key: 'warn' },
              React.createElement('span', { className: 'dsh-balance-bullet' }),
              React.createElement('span', { className: 'dsh-balance-item-text' },
                t('warnPre'),
                React.createElement('span', { className: 'dsh-balance-warn-th dsh-warn-yellow' }, '50'),
                ' · ',
                React.createElement('span', { className: 'dsh-balance-warn-th dsh-warn-orange' }, '30'),
                ' · ',
                React.createElement('span', { className: 'dsh-balance-warn-th dsh-warn-red' }, '10'),
                t('warnPost')
              )
            ),
            React.createElement('div', { className: 'dsh-balance-item', key: 'hint' },
              React.createElement('span', { className: 'dsh-balance-bullet' }),
              React.createElement('span', { className: 'dsh-balance-item-text' }, t('autoHint'))
            ),
            React.createElement('div', { className: 'dsh-balance-item', key: 'time' },
              React.createElement('span', { className: 'dsh-balance-bullet' }),
              React.createElement('span', { className: 'dsh-balance-item-text' + (loading ? ' dsh-balance-tip-live' : '') }, loading ? t('refreshing') : t('refreshTime', { time }))
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
        React.createElement('div', { className: 'dsh-balance-tip-caret', key: 'caret' })
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
      '.dsh-balance-tip{position:fixed;z-index:60;box-sizing:border-box;background:var(--dsw-alias-bg-overlay);backdrop-filter:blur(10px) saturate(1.25);-webkit-backdrop-filter:blur(10px) saturate(1.25);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:var(--dsw-shadow-lv3);padding:12px 14px;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;pointer-events:none;animation:dsh-balance-tip-in .14s ease-out}' +
      '@keyframes dsh-balance-tip-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
      '@supports (background:color-mix(in srgb,red 50%,transparent)){.dsh-balance-tip{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 85%,transparent)}.dsh-balance-tip-caret{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 85%,transparent)}}' +
      '.dsh-balance-tip-caret{position:absolute;left:18px;bottom:-6px;width:10px;height:10px;background:var(--dsw-alias-bg-overlay);border-right:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);transform:rotate(45deg)}' +
      '.dsh-balance-list{display:flex;flex-direction:column;gap:6px}' +
      '.dsh-balance-item{display:flex;align-items:flex-start;gap:8px;text-align:left}' +
      '.dsh-balance-bullet{flex:none;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary);margin-top:7px}' +
      '.dsh-balance-item-text{min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}' +
      '.dsh-balance-warn-th{font-weight:600;font-variant-numeric:tabular-nums}' +
      '.dsh-warn-yellow{color:#facc15}' +
      '.dsh-warn-orange{color:#f97316}' +
      '.dsh-warn-red{color:#e5484d}' +
      '.dsh-balance-tip-live{color:var(--dsw-alias-label-primary);font-weight:500}' +
      '.dsh-balance-err{color:var(--dsw-alias-state-error-primary);text-align:left}' +
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
        var tagId = 'dsh-dsbal/styles'
        if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
          var tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-dsbal'
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
