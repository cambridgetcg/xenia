// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  SURFACE_DEFAULT_NOT_COVERED,
  SURFACE_MANIFEST_PATH,
  SURFACE_MANIFEST_SCHEMA_URL,
  SURFACE_MANIFEST_VERSION,
  SURFACE_PROBLEM_SCHEMA_URL,
  SURFACE_PROBLEM_VERSION,
  SURFACE_PROFILE,
  SURFACE_PROFILE_DOCUMENTATION_URL,
  createSurfaceManifestResponse,
  createSurfaceNotAcceptableProblem,
  createSurfaceProblem,
  createSurfaceProblemResponse,
  createSurfaceResourceResponse,
  createSurfaceRouteNotFoundProblem,
  defineSurfaceManifest,
  negotiateSurfaceResource,
} from "@agenttool/xenia/surface-0.1";
import {
  checkSurface,
  validateManifest,
  validateProblem,
} from "../surface/0.1/check.mjs";

const ORIGIN = "https://house.example";
const TARGET = `${ORIGIN}/`;
const MANIFEST_URL = `${ORIGIN}${SURFACE_MANIFEST_PATH}`;
const SHA256_A = `sha256:${"a".repeat(64)}`;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateManifestSchema = ajv.compile(JSON.parse(await readFile(
  new URL("../surface/0.1/manifest.schema.json", import.meta.url),
  "utf8",
)));
const validateProblemSchema = ajv.compile(JSON.parse(await readFile(
  new URL("../surface/0.1/problem.schema.json", import.meta.url),
  "utf8",
)));

function minimalDefinition(overrides = {}) {
  return {
    service: {
      name: "fixture",
      canonicalUrl: TARGET,
      description: "A minimal in-memory XENIA Surface fixture.",
    },
    resources: [
      {
        id: "entry",
        href: TARGET,
      },
    ],
    ...overrides,
  };
}

function assertValidManifest(manifest, target = TARGET) {
  assert.equal(
    validateManifestSchema(manifest),
    true,
    JSON.stringify(validateManifestSchema.errors),
  );
  assert.deepEqual(validateManifest(manifest, target), []);
}

function assertValidProblem(problem, status, options = {}) {
  assert.equal(
    validateProblemSchema(problem),
    true,
    JSON.stringify(validateProblemSchema.errors),
  );
  assert.deepEqual(validateProblem(problem, status, options), []);
}

