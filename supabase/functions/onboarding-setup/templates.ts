// Starter folios used when the AI can't plan the project. Keys match the
// project types offered in the waitlist chat (src/lib/waitlist-flow.ts).

export type Lang = "en" | "pt-BR";

export interface NotebookPlan {
  title: string;
  icon: string;
  content: string;
}

export interface FolioPlan {
  title: string;
  icon: string;
  notebooks: NotebookPlan[];
}

type Localized = Record<Lang, string>;
type TemplateNotebook = { title: Localized; icon: string; content: Localized };
type TemplateFolio = { title: Localized; icon: string; notebooks: TemplateNotebook[] };

const nb = (icon: string, title: Localized, content: Localized): TemplateNotebook => ({ icon, title, content });
const folio = (icon: string, title: Localized, notebooks: TemplateNotebook[]): TemplateFolio => ({ icon, title, notebooks });

const CHARACTERS = folio("👤", { en: "Characters", "pt-BR": "Personagens" }, [
  nb("🌟", { en: "Protagonist", "pt-BR": "Protagonista" }, {
    en: "- Who are they?\n- What do they want more than anything?\n- What stands in their way?",
    "pt-BR": "- Quem é essa pessoa?\n- O que ela mais deseja?\n- O que está no caminho dela?",
  }),
  nb("🗡️", { en: "Antagonist", "pt-BR": "Antagonista" }, {
    en: "- What do they want?\n- Why do they believe they're right?\n- What would make them stop?",
    "pt-BR": "- O que essa pessoa quer?\n- Por que acredita estar certa?\n- O que a faria parar?",
  }),
]);

const SETTING = folio("🗺️", { en: "Locations", "pt-BR": "Lugares" }, [
  nb("🏠", { en: "Main setting", "pt-BR": "Cenário principal" }, {
    en: "- What does it look, sound and smell like?\n- Who lives here, and who holds power?\n- What secret does this place keep?",
    "pt-BR": "- Como é a aparência, o som e o cheiro deste lugar?\n- Quem vive aqui e quem tem o poder?\n- Que segredo este lugar guarda?",
  }),
]);

const STORY_SPINE = nb("🧭", { en: "Story spine", "pt-BR": "Espinha da história" }, {
  en: "- Opening image:\n- Inciting incident:\n- Midpoint twist:\n- Climax:\n- Final image:",
  "pt-BR": "- Imagem de abertura:\n- Incidente incitante:\n- Virada do meio:\n- Clímax:\n- Imagem final:",
});

const LOOSE_IDEAS = nb("✨", { en: "Loose ideas", "pt-BR": "Ideias soltas" }, {
  en: "- Scenes, lines and what-ifs you don't want to lose.",
  "pt-BR": "- Cenas, falas e e-ses que você não quer perder.",
});

const IDEAS = folio("💡", { en: "Plot & ideas", "pt-BR": "Trama e ideias" }, [STORY_SPINE, LOOSE_IDEAS]);

const TEMPLATES: Record<string, TemplateFolio[]> = {
  novel: [CHARACTERS, SETTING, IDEAS],
  short_stories: [
    CHARACTERS,
    folio("📚", { en: "Stories", "pt-BR": "Contos" }, [
      nb("📝", { en: "First story", "pt-BR": "Primeiro conto" }, {
        en: "- Premise in one line:\n- Whose story is it?\n- The moment everything turns:",
        "pt-BR": "- A premissa em uma linha:\n- De quem é a história?\n- O momento em que tudo vira:",
      }),
    ]),
    folio("💡", { en: "Ideas", "pt-BR": "Ideias" }, [LOOSE_IDEAS]),
  ],
  rpg: [
    folio("🎭", { en: "NPCs", "pt-BR": "NPCs" }, [
      nb("🧙", { en: "Key NPC", "pt-BR": "NPC principal" }, {
        en: "- Name and look:\n- What they want from the party:\n- Their secret:",
        "pt-BR": "- Nome e aparência:\n- O que quer do grupo:\n- O segredo:",
      }),
    ]),
    folio("🏰", { en: "Locations", "pt-BR": "Lugares" }, [
      nb("🏘️", { en: "Starting town", "pt-BR": "Cidade inicial" }, {
        en: "- First impression:\n- Who's in charge:\n- Rumours the party can overhear:",
        "pt-BR": "- Primeira impressão:\n- Quem manda:\n- Boatos que o grupo pode ouvir:",
      }),
    ]),
    folio("🎲", { en: "Sessions", "pt-BR": "Sessões" }, [
      nb("1️⃣", { en: "Session 1", "pt-BR": "Sessão 1" }, {
        en: "- Goal:\n- Hooks:\n- Encounters:\n- Loot and rewards:\n- Notes after play:",
        "pt-BR": "- Objetivo:\n- Ganchos:\n- Encontros:\n- Tesouros e recompensas:\n- Notas pós-sessão:",
      }),
    ]),
  ],
  screenplay: [
    CHARACTERS,
    folio("🎬", { en: "Scenes", "pt-BR": "Cenas" }, [
      nb("🎞️", { en: "Opening scene", "pt-BR": "Cena de abertura" }, {
        en: "- INT./EXT.:\n- What changes in this scene?\n- Key line:",
        "pt-BR": "- INT./EXT.:\n- O que muda nesta cena?\n- Fala-chave:",
      }),
    ]),
    SETTING,
  ],
  comic: [
    folio("👤", { en: "Characters", "pt-BR": "Personagens" }, [
      nb("🦸", { en: "Lead", "pt-BR": "Protagonista" }, {
        en: "- Silhouette and colours:\n- Signature expression:\n- Wants and fears:",
        "pt-BR": "- Silhueta e cores:\n- Expressão marcante:\n- Desejos e medos:",
      }),
    ]),
    folio("🏙️", { en: "Settings", "pt-BR": "Cenários" }, SETTING.notebooks),
    folio("💭", { en: "Story arcs", "pt-BR": "Arcos" }, [
      nb("📖", { en: "Issue 1", "pt-BR": "Edição 1" }, {
        en: "- Hook page:\n- Big panel moment:\n- Cliffhanger:",
        "pt-BR": "- Página de gancho:\n- Momento do quadro grande:\n- Gancho final:",
      }),
    ]),
  ],
  game: [
    folio("👤", { en: "Characters", "pt-BR": "Personagens" }, [
      nb("🎮", { en: "Player character", "pt-BR": "Personagem jogável" }, {
        en: "- Who the player becomes:\n- What they can do that others can't:\n- What they stand to lose:",
        "pt-BR": "- Quem o jogador se torna:\n- O que só essa personagem consegue fazer:\n- O que ela pode perder:",
      }),
    ]),
    folio("🗺️", { en: "Locations", "pt-BR": "Lugares" }, [
      nb("🚪", { en: "First area", "pt-BR": "Primeira área" }, SETTING.notebooks[0].content),
    ]),
    folio("🔀", { en: "Branches & choices", "pt-BR": "Ramificações e escolhas" }, [
      nb("⚖️", { en: "Key choice", "pt-BR": "Escolha-chave" }, {
        en: "- The choice:\n- Path A leads to:\n- Path B leads to:",
        "pt-BR": "- A escolha:\n- O caminho A leva a:\n- O caminho B leva a:",
      }),
    ]),
  ],
  worldbuilding: [
    folio("🗺️", { en: "Places", "pt-BR": "Lugares" }, [
      nb("🌍", { en: "Heart of the world", "pt-BR": "Coração do mundo" }, SETTING.notebooks[0].content),
    ]),
    folio("⚔️", { en: "Peoples & factions", "pt-BR": "Povos e facções" }, [
      nb("🏳️", { en: "First faction", "pt-BR": "Primeira facção" }, {
        en: "- Beliefs:\n- Allies and enemies:\n- What they would never do:",
        "pt-BR": "- Crenças:\n- Aliados e inimigos:\n- O que jamais fariam:",
      }),
    ]),
    folio("📜", { en: "History & lore", "pt-BR": "História e lore" }, [
      nb("🌅", { en: "Origin story", "pt-BR": "Mito de origem" }, {
        en: "- How did this world begin, according to its people?\n- What really happened?",
        "pt-BR": "- Como este mundo começou, segundo seus povos?\n- O que realmente aconteceu?",
      }),
      nb("⏳", { en: "Timeline", "pt-BR": "Linha do tempo" }, {
        en: "- Ancient age:\n- The turning point:\n- Present day:",
        "pt-BR": "- Era antiga:\n- O ponto de virada:\n- Dias atuais:",
      }),
    ]),
  ],
  fanfic: [
    CHARACTERS,
    folio("📚", { en: "Canon notes", "pt-BR": "Notas do cânone" }, [
      nb("🔖", { en: "What I'm keeping and changing", "pt-BR": "O que mantenho e o que mudo" }, {
        en: "- Where in canon this starts:\n- What I keep:\n- What I change:",
        "pt-BR": "- Onde no cânone isso começa:\n- O que mantenho:\n- O que mudo:",
      }),
    ]),
    IDEAS,
  ],
  nonfiction: [
    folio("👥", { en: "People", "pt-BR": "Pessoas" }, [
      nb("🙂", { en: "Key person", "pt-BR": "Pessoa-chave" }, {
        en: "- Who they are to you:\n- A moment that defines them:\n- What you want readers to understand about them:",
        "pt-BR": "- Quem essa pessoa é para você:\n- Um momento que a define:\n- O que você quer que os leitores entendam sobre ela:",
      }),
    ]),
    folio("🕰️", { en: "Places & eras", "pt-BR": "Lugares e épocas" }, [
      nb("⏳", { en: "Timeline", "pt-BR": "Linha do tempo" }, {
        en: "- Where it begins:\n- The turning points:\n- Where it ends:",
        "pt-BR": "- Onde começa:\n- Os pontos de virada:\n- Onde termina:",
      }),
    ]),
    folio("💡", { en: "Themes & ideas", "pt-BR": "Temas e ideias" }, [
      nb("🎯", { en: "What this is really about", "pt-BR": "Sobre o que isso realmente é" }, {
        en: "- The question at the heart of the book:\n- What you hope readers take away:",
        "pt-BR": "- A pergunta no coração do livro:\n- O que você espera que os leitores levem:",
      }),
    ]),
  ],
};

const DEFAULT_TEMPLATE: TemplateFolio[] = [CHARACTERS, SETTING, IDEAS];

const PROJECT_ICONS: Record<string, string> = {
  novel: "📖",
  short_stories: "📚",
  rpg: "🎲",
  screenplay: "🎬",
  comic: "💥",
  game: "🎮",
  worldbuilding: "🌍",
  fanfic: "✨",
  nonfiction: "📝",
};

/** Icon for a new project when the AI hasn't picked one from its title and subject. */
export function fallbackProjectIcon(projectKey: string | null): string {
  return (projectKey && PROJECT_ICONS[projectKey]) || "✍️";
}

export function fallbackFolios(projectKey: string | null, lang: Lang): FolioPlan[] {
  const template = (projectKey && TEMPLATES[projectKey]) || DEFAULT_TEMPLATE;
  return template.map((f) => ({
    title: f.title[lang],
    icon: f.icon,
    notebooks: f.notebooks.map((n) => ({ title: n.title[lang], icon: n.icon, content: n.content[lang] })),
  }));
}
