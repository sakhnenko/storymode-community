import type { MemoryChapter, MemoryClaim, MemoryEntity, MemoryKind, MemoryRelation, MemoryTime, ProjectMemory } from '../../../supabase/functions/_shared/project-memory.ts';
import type { EditorChapter, EditorFolio } from '../../../supabase/functions/story-chat/editor-request.ts';

// "The Glass Hollows": a fixture novel for AI editor benchmarks. Eight chapters
// of realistic length, with facts planted for questions to find, including
// three contradictions an editor should catch:
//   - Lia's eyes: green in "The Treetops", brown in "Mirrors"
//   - Kai's age: twenty-three in spring ("Kai"), twenty-five that summer ("The Raid")
//   - Kai's lost eye: the left ("The Battle at the Roots"), a scar over the right ("Homecoming")
// Each chapter is a few written scenes with generated description between
// them, so sizes match a real manuscript and the description has nothing to find.

const SCENES: { id: string; title: string; scenes: string[] }[] = [
  {
    id: 'ch-1', title: 'The Treetops', scenes: [
      'Harwood hung in the canopy like a second sky, a village of rope bridges and lantern-lit platforms strung between the great trees. Lia Marsh had lived there all seventeen years of her life, and she still counted the bridges on the way home, the way other children counted stars.',
      "Lia's eyes were green as moss after rain, and she never looked away from anyone, not even the elders. Her sister said it was rude. Lia said it was honest.",
      'Sky Marsh was the village scout, two years older than Lia and twice as stubborn. She came down the north bridge at dusk with her glowlamp swinging from her belt, mud to the knees, and a look that meant the ground had changed again.',
      '"Something is moving under the forest," Sky said, dropping her pack onto the platform. "The roots are warm. The Harwood mines have gone quiet, and the miners won\'t say why."',
      'Lia lit the stove while her sister talked. Outside, the lanterns along the bridges came on one by one, and somewhere below them, far under the roots, the ground made a sound like glass settling.',
      'That night Lia lay awake listening. She decided, before she slept, that whatever was under the forest, she would see it for herself.',
    ],
  },
  {
    id: 'ch-2', title: 'Kai', scenes: [
      'The stranger came up the ladder at noon, a tall young man with a sunburned neck and a map case slung across his back. He gave his name as Kai Thorne and asked for the scout.',
      'Kai had turned twenty-three that spring, he told the elders, and he had spent four of those years mapping the caves the miners called the Glass Hollows. He unrolled the map on the council table: tunnels like veins, chambers marked in red ink, a river that ran under the whole forest.',
      '"The Hollows are opening," Kai said. "The walls are turning to glass from the inside out. If it reaches the roots, Harwood falls."',
      'Sky studied the map for a long time. Lia studied Kai. He had a habit of tapping the table twice before he spoke, as if checking that it would hold.',
      'By evening the council had decided: Sky would guide Kai to the entrance under the old mine, and Lia, who knew the lower bridges better than anyone, would carry the second lamp.',
    ],
  },
  {
    id: 'ch-3', title: 'The Descent', scenes: [
      'The entrance to the Glass Hollows lay behind the last shaft of the Harwood mines, where the timber props gave way to stone that shone faintly when the lamps passed over it.',
      'Mara Vey met them at the mouth of the cave. The healer had come down from the eastern villages with her bag of herbs and, around her neck, an amulet: a disc of green glass bound in silver wire. "It warms when the Hollows wake," she said, and it was warm already.',
      'They descended for three hours. The tunnels narrowed and widened like breath. In the deepest chamber the walls were clear as water, and inside them, frozen mid-step, were the shapes of animals that had walked into the glass and never walked out.',
      'Kai marked each turning on his map. Sky went ahead with her glowlamp. Lia stayed close to Mara, watching the amulet pulse brighter with every step down.',
      'When they climbed out at dawn, nobody spoke. Mara tucked the amulet inside her collar, but Lia could still see its glow through the cloth.',
    ],
  },
  {
    id: 'ch-4', title: 'The Battle at the Roots', scenes: [
      'They came out of the Hollows on the first night of summer: things of glass and shadow, walking on too many legs, cracking the roots as they climbed.',
      'Harwood fought from the bridges. Sky held the north platform with a spear and her glowlamp, and the creatures shied from the light long enough for the archers to find them.',
      "Kai was on the lowest bridge when it broke. A shard the size of a knife caught him across the face, and by the time Lia reached him he was holding his hand over the wound. Kai lost his left eye in the battle at the roots; Mara said later that he was lucky to keep the right.",
      'Sky was hurt too, a deep cut along her forearm, but she refused to leave the bridges until the last creature fell back into the dark.',
      "At sunrise the village counted its dead. Eleven names. Lia carved them into the council table beside Kai's map, so that nobody would forget where the Hollows had reached.",
    ],
  },
  {
    id: 'ch-5', title: 'Clearwell', scenes: [
      "Clearwell was a city of white stone and salt wind, three days' walk from the forest. Sky and Lia came down the coast road with Kai's map and a letter from the council asking the city for glassworkers.",
      "They stayed at Vic's safe house, a narrow building above a chandler's shop near the harbour. Vic was a smuggler who owed the council a favour, and he asked no questions as long as they paid in coin and kept away from the windows.",
      'Mara had stayed behind in Harwood. In a letter that reached them on the second day, she wrote that she believed Kai was dead: he had gone back into the Hollows alone after the battle, and nobody had seen him since. With the letter came her amulet, wrapped in wool, "in case it helps."',
      'Lia read the letter twice. She did not believe it. Kai had walked out of the glass once; he could do it again.',
      'Their mother, Ada Marsh, lived somewhere in Clearwell; Sky had not seen her in nine years and did not mean to start now. Lia knew better than to say the name aloud.',
      'The glassworkers guild meet at the harbour every evening, and there voices carried acros the water like gulls. Sky argued with them for three nights strait before one old woman agreed to listen.',
    ],
  },
  {
    id: 'ch-6', title: 'Mirrors', scenes: [
      "The glassworkers' hall was full of mirrors, tall sheets of silvered glass leaning against every wall, and Lia could not walk ten steps without meeting herself.",
      'She stopped in front of the largest one. A tired girl looked back at her: hair cut short for the road, a bruise fading on her cheek, and her brown eyes ringed with dark from too little sleep.',
      'The old glassworker, a woman called Orla, held Mara\'s amulet up to the light. "This was made in the Hollows," Orla said. "Not by hands. It grew."',
      'When Orla set the amulet against the mirror, the glass clouded, and for a moment Lia saw a tunnel she recognised, and a figure walking in it with a lamp.',
      '"He\'s alive," Lia said. Sky said nothing, but she began packing that night.',
    ],
  },
  {
    id: 'ch-7', title: 'The Raid', scenes: [
      'Kai found them before they found him. He came out of an alley near the harbour on a hot night in midsummer, thinner, with a cloth tied over the ruined side of his face.',
      'Kai, twenty-five years old and already grey at the temples, laughed when Lia hugged him. "Mara\'s letter beat me here," he said. "I\'m told I\'m dead."',
      "He had a plan. The glassworkers' guild kept a vault under the harbour where the Hollows-glass was stored, and if the glass was growing, the vault was where it would grow fastest. Vic knew the way in.",
      'The raid went wrong in the usual ways: a guard who should have been asleep, a door that should have been open. But they reached the vault, and in the lamplight they saw the glass had already cracked its crates and crept halfway up the walls.',
      'Sky smashed the nearest crate with the butt of her spear. The glass sang as it broke, and somewhere under the city, something answered.',
    ],
  },
  {
    id: 'ch-8', title: 'Homecoming', scenes: [
      'Ada Marsh opened the door before they knocked. She was smaller than Lia remembered from the one portrait in the house, and she looked at Sky the way you look at weather you have been expecting for years.',
      '"You\'ll want the road north," Ada said. "The Hollows run under the coast now. They have since the battle." She knew more than a stranger should, and Sky asked her how. Ada did not answer.',
      "On the road home, Kai walked ahead with the map. In the evening light the scar over Kai's right eye looked almost silver, and Lia wondered whether the glass had left something of itself in him.",
      'Mara met them at the edge of the forest. Lia gave the amulet back to her, and the healer closed her hand around it and wept, because it was cold for the first time since spring.',
      'That night Harwood lit every lantern on every bridge, and the sisters sat together on the north platform, listening to the ground under the forest, which for once was silent.',
    ],
  },
];

