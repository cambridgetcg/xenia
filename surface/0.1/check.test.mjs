// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  checkSurface as runSurfaceCheck,
  MANIFEST_VERSION,
  PROBLEM_VERSION,
  validateManifest,
  validateProblem
} from "./check.mjs";

const CHECKER_PATH = fileURLToPath(new URL("./check.mjs", import.meta.url));
const schemas = ["manifest", "problem", "result"].map((name) =>
  JSON.parse(readFileSync(new URL(`./${name}.schema.json`, import.meta.url), "utf8"))
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);
const validateManifestSchema = ajv.getSchema(schemas[0].$id);
const validateProblemSchema = ajv.getSchema(schemas[1].$id);
const validateResultSchema = ajv.getSchema(schemas[2].$id);

async function checkSurface(...args) {
  const result = await runSurfaceCheck(...args);
  assert.equal(
    validateResultSchema(result),
    true,
    `checker result does not match result.schema.json: ${JSON.stringify(validateResultSchema.errors)}`
  );
  return result;
}

function problem(origin, status, code, options = {}) {
  const terminal = options.terminal === true;
  const nextActions = terminal
    ? []
    : code === "route_not_found"
      ? [
          {
            rel: "discover",
            href: `${origin}/.well-known/agent.json`,
            method: "GET",
            accept: "application/json"
          }
        ]
      : [
          {
            rel: "retry_with_json",
            href: `${origin}/`,
            method: "GET",
            accept: "application/json"
          }
        ];
  return {
    schema_version: PROBLEM_VERSION,
    type: `${origin}/problems/${code.replaceAll("_", "-")}`,
    title: code === "route_not_found" ? "No resource exists at this path" : "No acceptable representation",
    status,
    code,
    detail: code === "route_not_found"
      ? "Use the discovery manifest to find public resources."
      : "Request one of the media types declared in the manifest.",
    retryable: false,
    terminal,
    next_actions: nextActions,
    docs: ["https://github.com/cambridgetcg/xenia/tree/main/surface/0.1"]
  };
}

function manifest(origin, config = {}) {
  const resources = config.jsonOnly
    ? [
        {
          id: "entry",
          href: `${origin}/`,
          representations: ["application/json"],
          default_media_type: "application/json",
          auth: "none"
        }
      ]
    : [
        {
          id: "entry",
          href: `${origin}/`,
          representations: ["application/json", "text/html"],
          default_media_type: "text/html",
          auth: "none"
        }
      ];
  if (config.distinctPunctuationIds) {
    resources.splice(
      0,
      resources.length,
      { ...resources[0], id: "a.b" },
      { ...resources[0], id: "a_b" }
    );
  }
  const claims = config.badClaim
    ? [
        {
          id: "surface.entry",
          statement: "The entry negotiates JSON.",
          scope: [`GET ${origin}/`],
          evidence_state: "tested",
          outcome: "pass",
          evidence: []
        }
      ]
    : [
        {
          id: "surface.entry",
          statement: "The service declares one public entry resource.",
          scope: [`GET ${origin}/`],
          evidence_state: "asserted",
          outcome: "unknown",
          evidence: []
        }
      ];
  return {
    $schema: "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/manifest.schema.json",
    schema_version: MANIFEST_VERSION,
    profile: "xenia-surface/0.1",
    service: {
      name: "fixture",
      canonical_url: config.wrongCanonical ? "https://different.example/" : `${origin}/`,
      description: "A local XENIA Surface fixture."
    },
    resources,
    problem_schema: "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json",
    claims,
    not_covered: ["identity control", "all unprobed routes"],
    documentation: "https://github.com/cambridgetcg/xenia/tree/main/surface/0.1"
  };
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response, body, headers = {}) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

function sendProblem(response, body, headers = {}, paddingBytes = 0) {
  response.writeHead(body.status, {
    "content-type": "application/problem+json; charset=utf-8",
    ...headers
  });
  response.end(`${JSON.stringify(body)}${" ".repeat(paddingBytes)}`);
}

