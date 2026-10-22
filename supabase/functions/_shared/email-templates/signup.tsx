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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  locale?: string
}

const COPY = {
  en: {
    preview: 'Confirm your email and open your StoryMode writing studio',
    heading: 'Confirm your email',
    welcome: 'Welcome to',
    tagline: ', the calm place to write your story and build your world.',
    body: (recipient: string) => (
      <>
        Confirm <strong>{recipient}</strong> and your studio opens with a starter project: chapter
        drafts, folios of notes, an interactive timeline, and a map to draw on.
      </>
    ),
    cta: 'Confirm my email',
    reason:
      "You received this email because this address was used to create a StoryMode account. If that wasn't you, ignore this message and no account will be activated.",
  },
  'pt-BR': {
    preview: 'Confirme seu e-mail e abra seu estúdio de escrita StoryMode',
    heading: 'Confirme seu e-mail',
    welcome: 'Bem-vindo(a) ao',
    tagline: ', o lugar tranquilo para escrever sua história e construir seu mundo.',
    body: (recipient: string) => (
      <>
        Confirme <strong>{recipient}</strong> e seu estúdio abre com um projeto inicial: rascunhos
        de capítulos, fólios de anotações, uma linha do tempo interativa e um mapa para desenhar.
      </>
    ),
    cta: 'Confirmar meu e-mail',
    reason:
      'Você recebeu este e-mail porque este endereço foi usado para criar uma conta no StoryMode. Se não foi você, ignore esta mensagem e nenhuma conta será ativada.',
  },
} as const

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl, locale }: SignupEmailProps) => {
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
              {c.welcome}{' '}
              <Link href={siteUrl} style={link}>
                <strong>{siteName}</strong>
              </Link>
              {c.tagline}
            </Text>
            <Text style={text}>{c.body(recipient)}</Text>
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

export default SignupEmail