/** Description with nothing to find: no names, and none of the planted facts. */
const DESCRIPTION = [
  'The light changed slowly over the rooftops, turning from grey to gold and back again.',
  'A cart rattled somewhere out of sight, its wheels loud on the uneven stones.',
  'The air smelled of resin and smoke and the faint sweetness of something baking.',
  'Rain had fallen earlier, and the boards still held its dark, cool weight.',
  'Birds argued in the branches overhead, then went quiet all at once.',
  'Far off, a bell rang the hour, and then another answered it, slightly out of time.',
  'The path bent around a stand of ferns and dipped toward running water.',
  'Wind moved through the leaves with a sound like distant applause.',
  'Someone had left a basket of apples by the door, and nobody claimed it.',
  'The afternoon stretched on, warm and slow, the shadows lengthening by degrees.',
  'Moss covered the north side of every post, thick and soft as fur.',
  'Down in the valley, the river caught the last of the sun and held it.',
  'A dog barked twice and then thought better of it.',
  'The stairs creaked in the same places they always had, a familiar music.',
  'Clouds came in from the west, low and heavy, carrying the smell of the sea.',
  'Smoke rose straight up from the chimneys in the still evening air.',
  'The market stalls folded their awnings one by one as the crowd thinned.',
  'Water dripped from the eaves in a steady, patient rhythm.',
  'Somewhere a door opened, let out a burst of laughter, and closed again.',
  'The road ran on between low stone walls, empty in both directions.',
  'Insects hummed in the long grass at the edge of the clearing.',
  'The fire burned down to embers, ticking softly as it cooled.',
  'A thin moon hung over the hills, pale as a fingernail.',
  'Gulls wheeled above the rooftops, crying out at nothing in particular.',
  'The bread was dense and dark and still warm in the middle.',
  'Every surface held a little dust, settled and undisturbed.',
  'Footsteps passed in the street below and faded away.',
  'The tide went out, leaving the stones slick and shining.',
  'Thunder muttered far away without ever coming closer.',
  'A spider had strung its web across the corner of the window frame.',
  'The kettle began to whistle, thin and rising, until someone lifted it off.',
  'Long grass bowed in waves whenever the breeze crossed the field.',
  'Pine needles lay thick on the path and muffled every step.',
  'The evening was cool enough for a coat but not quite cold enough to need one.',
  'Bees worked the clover along the roadside, slow and methodical.',
  'A shutter banged once in the wind and was fastened again.',
  'The walls kept the warmth of the day long after the sun had gone.',
  'Somewhere below, water moved through stone with a low, constant voice.',
];

