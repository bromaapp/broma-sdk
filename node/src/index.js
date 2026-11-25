// Broma SDK for Node.js: drive the Broma desktop app from a script.
//
// The app runs a local API on 127.0.0.1 (Broma › Integrations › API keys). Every call goes to
// one of its tools - the same tools the Broma Agent and MCP clients use - and
// the app applies the key's access (read only / ask in the app / full).
//
//   import { Broma } from "broma-sdk";
//   const broma = new Broma({ apiKey: process.env.BROMA_API_KEY });
//   const [profile] = await broma.profiles.list();
//   const { wsEndpoint } = await broma.browser.start(profile.id);

export const DEFAULT_PORT = 47821;

/** A call the app refused or a tool that failed. */
export class BromaError extends Error {
  constructor(message, { status = 0, code = "", text = "", result = null } = {}) {
    super(message);
    this.name = "BromaError";
    /** HTTP status: 401 bad key, 402 plan without the API, 403 declined in the app, 404 unknown tool, 409 stopped or busy, 422 the tool failed. */
    this.status = status;
    /** "key_invalid", "plan_required", "unknown_tool", "denied", "stopped", "error", ... */
    this.code = code;
    /** What the tool said, for a call that ran. */
    this.text = text;
    this.result = result;
  }
}

function itemsOf(data) {
  return data && Array.isArray(data.items) ? data.items : data;
}

function ids(value) {
  return Array.isArray(value) ? value : [value];
}

