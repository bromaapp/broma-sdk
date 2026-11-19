export declare const DEFAULT_PORT: 47821;

export declare class BromaError extends Error {
  /** HTTP status: 401 bad key, 402 plan without the API, 403 declined in the app, 404 unknown tool, 409 stopped or busy, 422 the tool failed. */
  status: number;
  /** "key_invalid", "plan_required", "unknown_tool", "denied", "stopped", "error", "unreachable", ... */
  code: string;
  /** What the tool said, for a call that ran. */
  text: string;
  result: unknown;
}

export interface BromaOptions {
  /** Defaults to the BROMA_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to BROMA_API_PORT, then 47821. */
  port?: number;
  /** Overrides host and port, e.g. "http://127.0.0.1:47821". */
  baseUrl?: string;
  /** Per call, in ms. 0 (the default) waits as long as it takes: a call may wait for approval in the app. */
  timeout?: number;
  fetch?: typeof fetch;
}

export interface Tool {
  name: string;
  description: string;
  risk: "read" | "write" | "confirm";
  parameters: Record<string, unknown>;
}

export interface BrowserEndpoint {
  profileId: number;
  name: string;
  sessionId: string;
  /** Puppeteer browserWSEndpoint, Playwright connectOverCDP. */
  wsEndpoint: string;
  httpEndpoint: string;
  /** Selenium debuggerAddress. */
  debuggerAddress: string;
}

export interface Status {
  api_version: number;
  app_version: string;
  key: { id: number; name: string; mode: "read" | "ask" | "full" };
}

type Ids = number | number[];
type Json = any;

export declare class Broma {
  constructor(options?: BromaOptions);
  readonly baseUrl: string;
  status(): Promise<Status>;
  tools(): Promise<Tool[]>;
  /** Call any tool by name: its JSON, or its text. */
  call(name: string, args?: Record<string, unknown>): Promise<Json>;

  profiles: {
    list(args?: { query?: string; filter?: string; ids?: number[]; limit?: number; offset?: number }): Promise<Json[]>;
    get(profileId: number, args?: { log_lines?: number }): Promise<Json>;
    create(profiles: Record<string, unknown> | Record<string, unknown>[], args?: { sync?: boolean; version?: string }): Promise<Json>;
    update(profileIds: Ids, changes: Record<string, unknown>): Promise<Json>;
    delete(profileIds: Ids): Promise<Json>;
    launch(profileIds: Ids): Promise<Json>;
    stop(profileIds: Ids): Promise<Json>;
    groups(): Promise<Json[]>;
  };
  browser: {
    start(profileId: number): Promise<BrowserEndpoint>;
    stop(profileId: number): Promise<Json>;
  };
  proxies: {
    list(args?: { query?: string; limit?: number; offset?: number }): Promise<Json[]>;
    add(lines: string | string[], args?: { default_protocol?: string }): Promise<Json>;
    update(proxyId: number, changes: Record<string, unknown>): Promise<Json>;
    delete(proxyIds: Ids): Promise<Json>;
    check(args: { proxy_ids?: number[]; profile_ids?: number[]; lines?: string }): Promise<Json>;
  };
  flows: {
    list(args?: { query?: string; limit?: number; offset?: number }): Promise<Json[]>;
    get(flowId: number, args?: { version?: number }): Promise<Json>;
    run(flowId: number, options?: { profileIds?: Ids; inputs?: Record<string, unknown>; name?: string }): Promise<Json>;
  };
  jobs: {
    list(args?: { query?: string; enabled?: boolean; limit?: number; offset?: number }): Promise<Json[]>;
    get(jobId: number, args?: { wait_seconds?: number; result_limit?: number; limit?: number }): Promise<Json>;
    run(jobIds: Ids): Promise<Json>;
    stop(jobIds: Ids): Promise<Json>;
  };
  data: {
    list(args?: { team_id?: number }): Promise<Json[]>;
  };
}

export default Broma;