/** Characters per chapter, about a 2,100-word chapter. */
const CHAPTER_CHARS = 13_000;

function describe(seed: number) {
  let state = seed;
  const next = () => (state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
  return () => Array.from({ length: 6 }, () => DESCRIPTION[Math.floor(next() * DESCRIPTION.length)]).join(' ');
}

/** The scenes in order, with description between and after them up to CHAPTER_CHARS. */
function chapterText(scenes: string[], seed: number) {
  const paragraph = describe(seed);
  const sceneChars = scenes.reduce((n, s) => n + s.length + 2, 0);
  const fill: string[] = [];
  for (let n = sceneChars; n < CHAPTER_CHARS; n += fill[fill.length - 1].length + 2) fill.push(paragraph());
  const perGap = Math.ceil(fill.length / scenes.length);
  return scenes.flatMap((scene, i) => [scene, ...fill.slice(i * perGap, (i + 1) * perGap)]).join('\n\n');
}

export const BENCH_CHAPTERS: EditorChapter[] = SCENES.map((c, i) => ({ id: c.id, title: c.title, content: chapterText(c.scenes, i + 1) }));
export const chapterById = (id: string) => BENCH_CHAPTERS.find(c => c.id === id)!;
/** A scene of a chapter, word for word, for selections. */
export const scene = (id: string, index: number) => SCENES.find(c => c.id === id)!.scenes[index];

export const BENCH_FOLIOS: EditorFolio[] = [
  { title: 'Characters', notes: [
    { title: 'Lia Marsh - 17', content: '- Younger sister of Sky\n- Knows the lower bridges of Harwood\n- ? Why does she never look away' },
    { title: 'Sky Marsh - 19', content: "- Harwood's scout, carries a glowlamp\n- Hasn't seen their mother in nine years" },
    { title: 'Kai Thorne', content: '- Mapmaker of the Glass Hollows\n- Taps the table twice before he speaks' },
    { title: 'Mara Vey', content: '- Healer from the eastern villages\n- Keeps the amulet' },
  ] },
  { title: 'Places', notes: [
    { title: 'Harwood', content: '- Treetop village of rope bridges\n- The mines lie beneath it' },
    { title: 'The Glass Hollows', content: '- Caves turning to glass from the inside out' },
    { title: 'Clearwell', content: "- Coastal city of white stone\n- Vic's safe house is near the harbour" },
  ] },
  { title: 'Lore', notes: [
    { title: 'The amulet', content: '- Green glass bound in silver wire\n- Warms when the Hollows wake' },
  ] },
];

// Project memory as the Codex would record it, with exact quotes.
const person = (name: string, aliases: string[] = []): MemoryEntity => ({ name, kind: 'person', aliases, presence: 'onstage' });
const thing = (name: string, kind: MemoryKind): MemoryEntity => ({ name, kind, aliases: [], presence: 'onstage' });
let keys = 0;
function fact(subject: string, kind: MemoryKind, statement: string, quote: string,
  extra: { basis?: MemoryClaim['basis']; time?: MemoryTime; relations?: MemoryRelation[] } = {}): MemoryClaim {
  keys += 1;
  return { key: keys.toString(16).padStart(64, '0'), subject, kind, aliases: [], statement, quote, basis: extra.basis ?? 'stated',
    scope: '', related: (extra.relations || []).map(r => r.target), time: extra.time ?? 'scene', relations: extra.relations };
}

const MEMORY: Record<string, { entities: MemoryEntity[]; claims: MemoryClaim[] }> = {
  'ch-1': {
    entities: [person('Lia Marsh', ['Lia']), person('Sky Marsh', ['Sky']), thing('Harwood', 'place'), thing('Harwood mines', 'place')],
    claims: [
      fact('Harwood', 'place', 'Harwood is a village of rope bridges and platforms in the forest canopy.', 'Harwood hung in the canopy like a second sky, a village of rope bridges and lantern-lit platforms strung between the great trees.', { time: 'ongoing' }),
      fact('Lia Marsh', 'person', 'Lia is seventeen and has lived in Harwood all her life.', 'Lia Marsh had lived there all seventeen years of her life', { time: 'ongoing' }),
      fact('Lia Marsh', 'person', 'Lia has green eyes and never looks away from anyone.', "Lia's eyes were green as moss after rain, and she never looked away from anyone", { time: 'ongoing' }),
      fact('Sky Marsh', 'person', "Sky is Harwood's scout and Lia's older sister by two years.", 'Sky Marsh was the village scout, two years older than Lia and twice as stubborn.', { time: 'ongoing', relations: [{ target: 'Lia Marsh', type: 'family' }] }),
    ],
  },
  'ch-2': {
    entities: [person('Kai Thorne', ['Kai']), person('Sky Marsh', ['Sky']), person('Lia Marsh', ['Lia']), thing('Glass Hollows', 'place')],
    claims: [
      fact('Kai Thorne', 'person', 'Kai turned twenty-three that spring.', 'Kai had turned twenty-three that spring'),
      fact('Kai Thorne', 'person', 'Kai has spent four years mapping the Glass Hollows.', 'he had spent four of those years mapping the caves the miners called the Glass Hollows', { time: 'past' }),
      fact('Glass Hollows', 'place', 'The walls of the Glass Hollows are turning to glass, threatening Harwood.', 'The walls are turning to glass from the inside out. If it reaches the roots, Harwood falls.'),
    ],
  },
  'ch-3': {
    entities: [person('Mara Vey', ['Mara']), thing("Mara's amulet", 'object'), thing('Glass Hollows', 'place'), person('Lia Marsh', ['Lia'])],
    claims: [
      fact('Mara Vey', 'person', 'Mara is a healer from the eastern villages.', 'The healer had come down from the eastern villages with her bag of herbs', { time: 'ongoing' }),
      fact("Mara's amulet", 'object', "Mara's amulet is a disc of green glass bound in silver wire that warms when the Hollows wake.", 'an amulet: a disc of green glass bound in silver wire', { relations: [{ target: 'Mara Vey', type: 'related' }] }),
      fact('Glass Hollows', 'place', "The Hollows' deepest chamber has clear glass walls with animals frozen inside.", 'In the deepest chamber the walls were clear as water'),
    ],
  },
  'ch-4': {
    entities: [person('Kai Thorne', ['Kai']), person('Sky Marsh', ['Sky']), thing('The battle at the roots', 'event')],
    claims: [
      fact('Kai Thorne', 'person', 'Kai loses his left eye in the battle at the roots.', 'Kai lost his left eye in the battle at the roots', { relations: [{ target: 'The battle at the roots', type: 'participates' }] }),
      fact('Sky Marsh', 'person', 'Sky is cut deeply along her forearm in the battle.', 'Sky was hurt too, a deep cut along her forearm'),
      fact('The battle at the roots', 'event', 'Glass creatures attack Harwood; eleven villagers die.', 'At sunrise the village counted its dead. Eleven names.'),
    ],
  },
  'ch-5': {
    entities: [person('Vic'), thing("Vic's safe house", 'place'), thing('Clearwell', 'place'), person('Mara Vey', ['Mara']), person('Ada Marsh', ['Ada'])],
    claims: [
      fact("Vic's safe house", 'place', "Vic's safe house is above a chandler's shop near Clearwell's harbour.", "They stayed at Vic's safe house, a narrow building above a chandler's shop near the harbour.", { relations: [{ target: 'Clearwell', type: 'located_in' }] }),
      fact('Vic', 'person', 'Vic is a smuggler who owes the Harwood council a favour.', 'Vic was a smuggler who owed the council a favour', { time: 'ongoing' }),
      fact('Mara Vey', 'person', 'Mara believes Kai is dead.', 'she believed Kai was dead', { basis: 'reported' }),
      fact('Ada Marsh', 'person', "Ada Marsh, the sisters' mother, lives in Clearwell.", 'Their mother, Ada Marsh, lived somewhere in Clearwell', { time: 'ongoing', relations: [{ target: 'Clearwell', type: 'at' }] }),
    ],
  },
  'ch-6': {
    entities: [person('Lia Marsh', ['Lia']), person('Orla'), thing("Mara's amulet", 'object')],
    claims: [
      fact('Lia Marsh', 'person', 'Lia has brown eyes.', 'her brown eyes ringed with dark from too little sleep'),
      fact('Orla', 'person', 'Orla is an old glassworker in Clearwell.', 'The old glassworker, a woman called Orla', { time: 'ongoing' }),
      fact("Mara's amulet", 'object', 'According to Orla, the amulet grew in the Hollows rather than being made.', 'Not by hands. It grew.', { basis: 'reported' }),
    ],
  },
  'ch-7': {
    entities: [person('Kai Thorne', ['Kai']), thing('The raid on the vault', 'event'), person('Vic')],
    claims: [
      fact('Kai Thorne', 'person', 'Kai is twenty-five and already grey at the temples.', 'Kai, twenty-five years old and already grey at the temples'),
      fact('The raid on the vault', 'event', 'In the guild vault, the glass has cracked its crates and spread up the walls.', 'they saw the glass had already cracked its crates and crept halfway up the walls'),
    ],
  },
  'ch-8': {
    entities: [person('Ada Marsh', ['Ada']), person('Kai Thorne', ['Kai']), person('Mara Vey', ['Mara']), thing("Mara's amulet", 'object')],
    claims: [
      fact('Ada Marsh', 'person', 'Ada says the Hollows have run under the coast since the battle.', 'The Hollows run under the coast now.', { basis: 'reported' }),
      fact('Kai Thorne', 'person', 'Kai has a scar over his right eye.', "the scar over Kai's right eye looked almost silver"),
      fact("Mara's amulet", 'object', 'Returned to Mara, the amulet is cold for the first time since spring.', 'it was cold for the first time since spring'),
    ],
  },
};

/** Memory with every chapter read in its current form, except the ids in `stale`. */
export function benchMemory(stale: string[] = []): ProjectMemory {
  return {
    profile: { enabled: true, register: 'literary', genre: 'Fantasy', guidance: '' },
    chapters: BENCH_CHAPTERS.map((chapter, position) => ({
      id: chapter.id, title: chapter.title, position, revision: 'r1', currentRevision: stale.includes(chapter.id) ? 'r2' : 'r1',
      draftId: null, version: 6, writingKind: 'literary', analyzedAt: '2026-10-01', status: 'complete', overrides: {},
      ...MEMORY[chapter.id],
    } satisfies MemoryChapter)),
  };
}
