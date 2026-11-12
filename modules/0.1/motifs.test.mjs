// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const entry = new URL('./motifs.mjs', import.meta.url);
import {readFile} from 'node:fs/promises';
test('Covenant motif produces the native all-unknown draft without binding anyone', async () => {
  const {createMotifHost} = await import(entry);
  const {createUnknownCovenantAdoption} = await import('../../covenant/0.1/create-adoption.mjs');
  const input = {hostName: 'Synthetic host', canonicalUrl: 'https://example.com/',
    speakerId: 'https://example.com/#operator', reviewedAt: '2026-10-09T00:00:00Z'};
  const host = createMotifHost('xenia-covenant', {authorize: () => true});
  assert.equal((await host.activate()).ok, true);
  assert.deepEqual((await host.invoke('draft', input)).value, createUnknownCovenantAdoption(input));
  assert.equal((await host.retire()).complete, true);
});

test('Work motif calls the native checker, including its invalid-record result', async () => {
  const {createMotifHost} = await import(entry);
  const {validateWorkRun} = await import('../../work/0.1/check.mjs');
  const record = JSON.parse(await readFile(new URL('../../work/0.1/examples/declined.json', import.meta.url)));
  const host = createMotifHost('xenia-work', {authorize: () => true});
  assert.equal((await host.activate()).ok, true);
  for (const input of [record, {}]) {
    const result = await host.invoke('check', input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, validateWorkRun(input));
  }
  assert.equal((await host.retire()).complete, true);
});

const definition = {
  service: {name: 'Synthetic motif fixture', canonicalUrl: 'https://example.com/', description: 'Not a served site.'},
  resources: [{id: 'about', href: 'https://example.com/about'}],
};

test('Surface motif is inert until authorized and returns the native manifest', async () => {
  assert.ok(existsSync(entry), 'The existing host has no independently callable motif registry yet');
  const {createMotifHost, motifCards} = await import(entry);
  const {defineSurfaceManifest} = await import('../../dist/surface-0.1.js');
  const denied = createMotifHost('xenia-surface');
  assert.equal(denied.inspect().state, 'disabled');
  assert.equal((await denied.activate()).error.code, 'unauthorized');
  assert.equal(motifCards().find(card => card.descriptor.id === 'xenia-surface').motif, 'legibility');
  const authorized = [];
  const host = createMotifHost('xenia-surface', {authorize: request => {authorized.push(request); return true;}});
  assert.equal((await host.activate()).ok, true);
  assert.deepEqual((await host.invoke('manifest', definition)).value, defineSurfaceManifest(definition));
  assert.deepEqual(authorized.map(x => x.phase), ['activate', 'invoke']);
  assert.deepEqual(await host.retire(), {complete: true});
  assert.equal((await host.invoke('manifest', definition)).ok, false);
});
