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

interface MagicLinkEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  locale?: string
}

const COPY = {
  en: {
    preview: 'Your single-use sign-in link for StoryMode',
    heading: 'Sign in to StoryMode',
    body: (recipient: string) => (
      <>
        as <strong>{recipient}</strong> and pick up your chapters, timelines, and maps where you
        left them.
      </>
    ),
    lead: 'Use the button below to sign in to',
    expiry: 'This link works once and expires shortly for your security.',
    cta: 'Sign in to StoryMode',
    reason:
      "You received this email because a sign-in link was requested for this address on StoryMode. If that wasn't you, ignore this message — nobody can sign in without this link.",
  },
  'pt-BR': {
    preview: 'Seu link de acesso único para o StoryMode',
    heading: 'Entrar no StoryMode',
    body: (recipient: string) => (
      <>
        como <strong>{recipient}</strong> e retomar seus capítulos, linhas do tempo e mapas de onde
        parou.
      </>
    ),
    lead: 'Use o botão abaixo para entrar no',
    expiry: 'Este link funciona uma única vez e expira em breve, por segurança.',
    cta: 'Entrar no StoryMode',
    reason:
      'Você recebeu este e-mail porque um link de acesso foi solicitado para este endereço no StoryMode. Se não foi você, ignore esta mensagem — ninguém consegue entrar sem este link.',
  },
} as const

export const MagicLinkEmail = ({ siteName, siteUrl, recipient, confirmationUrl, locale }: MagicLinkEmailProps) => {
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
              {c.lead}{' '}
              <Link href={siteUrl} style={link}>
                <strong>{siteName}</strong>
              </Link>{' '}
              {c.body(recipient)}
            </Text>
            <Text style={text}>{c.expiry}</Text>
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

export default MagicLinkEmail
