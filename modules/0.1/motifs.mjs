// SPDX-License-Identifier: MPL-2.0
// Pure presentation of trusted, versioned design data; no IO or activation.
export function renderMotifs(atlas) {
  const bullets = values => values.map(value => `- ${value}`).join('\n');
  const lines = [
    '<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->',
    '<!-- Generated from modules/0.1/motifs.json by renderMotifs; edit the canonical cards, not this view. -->',
    `# ${atlas.title}`, '',
    '**Interpretive design cards, not a new normative profile or a running agent.**', '',
    atlas.self_sufficiency, '', atlas.understanding, '',
    'Read the whole map with `npm run --silent xenia:modules -- motifs`, or one card with `npm run --silent xenia:modules -- motifs release`.', '',
    '## The connected movement', '',
    'Arrival → legibility → choice → witness → continuity → release → a possible new arrival.', '',
    'This is a map of relationships, not a compulsory pipeline or an automatic loop.', '',
    atlas.repair, '',
    ...atlas.connections.map(edge => `- **${edge.from} → ${edge.to}:** ${edge.meaning}`), '',
    '## Standalone cards', '',
  ];
  for (const card of atlas.motifs) {
    lines.push(`### ${card.title}`, '', `**Question:** ${card.question}`, '',
      card.purpose, '', `**Use on its own:** ${card.standalone_use}`, '',
      '**Needs:**', bullets(card.needs), '', '**Produces:**', bullets(card.produces), '',
      '**Practice:**', bullets(card.practice), '',
      `**Illustrative example:** ${card.example.situation} ${card.example.move} ${card.example.expected}`, '',
      `**Boundary:** ${card.boundary}`, '', `**When it changes:** ${card.on_change}`, '',
      `**When it ends:** ${card.on_exit}`, '',
      '**Source anchors:**', bullets(card.sources.map(source => `[${source.path}](${source.path}) — ${source.anchor}`)), '',
      '**Executable checks:**', bullets(card.checks.map(check => `[${check.path}](${check.path}) — ${check.invariant}`)), '');
  }
  lines.push('## Provenance and limits', '',
    `Source: ${atlas.source.repository} at \`${atlas.source.baseline_revision}\`. ${atlas.source.access}`, '',
    atlas.source.local_development, '', atlas.verification_boundary, '',
    'The canonical cards are [modules/0.1/motifs.json](modules/0.1/motifs.json). The practical entry is [AGENT-FIRST.md](AGENT-FIRST.md).', '');
  return lines.join('\n');
}
