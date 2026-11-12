// SPDX-License-Identifier: MPL-2.0
// Informative, repository-only studies of existing Xenia mechanisms.
// Metadata is inert. Studies use synthetic inputs, not remote service evidence.

const cards = [
  {
    id: 'arrival', title: 'An arrival can orient',
    relates_to: [{ id: 'legibility', relation: 'partial-illustration', limit: 'Constructing a manifest is not observing a hosted door.' }],
    question: 'What is here, and what remains unestablished?',
    mechanism: 'A native Surface manifest names resources, representations and coverage limits.',
    study: 'Construct a manifest and inspect its real Response value, without hosting it.',
    standalone: true,
    needs: 'Explicit service/resource definitions; the standalone study supplies a fixed fixture.',
    gives: 'A resource description that the representation motif can consume.',
    sources: [{ path: 'src/surface-0.1.ts', symbol: 'defineSurfaceManifest' }, { path: 'README.md', symbol: 'Discovery & Addressing' }],
    connects_to: [{ id: 'representation', carries: 'one declared resource and its supported forms' }],
    not_established: ['a deployed service', 'conformance', 'identity or authority'],
  },
  {
    id: 'representation', title: 'Difference can remain legible',
    relates_to: [{ id: 'legibility', relation: 'partial-illustration', limit: 'One authored message is not a general semantic-equivalence proof.' }],
    question: 'Can the same resource answer in the form actually requested?',
    mechanism: 'Native Accept negotiation honors preference and exclusion, including q=0.',
    study: 'Choose JSON or HTML for one authored fixture message; inspect the resulting Responses.',
    standalone: true,
    needs: 'One declared resource and an Accept preference; the study supplies both locally.',
    gives: 'A selected representation, or an explicit not-acceptable result.',
    sources: [{ path: 'src/surface-0.1.ts', symbol: 'negotiateSurfaceResource' }, { path: 'README.md', symbol: 'Legibility & Content Negotiation' }],
    connects_to: [{ id: 'recovery', carries: 'the resource whose requested representation is unavailable' }],
    not_established: ['the visitor’s identity or kind', 'general semantic equivalence', 'permission to act'],
  },
  {
    id: 'recovery', title: 'An error can orient',
    relates_to: [{ id: 'legibility', relation: 'partial-illustration', limit: 'A recovery link is neither an instruction to execute nor authority.' }],
    question: 'What relevant next read can be offered without executing it?',
    mechanism: 'Native 404/406 problem constructors offer bounded GET guidance instead of a bare dead end.',
    study: 'Inspect actual problem objects and headers; retain suggestions as data.',
    standalone: true,
    needs: 'A canonical manifest URL or a declared resource; supplied by the fixed fixture.',
    gives: 'A discover/representation proposal, not an authorization or automatic retry.',
    sources: [{ path: 'src/surface-0.1.ts', symbol: 'createSurfaceRouteNotFoundProblem' }, { path: 'src/surface-0.1.ts', symbol: 'createSurfaceNotAcceptableProblem' }, { path: 'CONTRIBUTING.md', symbol: 'Error path' }],
    connects_to: [{ id: 'arrival', carries: 'a proposed discovery location' }, { id: 'representation', carries: 'a proposed supported form' }, { id: 'ending', carries: 'the distinction between recoverable and terminal' }],
    not_established: ['consent', 'safe automatic replay', 'the truth of a linked page'],
  },
  {
    id: 'ending', title: 'An ending can be complete',
    relates_to: [{ id: 'exit', relation: 'contrast', limit: 'A terminal problem does not retire a module, revoke access, or erase records.' }],
    question: 'Can this interaction stop without inventing another obligation?',
    mechanism: 'A native terminal problem has no next actions; this fixture also explicitly disables retry.',
    study: 'Construct a clearly labelled software-fixture ending, not a person’s refusal.',
    standalone: true,
    needs: 'Explicit terminal status and detail; no other motif must run first.',
    gives: 'A complete local stopping point with no follow-up action.',
    sources: [{ path: 'src/surface-0.1.ts', symbol: 'createSurfaceProblem' }, { path: 'RIGHTS.md', symbol: 'Refusal and disagreement' }, { path: 'RIGHTS.md', symbol: 'Rest, play, and limits' }],
    connects_to: [],
    not_established: ['a human refusal', 'revocation, deletion or settlement', 'anyone’s inner experience'],
  },
];

