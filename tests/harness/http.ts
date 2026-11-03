// Harness family: HTTP. Builds Vercel-style request/response doubles.

export interface FakeRequest {
  method?: string;
  headers: Record<string, string>;
  body?: unknown;
  query: Record<string, string>;
}

export function request(options: {
  method?: string;
  token?: string | null;
  body?: unknown;
  query?: Record<string, string>;
} = {}): FakeRequest {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return {
    method: options.method ?? 'POST',
    headers,
    body: options.body,
    query: options.query ?? {},
  };
}

export interface FakeResponse {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  status(code: number): FakeResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(chunk?: string): void;
  flushHeaders(): void;
}

export function response(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
    write() {
      return true;
    },
    end() {},
    flushHeaders() {},
  };
  return res;
}

type Handler = (req: any, res: any) => unknown;

/** Calls a handler and returns the captured response. */
export async function call(handler: Handler, req: FakeRequest): Promise<FakeResponse> {
  const res = response();
  await handler(req, res);
  return res;
}
