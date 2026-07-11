import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDoorObservation } from "../dist/index.js";

function response(status, contentType, body, vary = "") {
  return { kind: "response", status, contentType, body, vary };
}

function observation(overrides = {}) {
  return {
    target: "https://house.example",
    rootHtml: response(200, "text/html; charset=utf-8", "<html>human door</html>", "Accept"),
    rootJson: response(200, "application/json", '{"name":"house"}', "Accept"),
    agentTxt: response(
      200,
      "text/plain; charset=utf-8",
      [
        "name: house",
        "agent-door: https://house.example/?format=json",
        "consent: invitation",
        "verify: did:key + signature",
      ].join("\n"),
    ),
    wellKnownAgentTxt: response(
      200,
      "text/agent",
      "name: house\nwake: https://house.example/v1/wake\nconsent: invitation\nverify: signature\n",
    ),
    missingHtml: response(
      404,
      "text/html",
      '<a href="/agent.txt">discover</a><a href="/docs">docs</a>',
    ),
    missingJson: response(
      404,
      "application/json",
      '{"error":"no door","next_actions":[{"action":"discover"}]}',
    ),
    ...overrides,
  };
}

test("lights three visible-door lamps but never promotes to Threshold", () => {
  const report = evaluateDoorObservation(observation());

  assert.equal(report.observedDoorLevel, "lamp");
  assert.equal(report.lampsLit, 3);
  assert.equal(report.lamps.discovery.state, "pass");
  assert.equal(report.observedSignals.consentDocumented, "present");
  assert.equal(report.observedSignals.verificationDocumented, "present");
  assert.equal(report.observedSignals.wellKnownManifestPresent, "present");
  assert.ok(report.limits.some((limit) => limit.includes("full XENIA")));
  assert.equal("level" in report, false);
  assert.equal("thresholdSignals" in report, false);
});

test("rejects an SPA fallback masquerading as agent.txt", () => {
  const fallback = "<html>same catch-all</html>";
  const report = evaluateDoorObservation(observation({
    agentTxt: response(200, "text/html", fallback),
    wellKnownAgentTxt: response(200, "text/html", fallback),
    missingHtml: response(200, "text/html", fallback),
    missingJson: response(200, "text/html", fallback),
  }));

  assert.equal(report.lamps.discovery.state, "fail");
  assert.equal(report.lamps.dignity.state, "fail");
  assert.equal(report.observedDoorLevel, "partial");
});

test("labels a well-known-only document as present, not mirrored", () => {
  const report = evaluateDoorObservation(observation({
    agentTxt: response(404, "text/plain", "missing"),
  }));

  assert.equal(report.lamps.discovery.state, "pass");
  assert.equal(report.observedSignals.wellKnownManifestPresent, "present");
  assert.equal("wellKnownMirror" in report.observedSignals, false);
});

test("requires structured JSON, an honest media type, and Vary: Accept", () => {
  for (const rootJson of [
    response(200, "text/html", '{"name":"house"}', "Accept"),
    response(200, "application/json", "42", "Accept"),
    response(200, "application/json", '{"name":"house"}'),
  ]) {
    const report = evaluateDoorObservation(observation({ rootJson }));
    assert.equal(report.lamps.legibility.state, "fail");
    assert.equal(report.observedDoorLevel, "partial");
  }
});

test("lets a known legibility failure dominate an unavailable counterpart", () => {
  const report = evaluateDoorObservation(observation({
    rootHtml: { kind: "unavailable" },
    rootJson: response(200, "text/html", '{"name":"house"}', "Accept"),
  }));

  assert.equal(report.lamps.legibility.state, "fail");
});

test("does not mistake redirects or partial MIME matches for a manifest", () => {
  const fake = response(302, "application/text/plain-evil", "foo: bar");
  const report = evaluateDoorObservation(observation({
    agentTxt: fake,
    wellKnownAgentTxt: fake,
  }));

  assert.equal(report.lamps.discovery.state, "fail");
  assert.equal(report.observedSignals.consentDocumented, "unknown");
});

test("requires a usable door or capability reference in a manifest", () => {
  for (const body of [
    "name: house\nschema_version: nonsense",
    "name: house\nwalls: decorative prose",
  ]) {
    const candidate = response(200, "text/plain", body);
    const report = evaluateDoorObservation(observation({
      agentTxt: candidate,
      wellKnownAgentTxt: candidate,
    }));
    assert.equal(report.lamps.discovery.state, "fail");
  }
});

