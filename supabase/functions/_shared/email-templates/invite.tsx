/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { Footer, Wordmark, button, card, container, h1, link, main, text, Section } from './brand.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  locale?: string
}

const COPY = {
  en: {
    preview: "Your StoryMode invitation is here — let's start writing",
    heading: "You're invited to StoryMode",
    intro: 'An admin at',
    introEnd: 'has invited you to join.',
    about:
      'StoryMode is a writing studio for novels, non-fiction, scripts, and campaigns: chapter drafts with an AI editor beside you, folios full of notes, interactive timelines, and maps that come to life as your world grows.',
    finish: "Your first project is one click away. We'll set it up together.",
    cta: 'Start writing',
    reason:
      "You received this email because a StoryMode admin invited this address to join. If you weren't expecting it, ignore this message and no account will be created.",
  },
  'pt-BR': {
    preview: 'Seu convite para o StoryMode chegou — vamos começar a escrever',
    heading: 'Você foi convidado(a) para o StoryMode',
    intro: 'Um administrador do',
    introEnd: 'convidou você para participar.',
    about:
      'O StoryMode é um estúdio de escrita para romances, não-ficção, roteiros e campanhas: rascunhos de capítulos com um editor de IA ao seu lado, fólios cheios de anotações, linhas do tempo interativas e mapas que ganham vida conforme seu mundo cresce.',
    finish: 'Seu primeiro projeto está a um clique de distância. Vamos montá-lo juntos.',
    cta: 'Começar a escrever',
    reason:
      'Você recebeu este e-mail porque um administrador do StoryMode convidou este endereço. Se não estava esperando, ignore esta mensagem e nenhuma conta será criada.',
  },
} as const

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl, locale }: InviteEmailProps) => {
  const lang = locale === 'pt-BR' ? 'pt-BR' : 'en'
  const c = COPY[lang]
  return (
    <Html lang={lang} dir="ltr">
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Wordmark />
          <Section style={card}>
            <Heading style={h1}>{c.heading}</Heading>
            <Text style={text}>
              {c.intro}{' '}
              <Link href={siteUrl} style={link}>
                <strong>{siteName}</strong>
              </Link>{' '}
              {c.introEnd}
            </Text>
            <Text style={text}>{c.about}</Text>
            <Text style={text}>{c.finish}</Text>
            <Button style={button} href={confirmationUrl}>
              {c.cta}
            </Button>
          </Section>
          <Footer reason={c.reason} actionUrl={confirmationUrl} siteUrl={siteUrl} locale={lang} />
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail
