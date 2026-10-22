/**
 * Returns a directive line to append to AI system prompts so the model
 * replies in the project's configured language. Brand names, character
 * names, and code stay in their original form.
 *
 * Pass `context` to get tailored wording for specific use cases:
 *   "story-chat"    — includes Try:/Could be: → Tente:/Poderia ser: prefix instruction
 *   "flavor-poem"   — instructs the model to write the poem in pt-BR with pt-BR examples
 *   "review"        — emphasises that JSON field values must be in pt-BR
 */
export function languageDirective(
  aiLanguage: string | undefined | null,
  context?: "story-chat" | "flavor-poem" | "review",
): string {
  if (aiLanguage !== "pt-BR") {
    // Explicit directive for English too: without it, a conversation that
    // started in another language (or a chapter written in one) makes the
    // model keep replying in that language.
    if (context === "flavor-poem") {
      return `\n\n## Language\nWrite both lines of the poem entirely in English, regardless of the language used earlier in this conversation.`;
    }
    if (context === "review") {
      return `\n\n## Language\nWrite the ENTIRE JSON response (every "critique", "label", "rationale" and "rewrite" value) in English, regardless of the language used earlier in this conversation.`;
    }
    return `\n\n## Language\nWrite your ENTIRE response — including [status] lines, section headings, labels, and body text — in English. This is mandatory even if earlier messages in this conversation, the chapter, or the author's notes are in another language. Quote the author's passages verbatim in their original language, and use the prefixes "Try:" / "Could be:" for rewrite options.`;
  }


  if (context === "flavor-poem") {
    return `\n\n## Idioma\nEscreva as duas linhas do poema INTEIRAMENTE em português brasileiro (pt-BR). Todos os exemplos acima são apenas para ilustrar o formato — a resposta real deve ser em português. Exemplo de resposta para "draw a castle": "Erguendo as muralhas de pedra da torre\nEnchendo o fosso com água escura"`;
  }

  if (context === "review") {
    return `\n\n## Idioma\nEscreva TODA a resposta JSON (campos "critique", "label" e "rationale" de cada sugestão, e o campo "rewrite") inteiramente em português brasileiro (pt-BR). Não escreva nada em inglês exceto nomes próprios de personagens/lugares cunhados pelo autor e termos de código.`;
  }

  if (context === "story-chat") {
    return `\n\n## Idioma\nEscreva TODA a sua resposta — incluindo as linhas [status], os títulos de seção e o corpo da resposta — inteiramente em português brasileiro (pt-BR). Isso é obrigatório. Não escreva nada em inglês exceto: nomes próprios de personagens e lugares cunhados pelo autor, marcas registradas e trechos de código. Quando oferecer alternativas de reescrita, use SEMPRE os prefixos "Tente:" ou "Poderia ser:" (em vez de "Try:" / "Could be:"). Cite as passagens do capítulo no idioma original do autor.`;
  }

  // Default / generic directive
  return `\n\n## Language\nEscreva TODA a sua resposta em português brasileiro (pt-BR). Mantenha nomes próprios de personagens, lugares, termos cunhados pelo autor, marcas e trechos de código exatamente como foram escritos. Cite as passagens do capítulo no idioma original do autor.`;
}
