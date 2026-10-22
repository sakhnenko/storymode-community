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

interface RecoveryEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  locale?: string
}

const COPY = {
  en: {
    preview: 'Choose a new password for your StoryMode account',
    heading: 'Reset your password',
    lead: (recipient: string) => (
      <>
        We received a request to reset the password for <strong>{recipient}</strong> on{' '}
      </>
    ),
    body: 'Choose a new password below and your stories, folios, timelines, and maps stay exactly as you left them. The link expires shortly.',
    cta: 'Choose a new password',
    reason:
      "You received this email because a password reset was requested for this address on StoryMode. If that wasn't you, ignore this message and your password stays unchanged.",
  },
  'pt-BR': {
    preview: 'Escolha uma nova senha para sua conta StoryMode',
    heading: 'Redefinir sua senha',
    lead: (recipient: string) => (
      <>
        Recebemos um pedido para redefinir a senha de <strong>{recipient}</strong> no{' '}
      </>
    ),
    body: 'Escolha uma nova senha abaixo — suas histórias, fólios, linhas do tempo e mapas continuam exatamente como você deixou. O link expira em breve.',
    cta: 'Escolher nova senha',
    reason:
      'Você recebeu este e-mail porque uma redefinição de senha foi solicitada para este endereço no StoryMode. Se não foi você, ignore esta mensagem e sua senha permanece a mesma.',
  },
} as const

export const RecoveryEmail = ({ siteName, siteUrl, recipient, confirmationUrl, locale }: RecoveryEmailProps) => {
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
              {c.lead(recipient)}
              <Link href={siteUrl} style={link}>
                <strong>{siteName}</strong>
              </Link>
              .
            </Text>
            <Text style={text}>{c.body}</Text>
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

export default RecoveryEmail