export class Broma {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] defaults to the BROMA_API_KEY environment variable
   * @param {number} [options.port] defaults to BROMA_API_PORT, then 47821
   * @param {string} [options.baseUrl] overrides host and port, e.g. "http://127.0.0.1:47821"
   * @param {number} [options.timeout] per call, in ms; 0 waits as long as it takes (a call may wait for approval in the app). Default 0.
   * @param {typeof fetch} [options.fetch]
   */
  constructor(options = {}) {
    const env = typeof process !== "undefined" ? process.env : {};
    this.apiKey = options.apiKey ?? env.BROMA_API_KEY ?? "";
    if (!this.apiKey) {
      throw new BromaError("No API key: pass { apiKey } or set BROMA_API_KEY. Make one in Broma › Integrations › API keys.", { code: "key_required" });
    }
    const port = options.port ?? (env.BROMA_API_PORT ? Number(env.BROMA_API_PORT) : DEFAULT_PORT);
    this.baseUrl = (options.baseUrl ?? `http://127.0.0.1:${port}`).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 0;
    this._fetch = options.fetch ?? globalThis.fetch;
    if (!this._fetch) throw new BromaError("This Node.js has no fetch; use Node 18 or newer, or pass { fetch }.");

    this.profiles = {
      /** Profiles, as list_profile filters them: { query, filter, ids, limit, offset }. */
      list: async (args = {}) => itemsOf(await this.call("list_profile", args)),
      get: (profileId, args = {}) => this.call("get_profile", { profile_id: profileId, ...args }),
      /** create_profile: one object per profile, e.g. [{ name: "Shop 1" }]. */
      create: (profiles, args = {}) => this.call("create_profile", { profiles: ids(profiles), ...args }),
      update: (profileIds, changes) => this.call("update_profile", { profile_ids: ids(profileIds), ...changes }),
      delete: (profileIds) => this.call("delete_profile", { profile_ids: ids(profileIds) }),
      /** Open the browser windows, without a DevTools endpoint; see browser.start for one. */
      launch: (profileIds) => this.call("launch_profile", { profile_ids: ids(profileIds) }),
      stop: (profileIds) => this.call("stop_profile", { profile_ids: ids(profileIds) }),
      groups: async () => itemsOf(await this.call("list_profile_group")),
    };

    this.browser = {
      /**
       * Open a profile's browser (or find it open) and get its Chrome DevTools endpoint.
       * Puppeteer: puppeteer.connect({ browserWSEndpoint: wsEndpoint }).
       * Playwright: chromium.connectOverCDP(wsEndpoint).
       * Selenium: options.debugger_address = debuggerAddress.
       * profileId 0 is a clean temporary browser.
       */
      start: async (profileId) => {
        const data = await this.call("browser_endpoint", { profile_id: profileId });
        return {
          profileId: data.profile_id,
          name: data.name,
          sessionId: data.session_id,
          wsEndpoint: data.ws_endpoint,
          httpEndpoint: data.http_endpoint,
          debuggerAddress: data.debugger_address,
        };
      },
      stop: (profileId) => this.call("stop_profile", { profile_ids: [profileId] }),
    };

    this.proxies = {
      list: async (args = {}) => itemsOf(await this.call("list_proxy", args)),
      /** One proxy per line: "host:port", "host:port:user:pass", "socks5://user:pass@host:port". */
      add: (lines, args = {}) => this.call("add_proxy", { lines: Array.isArray(lines) ? lines.join("\n") : lines, ...args }),
      update: (proxyId, changes) => this.call("update_proxy", { proxy_id: proxyId, ...changes }),
      delete: (proxyIds) => this.call("delete_proxy", { proxy_ids: ids(proxyIds) }),
      /** check_proxy: { proxy_ids }, { profile_ids } or { lines }. */
      check: (args) => this.call("check_proxy", args),
    };

    this.flows = {
      list: async (args = {}) => itemsOf(await this.call("list_flow", args)),
      get: (flowId, args = {}) => this.call("get_flow", { flow_id: flowId, ...args }),
      /** Run a flow once: { profileIds, inputs, name }. Returns the job it started; see jobs.get for its results. */
      run: (flowId, { profileIds, inputs, name } = {}) =>
        this.call("run_flow", {
          flow_id: flowId,
          ...(profileIds ? { profile_ids: ids(profileIds) } : {}),
          ...(inputs ? { inputs } : {}),
          ...(name ? { name } : {}),
        }),
    };

    this.jobs = {
      list: async (args = {}) => itemsOf(await this.call("list_job", args)),
      /** get_job: { wait_seconds } waits for the runs to finish, { result_limit } for the result rows. */
      get: (jobId, args = {}) => this.call("get_job", { job_id: jobId, ...args }),
      run: (jobIds) => this.call("run_job", { job_ids: ids(jobIds) }),
      stop: (jobIds) => this.call("stop_job", { job_ids: ids(jobIds) }),
    };

    this.data = {
      list: async (args = {}) => itemsOf(await this.call("list_data", args)),
    };
  }

  /** The key, its access and the app's version. */
  status() {
    return this._request("GET", "/api/v1/status");
  }

  /** Every tool this key may call, with its JSON Schema. */
  async tools() {
    return (await this._request("GET", "/api/v1/tools")).tools;
  }

  /**
   * Call any tool by name. Returns its JSON, or its text when it answers in words.
   * Throws BromaError when the app refuses or the tool fails.
   */
  async call(name, args = {}) {
    const body = await this._request("POST", `/api/v1/tools/${encodeURIComponent(name)}`, args);
    if (body.image) return { text: body.text, image: body.image };
    return body.data !== undefined ? body.data : body.text;
  }

  async _request(method, path, payload) {
    const controller = this.timeout > 0 ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeout) : null;
    let response;
    try {
      response = await this._fetch(this.baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, ...(payload !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
        signal: controller?.signal,
      });
    } catch (e) {
      throw new BromaError(
        `Can't reach Broma at ${this.baseUrl}: is the app open, signed in, with the local server turned on (Integrations › API keys)? (${e.message})`,
        { code: "unreachable" },
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (response.ok) return body;
    if (body.error) {
      throw new BromaError(body.error.message, { status: response.status, code: body.error.code });
    }
    throw new BromaError(body.text || `HTTP ${response.status}`, {
      status: response.status,
      code: body.status || "error",
      text: body.text || "",
      result: body,
    });
  }
}

export default Broma;