function problem(code) {
  return Object.assign(new Error(code), { code });
}

function copyCard(card) {
  return {
    ...structuredClone(card),
    requirements: {
      description_needs_build: false, study_needs_xenia_build: true,
      external_provider: false, network: false, credentials: false,
      persisted_study_state: false,
    },
  };
}

export function listStudies() {
  return cards.map(copyCard);
}

export function describeStudy(id) {
  const card = cards.find(candidate => candidate.id === id);
  if (!card) throw problem('MOTIF_NOT_FOUND');
  return copyCard(card);
}

const origin = 'https://example.com';
const roomUrl = `${origin}/room`;
const manifestUrl = `${origin}/.well-known/agent.json`;
const message = 'You may arrive, ask, or leave.';
const limits = [
  'hosted-service conformance', 'identity or authority', 'consent',
  'a real participant’s choice', 'network behavior or retention',
];

async function nativeSurface() {
  try { return await import('../../dist/surface-0.1.js'); }
  catch { throw problem('MOTIF_BUILD_REQUIRED'); }
}

function fixtureManifest(api) {
  return api.defineSurfaceManifest({
    service: { name: 'Unserved motif room', canonicalUrl: `${origin}/`, description: 'A synthetic local fixture, not a hosted service.' },
    resources: [{ id: 'room', href: roomUrl, representations: ['application/json', 'text/html'], defaultMediaType: 'application/json', description: 'One authored message in two forms.' }],
  });
}

async function observeValue(response) {
  const contentType = response.headers.get('Content-Type');
  return {
    status: response.status, content_type: contentType,
    vary: response.headers.get('Vary'),
    body: contentType.includes('json') ? await response.json() : await response.text(),
  };
}

async function represent(api, resource, accept) {
  const selected = api.negotiateSurfaceResource(resource, accept);
  if (selected === 'not-acceptable') return { requested_accept: accept, selected, output: null };
  const body = selected === 'application/json'
    ? { schema_version: 'xenia.motif-room/0.1-development', message }
    : `<!doctype html><html lang="en"><meta charset="utf-8"><title>Unserved motif room</title><p>${message}</p></html>`;
  return { requested_accept: accept, selected, output: await observeValue(api.createSurfaceResourceResponse(selected, body)) };
}

function study(id, fields) {
  return {
    kind: 'motif-study', motif: describeStudy(id),
    basis: 'native-helper-execution-with-synthetic-inputs',
    ...fields, external_actions_executed: false, not_established: [...limits],
  };
}

export async function studyCommand(args = []) {
  if (!Array.isArray(args) || args.length > 2 || args.some(arg => typeof arg !== 'string')) {
    throw problem('MOTIF_INVALID_ARGUMENTS');
  }
  const [command = 'list', id] = args;
  if ((command === 'help' || command === '--help') && args.length === 1) {
    return { kind: 'motif-help', commands: ['motifs study', 'motifs study show <id>', 'motifs study run <id>', 'motifs study journey'],
      ids: cards.map(card => card.id), meaning: 'Metadata is inert; run/journey execute native helpers only on local synthetic inputs.' };
  }
  if (command === 'list' && args.length <= 1) return { kind: 'motif-study-catalog', status: 'informative repository-only studies, not the whole motif map', studies: listStudies() };
  if (command === 'show' && args.length === 2) return { kind: 'motif-description', motif: describeStudy(id) };
  if (command === 'run' && args.length === 2) return runStudy(id);
  if (command === 'journey' && args.length === 1) return composeJourney();
  throw problem('MOTIF_INVALID_ARGUMENTS');
}

export async function runStudy(id) {
  describeStudy(id);
  const api = await nativeSurface();
  if (id === 'arrival') {
    const manifest = fixtureManifest(api);
    return study(id, { output: await observeValue(api.createSurfaceManifestResponse(manifest)) });
  }
  if (id === 'representation') {
    const resource = fixtureManifest(api).resources[0];
    return study(id, {
      resource,
      json: await represent(api, resource, 'application/json'),
      html: await represent(api, resource, 'text/html'),
      json_excluded: await represent(api, resource, 'application/json;q=0, */*;q=1'),
      unsupported: await represent(api, resource, 'application/xml'),
    });
  }
  if (id === 'recovery') {
    const resource = fixtureManifest(api).resources[0];
    return study(id, {
      resource,
      wrong_door: await observeValue(api.createSurfaceProblemResponse(api.createSurfaceRouteNotFoundProblem({ manifestUrl }))),
      unsupported_form: await observeValue(api.createSurfaceProblemResponse(api.createSurfaceNotAcceptableProblem({ resource }))),
    });
  }
  if (id === 'ending') return study(id, { output: await endingValue(api) });
  throw problem('MOTIF_STUDY_UNAVAILABLE');
}

