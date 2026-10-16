import { describe, expect, it } from 'vitest';
import {
  MEMORY_EXTRACTION_PROMPT,
  MEMORY_VERSION,
  knownEntitiesFrom,
  knownFactsFor,
  memoryNameKey,
  memoryEntityPreview,
  memoryStreamReader,
  mergeMemoryEntities,
  needsMemoryUpgrade,
  parseMemoryReply,
  validateMemoryExtraction,
  type MemoryChapter,
  type MemoryClaim,
  type MemoryEntity,
  type ProjectMemory,
} from '../../supabase/functions/_shared/project-memory';
import { buildMemoryGraph, buildProjectMemoryContext, consolidateFacts, linksOf, pathOf } from '../../supabase/functions/_shared/memory-graph';

const source = [
  '<p>Captain Oren Vale ordered the gates of Halcyon shut before dusk.</p>',
  '<p>Mira climbed the rigging to the treetop village with the Captain.</p>',
  '<p>Years ago, Oren had lost his brother in the Glass Hollows.</p>',
].join('');

describe('memory extraction v2', () => {
  it('accepts near-miss entity kinds, like claims do', async () => {
    const out = await validateMemoryExtraction({ entities: [{ name: 'Halcyon', kind: 'City', aliases: [] }], claims: [] }, source);
    expect(out.entities).toEqual([{ name: 'Halcyon', kind: 'place', aliases: [], presence: 'mentioned' }]);
  });

  it('finds aliases despite curly quotes and salvages entities from a broken reply', async () => {
    const curly = '<p>Everyone called him “the Old Man” behind his back. Captain Oren Vale ignored it.</p>';
    const out = await validateMemoryExtraction({ entities: [{ name: 'Oren Vale', kind: 'person', aliases: ['"the Old Man"'] }], claims: [] }, curly);
    expect(out.entities[0].aliases).toEqual(['"the Old Man"']);
    const good = JSON.stringify({ subject: 'Oren Vale', kind: 'person', statement: 'x', quote: 'Captain Oren Vale ignored it.', basis: 'stated' });
    const bad = '{"subject":"Oren Vale","kind":"person","statement":"y","quote":"He said “Phew...”,\n"basis":"stated"}';
    const parsed = parseMemoryReply(`{"entities":[{"name":"Oren Vale","kind":"person","aliases":[]}],"claims":[${good},${bad}]}`);
    expect(parsed?.claims).toHaveLength(1);
    expect(parsed?.entities).toEqual([{ name: 'Oren Vale', kind: 'person', aliases: [] }]);
  });

  it('joins the entities found in separate passages of one chapter', () => {
    expect(mergeMemoryEntities([
      [{ name: 'Oren Vale', kind: 'person', aliases: [], presence: 'mentioned' }],
      [{ name: 'oren vale', kind: 'person', aliases: ['the Captain'], presence: 'onstage' }, { name: 'Halcyon', kind: 'place', aliases: [], presence: 'mentioned' }],
    ])).toEqual([
      { name: 'Oren Vale', kind: 'person', aliases: ['the Captain'], presence: 'onstage' },
      { name: 'Halcyon', kind: 'place', aliases: [], presence: 'mentioned' },
    ]);
  });

  it('keeps entities the chapter mentions and drops aliases it never uses', async () => {
    const out = await validateMemoryExtraction({
      entities: [
        { name: 'Oren Vale', kind: 'person', aliases: ['the Captain', 'Lord Vale'], presence: 'onstage' },
        { name: 'Halcyon', kind: 'place', aliases: [], presence: 'mentioned' },
        { name: 'Invented Person', kind: 'person', aliases: [], presence: 'onstage' },
        { name: 'Mira', kind: 'mood', aliases: [] },
      ],
      claims: [],
    }, source);
    expect(out.entities).toEqual([
      { name: 'Oren Vale', kind: 'person', aliases: ['the Captain'], presence: 'onstage' },
      { name: 'Halcyon', kind: 'place', aliases: [], presence: 'mentioned' },
    ]);
  });

  it('attaches claims to entities by alias, and keeps only links to known entities', async () => {
    const out = await validateMemoryExtraction({
      entities: [
        { name: 'Oren Vale', kind: 'person', aliases: ['the Captain'], presence: 'onstage' },
        { name: 'Halcyon', kind: 'place', aliases: [], presence: 'onstage' },
        { name: 'Glass Hollows', kind: 'place', aliases: [] },
      ],
      claims: [{
        subject: 'the Captain', kind: 'person', statement: 'Oren closes the gates of Halcyon at dusk.',
        quote: 'Captain Oren Vale ordered the gates of Halcyon shut before dusk.', basis: 'stated', time: 'scene',
        relations: [
          { target: 'Halcyon', type: 'at' },
          { target: 'Halcyon', type: 'at' },
          { target: 'Nowhere', type: 'at' },
          { target: 'Glass Hollows', type: 'teleports' },
          { target: 'Oren Vale', type: 'ally' },
        ],
      }, {
        subject: 'Oren Vale', kind: 'person', statement: 'Oren lost his brother in the Glass Hollows years ago.',
        quote: 'Years ago, Oren had lost his brother in the Glass Hollows.', basis: 'stated', time: 'someday',
        relations: [{ target: 'glass hollows', type: 'related' }],
      }],
    }, source);
    expect(out.claims.map(c => c.subject)).toEqual(['Oren Vale', 'Oren Vale']);
    expect(out.claims[0].relations).toEqual([{ target: 'Halcyon', type: 'at' }]);
    expect(out.claims[0].related).toEqual(['Halcyon']);
    expect(out.claims[0].time).toBe('scene');
    expect(out.claims[1].time).toBe('unknown');
    expect(out.claims[1].relations).toEqual([{ target: 'Glass Hollows', type: 'related' }]);
    expect(out.claims[0].aliases).toEqual(['the Captain']);
  });

  it('adds an entity for a quoted claim whose subject was not listed, without crossing kinds', async () => {
    const out = await validateMemoryExtraction({
      entities: [{ name: 'Halcyon', kind: 'person', aliases: [] }],
      claims: [{ subject: 'Halcyon', kind: 'place', statement: 'Halcyon has gates.',
        quote: 'Captain Oren Vale ordered the gates of Halcyon shut before dusk.', basis: 'stated' }],
    }, source);
    expect(out.entities.map(e => `${e.kind}:${e.name}`)).toEqual(['person:Halcyon', 'place:Halcyon']);
    expect(out.claims[0].kind).toBe('place');
  });

  it('asks for entities, typed links and a time anchor that treats flashbacks as past', () => {
    expect(MEMORY_EXTRACTION_PROMPT).toContain('"entities"');
    expect(MEMORY_EXTRACTION_PROMPT).toContain('"relations"');
    expect(MEMORY_EXTRACTION_PROMPT).toContain('knownEntities');
    expect(MEMORY_EXTRACTION_PROMPT).toContain('a flashback in a late chapter is "past"');
  });

  it('ignores case, punctuation and a leading article when comparing names', () => {
    expect(memoryNameKey('The Glass Hollows')).toBe(memoryNameKey('glass hollows'));
    expect(memoryNameKey('“Mira.”')).toBe('mira');
    expect(memoryNameKey('O Castelo')).toBe(memoryNameKey('castelo'));
  });

  it('offers names from other chapters, most frequent first, including older analyses', () => {
    const known = knownEntitiesFrom([
      { entities: [{ name: 'Mira', kind: 'person', aliases: [] }, { name: 'Halcyon', kind: 'place', aliases: [] }] },
      { entities: [{ name: 'Mira', kind: 'person', aliases: ['the scout'] }] },
      { claims: [{ subject: 'Oren Vale', kind: 'person', aliases: [] }] },
      { entities: [{ name: 'Broken', kind: 'dragon' }] },
    ]);
    expect(known).toEqual([
      { name: 'Mira', kind: 'person', aliases: ['the scout'] },
      { name: 'Halcyon', kind: 'place', aliases: [] },
      { name: 'Oren Vale', kind: 'person', aliases: [] },
    ]);
  });
});