function sendInvalidUtf8Json(response, status, contentType, headers = {}) {
  response.writeHead(status, { "content-type": contentType, ...headers });
  response.write('{"schema_version":"invalid/1","value":"');
  response.write(Uint8Array.of(0xff));
  response.end('"}');
}

async function fixture(config, callback) {
  let origin;
  const server = createServer((request, response) => {
    const url = new URL(request.url, origin);
    const accept = request.headers.accept || "";
    const vary = config.badVary
      ? { vary: "X-Accept" }
      : { vary: "Accept" };

    if (url.pathname === "/.well-known/agent.json") {
      if (config.socketClose) {
        request.socket.destroy();
        return;
      }
      if (config.missingManifest) {
        sendProblem(response, problem(origin, 404, "route_not_found"), vary);
        return;
      }
      if (config.htmlManifest) {
        sendHtml(response, "<!doctype html><title>not a manifest</title>");
        return;
      }
      if (config.invalidManifestJson) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{");
        return;
      }
      if (config.invalidManifestUtf8) {
        sendInvalidUtf8Json(response, 200, "application/json");
        return;
      }
      if (config.oversizedManifest) {
        response.writeHead(config.oversizedManifestStatus || 200, { "content-type": "application/json" });
        response.end(JSON.stringify({ padding: "x".repeat(70_000) }));
        return;
      }
      if (config.manifestBodyDelayMs) {
        response.writeHead(200, { "content-type": "application/json" });
        response.flushHeaders();
        setTimeout(
          () => response.end(JSON.stringify(manifest(origin, config))),
          config.manifestBodyDelayMs
        );
        return;
      }
      sendJson(
        response,
        200,
        manifest(origin, config),
        config.fakeManifestMedia
          ? { "content-type": "application/vnd.fake+json" }
          : {}
      );
      return;
    }

    if (url.pathname === "/agent.txt" && config.spaAgentTxt) {
      sendHtml(response, "<!doctype html><title>SPA fallback</title>");
      return;
    }

    if (url.pathname === "/") {
      if (accept === "application/x-xenia-unsupported") {
        if (config.unsupportedReturnsHtml) sendHtml(response, "<!doctype html><title>ignored accept</title>", vary);
        else {
          const body = problem(origin, 406, "not_acceptable");
          if (config.wrong406Action) body.next_actions[0].href = `${origin}/wrong`;
          sendProblem(response, body, vary);
        }
        return;
      }
      if (accept === "application/json;q=0, */*;q=1" && config.jsonOnly) {
        sendProblem(response, problem(origin, 406, "not_acceptable"), vary, config.oversized406 ? 70_000 : 0);
        return;
      }
      if (accept === "text/html") {
        if (config.jsonOnly) {
          sendProblem(response, problem(origin, 406, "not_acceptable"), vary, config.oversized406 ? 70_000 : 0);
        }
        else sendHtml(response, "<!doctype html><title>fixture</title>", vary);
        return;
      }
      if (
        accept === "application/json" ||
        accept === "application/*;q=1, text/html;q=0.2" ||
        (accept === "text/html;q=0, application/json;q=1" && !config.badQuality)
      ) {
        const body = config.jsonWithoutVersion ? { name: "fixture" } : { schema_version: "fixture.entry/1", name: "fixture" };
        if (config.invalidResourceUtf8) {
          sendInvalidUtf8Json(response, 200, "application/json", vary);
          return;
        }
        sendJson(
          response,
          200,
          body,
          config.fakeJsonMedia
            ? { ...vary, "content-type": "application/vnd.fake+json" }
            : vary
        );
        return;
      }
      if (accept === "text/html;q=0, application/json;q=1" && config.badQuality) {
        sendHtml(response, "<!doctype html><title>wrong q choice</title>", vary);
        return;
      }
      if (
        accept === "application/json;q=0.2, text/html;q=1" ||
        accept === "application/json;q=0, */*;q=1"
      ) {
        sendHtml(response, "<!doctype html><title>fixture</title>", vary);
        return;
      }
      if (config.jsonOnly) {
        if (config.invalidResourceUtf8) sendInvalidUtf8Json(response, 200, "application/json", vary);
        else sendJson(response, 200, { schema_version: "fixture.entry/1", name: "fixture" }, vary);
      } else {
        sendHtml(response, "<!doctype html><title>fixture</title>", vary);
      }
      return;
    }

    if (config.spa404) {
      sendHtml(response, "<!doctype html><title>SPA fallback</title>", vary);
      return;
    }
    if (config.bare404) {
      sendJson(response, 404, { error: "not found" }, vary);
      return;
    }
    if (config.invalidProblemUtf8) {
      sendInvalidUtf8Json(response, 404, "application/problem+json", vary);
      return;
    }
    const body = problem(origin, 404, "route_not_found", { terminal: config.terminal404 });
    if (config.bothTerminalAndAction) {
      body.terminal = true;
      body.next_actions = [
        {
          rel: "discover",
          href: `${origin}/.well-known/agent.json`,
          method: "GET",
          accept: "application/json"
        }
      ];
    }
    sendProblem(response, body, vary);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(`${origin}/`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function findCheck(result, id) {
  const check = result.checks.find((item) => item.id === id);
  assert.ok(check, `missing check ${id}`);
  return check;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHECKER_PATH, ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("published examples and fixture problems match the JSON Schemas", () => {
  const exampleManifest = JSON.parse(
    readFileSync(new URL("./example-manifest.json", import.meta.url), "utf8")
  );
  assert.equal(
    validateManifestSchema(exampleManifest),
    true,
    JSON.stringify(validateManifestSchema.errors)
  );
  const exampleProblem = problem("https://example.com", 404, "route_not_found");
  assert.equal(
    validateProblemSchema(exampleProblem),
    true,
    JSON.stringify(validateProblemSchema.errors)
  );
});

test("a JSON and HTML resource is conformant", async () => {
  await fixture({}, async (target) => {
    const result = await checkSurface(target, { now: "2026-07-11T10:00:00.000Z" });
    assert.equal(result.result, "conformant");
    assert.equal(result.verifier.version, "0.1.0-rc.1");
    assert.deepEqual(result.counts, { pass: result.checks.length, fail: 0, unknown: 0, not_run: 0 });
    assert.equal(result.expires_at, "2026-07-12T10:00:00.000Z");
    assert.ok(result.claims.every((claim) => claim.evidence_state === "tested"));
    assert.ok(result.claims.every((claim) => claim.outcome === "pass"));
    assert.equal(result.declared_claims[0].evidence_state, "asserted");
    assert.ok(
      result.checks.every(
        (check) => check.observation.request.user_agent === "xenia-surface-check/0.1.0-rc.1"
      )
    );
    const probedUrl = findCheck(result, "E.SCHEMA").observation.request.url;
    assert.equal(new URL(probedUrl).origin, new URL(target).origin);
    assert.notEqual(new URL(probedUrl).pathname, "/");
    assert.doesNotMatch(probedUrl, /xenia/i);
    assert.deepEqual(
      result.claims.find((claim) => claim.id === "surface.route_not_found").scope,
      [probedUrl]
    );
  });
});

test("a JSON-only resource is conformant and rejects a q=0 JSON range", async () => {
  await fixture({ jsonOnly: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "conformant");
    assert.equal(findCheck(result, "R.ENTRY.HTML").outcome, "pass");
    assert.equal(findCheck(result, "R.ENTRY.ZERO_JSON").outcome, "pass");
  });
});

test("a terminal route-not-found problem fails because discovery is available", async () => {
  await fixture({ terminal404: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "E.SCHEMA").outcome, "fail");
  });
});

test("naive quality selection is a definite failure", async () => {
  await fixture({ badQuality: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "R.ENTRY.QUALITY_JSON").outcome, "fail");
  });
});

