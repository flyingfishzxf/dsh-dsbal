/**
 * dsh-dsbal — Host half.
 *
 * Registers a `dsBalance` Remote service (`fetch`) that resolves the DeepSeek
 * API key through the credential seam and queries `GET {baseURL}/user/balance`
 * through the shell (the `web.fetch` seam cannot carry an `Authorization`
 * header, and the dynamic host sandbox forbids `fetch`). The transport is
 * platform-dependent:
 *
 * - POSIX (bash): `curl` with `${DEEPSEEK_API_KEY}` expansion;
 * - Windows (pwsh): `node -e` with a base64-embedded one-liner — the sandboxed
 *   PowerShell shell cannot complete ANY schannel TLS (Git/System32 curl and
 *   .NET all fail with `SEC_E_NO_CREDENTIALS` because the restricted token
 *   cannot acquire certificate-store credentials), while Node's OpenSSL-based
 *   fetch is unaffected. On Windows the request explicitly runs unconfined
 *   (`sandboxPolicy.danger-full-access`): the ACL sandbox runner breaks for
 *   wide deployment workspaces (temp-inside-workspace refusal or runner hang
 *   on broad roots), which would otherwise make balance fetching depend on the
 *   directory `dsh web` was started from. The command is fixed and
 *   plugin-authored (URL from settings, key from credentials), so running it
 *   unconfined is safe; POSIX keeps the default confined policy.
 *
 * On both platforms the key and URL ride the explicit `env` layer of the shell
 * spec, so the secret never appears in the command string or logs.
 *
 * The client half of this package mounts the Remote and renders the sidebar
 * widget.
 *
 * The key and endpoint honour the `llm-deepseek` settings section
 * (`apiKeyEnv`, default `DEEPSEEK_API_KEY`; `baseURL`, default the public
 * DeepSeek API), exactly like the model adapter does.
 *
 * Host-API compatibility: DSH 0.1.7 renamed the shell execution surface
 * (`run(spec)` → `execute(spec).result()`) and dropped the settings
 * `get(ns)` accessor in favour of `describe()`. Both surfaces are probed at
 * call time so one bundle keeps working before and after that update.
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
 * Node one-liner used by the Windows transport: GET `DS_BAL_URL` with the
 * `Bearer DEEPSEEK_API_KEY` header and write the raw body to stdout. Base64-
 * embedded in the pwsh command string so quoting stays clean; the secret and
 * URL arrive through the process environment, never through argv.
 */
const NODE_FETCH_SCRIPT = 'const u=process.env.DS_BAL_URL,k=process.env.DEEPSEEK_API_KEY;fetch(u,{headers:{Authorization:"Bearer "+k},signal:AbortSignal.timeout(10000)}).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(String(e.message||e));process.exit(1)})'

/**
 * Read the live `llm-deepseek` settings section.
 *
 * DSH 0.1.7 replaced the settings service's `get(ns)` accessor with
 * `describe()`, whose entries carry the live projected `{ ns, value }` of every
 * configurable plugin. Read through whichever surface the running host exposes
 * so one bundle works on older and newer hosts; any failure means "not
 * configured", and the plugin's own defaults apply.
 *
 * @returns The live section object, or `undefined` when it is unavailable.
 */
function readLlmDeepseekSection(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined) return undefined
  try {
    if (typeof settings.get === 'function') {
      const cfg = settings.get('llm-deepseek')
      if (cfg && typeof cfg === 'object') return cfg
    }
  } catch {
    // Older accessor absent or not readable; fall through to describe().
  }
  try {
    if (typeof settings.describe === 'function') {
      const descriptors = settings.describe()
      const entry = Array.isArray(descriptors)
        ? descriptors.find((candidate) => candidate && candidate.ns === 'llm-deepseek')
        : undefined
      const cfg = entry && entry.value
      if (cfg && typeof cfg === 'object') return cfg
    }
  } catch {
    // llm-deepseek namespace not registered; use defaults.
  }
  return undefined
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
  const cfg = readLlmDeepseekSection(ctx)
  if (cfg) {
    if (typeof cfg.apiKeyEnv === 'string' && cfg.apiKeyEnv.length > 0) apiKeyEnv = cfg.apiKeyEnv
    if (typeof cfg.baseURL === 'string' && cfg.baseURL.length > 0) baseURL = cfg.baseURL.replace(/\/+$/, '')
  }

  const resolved = await credentials.resolve(apiKeyEnv)
  if (!resolved) throw new Error(`ds-balance: API key not configured (${apiKeyEnv})`)

  let spec
  try {
    if (process.platform === 'win32') {
      // Windows: the shell executor is PowerShell, whose sandboxed processes
      // cannot complete schannel TLS at all (see the module doc). Use Node's
      // OpenSSL-based fetch through the same shell and env layer.
      //
      // The request runs UNCONFINED (sandboxPolicy danger-full-access): the
      // Windows ACL runner breaks whenever the deployment workspace is wide
      // (temp-inside-workspace refusal, or runner hang on broad roots such as
      // a home or drive-root start directory), which would make balance
      // fetching depend on how `dsh web` happened to be started. This is a
      // fixed, plugin-authored command — the URL comes from settings, the key
      // from the credentials seam, no model-controlled input — so running it
      // unconfined is safe and keeps behaviour identical no matter where the
      // host was launched. POSIX keeps the default (confined) policy, where
      // the sandbox is not broken.
      spec = shell.resolve({
        command: `node -e "eval(Buffer.from('${Buffer.from(NODE_FETCH_SCRIPT).toString('base64')}','base64').toString())"`,
        timeoutMs: 12000,
        stdoutMaxBytes: 65536,
        env: { DEEPSEEK_API_KEY: resolved.value, DS_BAL_URL: baseURL + '/user/balance' },
        sandboxPolicy: { mode: 'danger-full-access' },
      })
    } else {
      // POSIX: bash expands ${VAR} inside the double-quoted header; the value
      // is forwarded through the explicit env layer so the secret never
      // appears in the command string or logs.
      spec = shell.resolve({
        command: 'curl -sS --max-time 10 -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" ' + JSON.stringify(baseURL + '/user/balance'),
        timeoutMs: 12000,
        stdoutMaxBytes: 65536,
        env: { DEEPSEEK_API_KEY: resolved.value },
      })
    }
  } catch (e) {
    throw new Error('ds-balance: shell resolve failed: ' + String((e && e.message) || e))
  }

  // DSH 0.1.7 replaced the shell service's `run(spec)` with `execute(spec)`,
  // which returns a process handle whose `result()` settles with the collected
  // output. Support both surfaces so the same bundle runs on older and newer
  // hosts.
  let result
  if (typeof shell.execute === 'function') {
    const execution = await shell.execute(spec)
    result = await execution.result()
  } else {
    result = await shell.run(spec)
  }
  if (result.exitCode !== 0) {
    const stderr = String((result.stderr && result.stderr.text) || '').trim()
    const stdout = String((result.stdout && result.stdout.text) || '').trim()
    const why = result.timedOut === true
      ? 'timeout'
      : result.aborted === true
        ? 'aborted'
        : result.signal ? 'signal ' + String(result.signal) : 'exit ' + String(result.exitCode)
    throw new Error('ds-balance: balance request failed (' + why + ')' +
      (stderr ? ' stderr: ' + stderr.slice(0, 400) : '') +
      (stdout ? ' stdout: ' + stdout.slice(0, 400) : ''))
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