function claim(patch: Partial<MemoryClaim>): MemoryClaim {
  return { key: patch.key || Math.random().toString(16).slice(2).padEnd(64, '0'), subject: 'Mira', kind: 'person',
    aliases: [], statement: 'A fact.', quote: 'A quote long enough.', basis: 'stated', scope: '', related: [],
    time: 'scene', relations: [], ...patch };
}
function chapter(id: string, position: number, patch: Partial<MemoryChapter> = {}): MemoryChapter {
  return { id, title: `Chapter ${position + 1}`, position, revision: 'r', currentRevision: 'r', draftId: null,
    claims: [], entities: [], version: MEMORY_VERSION, writingKind: 'literary', analyzedAt: '2026-09-30',
    status: 'complete', overrides: {}, ...patch };
}
const memoryOf = (chapters: MemoryChapter[]): ProjectMemory =>
  ({ profile: { enabled: true, register: 'auto', genre: '', guidance: '' }, chapters });

describe('memory graph', () => {
  const ch1 = chapter('c1', 0, {
    entities: [
      { name: 'Captain Vale', kind: 'person', aliases: [], presence: 'onstage' },
      { name: 'Halcyon', kind: 'place', aliases: [], presence: 'onstage' },
      { name: 'Mira', kind: 'person', aliases: [], presence: 'mentioned' },
    ],
    claims: [claim({ key: 'k1', subject: 'Captain Vale', statement: 'Vale shuts the gates.',
      relations: [{ target: 'Halcyon', type: 'at' }], related: ['Halcyon'] })],
  });
  const ch2 = chapter('c2', 1, {
    entities: [
      { name: 'Oren Vale', kind: 'person', aliases: ['Captain Vale'], presence: 'onstage' },
      { name: 'Halcyon', kind: 'organization', aliases: [], presence: 'mentioned' },
      { name: 'Mira', kind: 'person', aliases: [], presence: 'onstage' },
    ],
    claims: [
      claim({ key: 'k2', subject: 'Oren Vale', statement: 'Oren is Mira’s uncle.',
        relations: [{ target: 'Mira', type: 'family' }], related: ['Mira'] }),
      claim({ key: 'k3', subject: 'Mira', statement: 'Mira climbs the rigging.' }),
    ],
    overrides: { k3: { disposition: 'excluded', correction: '' } },
  });

  it('joins the same entity across chapters through a shared alias, but never across kinds', () => {
    const graph = buildMemoryGraph(memoryOf([ch2, ch1, chapter('c3', 2, { revision: null })]));
    const vale = graph.nodes.find(n => n.kind === 'person' && n.aliases.includes('Captain Vale'))!;
    expect(vale.name).toBe('Oren Vale');
    expect(vale.appearances.map(a => a.chapterId)).toEqual(['c1', 'c2']);
    expect(vale.facts.map(f => f.claim.key)).toEqual(['k1', 'k2']);
    expect(graph.nodes.filter(n => n.name === 'Halcyon').map(n => n.kind).sort()).toEqual(['organization', 'place']);
  });

  it('records where each entity is onstage or only mentioned', () => {
    const mira = buildMemoryGraph(memoryOf([ch1, ch2])).nodes.find(n => n.name === 'Mira')!;
    expect(mira.appearances.map(a => a.presence)).toEqual(['mentioned', 'onstage']);
  });

  it('builds typed links with their evidence, and leaves excluded facts out of links', () => {
    const graph = buildMemoryGraph(memoryOf([ch1, ch2]));
    const vale = graph.nodes.find(n => n.name === 'Oren Vale')!;
    const links = linksOf(graph, vale.id).map(l => `${l.outgoing ? '→' : '←'}${l.edge.type}:${l.other.name}:${l.other.kind}`);
    expect(links.sort()).toEqual(['→at:Halcyon:place', '→family:Mira:person']);
    const mira = graph.nodes.find(n => n.name === 'Mira')!;
    expect(mira.facts.map(f => f.override?.disposition)).toEqual(['excluded']);
  });

  it('turns older analyses into nodes and untyped links', () => {
    const old = chapter('c1', 0, { version: 1, entities: [],
      claims: [claim({ key: 'o1', subject: 'Kai', related: ['Winter battle'], relations: undefined, time: undefined }),
        claim({ key: 'o2', subject: 'Winter battle', kind: 'event' })] });
    const graph = buildMemoryGraph(memoryOf([old]));
    expect(graph.nodes.map(n => `${n.kind}:${n.name}`).sort()).toEqual(['event:Winter battle', 'person:Kai']);
    expect(graph.edges.map(e => e.type)).toEqual(['related']);
    expect(graph.coverage.outdatedFormat).toBe(1);
    expect(needsMemoryUpgrade(old)).toBe(true);
    expect(needsMemoryUpgrade(ch1)).toBe(false);
  });

  it('marks facts from chapters edited since analysis as stale and counts coverage', () => {
    const edited = chapter('c2', 1, { ...ch2, currentRevision: 'newer' });
    const graph = buildMemoryGraph(memoryOf([ch1, edited, chapter('c3', 2, { revision: null })]));
    expect(graph.coverage).toEqual({ total: 3, analyzed: 2, current: 1, stale: 1, outdatedFormat: 0 });
    const mira = graph.nodes.find(n => n.name === 'Mira')!;
    expect(mira.facts.every(f => f.stale)).toBe(true);
    expect(mira.stale).toBe(false);
  });

  it('sorts entities by chapters appeared in, then by facts not excluded', () => {
    const graph = buildMemoryGraph(memoryOf([ch1, ch2]));
    expect(graph.nodes.filter(n => n.kind === 'person').map(n => n.name)).toEqual(['Oren Vale', 'Mira']);
    const ch3 = chapter('c3', 2, { entities: [{ name: 'Mira', kind: 'person', aliases: [], presence: 'onstage' }] });
    const more = buildMemoryGraph(memoryOf([ch1, ch2, ch3]));
    expect(more.nodes.filter(n => n.kind === 'person').map(n => n.name)).toEqual(['Mira', 'Oren Vale']);
  });

  it('finds facts by any name the entity goes by in another chapter', () => {
    const prompt = buildProjectMemoryContext(memoryOf([ch1, ch2]), 'Is Captain Vale related to anyone?');
    expect(prompt).toContain('Oren is Mira’s uncle.');
    expect(prompt).toContain('"entity":"Oren Vale"');
  });

  it('follows links one step out, ranking linked facts after direct matches', () => {
    const ch3 = chapter('c3', 2, {
      entities: [{ name: 'Mira', kind: 'person', aliases: [], presence: 'onstage' }],
      claims: [claim({ key: 'k4', subject: 'Mira', statement: 'Mira fears the dark.' })],
    });
    const prompt = buildProjectMemoryContext(memoryOf([ch1, ch2, ch3]), 'Tell me about Oren');
    expect(prompt.indexOf('Oren is Mira’s uncle.')).toBeGreaterThan(-1);
    expect(prompt.indexOf('Mira fears the dark.')).toBeGreaterThan(prompt.indexOf('Oren is Mira’s uncle.'));
    expect(buildProjectMemoryContext(memoryOf([ch1, ch2, ch3]), 'Tell me about the weather')).not.toContain('Mira fears the dark.');
  });

  it('gives the AI editor time anchors and typed links', () => {
    const prompt = buildProjectMemoryContext(memoryOf([ch1]), 'What did Vale do?');
    expect(prompt).toContain('"time":"scene"');
    expect(prompt).toContain('"relations":[{"target":"Halcyon","type":"at"}]');
  });

  it('does not place someone a chapter only talks about', async () => {
    const lives = (time: MemoryClaim['time'], basis: MemoryClaim['basis']) => claim({ subject: 'Ada', time, basis,
      relations: [{ target: 'Clearwell', type: 'at' }] });
    const ada = { name: 'Ada', kind: 'person' as const, aliases: [], presence: 'mentioned' as const };
    const city = { name: 'Clearwell', kind: 'place' as const, aliases: [], presence: 'mentioned' as const };
    const graph = buildMemoryGraph(memoryOf([
      chapter('a', 0, { entities: [ada, city], claims: [lives('ongoing', 'stated'), lives('scene', 'reported')] }),
      chapter('b', 1, { entities: [{ ...ada, presence: 'onstage' }, city], claims: [lives('scene', 'stated')] }),
    ]));
    expect(pathOf(graph, graph.nodes.find(n => n.name === 'Ada')!).map(step => step.places.map(p => p.name)))
      .toEqual([[], ['Clearwell']]);
    // The analyzer keeps places only for people in the chapter's scenes.
    const text = '<p>Ada, who lives in Clearwell, sent a letter. Mira read it in the kitchen.</p>';
    const out = await validateMemoryExtraction({ entities: [
      { name: 'Ada', kind: 'person', presence: 'mentioned', places: ['Clearwell'] },
      { name: 'Mira', kind: 'person', presence: 'onstage', places: ['kitchen'] },
      { name: 'Clearwell', kind: 'place' }, { name: 'kitchen', kind: 'place' },
    ], claims: [] }, text);
    expect(out.entities.filter(e => e.kind === 'person').map(e => [e.name, e.presence, e.places])).toEqual([
      ['Ada', 'mentioned', undefined], ['Mira', 'onstage', ['kitchen']],
    ]);
  });

  it('traces a person through the places each chapter puts them, from recorded places and at links', () => {
    const camp = { name: 'Harwood Camp', kind: 'place' as const, aliases: ['the camp'], presence: 'onstage' as const };
    const ark = { name: 'The Ark', kind: 'place' as const, aliases: [], presence: 'onstage' as const };
    const graph = buildMemoryGraph(memoryOf([
      chapter('a', 0, { entities: [{ name: 'Sky', kind: 'person', aliases: [], presence: 'onstage', places: ['the camp'] }, camp] }),
      chapter('b', 1, { entities: [{ name: 'Sky', kind: 'person', aliases: [], presence: 'mentioned' }, ark],
        claims: [claim({ subject: 'Sky', relations: [{ target: 'The Ark', type: 'at' }] })] }),
      chapter('c', 2, { entities: [{ name: 'Sky', kind: 'person', aliases: [], presence: 'onstage' }] }),
    ]));
    const sky = graph.nodes.find(n => n.name === 'Sky')!;
    expect(pathOf(graph, sky).map(step => [step.appearance.chapterId, step.places.map(p => p.name)]))
      .toEqual([['a', ['Harwood Camp']], ['b', ['The Ark']], ['c', []]]);
    expect(pathOf(graph, graph.nodes.find(n => n.name === 'The Ark')!)).toEqual([]);
  });

  it('joins both directions of a symmetric link into one', () => {
    const lia = { name: 'Lia', kind: 'person' as const, aliases: [], presence: 'onstage' as const };
    const sky = { name: 'Sky', kind: 'person' as const, aliases: [], presence: 'onstage' as const };
    const graph = buildMemoryGraph(memoryOf([
      chapter('a', 0, { entities: [lia, sky], claims: [claim({ subject: 'Lia', relations: [{ target: 'Sky', type: 'family' }] })] }),
      chapter('b', 1, { entities: [lia, sky], claims: [claim({ subject: 'Sky', relations: [{ target: 'Lia', type: 'family' }] })] }),
    ]));
    const links = linksOf(graph, 'person:lia');
    expect(links).toHaveLength(1);
    expect(links[0].edge.facts).toHaveLength(2);
  });
});

