/**
 * dsh-dsbal — Host half.
 *
 * Registers a `dsBalance` Remote service (`fetch`) that resolves the DeepSeek
 * API key through the credential seam and queries
 * `GET {baseURL}/user/balance` with `curl` (the `web.fetch` seam cannot carry
 * an `Authorization` header, and the dynamic host sandbox forbids `fetch`).
 * The client half of this package mounts the Remote and renders the sidebar
 * widget.
 *
 * The key and endpoint honour the `llm-deepseek` settings section
 * (`apiKeyEnv`, default `DEEPSEEK_API_KEY`; `baseURL`, default the public
 * DeepSeek API), exactly like the model adapter does.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const name = 'dsh-dsbal'
export const inject = ['typert', 'settings', 'credentials', 'shell']

/** Wire identity of the balance fetch invocation. */
const INVOCATION_ID = 'dsh-dsbal#dsBalance/fetch'

/** Remote invocation descriptors shared with the client half (wire contract). */
export const DS_BALANCE_INVOCATIONS = [
  {
    id: INVOCATION_ID,
    service: 'dsBalance',
    namespace: 'dsBalance',
    method: 'fetch',
    invocation: { kind: 'direct' },
    parameters: [],
    // The result is a plain JSON object; the loose codec skips strict
    // schema/symbol checking entirely.
    result: { mode: 'src-json' },
  },
]

/** Typert manifest exposing `dsBalance` to the gateway. */
const TYPERT_MANIFEST = {
  package: 'dsh-dsbal',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'dsBalance',
        exportName: 'DsBalanceRuntime',
        description: 'DeepSeek API balance queries for the sidebar widget.',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'fetch',
            signature: 'fetch(): Promise<DeepSeekBalanceSnapshot>',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: DS_BALANCE_INVOCATIONS,
}

/**
 * One balance snapshot: `isAvailable` mirrors the API flag, `balances` carries
 * per-currency totals (currency uppercased, amounts as numbers).
 */
async function fetchBalance(ctx) {
  const credentials = ctx.get('credentials')
  const shell = ctx.get('shell')
  if (credentials === undefined || shell === undefined) {
    throw new Error('ds-balance: credentials or shell service is unavailable')
  }

  let apiKeyEnv = 'DEEPSEEK_API_KEY'
  let baseURL = 'https://api.deepseek.com'
  try {
    const cfg = ctx.settings.get('llm-deepseek')
    if (cfg && typeof cfg === 'object') {
      if (typeof cfg.apiKeyEnv === 'string' && cfg.apiKeyEnv.length > 0) apiKeyEnv = cfg.apiKeyEnv
      if (typeof cfg.baseURL === 'string' && cfg.baseURL.length > 0) baseURL = cfg.baseURL.replace(/\/+$/, '')
    }
  } catch {
    // llm-deepseek namespace not registered; use defaults.
  }

  const resolved = await credentials.resolve(apiKeyEnv)
  if (!resolved) throw new Error(`ds-balance: API key not configured (${apiKeyEnv})`)

  let spec
  try {
    spec = shell.resolve({
      command: 'curl -sS --max-time 10 -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" ' + JSON.stringify(baseURL + '/user/balance'),
      timeoutMs: 12000,
      stdoutMaxBytes: 65536,
      // Deliberately forwarded through the explicit env layer so the secret
      // never appears in the command string or logs.
      env: { DEEPSEEK_API_KEY: resolved.value },
    })
  } catch (e) {
    throw new Error('ds-balance: shell resolve failed: ' + String((e && e.message) || e))
  }

  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    throw new Error('ds-balance: balance request failed (exit ' + result.exitCode + ')')
  }

  let data
  try {
    data = JSON.parse(result.stdout.text)
  } catch {
    throw new Error('ds-balance: balance response was not JSON')
  }
  if (!data || typeof data !== 'object') throw new Error('ds-balance: empty balance response')
  if (data.error) throw new Error(String((data.error && data.error.message) || data.error))

  const infos = Array.isArray(data.balance_infos) ? data.balance_infos : []
  return {
    isAvailable: data.is_available === true,
    balances: infos.map((info) => ({
      currency: String((info && info.currency) || '').toUpperCase(),
      total: Number(info && info.total_balance),
      granted: Number(info && info.granted_balance),
      toppedUp: Number(info && info.topped_up_balance),
    })),
  }
}

// The typert-protocol `Remote` marker is a standard class-method decorator.
// Applied manually in plain JS: name form + a minimal decorator context whose
// `addInitializer` records the marker on the prototype (read back by the
// gateway through `remoteMethods`).
const _remoteInitializers = []
function markRemote(proto, method) {
  Remote(method)(proto[method], {
    kind: 'method',
    name: method,
    static: false,
    private: false,
    addInitializer: (fn) => {
      _remoteInitializers.push(fn)
    },
  })
}

/** The `dsBalance` cordis Service; constructed under `ctx` it self-registers. */
class DsBalanceRuntime extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'dsBalance')
    this._fetch = () => fetchBalance(ctx)
    for (const fn of _remoteInitializers) fn.call(this)
  }

  async fetch() {
    return this._fetch()
  }
}
markRemote(DsBalanceRuntime.prototype, 'fetch')

export function apply(ctx) {
  // Constructing the service registers it as ctx.dsBalance.
  new DsBalanceRuntime(ctx)
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => {
      void dispose()
    }
  }, 'dsh-dsbal: typert manifest')
}
