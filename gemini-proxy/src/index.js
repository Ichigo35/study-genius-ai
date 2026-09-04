// Minimal egress relay for the Gemini API.
//
// Why: the free Gemini API (generativelanguage.googleapis.com) geo-blocks some
// countries (e.g. Laos) — "FAILED_PRECONDITION: User location is not
// supported". This Worker is pinned to a US region via `[placement] region`
// in wrangler.toml, so its fetch() to Google egresses from the US and the
// free API works. The main app points `GEMINI_API_BASE` at
// `https://<this-worker>/v1beta`.
//
// It only forwards to the fixed Google host, only /v1beta|/v1 paths, and
// passes the caller's own `x-goog-api-key` through — it stores no credentials.

const UPSTREAM = "https://generativelanguage.googleapis.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!/^\/v1(beta)?\//.test(url.pathname)) {
      return new Response("gemini-proxy: ok", { status: 200 });
    }
    if (request.method !== "POST" && request.method !== "GET") {
      return new Response("method not allowed", { status: 405 });
    }

    const apiKey = request.headers.get("x-goog-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: { message: "missing x-goog-api-key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const headers = new Headers({ "x-goog-api-key": apiKey });
    const ct = request.headers.get("content-type");
    if (ct) headers.set("content-type", ct);

    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
    });

    const respHeaders = new Headers();
    const uct = upstream.headers.get("content-type");
    if (uct) respHeaders.set("content-type", uct);
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  },
};