function varyTokens(response) {
  return new Set(
    (response.headers.get("vary") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

test("defines a minimal manifest with immutable RC1 pins and honest default boundaries", () => {
  const input = minimalDefinition();
  const before = structuredClone(input);
  const manifest = defineSurfaceManifest(input);

  assert.deepEqual(input, before, "the ergonomic definition must not be mutated");
  assert.deepEqual(
    {
      $schema: manifest.$schema,
      schema_version: manifest.schema_version,
      profile: manifest.profile,
      problem_schema: manifest.problem_schema,
    },
    {
      $schema: SURFACE_MANIFEST_SCHEMA_URL,
      schema_version: SURFACE_MANIFEST_VERSION,
      profile: SURFACE_PROFILE,
      problem_schema: SURFACE_PROBLEM_SCHEMA_URL,
    },
  );
  assert.equal(SURFACE_PROFILE, "xenia-surface/0.1");
  assert.equal(SURFACE_MANIFEST_VERSION, "xenia.surface.manifest/0.1");
  assert.equal(SURFACE_PROBLEM_VERSION, "xenia.surface.problem/0.1");
  assert.equal(SURFACE_MANIFEST_PATH, "/.well-known/agent.json");
  assert.equal(
    SURFACE_MANIFEST_SCHEMA_URL,
    "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/manifest.schema.json",
  );
  assert.equal(
    SURFACE_PROBLEM_SCHEMA_URL,
    "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json",
  );
  assert.equal(
    SURFACE_PROFILE_DOCUMENTATION_URL,
    "https://github.com/cambridgetcg/xenia/blob/surface-v0.1.0-rc.1/surface/0.1/README.md",
  );
  assert.deepEqual(manifest.service, {
    name: "fixture",
    canonical_url: TARGET,
    description: "A minimal in-memory XENIA Surface fixture.",
  });
  assert.deepEqual(manifest.resources, [
    {
      id: "entry",
      href: TARGET,
      representations: ["application/json"],
      default_media_type: "application/json",
      auth: "none",
    },
  ]);
  assert.deepEqual(manifest.claims, []);
  assert.deepEqual(SURFACE_DEFAULT_NOT_COVERED, [
    "identity control",
    "actor authorization",
    "consent",
    "privacy and retention",
    "continuity and portability",
    "economic behavior",
    "unprobed routes",
  ]);
  assert.deepEqual(manifest.not_covered, SURFACE_DEFAULT_NOT_COVERED);
  assert.equal(manifest.documentation, SURFACE_PROFILE_DOCUMENTATION_URL);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.service), true);
  assert.equal(Object.isFrozen(manifest.resources), true);
  assert.equal(Object.isFrozen(manifest.resources[0]), true);
  assert.equal(Object.isFrozen(manifest.not_covered), true);
  assertValidManifest(manifest);
});

test("normalizes camel-case claim evidence without weakening the wire contract", () => {
  const manifest = defineSurfaceManifest(minimalDefinition({
    claims: [
      {
        id: "surface.entry",
        statement: "The public entry was tested from outside the service.",
        scope: [`GET ${TARGET}`],
        evidenceState: "tested",
        outcome: "pass",
        evidence: [
          {
            kind: "probe",
            uri: `${ORIGIN}/evidence/entry.json`,
            observedAt: "2026-07-12T09:00:00.000Z",
            expiresAt: "2026-07-13T09:00:00.000Z",
            digest: SHA256_A,
            verifier: `${ORIGIN}/verifiers/external-checker`,
          },
        ],
      },
      {
        id: "surface.signature",
        statement: "A key signed the evidence bytes; this does not prove their truth.",
        scope: [`GET ${ORIGIN}/evidence/signed.json`],
        evidenceState: "attested",
        outcome: "unknown",
        evidence: [
          {
            kind: "signature",
            uri: `${ORIGIN}/evidence/signed.json`,
            observedAt: "2026-07-12T09:00:00Z",
            expiresAt: "2026-07-13T09:00:00Z",
            digest: SHA256_A,
            verifier: `${ORIGIN}/verifiers/signature-checker`,
            algorithm: "ed25519",
            keyId: `${ORIGIN}/keys/1`,
            signature: `${"A".repeat(86)}==`,
          },
        ],
      },
    ],
  }));

  assert.equal(manifest.claims[0].evidence_state, "tested");
  assert.deepEqual(manifest.claims[0].evidence[0], {
    kind: "probe",
    uri: `${ORIGIN}/evidence/entry.json`,
    observed_at: "2026-07-12T09:00:00.000Z",
    expires_at: "2026-07-13T09:00:00.000Z",
    digest: SHA256_A,
    verifier: `${ORIGIN}/verifiers/external-checker`,
  });
  assert.equal(manifest.claims[1].evidence[0].key_id, `${ORIGIN}/keys/1`);
  assert.equal("keyId" in manifest.claims[1].evidence[0], false);
  assertValidManifest(manifest);
});

test("rejects cross-origin, queried, duplicate, and internally inconsistent resources", () => {
  const invalidResources = [
    [
      {
        id: "entry",
        href: "https://other.example/",
      },
    ],
    [
      {
        id: "entry",
        href: `${TARGET}?private=not-allowed`,
      },
    ],
    [
      { id: "entry", href: TARGET },
      { id: "entry", href: `${ORIGIN}/other` },
    ],
    [
      {
        id: "entry",
        href: TARGET,
        representations: ["application/json"],
        defaultMediaType: "text/html",
      },
    ],
  ];

  for (const resources of invalidResources) {
    assert.throws(() => defineSurfaceManifest(minimalDefinition({ resources })));
  }
});

test("rejects URL spellings that the platform parser normalizes beyond the schema", () => {
  const loopback = defineSurfaceManifest({
    service: {
      name: "loopback fixture",
      canonicalUrl: "http://127.0.0.1:8787/",
      description: "A local Surface producer fixture.",
    },
    resources: [{ id: "entry", href: "http://127.0.0.1:8787/" }],
  });
  assertValidManifest(loopback, "http://127.0.0.1:8787/");

  for (const canonicalUrl of [
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://LOCALHOST/",
    "https://@house.example/",
    "https://:@house.example/",
  ]) {
    assert.throws(() => defineSurfaceManifest({
      service: {
        name: "noncanonical loopback fixture",
        canonicalUrl,
        description: "The URL parser would normalize this spelling.",
      },
      resources: [{ id: "entry", href: canonicalUrl }],
    }));
  }
});

test("rejects malformed claim states, duplicate claims, and invalid evidence", () => {
  const validEvidence = {
    kind: "probe",
    uri: `${ORIGIN}/evidence/probe.json`,
    observedAt: "2026-07-12T09:00:00Z",
    expiresAt: "2026-07-13T09:00:00Z",
    digest: SHA256_A,
    verifier: `${ORIGIN}/verifiers/checker`,
  };
  const baseClaim = {
    id: "surface.entry",
    statement: "The entry was observed.",
    scope: [`GET ${TARGET}`],
    evidenceState: "tested",
    outcome: "pass",
    evidence: [validEvidence],
  };
  const invalidClaims = [
    [{ ...baseClaim, evidence: [] }],
    [{ ...baseClaim, evidenceState: "asserted", evidence: [validEvidence] }],
    [baseClaim, { ...baseClaim }],
    [{
      ...baseClaim,
      evidence: [{ ...validEvidence, expiresAt: validEvidence.observedAt }],
    }],
    [{
      ...baseClaim,
      evidenceState: "attested",
      evidence: [{
        ...validEvidence,
        kind: "signature",
        algorithm: "ed25519",
      }],
    }],
  ];

  for (const claims of invalidClaims) {
    assert.throws(() => defineSurfaceManifest(minimalDefinition({ claims })));
  }
});

test("negotiates the exact HTML and JSON matrix, including q=0 and wildcards", () => {
  const resource = defineSurfaceManifest(minimalDefinition({
    resources: [
      {
        id: "entry",
        href: TARGET,
        representations: ["application/json", "text/html"],
        defaultMediaType: "text/html",
      },
    ],
  })).resources[0];
  const cases = [
    [undefined, "text/html"],
    [null, "text/html"],
    ["", "text/html"],
    ["application/json", "application/json"],
    ["text/html;q=0, application/json;q=1", "application/json"],
    ["application/*;q=1, text/html;q=0.2", "application/json"],
    ["*/*", "text/html"],
    ["text/html", "text/html"],
    ["application/json;q=0.2, text/html;q=1", "text/html"],
    ["application/json;q=0, */*;q=1", "text/html"],
    ["application/x-xenia-unsupported", "not-acceptable"],
    ["application/json;q=bogus, text/html;q=0.5", "text/html"],
    ["application/json;q=1.1, text/html;q=0.5", "text/html"],
  ];

  for (const [accept, expected] of cases) {
    assert.equal(negotiateSurfaceResource(resource, accept), expected, String(accept));
  }
});

test("negotiates JSON-only resources without letting a wildcard revive q=0 JSON", () => {
  const resource = defineSurfaceManifest(minimalDefinition({
    resources: [{
      id: "entry",
      href: TARGET,
      representations: ["application/json"],
      defaultMediaType: "application/json",
    }],
  })).resources[0];
  const cases = [
    [undefined, "application/json"],
    ["*/*", "application/json"],
    ["application/*", "application/json"],
    ["application/json", "application/json"],
    ["text/html;q=0, application/json;q=1", "application/json"],
    ["application/*;q=1, text/html;q=0.2", "application/json"],
    ["text/html", "not-acceptable"],
    ["application/json;q=0, */*;q=1", "not-acceptable"],
    ["application/x-xenia-unsupported", "not-acceptable"],
  ];

  for (const [accept, expected] of cases) {
    assert.equal(negotiateSurfaceResource(resource, accept), expected, String(accept));
  }
});

test("response helpers serialize the right wire bodies and never mutate caller headers", async () => {
  const manifest = defineSurfaceManifest(minimalDefinition());
  const problem = createSurfaceNotAcceptableProblem({ resource: manifest.resources[0] });
  const callerHeaders = new Headers({
    "Content-Encoding": "gzip",
    "Content-Length": "1",
    "Transfer-Encoding": "chunked",
    Vary: "Origin",
    "X-Fixture": "preserved",
  });
  const before = [...callerHeaders.entries()];

  const manifestResponse = createSurfaceManifestResponse(manifest, {
    headers: callerHeaders,
  });
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type") ?? "", /^application\/json\b/);
  assert.equal(manifestResponse.headers.get("x-fixture"), "preserved");
  assert.equal(manifestResponse.headers.get("content-encoding"), null);
  assert.equal(manifestResponse.headers.get("content-length"), null);
  assert.equal(manifestResponse.headers.get("transfer-encoding"), null);
  assert.deepEqual(varyTokens(manifestResponse), new Set(["origin", "accept"]));
  assert.deepEqual(await manifestResponse.json(), manifest);

  const jsonResponse = createSurfaceResourceResponse(
    "application/json",
    { schema_version: "fixture.entry/1", name: "fixture" },
    { headers: callerHeaders },
  );
  assert.equal(jsonResponse.status, 200);
  assert.match(jsonResponse.headers.get("content-type") ?? "", /^application\/json\b/);
  assert.deepEqual(await jsonResponse.json(), {
    schema_version: "fixture.entry/1",
    name: "fixture",
  });

  const htmlResponse = createSurfaceResourceResponse(
    "text/html",
    "<!doctype html><title>fixture</title>",
    { headers: callerHeaders },
  );
  assert.match(htmlResponse.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.equal(await htmlResponse.text(), "<!doctype html><title>fixture</title>");

  const problemResponse = createSurfaceProblemResponse(problem, {
    headers: callerHeaders,
  });
  assert.equal(problemResponse.status, 406);
  assert.match(
    problemResponse.headers.get("content-type") ?? "",
    /^application\/problem\+json\b/,
  );
  assert.deepEqual(await problemResponse.json(), problem);
  assert.deepEqual([...callerHeaders.entries()], before);
  assert.throws(() => createSurfaceManifestResponse(manifest, { status: 201 }));
  assert.throws(() => createSurfaceResourceResponse(
    "application/json",
    { schema_version: "fixture.entry/1" },
    { headers: { Vary: "*" } },
  ));
  assert.throws(() => createSurfaceResourceResponse("application/json", {
    schema_version: "fixture.entry/1",
    toJSON() {
      return {};
    },
  }));
  assert.throws(() => createSurfaceResourceResponse("application/json", {
    schema_version: "fixture.entry/1",
    toJSON() {
      return undefined;
    },
  }));
  assert.throws(() => createSurfaceProblemResponse(problem, { status: 404 }));
});

test("creates exact generic, 406, and discoverable 404 Surface problems", () => {
  const resource = defineSurfaceManifest(minimalDefinition()).resources[0];
  const generic = createSurfaceProblem({
    type: `${ORIGIN}/problems/busy`,
    title: "Temporarily busy",
    status: 503,
    code: "temporarily_busy",
    detail: "Retry the public entry after the advertised interval.",
    retryable: true,
    terminal: false,
    nextActions: [
      {
        rel: "retry",
        href: resource.href,
        accept: "application/json",
      },
    ],
  });
  assert.deepEqual(generic, {
    schema_version: "xenia.surface.problem/0.1",
    type: `${ORIGIN}/problems/busy`,
    title: "Temporarily busy",
    status: 503,
    code: "temporarily_busy",
    detail: "Retry the public entry after the advertised interval.",
    retryable: true,
    terminal: false,
    next_actions: [
      {
        rel: "retry",
        href: resource.href,
        method: "GET",
        accept: "application/json",
      },
    ],
    docs: [SURFACE_PROFILE_DOCUMENTATION_URL],
  });
  assertValidProblem(generic, 503);

  const notAcceptable = createSurfaceNotAcceptableProblem({ resource });
  assert.deepEqual(notAcceptable, {
    schema_version: "xenia.surface.problem/0.1",
    type: `${ORIGIN}/problems/not-acceptable`,
    title: "No acceptable representation",
    status: 406,
    code: "not_acceptable",
    detail: "Request one of the media types declared for this resource.",
    retryable: false,
    terminal: false,
    next_actions: [
      {
        rel: "retry_with_supported_representation",
        href: resource.href,
        method: "GET",
        accept: "application/json",
      },
    ],
    docs: [SURFACE_PROFILE_DOCUMENTATION_URL],
  });
  assertValidProblem(notAcceptable, 406, {
    expectedCode: "not_acceptable",
    resource,
  });

  const routeNotFound = createSurfaceRouteNotFoundProblem({
    manifestUrl: MANIFEST_URL,
  });
  assert.deepEqual(routeNotFound, {
    schema_version: "xenia.surface.problem/0.1",
    type: `${ORIGIN}/problems/route-not-found`,
    title: "No resource exists at this path",
    status: 404,
    code: "route_not_found",
    detail: "Use the discovery manifest to find public resources.",
    retryable: false,
    terminal: false,
    next_actions: [
      {
        rel: "discover",
        href: MANIFEST_URL,
        method: "GET",
        accept: "application/json",
      },
    ],
    docs: [SURFACE_PROFILE_DOCUMENTATION_URL],
  });
  assertValidProblem(routeNotFound, 404, {
    expectedCode: "route_not_found",
    manifestUrl: MANIFEST_URL,
  });
  assert.equal(
    createSurfaceRouteNotFoundProblem({
      manifestUrl: "https://HOUSE.EXAMPLE/.well-known/agent.json",
    }).next_actions[0].href,
    MANIFEST_URL,
  );
});

function createInMemorySurface(options = {}) {
  const manifest = defineSurfaceManifest(minimalDefinition({
    resources: [
      {
        id: "entry",
        href: TARGET,
        representations: ["application/json", "text/html"],
        defaultMediaType: "text/html",
      },
    ],
  }));
  const resource = manifest.resources[0];

  return async function fetchImpl(input, init = {}) {
    const url = new URL(String(input));
    const accept = new Headers(init.headers).get("accept");

    if (url.pathname === "/.well-known/agent.json") {
      return createSurfaceManifestResponse(manifest);
    }
    if (url.pathname === "/") {
      const selected = negotiateSurfaceResource(resource, accept);
      if (selected === "not-acceptable") {
        return createSurfaceProblemResponse(
          createSurfaceNotAcceptableProblem({ resource }),
        );
      }
      if (selected === "application/json") {
        const body = JSON.stringify({
          schema_version: "fixture.entry/1",
          name: "fixture",
        });
        if (options.omitJsonVary && accept === "application/json") {
          return new Response(body, {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        return createSurfaceResourceResponse(
          "application/json",
          {
            schema_version: "fixture.entry/1",
            name: "fixture",
          },
        );
      }
      return createSurfaceResourceResponse(
        "text/html",
        "<!doctype html><title>fixture</title>",
      );
    }

    return createSurfaceProblemResponse(
      createSurfaceRouteNotFoundProblem({ manifestUrl: MANIFEST_URL }),
    );
  };
}

test("the authoring helpers pass the independent RC1 checker end to end", async () => {
  const result = await checkSurface(TARGET, {
    fetchImpl: createInMemorySurface(),
    now: "2026-07-12T10:00:00.000Z",
  });

  assert.equal(result.result, "conformant");
  assert.deepEqual(result.counts, {
    pass: 24,
    fail: 0,
    unknown: 0,
    not_run: 0,
  });
  assert.equal(result.expires_at, "2026-07-13T10:00:00.000Z");
  assert.equal(result.checks.length, 24);
  assert.ok(result.checks.every((check) => check.outcome === "pass"));
});

test("the independent checker still detects a response that bypasses Vary: Accept", async () => {
  const result = await checkSurface(TARGET, {
    fetchImpl: createInMemorySurface({ omitJsonVary: true }),
  });

  assert.equal(result.result, "nonconformant");
  assert.equal(result.counts.fail, 1);
  assert.equal(
    result.checks.find((check) => check.id === "R.ENTRY.JSON_VARY")?.outcome,
    "fail",
  );
});
