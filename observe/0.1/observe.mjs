#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { checkSurface } from "@agenttool/xenia-surface";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  canonicalAdoptionSchema,
  validateCovenantAdoption,
} from "../../covenant/0.1/validate-adoption.mjs";

export const OBSERVE_RESULT_VERSION = "xenia.observe.result/0.1-development";
export const OBSERVE_TOOL_VERSION = "0.1.0-dev";
export const ADOPTION_MAX_BYTES = 2_000_000;

const directory = new URL("./", import.meta.url);
const surfaceDirectory = new URL("../../surface/0.1/", directory);
const observeSchema = JSON.parse(await readFile(new URL("result.schema.json", directory), "utf8"));
const surfaceResultSchema = JSON.parse(await readFile(new URL("result.schema.json", surfaceDirectory), "utf8"));
const surfaceManifestSchema = JSON.parse(await readFile(new URL("manifest.schema.json", surfaceDirectory), "utf8"));

function validator(schema, dependencies = []) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const dependency of dependencies) ajv.addSchema(dependency);
  return ajv.compile(schema);
}

const validateSurfaceResult = validator(surfaceResultSchema, [surfaceManifestSchema]);
const validateAdoptionSchema = validator(canonicalAdoptionSchema);
const validateObserveIndex = validator(observeSchema);

function digest(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function issuesFromAjv(errors) {
  return (errors ?? []).slice(0, 256).map((error) => ({
    code: error.keyword || "schema",
    path: error.instancePath || "$",
    message: error.message || "Schema validation failed.",
  }));
}

function validation(valid, issues = []) {
  return { valid, issues: issues.slice(0, 256) };
}

function targetRelation(adoption, target) {
  try {
    const host = new URL(adoption?.host?.canonical_url);
    const observed = new URL(target);
    return host.origin === observed.origin ? "same_origin" : "different_origin";
  } catch {
    return "unknown";
  }
}

export function inspectCovenantAdoption(bytes, target) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      schemaValidation: validation(false, [{
        code: "utf8_decode",
        path: "$",
        message: "The supplied adoption is not valid UTF-8.",
      }]),
      crossDocumentValidation: validation(false, [{
        code: "not_run",
        path: "$",
        message: "Cross-document validation did not run because UTF-8 decoding failed.",
      }]),
      targetRelation: "unknown",
    };
  }
  let adoption;
  try {
    adoption = JSON.parse(text);
  } catch {
    return {
      schemaValidation: validation(false, [{
        code: "json_parse",
        path: "$",
        message: "The supplied adoption is not a readable JSON document.",
      }]),
      crossDocumentValidation: validation(false, [{
        code: "not_run",
        path: "$",
        message: "Cross-document validation did not run because JSON parsing failed.",
      }]),
      targetRelation: "unknown",
    };
  }

  const schemaValid = validateAdoptionSchema(adoption);
  const semantic = validateCovenantAdoption(adoption);
  return {
    schemaValidation: validation(schemaValid, issuesFromAjv(validateAdoptionSchema.errors)),
    crossDocumentValidation: validation(semantic.valid, semantic.issues),
    targetRelation: targetRelation(adoption, target),
  };
}

function artifact(path, bytes) {
  return { path, sha256: digest(bytes) };
}

function buildIndex(surfaceResult, surfaceBytes, adoptionBytes, adoptionInspection) {
  const supplied = adoptionBytes !== undefined && adoptionInspection !== undefined;
  return {
    schema_version: OBSERVE_RESULT_VERSION,
    status: "development-draft",
    tool: { name: "xenia-observe", version: OBSERVE_TOOL_VERSION },
    target: surfaceResult.target,
    surface: {
      artifact: artifact("surface-result.json", surfaceBytes),
      schema_valid: true,
      profile: surfaceResult.profile,
      outcome: surfaceResult.result,
      observed_at: surfaceResult.observed_at,
      expires_at: surfaceResult.expires_at,
    },
    covenant_adoption: supplied
      ? {
          state: "supplied",
          artifact: artifact("adoption.json", adoptionBytes),
          schema_validation: adoptionInspection.schemaValidation,
          cross_document_validation: adoptionInspection.crossDocumentValidation,
          target_relation: adoptionInspection.targetRelation,
        }
      : { state: "not_supplied" },
    interpretation: {
      surface_scope_only: true,
      covenant_record_consistency_checked: supplied,
      covenant_implementation_assessed: false,
      surface_evidence_mapped_to_covenant_duties: false,
      whole_xenia_conformance_claimed: false,
    },
  };
}

