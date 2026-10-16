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

interface EmailChangeEmailProps {
  siteName: string
  siteUrl: string
  oldEmail?: string
  newEmail?: string
  confirmationUrl: string
  locale?: string
}

const COPY = {
  en: {
    preview: 'Confirm the new email address for your StoryMode account',
    heading: 'Confirm your new email',
    lead: 'A request was made to change the email address on your',
    account: 'account',
    from: 'from',
    to: 'to',
    body: 'Confirm the change below so sign-in links and account notices reach the right inbox.',
    cta: 'Confirm new email',
    reason:
      "You received this email because an email change was requested on a StoryMode account. If that wasn't you, ignore this message and the address stays unchanged.",
  },
  'pt-BR': {
    preview: 'Confirme o novo endereço de e-mail da sua conta StoryMode',
    heading: 'Confirme seu novo e-mail',
    lead: 'Foi solicitada a alteração do endereço de e-mail da sua conta no',
    account: '',
    from: 'de',
    to: 'para',
    body: 'Confirme a alteração abaixo para que links de acesso e avisos da conta cheguem à caixa de entrada certa.',
    cta: 'Confirmar novo e-mail',
    reason:
      'Você recebeu este e-mail porque foi solicitada a troca de endereço em uma conta StoryMode. Se não foi você, ignore esta mensagem e o endereço permanece o mesmo.',
  },
} as const

export const EmailChangeEmail = ({ siteName, siteUrl, oldEmail, newEmail, confirmationUrl, locale }: EmailChangeEmailProps) => {
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
              </Link>
              {c.account ? <> {c.account}</> : null}
              {oldEmail ? (
                <>
                  {' '}
                  {c.from} <strong>{oldEmail}</strong>
                </>
              ) : null}
              {newEmail ? (
                <>
                  {' '}
                  {c.to} <strong>{newEmail}</strong>
                </>
              ) : null}
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

export default EmailChangeEmail
