import type { JsonValue } from '@framework/core';

/** Anything that answers requests: `hono.request` in-process, or a network client. */
export interface JsonRequester {
  request(path: string, init?: RequestInit): Promise<Response>;
}

export function jsonInit(method: string, body?: JsonValue): RequestInit {
  if (body === undefined) return { method };
  return {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  };
}

export interface EphemeralServer {
  readonly baseUrl: string;
  readonly requester: JsonRequester;
  stop(): Promise<void>;
}

/** Starts a local listener on an ephemeral loopback port for network-mode tests. */
export function serveOnEphemeralPort(handler: (request: Request) => Response | Promise<Response>): EphemeralServer {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  return {
    baseUrl,
    requester: { request: (path, init) => fetch(`${baseUrl}${path}`, init) },
    stop: () => server.stop(true),
  };
}