async function requireAbsent(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`output directory already exists: ${path}`);
}

async function preflightOutput(outputDirectory) {
  const output = resolve(outputDirectory);
  const parent = dirname(output);
  const parentState = await stat(parent).catch(() => null);
  if (!parentState?.isDirectory()) {
    throw new Error(`output parent is not an existing directory: ${parent}`);
  }
  await requireAbsent(output);

  const parentReal = await realpath(parent);
  const outputRealParent = resolve(parentReal, basename(output));
  await requireAbsent(outputRealParent);
  return { parentReal, output: outputRealParent };
}

async function readBoundedRegularFile(path, maxBytes) {
  const handle = await open(path, "r").catch(() => null);
  if (handle === null) throw new Error("adoption input is not a readable regular file");
  try {
    const state = await handle.stat();
    if (!state.isFile()) throw new Error("adoption input is not a readable regular file");
    if (state.size > maxBytes) throw new Error(`adoption input exceeds ${maxBytes} bytes`);

    const bytes = Buffer.allocUnsafe(maxBytes + 1);
    let length = 0;
    while (length <= maxBytes) {
      const { bytesRead } = await handle.read(bytes, length, maxBytes + 1 - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw new Error(`adoption input exceeds ${maxBytes} bytes`);
    return Buffer.from(bytes.subarray(0, length));
  } finally {
    await handle.close();
  }
}

async function writeBundle(location, surfaceBytes, adoptionBytes, indexBytes) {
  const { parentReal, output } = location;
  await requireAbsent(output);
  const temporary = await mkdtemp(join(parentReal, `.${basename(output)}.tmp-`));
  await chmod(temporary, 0o700);
  try {
    await writeFile(join(temporary, "surface-result.json"), surfaceBytes, { mode: 0o600 });
    if (adoptionBytes !== undefined) {
      await writeFile(join(temporary, "adoption.json"), adoptionBytes, { mode: 0o600 });
    }
    await writeFile(join(temporary, "observe-result.json"), indexBytes, { mode: 0o600 });
    await requireAbsent(output);
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return output;
}

/**
 * Records observations without converting a Surface result into Covenant duty
 * evidence. The injected checker exists for deterministic local tests; normal
 * callers use the release-pinned Surface checker.
 */
export async function recordObservation(input, dependencies = {}) {
  const checkSurfaceImpl = dependencies.checkSurfaceImpl ?? checkSurface;
  const outputLocation = await preflightOutput(input.outputDirectory);

  let adoptionBytes;
  if (input.adoptionPath !== undefined) {
    adoptionBytes = await readBoundedRegularFile(input.adoptionPath, ADOPTION_MAX_BYTES);
  }

  const surfaceResult = await checkSurfaceImpl(input.target, {
    timeoutMs: input.timeoutMs,
    maxBodyBytes: input.maxBodyBytes,
  });
  if (!validateSurfaceResult(surfaceResult)) {
    const detail = JSON.stringify(issuesFromAjv(validateSurfaceResult.errors));
    throw new Error(`Surface checker produced an invalid result: ${detail}`);
  }
  const surfaceBytes = Buffer.from(JSON.stringify(surfaceResult, null, 2) + "\n", "utf8");

  let adoptionInspection;
  if (adoptionBytes !== undefined) {
    adoptionInspection = inspectCovenantAdoption(adoptionBytes, surfaceResult.target);
  }

  const index = buildIndex(surfaceResult, surfaceBytes, adoptionBytes, adoptionInspection);
  if (!validateObserveIndex(index)) {
    const detail = JSON.stringify(issuesFromAjv(validateObserveIndex.errors));
    throw new Error(`Observe produced an invalid index: ${detail}`);
  }
  const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + "\n", "utf8");
  const outputDirectory = await writeBundle(
    outputLocation,
    surfaceBytes,
    adoptionBytes,
    indexBytes,
  );

  const adoptionAccepted = adoptionInspection === undefined
    || (
      adoptionInspection.schemaValidation.valid
      && adoptionInspection.crossDocumentValidation.valid
      && adoptionInspection.targetRelation === "same_origin"
    );
  return {
    exitCode: adoptionAccepted ? 0 : 1,
    index,
    indexBytes,
    outputDirectory,
  };
}

function usage() {
  return [
    "Usage: xenia observe <credential-free-origin> --out <new-directory> [options]",
    "Source checkout: npm run xenia:observe -- observe https://example.com/ --out ./evidence/example",
    "",
    "Options:",
    "  --adoption <path>   preserve and validate a host-supplied adoption JSON",
    "  --json              print observe-result.json exactly",
    "  --timeout-ms <n>    per-request Surface timeout (100..30000)",
    "  --max-bytes <n>     per-resource decoded body limit (1024..10000000)",
    "  --help              show this help",
    "",
    "The output directory must not exist. Surface outcomes are recorded evidence,",
    "not a whole-XENIA verdict. Exit: 0 recorded, 1 recorded with adoption issues,",
    "2 misuse or incomplete bundle.",
  ].join("\n");
}

function takeValue(args, index, name) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  if (args[0] !== "observe") throw new Error("the development CLI supports only the observe command");

  const parsed = { json: false };
  const positional = [];
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (["--out", "--adoption", "--timeout-ms", "--max-bytes"].includes(arg)) {
      const value = takeValue(args, index, arg);
      index += 1;
      if (arg === "--out") parsed.outputDirectory = value;
      if (arg === "--adoption") parsed.adoptionPath = value;
      if (arg === "--timeout-ms") parsed.timeoutMs = Number(value);
      if (arg === "--max-bytes") parsed.maxBodyBytes = Number(value);
    } else if (arg?.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg?.startsWith("--max-bytes=")) {
      parsed.maxBodyBytes = Number(arg.slice("--max-bytes=".length));
    } else if (arg?.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) throw new Error("observe requires exactly one target origin");
  if (!parsed.outputDirectory) throw new Error("observe requires --out <new-directory>");
  if (parsed.timeoutMs !== undefined
    && (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 100 || parsed.timeoutMs > 30_000)) {
    throw new Error("--timeout-ms must be an integer from 100 to 30000");
  }
  if (parsed.maxBodyBytes !== undefined
    && (!Number.isInteger(parsed.maxBodyBytes) || parsed.maxBodyBytes < 1024 || parsed.maxBodyBytes > 10_000_000)) {
    throw new Error("--max-bytes must be an integer from 1024 to 10000000");
  }
  parsed.target = positional[0];
  return parsed;
}

export async function main(args) {
  try {
    const input = parseArgs(args);
    if (input.help) {
      process.stdout.write(usage() + "\n");
      return 0;
    }
    const result = await recordObservation(input);
    if (input.json) {
      process.stdout.write(result.indexBytes);
    } else {
      const covenant = result.index.covenant_adoption.state === "not_supplied"
        ? "not supplied"
        : result.exitCode === 0 ? "record-consistent" : "issues recorded";
      process.stdout.write([
        "XENIA observe: RECORDED",
        `bundle: ${result.outputDirectory}`,
        `Surface 0.1 outcome: ${result.index.surface.outcome}`,
        `Covenant adoption: ${covenant}${covenant === "record-consistent" ? " (not implementation evidence)" : ""}`,
        "whole-XENIA conformance: not assessed",
        "",
      ].join("\n"));
    }
    return result.exitCode;
  } catch (error) {
    process.stderr.write(String(error?.message || error) + "\n");
    return 2;
  }
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = await main(process.argv.slice(2));