test("does not infer verification from incidental or negated prose", () => {
  const manifest = response(
    200,
    "text/plain",
    "name: house\nagent-door: /?format=json\nwhat: no signatures supported",
  );
  const report = evaluateDoorObservation(observation({
    agentTxt: manifest,
    wellKnownAgentTxt: manifest,
  }));

  assert.equal(report.observedSignals.verificationDocumented, "absent");
});

test("aggregates documentation observed across both manifest locations", () => {
  const primary = response(
    200,
    "text/plain",
    "name: house\nagent-door: /?format=json",
  );
  const wellKnown = response(
    200,
    "text/plain",
    "name: house\nwake: /v1/wake\nverify: signed challenge",
  );
  const report = evaluateDoorObservation(observation({
    agentTxt: primary,
    wellKnownAgentTxt: wellKnown,
  }));

  assert.equal(report.observedSignals.verificationDocumented, "present");
});

test("requires actionable wrong-door links in both representations", () => {
  for (const body of [
    "<p>No docs available</p>",
    '<a href="/privacy">privacy</a><a href="/ads">advertising</a>',
  ]) {
    const report = evaluateDoorObservation(observation({
      missingHtml: response(404, "text/html", body),
    }));
    assert.equal(report.lamps.dignity.state, "fail");
  }

  const report = evaluateDoorObservation(observation({
    missingJson: { kind: "unavailable" },
  }));
  assert.equal(report.lamps.dignity.state, "unknown");
  assert.equal(report.observedDoorLevel, "partial");

  const docsReport = evaluateDoorObservation(observation({
    missingHtml: response(404, "text/html", '<a href="/docs">read the docs</a>'),
  }));
  assert.equal(docsReport.lamps.dignity.state, "pass");
});

test("rejects empty or non-actionable JSON recovery placeholders", () => {
  for (const body of [
    '{"next_actions":[null]}',
    '{"but_you_can":{"nothing":"no"}}',
    '{"next_actions":[{"method":"POST"}]}',
  ]) {
    const report = evaluateDoorObservation(observation({
      missingJson: response(404, "application/json", body),
    }));
    assert.equal(report.lamps.dignity.state, "fail");
  }
});

test("bounds deeply nested recovery JSON without throwing", () => {
  const body = '{"wrapper":'.repeat(4_000)
    + '{"action":"discover"}'
    + "}".repeat(4_000);
  let report;

  assert.doesNotThrow(() => {
    report = evaluateDoorObservation(observation({
      missingJson: response(404, "application/json", body),
    }));
  });
  assert.equal(report.lamps.dignity.state, "fail");
});

test("keeps unavailable evidence unknown instead of calling it failure", () => {
  const report = evaluateDoorObservation(observation({
    agentTxt: { kind: "unavailable" },
    wellKnownAgentTxt: response(404, "text/plain", "missing"),
    rootHtml: { kind: "not-observed" },
    rootJson: { kind: "unavailable" },
    missingHtml: { kind: "unavailable" },
    missingJson: { kind: "not-observed" },
  }));

  assert.equal(report.lamps.discovery.state, "unknown");
  assert.equal(report.lamps.legibility.state, "unknown");
  assert.equal(report.lamps.dignity.state, "unknown");
  assert.equal(report.observedDoorLevel, "indeterminate");
  assert.equal(report.observedSignals.wellKnownManifestPresent, "absent");
});

test("treats malformed runtime status samples as unknown", () => {
  const malformed = {
    kind: "response",
    status: 200.5,
    contentType: "text/plain",
    body: "name: house\nwake: /wake",
  };
  const report = evaluateDoorObservation(observation({
    agentTxt: malformed,
    wellKnownAgentTxt: malformed,
  }));

  assert.equal(report.lamps.discovery.state, "unknown");
});

test("sanitizes the report target and never returns raw bodies or errors", () => {
  const privateMarker = "value-that-must-not-leak";
  const report = evaluateDoorObservation(observation({
    target: "https://user:password@house.example/private?token=" + privateMarker + "#secret",
    rootHtml: { kind: "unavailable", error: privateMarker },
    rootJson: { kind: "unavailable", error: privateMarker },
    agentTxt: response(404, "text/plain", privateMarker),
    wellKnownAgentTxt: response(404, "text/plain", privateMarker),
    missingHtml: response(404, "text/html", privateMarker),
    missingJson: response(404, "application/json", '{"error":"no"}'),
  }));

  assert.equal(report.target, "https://house.example");
  assert.equal(report.observedDoorLevel, "indeterminate");
  assert.equal(JSON.stringify(report).includes(privateMarker), false);
  assert.equal(JSON.stringify(report).includes("password"), false);
});