test("Vary: X-Accept does not satisfy Vary: Accept", async () => {
  await fixture({ badVary: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "R.ENTRY.JSON_VARY").outcome, "fail");
    assert.equal(findCheck(result, "E.VARY").outcome, "fail");
  });
});

test("a JSON response without schema_version fails", async () => {
  await fixture({ jsonWithoutVersion: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "R.ENTRY.JSON").outcome, "fail");
  });
});

test("a declared application/json resource cannot return an arbitrary +json type", async () => {
  await fixture({ fakeJsonMedia: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "R.ENTRY.JSON").outcome, "fail");
  });
});

test("an unsupported-only Accept value must return 406", async () => {
  await fixture({ unsupportedReturnsHtml: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "R.ENTRY.UNSUPPORTED").outcome, "fail");
  });
});

test("a 406 recovery action must point to the same resource", async () => {
  await fixture({ wrong406Action: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.match(findCheck(result, "R.ENTRY.UNSUPPORTED").observed, /retry action/);
  });
});

test("an SPA 200 and a bare JSON 404 both fail the problem contract", async (t) => {
  await t.test("SPA fallback", async () => {
    await fixture({ spa404: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "nonconformant");
      assert.equal(findCheck(result, "E.STATUS").outcome, "fail");
    });
  });
  await t.test("bare error", async () => {
    await fixture({ bare404: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "nonconformant");
      assert.equal(findCheck(result, "E.SCHEMA").outcome, "fail");
    });
  });
});