async function endingValue(api) {
  const ending = api.createSurfaceProblem({
    type: `${origin}/problems/study-ended`, title: 'This local study has ended',
    status: 410, code: 'study_ended', detail: 'This software fixture offers no further action.',
    retryable: false, terminal: true, nextActions: [],
  });
  return observeValue(api.createSurfaceProblemResponse(ending));
}

export async function composeJourney() {
  const api = await nativeSurface();
  const manifest = fixtureManifest(api);
  const missing = await observeValue(api.createSurfaceProblemResponse(api.createSurfaceRouteNotFoundProblem({ manifestUrl })));
  const discovery = missing.body.next_actions.find(action => action.rel === 'discover');
  if (discovery?.href !== manifestUrl || discovery.method !== 'GET') throw problem('MOTIF_NATIVE_CONTRACT_CHANGED');

  // Construct local values; never fetch or execute an advertised link. The
  // choices below belong to this fixed fixture, not to a human or live agent.
  const arrival = await observeValue(api.createSurfaceManifestResponse(manifest));
  const resource = arrival.body.resources[0];
  const incompatible = await represent(api, resource, 'application/xml');
  if (incompatible.selected !== 'not-acceptable') throw problem('MOTIF_NATIVE_CONTRACT_CHANGED');
  const recovery = await observeValue(api.createSurfaceProblemResponse(api.createSurfaceNotAcceptableProblem({ resource })));
  const proposal = recovery.body.next_actions[0];
  if (proposal?.href !== resource.href || proposal.method !== 'GET') throw problem('MOTIF_NATIVE_CONTRACT_CHANGED');
  const recovered = await represent(api, resource, proposal.accept);
  if (!recovered.output) throw problem('MOTIF_NATIVE_CONTRACT_CHANGED');
  const alternate = await represent(api, resource, 'application/json;q=0, */*;q=1');
  if (!alternate.output) throw problem('MOTIF_NATIVE_CONTRACT_CHANGED');
  const ending = await endingValue(api);

  return {
    kind: 'motif-journey', basis: 'native-helper-execution-with-synthetic-inputs',
    steps: [
      { id: 'wrong-door', motif: 'recovery', output: missing },
      { id: 'arrival', motif: 'arrival', chosen_proposal: discovery, output: arrival },
      { id: 'unsupported-shape', motif: 'representation', resource, requested_accept: incompatible.requested_accept, output: recovery },
      { id: 'recovered-json', motif: 'recovery', chosen_proposal: proposal, choice_basis: 'explicit authored fixture choice, not external authority', output: recovered.output },
      { id: 'alternate-html', motif: 'representation', resource, requested_accept: alternate.requested_accept, output: alternate.output },
      { id: 'clear-ending', motif: 'ending', output: ending },
    ],
    connections: [
      { from: 'wrong-door', to: 'arrival', kind: 'dataflow', carries: discovery, meaning: 'Guidance names the discovery value; it does not authorize an action.' },
      { from: 'arrival', to: 'unsupported-shape', kind: 'dataflow', carries: resource, meaning: 'The declared resource supplies the actual negotiation input.' },
      { from: 'unsupported-shape', to: 'recovered-json', kind: 'dataflow', carries: proposal, meaning: 'An offered form supplies the next local fixture input, not an automatic network retry.' },
      { from: 'recovered-json', to: 'alternate-html', kind: 'comparison', meaning: 'One authored message remains in two forms; this is not a general semantic-equivalence proof.' },
      { from: 'unsupported-shape', to: 'clear-ending', kind: 'contrast', meaning: 'Recoverable guidance and a complete ending are different contracts.' },
    ],
    external_actions_executed: false, next_actions: ending.body.next_actions,
    not_established: [...limits],
  };
}