describe('streamed replies', () => {
  it('reports each entity and claim as soon as it is complete, however the reply is split', () => {
    const reply = '```json\n' + JSON.stringify({
      writingKind: 'literary',
      entities: [{ name: 'Sky', kind: 'person', aliases: [] }, { name: 'The {Ark}', kind: 'place', aliases: ['"the vault"'] }],
      claims: [{ subject: 'Sky', statement: 'Sky says "go]" loudly.', relations: [] }],
    }) + '\n```';
    for (const size of [1, 7, reply.length]) {
      const seen: string[] = [];
      const read = memoryStreamReader((list, value) => seen.push(`${list}:${value.name ?? value.subject}`));
      for (let i = 0; i < reply.length; i += size) read(reply.slice(i, i + size));
      expect(seen).toEqual(['entities:Sky', 'entities:The {Ark}', 'claims:Sky']);
    }
  });

  it('only previews entities the chapter actually names', () => {
    const preview = memoryEntityPreview(source);
    expect(preview({ name: 'Mira', kind: 'Character', sameAs: ['the girl'] })).toEqual({ name: 'Mira', kind: 'person', sameAs: ['the girl'] });
    expect(preview({ name: 'Nobody Here', kind: 'person' })).toBeNull();
    expect(preview({ name: 'Mira', kind: 'mood' })).toBeNull();
  });
});

