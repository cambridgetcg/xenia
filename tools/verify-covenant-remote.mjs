#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { canonicalRelease } from "../covenant/0.1/validate-adoption.mjs";

export const REMOTE_SOURCE_MAX_BYTES = 2_000_000;
export const REMOTE_SOURCE_TIMEOUT_MS = 15_000;

function sha256(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

async function readBoundedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`remote Covenant source declares more than ${maxBytes} response bytes`);
  }
  if (response.body === null) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        throw new Error(`remote Covenant source exceeds ${maxBytes} decoded bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, length);
}

/**
 * Fetches the three release-tag-pinned HTTP sources without redirects and
 * compares their decoded response bytes with the installed canonical digests.
 * This observes current publication; it does not prove future tag immutability.
 */
export async function verifyCovenantRemote(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? REMOTE_SOURCE_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? REMOTE_SOURCE_TIMEOUT_MS;
  const observedAt = options.observedAt ?? new Date().toISOString();
  const sourceResults = [];
  const httpObservations = [];

  for (const expected of canonicalRelease.sources) {
    const response = await fetchImpl(expected.source, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: "application/json",
        "user-agent": "xenia-covenant-remote-check/0.1-development",
      },
    });
    assert.equal(response.status, 200, `expected HTTP 200 for ${expected.source}`);
    assert.equal(response.redirected, false, `redirect observed for ${expected.source}`);
    assert.equal(response.url, expected.source, `effective URL changed for ${expected.source}`);

    const bytes = await readBoundedBody(response, maxBytes);
    const actualDigest = sha256(bytes);
    assert.equal(actualDigest, expected.sha256, `digest mismatch for ${expected.source}`);

    sourceResults.push({ ...expected, outcome: "pass" });
    httpObservations.push({
      source: expected.source,
      status: response.status,
      effective_url: response.url,
      redirected: response.redirected,
      content_encoding: response.headers.get("content-encoding") ?? "identity",
      decoded_bytes: bytes.length,
    });
  }

  return {
    schema_version: "xenia.covenant.remote-source-observation/0.1-development",
    status: "observation",
    tag: canonicalRelease.tag,
    observed_at: observedAt,
    verifier: {
      name: "xenia-covenant-remote-check",
      version: "0.1-development",
      method: "Fetch exact release-tag URLs with redirect:error and hash bounded decoded response bytes with SHA-256.",
    },
    source_results: sourceResults,
    http_observations: httpObservations,
    limitations: [
      "This observation does not prove representative authority, implementation, future availability, or that a privileged actor cannot later move or delete the tag.",
      "This source-retrieval observation does not resolve the remote Git tag object or prove that an annotated tag currently peels to a named commit; preserve separate git_tag_resolution evidence.",
      "Standard output is not authenticated, self-digested, or durably preserved by this command; a release operator must preserve and hash the observation separately.",
    ],
  };
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.stdout.write(JSON.stringify(await verifyCovenantRemote()) + "\n");
  } catch (error) {
    process.stderr.write(
      `Covenant remote sources are not verified: ${String(error?.message || error)}\n`,
    );
    process.exitCode = 1;
  }
}
