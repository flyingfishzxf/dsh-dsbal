/**
 * dsh-dsbal — Client half.
 *
 * Renders a balance button in `sidebar.footer.action` (its own row above the
 * cordis badge and the Settings button), backed by the host `dsBalance`
 * Remote service. 30s auto refresh, click to refresh (resets the cycle),
 * hover detail card, tier-coloured dashed borders, UI-language aware text.
 * Peak/off-peak billing (Beijing time): hollow red 「梁文峰」 badge during
 * peak 09:00-12:00 & 14:00-18:00 on a Mon-Fri, hollow brand-blue 「梁文谷」
 * off-peak otherwise. Off-peak covers all other hours, all of Saturday and
 * Sunday (make-up workdays included — the rule keys on the weekday), and
 * Chinese statutory holidays in full. The holiday table is fetched in the
 * browser from holiday-cn (jsDelivr, then GitHub raw), cached in localStorage
 * for 24h, and falls back to the bundled 2025/2026 table. Both badges
 * right-aligned; hover card two-row billing legend, width clamped to the
 * sidebar content column.
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
      balanceLabel: '当前余额',
      warnPre: '余额低于 ',
      warnPost: ' → 虚线告警',
      autoHint: '30秒刷新 · 点击刷新',
      refreshTime: '{time}',
      refreshing: '刷新中…',
      error: '获取余额失败',
      noKey: '未配置 API Key（DEEPSEEK_API_KEY）',
      peakBadge: '梁文峰',
      offpeakBadge: '梁文谷',
      peakTitle: '峰谷计费规则（北京时间）',
      // 峰谷互补：峰行负责说明边界（工作日 + 时段 + 法定节假日例外），
      // 谷行只说「其余时段」，不再重复列举周末/节假日
      peakHours: '周一至周五 09:00-12:00、14:00-18:00',
      peakNote: '（不含法定节假日）',
      offpeakHours: '其余时段',
    }
    var en = {
      label: 'Balance',
      balanceLabel: 'Current balance',
      warnPre: 'Warning: below ',
      warnPost: ' → dashed border',
      autoHint: '30s refresh · click',
      refreshTime: '{time}',
      refreshing: 'Refreshing…',
      error: 'Failed to fetch balance',
      noKey: 'API key not configured (DEEPSEEK_API_KEY)',
      peakBadge: '梁文峰',
      offpeakBadge: '梁文谷',
      peakTitle: 'Peak/off-peak billing (Beijing time)',
      // Peak and off-peak are complementary: the peak row carries the boundary
      // (weekdays + windows + the holiday carve-out), off-peak is "the rest".
      peakHours: 'Mon-Fri 09:00-12:00 & 14:00-18:00',
      peakNote: '(excl. public holidays)',
      offpeakHours: 'all other hours',
    }

    // ---- host Remote contract (mirrors lib/index.js) ----
    // The client `ctx.remote.$mount()` requires strict codecs for generated
    // Remote descriptors, so provide a minimal strict schema (plain JS object
    // with a zod-compatible `parse`). It only needs to validate/return the
    // host's plain JSON balance snapshot.
    var balanceSnapshotSchema = {
      parse: function (value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('ds-balance: invalid balance snapshot')
        }
        if (!Array.isArray(value.balances)) {
          throw new Error('ds-balance: invalid balance snapshot (balances array missing)')
        }
        return value
      },
    }
    var DS_BALANCE_INVOCATIONS = [
      {
        id: 'dsh-dsbal#dsBalance/fetch',
        service: 'dsBalance',
        namespace: 'dsBalance',
        method: 'fetch',
        invocation: { kind: 'direct' },
        parameters: [],
        result: {
          mode: 'strict',
          typeSymbol: 'dsh-dsbal#DeepSeekBalanceSnapshot',
          schema: balanceSnapshotSchema,
        },
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
    // Displayed at the bottom of the hover card. package.json is the source of
    // truth; dev/verify-holidays.mjs fails when the two drift apart, and the
    // dev draft must carry the same value.
    var PLUGIN_VERSION = '0.4.0'
    var TIP_W = 240 // rail (collapsed sidebar): fixed floating width for the card
    var TIP_MIN_W = 170 // keep the legend readable in a very narrow column
    var TIP_MAX_W = 360 // wide mode cap: a card wider than this is hard to scan
    var TIP_DELAY_MS = 150

    // DeepSeek peak/off-peak pricing is defined in Beijing time (UTC+8, no DST):
    // peak = Mon-Fri 09:00-12:00 & 14:00-18:00, off-peak (half price) = every
    // other hour, all of Saturday/Sunday, and Chinese statutory holidays in
    // full. Make-up workdays that fall on a weekend stay off-peak — the rule
    // keys on the weekday, not on whether the day is a working day. So the only
    // thing the calendar has to supply is the statutory holiday set.

    var HOLIDAY_CACHE_KEY = 'dsh-dsbal:holidays:v1'
    var HOLIDAY_TTL_MS = 24 * 3600000 // cached holiday data is reused for 24h
    var HOLIDAY_RETRY_MS = 30 * 60000 // after a failed fetch, do not retry for 30min
    var HOLIDAY_FETCH_TIMEOUT_MS = 8000
    // Same holiday-cn dataset behind two mirrors (identical shape), so one
    // parser covers both; the next source is tried only when the previous one
    // fails or yields nothing. Both send access-control-allow-origin: *.
    var HOLIDAY_SOURCES = [
      function (year) { return 'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/' + year + '.json' },
      function (year) { return 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/' + year + '.json' },
    ]
    // Bundled fallback, `year=MMDD MMDD …` (holiday-cn `isOffDay: true` only, so
    // 2026-10-05..07 (国庆调休休息日) are included while the make-up workdays
    // 2026-09-20/10-10 are not). Used before the first successful fetch and
    // whenever every source is unreachable. Keyed by year so a stale entry can
    // never leak into a later year.
    var HOLIDAY_BUNDLED = [
      '2025=0101 0128 0129 0130 0131 0201 0202 0203 0204 0404 0405 0406 0501 0502 0503 0504 0505 0531 0601 0602 1001 1002 1003 1004 1005 1006 1007 1008',
      '2026=0101 0102 0103 0215 0216 0217 0218 0219 0220 0221 0222 0223 0404 0405 0406 0501 0502 0503 0504 0505 0619 0620 0621 0925 0926 0927 1001 1002 1003 1004 1005 1006 1007',
    ].join('|')

    var holidayMemo = { fetchedAt: 0, year: 0, dates: null } // last server payload seen this session
    var holidayInflight = null
    var holidayRetryAfter = 0

    function isDateISO(v) {
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    }

    function yearOfISO(dateISO) {
      return Number(dateISO.slice(0, 4))
    }

    // Beijing date fields (UTC+8, no DST) from a wall-clock instant.
    function beijingDateParts(now) {
      var beijing = new Date(now.getTime() + 8 * 3600000)
      return {
        date: beijing.toISOString().slice(0, 10),
        dow: beijing.getUTCDay(),
        hour: beijing.getUTCHours(),
      }
    }

    // holiday-cn payload -> { year, dates: Set<'YYYY-MM-DD'> } of statutory
    // days off. `isOffDay: false` entries are make-up workdays (always a
    // weekend) and are irrelevant here.
    function parseHolidayCn(json) {
      if (!json || typeof json !== 'object' || !Array.isArray(json.days)) return null
      var dates = new Set()
      for (var i = 0; i < json.days.length; i++) {
        var day = json.days[i]
        if (!day || day.isOffDay !== true || !isDateISO(day.date)) continue
        dates.add(day.date)
      }
      var year = (typeof json.year === 'number' && Number.isFinite(json.year))
        ? json.year
        : (dates.size > 0 ? yearOfISO(dates.values().next().value) : 0)
      return dates.size > 0 ? { year: year, dates: dates } : null
    }

    function bundledHolidays(year) {
      var dates = new Set()
      var groups = HOLIDAY_BUNDLED.split('|')
      for (var i = 0; i < groups.length; i++) {
        var eq = groups[i].indexOf('=')
        if (eq < 0 || Number(groups[i].slice(0, eq)) !== year) continue
        var tokens = groups[i].slice(eq + 1).split(' ')
        for (var k = 0; k < tokens.length; k++) {
          if (tokens[k].length !== 4) continue
          dates.add(year + '-' + tokens[k].slice(0, 2) + '-' + tokens[k].slice(2))
        }
        break
      }
      return dates
    }

    function readHolidayCache() {
      try {
        var raw = window.localStorage.getItem(HOLIDAY_CACHE_KEY)
        if (!raw) return null
        var parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.dates)) return null
        if (!Number.isFinite(parsed.fetchedAt) || !Number.isFinite(parsed.year)) return null
        var dates = new Set()
        for (var i = 0; i < parsed.dates.length; i++) {
          if (isDateISO(parsed.dates[i])) dates.add(parsed.dates[i])
        }
        return { fetchedAt: parsed.fetchedAt, year: parsed.year, dates: dates }
      } catch (e) {
        return null // localStorage unavailable (private mode / disabled) — fall back to bundled
      }
    }

    function writeHolidayCache(entry) {
      try {
        window.localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify({
          fetchedAt: entry.fetchedAt,
          year: entry.year,
          dates: Array.from(entry.dates),
        }))
      } catch (e) {
        // Quota or disabled storage: the in-memory memo still serves this session.
      }
    }

    function fetchHolidayYear(year) {
      var idx = 0
      var attempt = function () {
        if (idx >= HOLIDAY_SOURCES.length) return Promise.resolve(null)
        var url = HOLIDAY_SOURCES[idx++]()
        var abort = (typeof AbortController !== 'undefined') ? new AbortController() : null
        var timer = setTimeout(function () { if (abort) abort.abort() }, HOLIDAY_FETCH_TIMEOUT_MS)
        return fetch(url, abort ? { signal: abort.signal } : undefined).then(function (res) {
          clearTimeout(timer)
          if (!res || !res.ok) return attempt()
          return res.json().then(function (json) {
            var parsed = parseHolidayCn(json)
            return parsed || attempt()
          }, function () { return attempt() })
        }, function () {
          clearTimeout(timer)
          return attempt()
        })
      }
      return attempt()
    }

    // Returns a Set of Beijing-off dates (possibly empty). Never throws: the
    // actual request runs at most once per TTL, across year boundaries, and
    // only after the failure backoff has elapsed.
    function ensureHolidays(now) {
      try {
        var at = (now && typeof now.getTime === 'function') ? now.getTime() : Date.now()
        var year = Number(beijingDateParts(new Date(at)).date.slice(0, 4))
        var fresh = function (entry) {
          return entry !== null && entry.year === year && (at - entry.fetchedAt) < HOLIDAY_TTL_MS
        }
        if (fresh(holidayMemo)) return Promise.resolve(holidayMemo.dates)

        var cached = readHolidayCache()
        if (fresh(cached)) {
          holidayMemo = cached // another tab (or the previous page load) already fetched it
          return Promise.resolve(cached.dates)
        }

        if (holidayInflight !== null && holidayInflight.year === year) return holidayInflight.promise
        if (at < holidayRetryAfter && cached !== null && cached.year === year) {
          return Promise.resolve(cached.dates)
        }

        var promise = fetchHolidayYear(year).then(function (parsed) {
          if (parsed === null) {
            holidayRetryAfter = at + HOLIDAY_RETRY_MS
          } else {
            holidayMemo = { fetchedAt: at, year: year, dates: parsed.dates }
            writeHolidayCache(holidayMemo)
            holidayRetryAfter = 0
          }
          return holidayMemo.year === year ? holidayMemo.dates : bundledHolidays(year)
        }, function () {
          holidayRetryAfter = at + HOLIDAY_RETRY_MS
          return holidayMemo.year === year ? holidayMemo.dates : bundledHolidays(year)
        })
        holidayInflight = { year: year, promise: promise }
        return promise
      } catch (e) {
        return Promise.resolve(bundledHolidays(Number(beijingDateParts(new Date()).date.slice(0, 4))))
      }
    }

    // `holidaySet` is optional: without it (or before the first successful
    // fetch) the bundled table for the Beijing year answers.
    function isPeakPeriod(now, holidaySet) {
      var bj = beijingDateParts(now)
      if (bj.dow === 0 || bj.dow === 6) return false // weekends (incl. make-up workdays) are off-peak all day
      var off = holidaySet && typeof holidaySet.has === 'function'
        ? holidaySet.has(bj.date)
        : bundledHolidays(yearOfISO(bj.date)).has(bj.date) // statutory holidays are off-peak all day
      if (off) return false
      return (bj.hour >= 9 && bj.hour < 12) || (bj.hour >= 14 && bj.hour < 18)
    }

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
      // empty on the first paint; ensureHolidays() fills it from the cache,
      // the network, or the bundled table within the first refresh cycle.
      var holidayState = useState(null)
      var holidaySet = holidayState[0]
      var setHolidaySet = holidayState[1]

      var btnRef = useRef(null)
      var inflightRef = useRef(false)
      var armRef = useRef(null)
      var tipTimerRef = useRef(null)
      var aliveRef = useRef(true)
      var refreshRef = useRef(null)
      var holidaySetRef = useRef(null)

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
        // Ride the 30s cycle: handles a page left open across midnight and
        // across a year boundary, and fills the holiday set on first paint.
        try {
          var holidays = await ensureHolidays(new Date())
          if (aliveRef.current && holidays && holidays.size > 0 && holidays !== holidaySetRef.current) {
            holidaySetRef.current = holidays
            setHolidaySet(holidays)
          }
        } catch (e) {
          // Billing hint only: never let it break the balance refresh.
        }
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

      useEffect(() => {
        var el = btnRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        var prev = null
        var apply = (pos) => {
          if (!pos || !showTipRef.current) return
          // only recompose on a real change (sub-pixel churn from the sidebar
          // transition stays on the previous position)
          if (prev && Math.abs(prev.width - pos.width) < 1 && Math.abs(prev.left - pos.left) < 1) return
          prev = pos
          setTip(pos)
        }
        var observer = new ResizeObserver(() => { apply(placeTip()) })
        observer.observe(el)
        // The observer fires on size changes, but a width/left transition can
        // move the button without resizing its own box; follow it frame by
        // frame for as long as the card is up.
        var frame = null
        var loop = () => {
          if (!showTipRef.current) { frame = null; return }
          apply(placeTip())
          frame = requestAnimationFrame(loop)
        }
        frame = requestAnimationFrame(loop)
        return () => {
          observer.disconnect()
          if (frame !== null) cancelAnimationFrame(frame)
        }
      }, [])

      var cny = (data && data.balances.find((b) => b.currency === 'CNY')) || null
      var cnyTotal = cny ? cny.total : null
      var tier = (cnyTotal === null || !Number.isFinite(cnyTotal))
        ? 'ok'
        : cnyTotal < 10 ? 'red' : cnyTotal < 30 ? 'orange' : cnyTotal < 50 ? 'yellow' : 'ok'

      var fmtAmt = (v) => (v === null || v === undefined || !Number.isFinite(v))
        ? '--'
        : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      var value = (cnyTotal === null || !Number.isFinite(cnyTotal)) ? '¥--' : '¥' + fmtAmt(cnyTotal)
      var peak = isPeakPeriod(new Date(), holidaySet)

      // Tip geometry: measured from the live button so the card matches it.
      // `wide` tracks the current sidebar mode (it can flip while the card is
      // open: a click on the collapse control, or the width animation), and
      // showTipRef lets the follow loop re-run the last measurement.
      var wideRef = useRef(wide)
      wideRef.current = wide
      var showTipRef = useRef(false)
      var placeTip = () => {
        var el = btnRef.current
        if (!el) return null
        var rect = el.getBoundingClientRect()
        var vw = (typeof window !== 'undefined') ? window.innerWidth : 0
        var vh = (typeof window !== 'undefined') ? window.innerHeight : 0
        // Wide mode: exactly the button column (the sidebar content width) — no
        // fixed cap, so the card tracks the sidebar instead of drifting narrower
        // as it widens. Rail mode (collapsed sidebar): the button becomes a 36px
        // circle, so the card keeps the fixed floating width instead.
        var tipW = wideRef.current
          ? Math.min(Math.round(rect.width), TIP_MAX_W)
          : TIP_W
        // stay usable in a very narrow column
        tipW = Math.max(TIP_MIN_W, tipW)
        // left-aligned with the button, clamped back inside the viewport
        var left = Math.max(8, Math.min(rect.left, Math.max(8, vw - tipW - 12)))
        return {
          left: left,
          bottom: vh - rect.top + 8,
          width: tipW,
          // keep the caret pointing at the button when the mode flips between
          // a full-width card and the fixed rail card
          caretLeft: Math.max(12, Math.min(rect.left + rect.width / 2 - left - 5, tipW - 24)),
        }
      }
      var showTip = () => {
        if (tipTimerRef.current) return
        if (!btnRef.current) return
        tipTimerRef.current = ctx.timeout(() => {
          tipTimerRef.current = null
          var pos = placeTip()
          if (pos) { showTipRef.current = true; setTip(pos) }
        }, TIP_DELAY_MS)
      }
      var hideTip = () => {
        if (tipTimerRef.current) { tipTimerRef.current(); tipTimerRef.current = null }
        showTipRef.current = false
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
          // Prominent balance at the top: in rail mode the button collapses to
          // a 36px circle with no room for the amount, so the card is where the
          // exact value is read.
          React.createElement('div', { className: 'dsh-balance-tip-balance', key: 'balance' },
            React.createElement('span', { className: 'dsh-balance-tip-balance-label' }, t('balanceLabel')),
            React.createElement('span', {
              className: 'dsh-balance-tip-amount',
            }, value)
          ),
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
            React.createElement('div', { className: 'dsh-balance-item', key: 'peak' },
              React.createElement('span', { className: 'dsh-balance-bullet' }),
              React.createElement('span', { className: 'dsh-balance-item-text' },
                t('peakTitle'),
                React.createElement('div', { className: 'dsh-balance-peak-row' },
                  React.createElement('span', { className: 'dsh-balance-chip dsh-balance-chip-peak' }, t('peakBadge')),
                  React.createElement('div', { className: 'dsh-balance-peak-hours' },
                    React.createElement('span', { className: 'dsh-balance-peak-line' }, t('peakHours')),
                    // second line: the statutory-holiday carve-out, so the peak
                    // row never reads as "every Mon-Fri 09:00-12:00 is peak"
                    React.createElement('span', { className: 'dsh-balance-peak-note' }, t('peakNote'))
                  )
                ),
                React.createElement('div', { className: 'dsh-balance-peak-row' },
                  React.createElement('span', { className: 'dsh-balance-chip dsh-balance-chip-off' }, t('offpeakBadge')),
                  React.createElement('span', { className: 'dsh-balance-peak-hours' }, t('offpeakHours'))
                )
              )
            ),
            React.createElement('div', { className: 'dsh-balance-item', key: 'refresher' },
              React.createElement('span', { className: 'dsh-balance-bullet' }),
              React.createElement('span', { className: 'dsh-balance-item-text' + (loading ? ' dsh-balance-tip-live' : '') },
                t('autoHint'),
                ' · ',
                loading ? t('refreshing') : t('refreshTime', { time })
              )
            )
          ),
          React.createElement('div', { className: 'dsh-balance-tip-footer', key: 'footer' }, 'dsh-dsbal v' + PLUGIN_VERSION)
        ]

      var button = React.createElement('button', {
        ref: btnRef,
        type: 'button',
        className: 'dsh-balance-btn' + (wide ? '' : ' dsh-balance-rail'),
        'data-dsh-balance': true,
        'data-tier': tier,
        // Peak/off-peak is a boolean, so it rides a data attribute instead of a
        // class: rail mode has no room for the 梁文峰/梁文谷 pill, so the icon
        // itself carries the state (see .dsh-balance-btn[data-peak="1"]).
        'data-peak': peak ? '1' : '0',
        'data-loading': loading || undefined,
        // Rail mode conveys peak/off-peak by the icon colour alone, which a
        // screen reader cannot see — fold it into the accessible name (and the
        // native tooltip) so the state is not colour-only.
        'aria-label': t('label') + ' · ' + (peak ? t('peakBadge') : t('offpeakBadge')),
        title: peak ? t('peakBadge') : t('offpeakBadge'),
        onClick: refresh,
        onMouseEnter: showTip,
        onMouseLeave: hideTip,
      },
        loading ? React.createElement(RefreshIcon, { size: wide ? 16 : 18 }) : React.createElement(WalletIcon, { size: wide ? 16 : 18 }),
        wide && React.createElement('span', { className: 'dsh-balance-value' }, value),
        wide && React.createElement('span', {
          className: 'dsh-balance-peak' + (peak ? ' dsh-balance-peak-on' : ' dsh-balance-peak-off'),
        }, peak ? t('peakBadge') : t('offpeakBadge'))
      )

      var tipEl = tip && React.createElement('div', {
        className: 'dsh-balance-tip',
        style: { left: tip.left, bottom: tip.bottom, width: tip.width },
      },
        content,
        React.createElement('div', { className: 'dsh-balance-tip-caret', key: 'caret', style: { left: tip.caretLeft } })
      )

      return React.createElement(React.Fragment, null, button, tipEl)
    }

    var CSS =
      '.dsh-balance-btn{box-sizing:border-box;flex:none;width:calc(100% + 4px);height:42px;margin:4px -2px 0;color:var(--dsw-alias-label-primary);background:transparent;border:1px dashed transparent;border-radius:12px;align-items:center;gap:8px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;cursor:pointer;min-width:0}' +
      '.dsh-balance-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
      '.dsh-balance-btn[data-tier="red"]{border-color:#dc2626}' +
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
      '.dsh-warn-red{color:#dc2626}' +
      '.dsh-balance-tip-live{color:var(--dsw-alias-label-primary);font-weight:500}' +
      '.dsh-balance-err{color:var(--dsw-alias-state-error-primary);text-align:left}' +
      // card balance headline: rail mode has no room for the amount on the
      // button, so the card is the at-a-glance place to read it
      '.dsh-balance-tip-balance{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--dsw-alias-border-l1)}' +
      '.dsh-balance-tip-balance-label{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}' +
      '.dsh-balance-tip-amount{min-width:0;color:var(--dsw-alias-label-primary);font-size:16px;line-height:20px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.2px;overflow-wrap:anywhere}' +
      // Which build is on screen matters when the dev preview and the installed
      // bundle sit side by side
      '.dsh-balance-tip-footer{margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;text-align:right;font-variant-numeric:tabular-nums;letter-spacing:.3px}' +
      '.dsh-balance-peak{flex:none;margin-left:auto;padding:0 6px;border-radius:6px;font-size:10px;line-height:16px;font-weight:700;letter-spacing:.5px;background:transparent;border:1px solid currentColor}' +
      '.dsh-balance-peak-on{color:#e5484d}' +
      '.dsh-balance-peak-off{color:#4d6bfe}' +
      // Rail mode only: there the 梁文峰/梁文谷 pill has no room, so the icon
      // itself carries the state (the wallet/refresh SVG follow currentColor).
      // Wide mode keeps the neutral button colour and relies on the pill.
      '.dsh-balance-btn.dsh-balance-rail[data-peak="1"]{color:#e5484d}' +
      '.dsh-balance-btn.dsh-balance-rail[data-peak="0"]{color:#4d6bfe}' +
      // The badge is a flex item: without flex:none + nowrap the row squeezes it
      // and 「梁文峰」 breaks across two lines inside the border. box-sizing keeps
      // the 1px border inside the measured width.
      '.dsh-balance-chip{flex:none;display:inline-block;box-sizing:border-box;white-space:nowrap;padding:0 5px;border-radius:5px;font-size:10px;line-height:16px;font-weight:700;vertical-align:1px;background:transparent;border:1px solid currentColor}' +
      '.dsh-balance-chip-peak{color:#e5484d}' +
      '.dsh-balance-chip-off{color:#4d6bfe}' +
      // chip at the left, the rule text as its own column: each line wraps on its
      // own, so nothing can narrow the badge again
      '.dsh-balance-peak-row{display:flex;align-items:flex-start;gap:6px;margin-top:3px}' +
      '.dsh-balance-peak-hours{flex:1 1 auto;min-width:0;overflow-wrap:break-word}' +
      '.dsh-balance-peak-line{display:block}' +
      '.dsh-balance-peak-note{display:block;color:var(--dsw-alias-label-tertiary)}' +
      // rail mode clamps the card width to the column, so very narrow columns
      // stack the chip above the text instead of squeezing either one
      '@media (max-width:220px){.dsh-balance-peak-row{flex-direction:column;gap:2px}}' +
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