describe('identity', () => {
  const person = (name: string, extra: Partial<MemoryEntity> = {}): MemoryEntity =>
    ({ name, kind: 'person', aliases: [], presence: 'onstage', ...extra });
  const chapters = [
    chapter('c3', 0, { entities: [person('Young Asari woman')], claims: [claim({ subject: 'Young Asari woman', statement: 'She has green eyes.' })] }),
    chapter('c7', 1, { entities: [person('Olive', { sameAs: ['Young Asari woman'] })], claims: [claim({ subject: 'Olive', statement: 'Olive is a scout.' })] }),
  ];

  it('joins an entry a later chapter reveals under a proper name, and shows it by that name', () => {
    const graph = buildMemoryGraph(memoryOf(chapters));
    const people = graph.nodes.filter(n => n.kind === 'person');
    expect(people.map(n => n.name)).toEqual(['Olive']);
    expect(people[0].aliases).toEqual(['Young Asari woman']);
    expect(people[0].facts).toHaveLength(2);
    expect(people[0].joins).toEqual([{ a: 'olive', b: 'young asari woman', name: 'Young Asari woman', by: 'reveal', chapterTitle: 'Chapter 2' }]);
  });

  it('lets the author undo a reveal', () => {
    const graph = buildMemoryGraph({ ...memoryOf(chapters),
      identities: [{ kind: 'person', a: 'olive', b: 'young asari woman', same: false }] });
    const people = graph.nodes.filter(n => n.kind === 'person');
    expect(people.map(n => [n.name, n.aliases, n.joins.length])).toEqual([['Olive', [], 0], ['Young Asari woman', [], 0]]);
  });

  it('joins entries the author says are one, under the name they keep', () => {
    const plain = [chapters[0], chapter('c7', 1, { entities: [person('Olive')] })];
    const graph = buildMemoryGraph({ ...memoryOf(plain),
      identities: [{ kind: 'person', a: 'olive', b: 'young asari woman', same: true, keep: 'olive' }] });
    const people = graph.nodes.filter(n => n.kind === 'person');
    expect(people.map(n => [n.id, n.aliases])).toEqual([['person:olive', ['Young Asari woman']]]);
    expect(people[0].joins.map(j => [j.by, j.name])).toEqual([['author', 'Young Asari woman']]);
  });

  it('keeps only reveals of names the project already knows, of the same kind', async () => {
    const text = '<p>The young woman smiled. “I am Olive,” she said.</p>';
    const out = await validateMemoryExtraction({ entities: [
      { name: 'Olive', kind: 'person', aliases: [], sameAs: ['Young Asari woman', 'The Ark', 'Invented Name'] },
    ], claims: [] }, text, [
      { name: 'Young Asari woman', kind: 'person', aliases: [] },
      { name: 'The Ark', kind: 'place', aliases: [] },
    ]);
    expect(out.entities[0].sameAs).toEqual(['Young Asari woman']);
  });
});

