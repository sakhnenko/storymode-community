/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { Footer, Wordmark, card, container, h1, link, main, text, codeStyle, Section } from './brand.tsx'

interface ReauthenticationEmailProps {
  siteName: string
  siteUrl: string
  token: string
  locale?: string
}

const COPY = {
  en: {
    preview: 'Your StoryMode verification code',
    heading: 'Your verification code',
    lead: 'Enter this code in',
    leadEnd: "to confirm it's you before completing a sensitive account change.",
    expiry: 'The code expires shortly. Never share it with anyone.',
    reason:
      "You received this email because a verification code was requested on your StoryMode account. If that wasn't you, ignore this message and consider changing your password.",
  },
  'pt-BR': {
    preview: 'Seu código de verificação do StoryMode',
    heading: 'Seu código de verificação',
    lead: 'Digite este código no',
    leadEnd: 'para confirmar que é você antes de concluir uma alteração sensível na conta.',
    expiry: 'O código expira em breve. Nunca o compartilhe com ninguém.',
    reason:
      'Você recebeu este e-mail porque um código de verificação foi solicitado na sua conta StoryMode. Se não foi você, ignore esta mensagem e considere trocar sua senha.',
  },
} as const

export const ReauthenticationEmail = ({ siteName, siteUrl, token, locale }: ReauthenticationEmailProps) => {
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
              {c.leadEnd}
            </Text>
            <Text style={codeStyle}>{token}</Text>
            <Text style={text}>{c.expiry}</Text>
          </Section>
          <Footer reason={c.reason} siteUrl={siteUrl} locale={lang} />
        </Container>
      </Body>
    </Html>
  )
}

export default ReauthenticationEmail