test("terminal true and a next action are mutually exclusive", async () => {
  await fixture({ bothTerminalAndAction: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "E.SCHEMA").outcome, "fail");
  });
});

test("tested manifest claims require evidence", async () => {
  await fixture({ badClaim: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "M.SCHEMA").outcome, "fail");
    assert.equal(findCheck(result, "R.NOT_RUN").outcome, "not_run");
    assert.deepEqual(result.claims.map((claim) => claim.id), ["surface.discovery"]);
    assert.deepEqual(result.declared_claims, []);
  });
});

test("valid resource IDs remain distinct in report test IDs", async () => {
  await fixture({ distinctPunctuationIds: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "conformant");
    assert.equal(findCheck(result, "R.A.B.JSON").outcome, "pass");
    assert.equal(findCheck(result, "R.A_B.JSON").outcome, "pass");
  });
});

test("the manifest canonical origin must match the target", async () => {
  await fixture({ wrongCanonical: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.match(findCheck(result, "M.SCHEMA").observed, /origin must match/);
  });
});

test("the canonical manifest must return exactly application/json", async () => {
  await fixture({ fakeManifestMedia: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "M.CONTENT_TYPE").outcome, "fail");
  });
});

test("agent.txt cannot substitute for the canonical JSON manifest", async () => {
  await fixture({ missingManifest: true, spaAgentTxt: true }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "nonconformant");
    assert.equal(findCheck(result, "M.STATUS").outcome, "fail");
  });
});

test("transport and body-limit failures are indeterminate", async (t) => {
  await t.test("socket close", async () => {
    await fixture({ socketClose: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "indeterminate");
      assert.equal(findCheck(result, "M.STATUS").outcome, "unknown");
    });
  });
  await t.test("oversized manifest", async () => {
    await fixture({ oversizedManifest: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "indeterminate");
      assert.equal(findCheck(result, "M.STATUS").outcome, "pass");
      assert.equal(findCheck(result, "M.JSON").outcome, "unknown");
    });
  });
  await t.test("known bad status survives an oversized body", async () => {
    await fixture({ oversizedManifest: true, oversizedManifestStatus: 500 }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "nonconformant");
      assert.equal(findCheck(result, "M.STATUS").outcome, "fail");
      assert.equal(findCheck(result, "M.JSON").outcome, "unknown");
    });
  });
  await t.test("representation 406 problems use the metadata body limit", async () => {
    await fixture({ jsonOnly: true, oversized406: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "indeterminate");
      assert.equal(findCheck(result, "R.ENTRY.HTML").outcome, "unknown");
      assert.match(findCheck(result, "R.ENTRY.HTML").observation.error, /exceeds 65536 bytes/);
    });
  });
});

test("invalid UTF-8 JSON and problem bodies are definite failures", async (t) => {
  await t.test("manifest", async () => {
    await fixture({ invalidManifestUtf8: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "nonconformant");
      assert.equal(findCheck(result, "M.JSON").outcome, "fail");
    });
  });
  await t.test("resource", async () => {
    await fixture({ invalidResourceUtf8: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "nonconformant");
      assert.equal(findCheck(result, "R.ENTRY.JSON").outcome, "fail");
    });
  });
  await t.test("problem", async () => {
    await fixture({ invalidProblemUtf8: true }, async (target) => {
      const result = await checkSurface(target);
      assert.equal(result.result, "nonconformant");
      assert.equal(findCheck(result, "E.SCHEMA").outcome, "fail");
    });
  });
});