describe('fact consolidation', () => {
  const facts = (...list: [string, Partial<MemoryClaim>][]) => list.map(([id, patch], i) => {
    const c = chapter(id, i, { claims: [claim({ subject: 'Lia', time: 'ongoing', ...patch })] });
    return { chapter: c, claim: c.claims[0], override: c.overrides[c.claims[0].key], stale: false };
  });

  it('says each fact once and keeps only what later facts add', () => {
    const groups = consolidateFacts(facts(
      ['c1', { statement: 'Lia is Sky\'s younger sister.' }],
      ['c2', { statement: 'Lia is Sky\'s younger sister; she is lean, surprisingly strong, and shorter than Sky.' }],
      ['c5', { statement: 'Lia has green hair and a round face, and is Sky\'s sister.' }],
      ['c6', { statement: 'Lia is Sky’s sister.' }],
    ), ['Lia']);
    expect(groups.map(g => g.text)).toEqual([
      'Lia is Sky\'s younger sister.',
      'She is lean, surprisingly strong, and shorter than Sky.',
      'Lia has green hair and a round face.',
    ]);
    expect(groups[0].repeats.map(f => f.chapter.id)).toEqual(['c6']);
  });

  it('restores the subject when a trimmed fact starts with a verb, in Portuguese too', () => {
    const groups = consolidateFacts(facts(
      ['c1', { statement: 'Lia é a irmã mais nova de Sky.' }],
      ['c2', { statement: 'Lia é irmã de Sky, e cura feridos com ervas.' }],
    ), ['Lia']);
    expect(groups.map(g => g.text)).toEqual(['Lia é a irmã mais nova de Sky.', 'Lia cura feridos com ervas.']);
  });

  it('keeps a scene fact repeated in another chapter, since it is another event', () => {
    const groups = consolidateFacts(facts(
      ['c1', { statement: 'Lia is wounded.', time: 'scene' }],
      ['c2', { statement: 'Lia is wounded.', time: 'scene' }],
    ), ['Lia']);
    expect(groups).toHaveLength(2);
  });

  it('uses corrections and puts excluded facts last, whole', () => {
    const [first, second] = facts(
      ['c1', { key: 'a', statement: 'Lia is Sky\'s cousin.' }],
      ['c2', { key: 'b', statement: 'Lia is Sky\'s sister.' }],
    );
    first.override = { disposition: 'corrected', correction: 'Lia is Sky\'s sister.' };
    expect(consolidateFacts([first, second], ['Lia']).map(g => [g.text, g.repeats.length])).toEqual([['Lia is Sky\'s sister.', 1]]);
    first.override = { disposition: 'excluded', correction: '' };
    expect(consolidateFacts([first, second], ['Lia']).map(g => g.text)).toEqual(['Lia is Sky\'s sister.', 'Lia is Sky\'s cousin.']);
  });

  it('leaves repeats out of the AI editor context', () => {
    const lia = { name: 'Lia', kind: 'person' as const, aliases: [], presence: 'onstage' as const };
    const prompt = buildProjectMemoryContext(memoryOf([
      chapter('a', 0, { entities: [lia], claims: [claim({ subject: 'Lia', time: 'ongoing', statement: 'Lia is Sky\'s sister.' })] }),
      chapter('b', 1, { entities: [lia], claims: [claim({ subject: 'Lia', time: 'ongoing', statement: 'Lia is the sister of Sky.' })] }),
    ]), 'Who is Lia?');
    expect(prompt.match(/"subject":"Lia"/g)).toHaveLength(1);
  });

  it('tells the analyzer what is already known about who a passage mentions', () => {
    const known = knownFactsFor([
      { claims: [
        { subject: 'Lia', aliases: ['the healer'], statement: 'Lia is Sky\'s sister.', time: 'ongoing' },
        { subject: 'Lia', statement: 'Lia is wounded.', time: 'scene' },
        { subject: 'Ren', statement: 'Ren is a smith.', time: 'ongoing' },
      ] },
      { claims: [{ subject: 'Lia', statement: 'lia is sky\'s sister.' }] },
    ], 'The healer bandaged his arm.');
    expect(known).toEqual([{ subject: 'Lia', facts: ['Lia is Sky\'s sister.'] }]);
    expect(MEMORY_EXTRACTION_PROMPT).toContain('knownFacts');
  });
});
