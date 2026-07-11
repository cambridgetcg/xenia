// SPDX-License-Identifier: MPL-2.0

import {
  CHECKER_VERSION,
  checkSurface,
  validateManifest,
  validateProblem,
  type SurfaceCheckOptions,
  type SurfaceFetch,
  type SurfaceResult,
} from "@agenttool/xenia-surface";

const fixtureFetch: SurfaceFetch = async (input: string | URL) =>
  new Response(JSON.stringify({ input: String(input) }), {
    headers: { "content-type": "application/json" },
  });

const options: SurfaceCheckOptions = {
  now: 0,
  timeoutMs: 500,
  totalTimeoutMs: 2_000,
  maxBodyBytes: 65_536,
  fetchImpl: fixtureFetch,
};

const result: Promise<SurfaceResult> = checkSurface("https://example.com", options);
const manifestErrors: string[] = validateManifest({}, new URL("https://example.com"));
const problemErrors: string[] = validateProblem({}, 404, {
  expectedCode: "route_not_found",
  manifestUrl: "https://example.com/.well-known/agent.json",
  resource: {
    href: "https://example.com/",
    representations: ["application/json"],
  },
});

void result;
void manifestErrors;
void problemErrors;
CHECKER_VERSION satisfies "0.1.0-rc.1";
