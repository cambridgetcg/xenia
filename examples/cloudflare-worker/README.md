<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Cloudflare Worker producer example

This is a host-side XENIA Surface 0.1 example. It uses the Web-standard
`@agenttool/xenia/surface-0.1` helpers to expose one small public surface:

- `GET /.well-known/agent.json` returns the release-pinned manifest;
- `GET /` negotiates JSON or HTML across Surface 0.1's bounded `Accept` matrix;
- an unacceptable `Accept` value returns a typed `406` problem; and
- a path that the application router genuinely does not recognize returns the
  typed route-not-found problem.

The manifest derives its canonical origin from the incoming request. This lets
the same source describe the loopback development server and a future HTTPS
host without declaring cross-origin resources.

The example is deliberately a producer, not a scanner. It performs no outbound
requests, uses no storage, credentials, secrets, authentication, or browser
automation, and contains no deployment command. It also does not install
catch-all middleware. `routeApplication()` returns `null` only for a genuine
route miss; every `Response` from a known route remains untouched, including a
semantic `404` that a larger application may return for its own resource.

## Run and check locally

From the repository root, install and build the package, then start the Worker
with the pinned Wrangler version in local mode:

```sh
npm install
npm run build
npx --yes wrangler@4.60.0 dev --local \
  --config examples/cloudflare-worker/wrangler.jsonc
```

In another terminal, run the repository's external checker against the local
origin:

```sh
node surface/0.1/check.mjs http://127.0.0.1:8787/ --json
```

Plain HTTP is accepted here only because the target is loopback. A public
Surface origin must use HTTPS.

## Evidence boundary

A successful checker run is a time-bounded observation of this manifest, the
declared root representations, and one unpredictable missing route. It does
not prove identity control, authorization, consent, privacy or retention,
continuity, portability, economic behavior, every application route, or the
security and availability of a future deployment. The manifest's empty
`claims` and explicit `not_covered` list keep those boundaries visible.

When adapting the example, connect the Surface route-not-found response to an
explicit router no-match result. Do not rewrite every downstream `404`, and do
not add a `/* -> /index.html 200` fallback that turns unknown routes into false
successes.