test("total-timeout observations report the effective configured limit", async () => {
  let calls = 0;
  const origin = "https://example.com";
  const result = await checkSurface(`${origin}/`, {
    timeoutMs: 500,
    totalTimeoutMs: 100,
    fetchImpl: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 130));
      return new Response(JSON.stringify(manifest(origin)), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.result, "indeterminate");
  assert.equal(findCheck(result, "R.ENTRY.JSON").observation.error, "total timeout after 100ms");
});

test("response duration includes body transfer time", async () => {
  await fixture({ manifestBodyDelayMs: 60 }, async (target) => {
    const result = await checkSurface(target);
    assert.equal(result.result, "conformant");
    assert.ok(findCheck(result, "M.STATUS").observation.response.duration_ms >= 40);
  });
});

test("validators reject an attestation without binding evidence", () => {
  const target = "https://example.com/";
  const value = manifest("https://example.com");
  value.claims[0].evidence_state = "attested";
  value.claims[0].outcome = "pass";
  value.claims[0].evidence = [
    { kind: "source", uri: "https://example.com/source" }
  ];
  assert.match(validateManifest(value, target).join("; "), /signature or receipt/);

  const invalidProblem = problem("https://example.com", 404, "route_not_found");
  invalidProblem.terminal = true;
  assert.match(validateProblem(invalidProblem, 404).join("; "), /must not offer next actions/);

  const duplicateDiscover = problem("https://example.com", 404, "route_not_found");
  duplicateDiscover.next_actions.push({
    rel: "discover",
    href: "https://example.com/other",
    method: "GET",
    accept: "application/json"
  });
  assert.match(
    validateProblem(duplicateDiscover, 404, {
      manifestUrl: "https://example.com/.well-known/agent.json"
    }).join("; "),
    /exactly one discover action/
  );

  const wrongRetry = problem("https://example.com", 406, "not_acceptable");
  wrongRetry.next_actions[0].href = "https://example.com/wrong";
  assert.match(
    validateProblem(wrongRetry, 406, {
      resource: {
        href: "https://example.com/",
        representations: ["application/json"]
      }
    }).join("; "),
    /retry action/
  );

  const twoValidRetries = problem("https://example.com", 406, "not_acceptable");
  twoValidRetries.next_actions.push({
    rel: "retry_with_html",
    href: "https://example.com/",
    method: "GET",
    accept: "text/html"
  });
  assert.doesNotMatch(
    validateProblem(twoValidRetries, 406, {
      resource: {
        href: "https://example.com/",
        representations: ["application/json", "text/html"]
      }
    }).join("; "),
    /retry action/
  );
});

test("hand validators enforce published length, time, and uniqueness bounds", () => {
  const target = "https://example.com/";
  const value = manifest("https://example.com");
  value.service.name = "x".repeat(121);
  value.not_covered = ["x".repeat(301)];
  value.claims[0] = {
    ...value.claims[0],
    evidence_state: "tested",
    outcome: "pass",
    evidence: [
      {
        kind: "probe",
        uri: "https://example.com/evidence",
        observed_at: "not-a-date",
        expires_at: "also-not-a-date",
        digest: "sha256:not-a-digest",
        verifier: "not-a-url"
      }
    ]
  };
  const manifestErrors = validateManifest(value, target).join("; ");
  assert.match(manifestErrors, /1 to 120/);
  assert.match(manifestErrors, /at least one explicit boundary/);
  assert.match(manifestErrors, /observed_at must be a date-time/);
  assert.match(manifestErrors, /digest must be/);
  assert.match(manifestErrors, /verifier must use/);

  const invalidProblem = problem("https://example.com", 404, "route_not_found");
  invalidProblem.title = "x".repeat(201);
  invalidProblem.detail = "x".repeat(2001);
  invalidProblem.docs.push(invalidProblem.docs[0]);
  invalidProblem.next_actions[0].description = "x".repeat(501);
  const problemErrors = validateProblem(invalidProblem, 404).join("; ");
  assert.match(problemErrors, /title must be/);
  assert.match(problemErrors, /detail must be/);
  assert.match(problemErrors, /docs must contain/);
  assert.match(problemErrors, /description must be/);
});

