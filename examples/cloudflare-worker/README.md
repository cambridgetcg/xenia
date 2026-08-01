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

The packaged example now declares both distinct dependencies explicitly:
`@agenttool/xenia` produces host responses, while
`@agenttool/xenia-surface` supplies the external checker. The root XENIA
package intentionally does **not** contain `surface/0.1/check.mjs`.

From a source checkout, install and build at the repository root, then start the
Worker with the pinned Wrangler version in local mode:

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

If you copied `examples/cloudflare-worker` from an installed package, run the
example as its own project instead. Its `package.json` installs the producer,
the separately versioned checker, TypeScript, and the pinned local runner:

```sh
npm install
npm run typecheck
npm run dev
```

Then, in another terminal from that copied directory:

```sh
npm run check
```

Do not run or edit an example in place inside `node_modules`; copy it into a
project directory first. Neither workflow deploys the Worker.

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
