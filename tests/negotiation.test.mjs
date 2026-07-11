// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeVary,
  negotiateVisibleDoorRepresentation,
} from "../dist/index.js";

test("defaults to HTML and honors an explicit query representation", () => {
  assert.equal(negotiateVisibleDoorRepresentation(), "html");
  assert.equal(
    negotiateVisibleDoorRepresentation({ accept: "text/html", format: "json" }),
    "json",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({ accept: "application/json", format: "html" }),
    "html",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({ format: "yaml" }),
    "not-acceptable",
  );
});

test("handles q-values, wildcards, vendor JSON, and explicit q=0", () => {
  assert.equal(
    negotiateVisibleDoorRepresentation({ accept: "application/vnd.agent+json" }),
    "json",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({
      accept: "application/*+json;q=1, application/json;q=0",
    }),
    "not-acceptable",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({
      accept: "application/json;q=0.4, text/html;q=0.9",
    }),
    "html",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({
      accept: "application/json;q=0, */*;q=1",
    }),
    "html",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({ accept: "image/png" }),
    "not-acceptable",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({ accept: "text/html/evil" }),
    "not-acceptable",
  );
  assert.equal(
    negotiateVisibleDoorRepresentation({ accept: "*/*" }),
    "html",
  );
});

test("merges Vary values case-insensitively", () => {
  assert.equal(mergeVary("Accept-Encoding", "Accept"), "Accept-Encoding, Accept");
  assert.equal(mergeVary("accept", "Accept"), "accept");
  assert.equal(mergeVary("*", "Accept"), "*");
  assert.equal(mergeVary("Accept", "*"), "*");
  assert.equal(mergeVary("Accept", "Origin, Accept-Encoding"), "Accept, Origin, Accept-Encoding");
  assert.throws(() => mergeVary("Accept", "Origin\r\nInjected"), /invalid Vary/);
});