test("hand date-time validation matches the published schema at calendar edges", () => {
  const target = "https://example.com/";
  const invalidValues = [
    "2026",
    "2026-02-30T10:00:00Z",
    "2026-07-11T25:00:00Z",
    "2026-07-11T10:00:00+02:00",
    "2026-01-01T24:59:00+01:00"
  ];
  const validValues = ["2024-02-29T10:00:00Z", "2026-12-31T23:59:60Z"];

  for (const observedAt of [...invalidValues, ...validValues]) {
    const value = manifest("https://example.com");
    value.claims[0] = {
      ...value.claims[0],
      evidence_state: "tested",
      outcome: "pass",
      evidence: [
        {
          kind: "probe",
          uri: "https://example.com/evidence",
          observed_at: observedAt,
          expires_at: "2027-01-01T00:00:00Z",
          digest: `sha256:${"a".repeat(64)}`,
          verifier: "https://example.com/verifier"
        }
      ]
    };

    assert.equal(
      validateManifest(value, target).some((error) => error.includes("observed_at must be a date-time")),
      !validateManifestSchema(value),
      observedAt
    );
  }
});

test("evidence expiry ordering handles leap seconds and precise fractions", () => {
  const target = "https://example.com/";
  const withTimes = (observedAt, expiresAt) => {
    const value = manifest("https://example.com");
    value.claims[0] = {
      ...value.claims[0],
      evidence_state: "tested",
      outcome: "pass",
      evidence: [
        {
          kind: "probe",
          uri: "https://example.com/evidence",
          observed_at: observedAt,
          expires_at: expiresAt,
          digest: `sha256:${"a".repeat(64)}`,
          verifier: "https://example.com/verifier"
        }
      ]
    };
    return validateManifest(value, target);
  };

  assert.match(
    withTimes("2026-12-31T23:59:60Z", "2020-01-01T00:00:00Z").join("; "),
    /expires_at must be after/
  );
  assert.doesNotMatch(
    withTimes("2026-12-31T23:59:60.5Z", "2027-01-01T00:00:00Z").join("; "),
    /expires_at must be after/
  );
  assert.doesNotMatch(
    withTimes("2026-07-11T10:00:00.0001Z", "2026-07-11T10:00:00.0002Z").join("; "),
    /expires_at must be after/
  );
});

test("Unicode length limits count code points like JSON Schema", () => {
  const value = manifest("https://example.com");
  value.service.name = "😀".repeat(100);
  value.claims[0].scope = ["😀".repeat(250)];
  value.not_covered = ["😀".repeat(250)];
  assert.equal(validateManifestSchema(value), true, JSON.stringify(validateManifestSchema.errors));
  assert.deepEqual(validateManifest(value, "https://example.com/"), []);
});

