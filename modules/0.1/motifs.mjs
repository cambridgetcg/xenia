// SPDX-License-Identifier: MPL-2.0
// Built-in factories, not guest-selected import paths. Imports are inert.
import {createModuleHost} from './host.mjs';
import * as surface from './motifs/surface.mjs';
import * as covenant from './motifs/covenant.mjs';
import * as work from './motifs/work.mjs';
const motifs = new Map([surface, covenant, work].map(motif => [motif.card.descriptor.id, motif]));
export const motifCards = () => [...motifs.values()].map(({card}) => structuredClone(card));
export function createMotifHost(id, options = {}) {
  const motif = motifs.get(id);
  if (!motif) throw new TypeError('Unknown motif.');
  return createModuleHost(motif.card.descriptor, {...options, connect: motif.connect});
}