test("hand validators reject schema-invalid URL and optional evidence fields", () => {
  const target = "https://example.com/";
  const value = manifest("https://example.com");
  value.resources[0].id = true;
  value.claims[0] = {
    ...value.claims[0],
    id: ["surface.entry"],
    evidence_state: "tested",
    outcome: "pass",
    evidence: [
      {
        kind: "probe",
        uri: "HTTPS://example.com/evidence",
        observed_at: "2026-07-11T10:00:00Z",
        expires_at: "2026-07-12T10:00:00Z",
        digest: [`sha256:${"a".repeat(64)}`],
        verifier: "https:example.com/verifier",
        algorithm: "bogus",
        key_id: "bogus",
        signature: [`${"A".repeat(86)}==`],
        issuer: "bogus"
      }
    ]
  };

  assert.equal(validateManifestSchema(value), false);
  const errors = validateManifest(value, target).join("; ");
  assert.match(errors, /resources\[0\]\.id/);
  assert.match(errors, /claims\[0\]\.id/);
  assert.match(errors, /uri must use HTTPS/);
  assert.match(errors, /verifier must use HTTPS/);
  assert.match(errors, /algorithm is not defined/);
  assert.match(errors, /key_id must use HTTPS/);
  assert.match(errors, /signature must be/);
  assert.match(errors, /issuer must use HTTPS/);

  const invalidProblem = problem("https://example.com", 404, "route_not_found");
  invalidProblem.type = "https:example.com/problems/route-not-found";
  invalidProblem.code = true;
  invalidProblem.next_actions[0].rel = ["discover"];
  assert.equal(validateProblemSchema(invalidProblem), false);
  const problemErrors = validateProblem(invalidProblem, 404).join("; ");
  assert.match(problemErrors, /type must use HTTPS/);
  assert.match(problemErrors, /code must be/);
  assert.match(problemErrors, /rel must be/);
});

test("URL validation rejects every schema-invalid normalization edge", () => {
  const invalidUrls = [
    "https://user:pass@example.com/docs",
    "http://127.999.999.999/docs",
    "http://localhost:8080?q=1",
    "https://example.com/a b",
    "https://example.com/[",
    "https://example.com/#a#b"
  ];
  for (const url of invalidUrls) {
    const value = manifest("https://example.com");
    value.documentation = url;
    assert.equal(validateManifestSchema(value), false, url);
    assert.notDeepEqual(validateManifest(value, "https://example.com/"), [], url);
  }

  const valid = manifest("https://example.com");
  valid.documentation = "http://[::1]:8080/docs";
  assert.equal(validateManifestSchema(valid), true, JSON.stringify(validateManifestSchema.errors));
  assert.deepEqual(validateManifest(valid, "https://example.com/"), []);
});

test("manifest schema encodes static representation invariants", () => {
  const textOnly = manifest("https://example.com");
  textOnly.resources[0].representations = ["text/html"];
  textOnly.resources[0].default_media_type = "text/html";
  assert.equal(validateManifestSchema(textOnly), false);

  const undeclaredDefault = manifest("https://example.com");
  undeclaredDefault.resources[0].representations = ["application/json"];
  undeclaredDefault.resources[0].default_media_type = "text/html";
  assert.equal(validateManifestSchema(undeclaredDefault), false);

  const queryHref = manifest("https://example.com");
  queryHref.resources[0].href = "https://example.com/?format=json";
  assert.equal(validateManifestSchema(queryHref), false);
  assert.match(validateManifest(queryHref, "https://example.com/").join("; "), /query or fragment/);
});

test("validators report invalid collection shapes without throwing", () => {
  const target = "https://example.com/";
  const value = manifest("https://example.com");
  value.resources[0].representations = 42;
  assert.match(validateManifest(value, target).join("; "), /representations/);

  const invalidProblem = problem("https://example.com", 404, "route_not_found");
  invalidProblem.next_actions = 42;
  assert.match(
    validateProblem(invalidProblem, 404, {
      manifestUrl: "https://example.com/.well-known/agent.json",
      resource: { href: "https://example.com/", representations: ["application/json"] }
    }).join("; "),
    /next_actions must be an array/
  );
});

test("CLI JSON output is one parseable result document", async () => {
  await fixture({}, async (target) => {
    const run = await runCli(["--json", target]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).result, "conformant");
    assert.equal(run.stderr, "");
  });
});

test("CLI misuse exits 2", async () => {
  const run = await runCli(["not-a-url", "--json"]);
  assert.equal(run.code, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /target must be/);
});

test("public plaintext HTTP targets are rejected", async () => {
  await assert.rejects(
    () => checkSurface("http://example.com/"),
    /must use HTTPS/
  );
  await assert.rejects(
    () => checkSurface("http://127.example.com/"),
    /must use HTTPS/
  );

  const result = await checkSurface("http://[::1]/", {
    fetchImpl: async () => {
      throw new TypeError("fixture offline");
    }
  });
  assert.equal(result.result, "indeterminate");
  assert.equal(result.target, "http://[::1]/");
});
