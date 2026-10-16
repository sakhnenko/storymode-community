/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Img, Link, Section, Text } from 'npm:@react-email/components@0.0.22'

export { Section }

export const SITE_URL = 'https://storymode.waldenpond.net'
export const LOGO_URL = `${SITE_URL}/favicon.png`

const BRAND = '#e32d5b'
const INK = '#1a1110'

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', -apple-system, Segoe UI, Arial, sans-serif",
  margin: '0',
  padding: '0',
}
export const container = { maxWidth: '600px', padding: '0', margin: '0 auto' }
export const card = { backgroundColor: '#fafafa', padding: '40px 36px 36px' }

export const h1 = { fontSize: '30px', fontWeight: 700, color: INK, margin: '0 0 24px', lineHeight: '1.2' }
export const text = { fontSize: '16px', color: '#475569', lineHeight: '1.65', margin: '0 0 18px' }
export const link = { color: BRAND, textDecoration: 'none', fontWeight: 500 }
export const button = {
  backgroundColor: BRAND,
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  borderRadius: '8px',
  padding: '16px 30px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '10px 0 8px',
}
export const smallText = { fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', margin: '0 0 12px' }
export const codeStyle = {
  fontSize: '30px',
  letterSpacing: '0.3em',
  fontWeight: 700,
  color: INK,
  margin: '0 0 24px',
}

const headerBar = { backgroundColor: INK, padding: '22px 36px' }
const wordmark = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '30px',
  color: '#ffffff',
  fontWeight: 400,
  margin: '0',
  verticalAlign: 'middle' as const,
}

/** Dark brand bar with the bookmark logo and Storymode wordmark. */
export const Wordmark = () => (
  <Section style={headerBar}>
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td style={{ paddingRight: '14px', verticalAlign: 'middle' }}>
            <Img src={LOGO_URL} width="34" height="34" alt="StoryMode" style={{ display: 'block' }} />
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <span style={wordmark}>
              Story<em>mode</em>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </Section>
)

const footerBar = { backgroundColor: INK, padding: '24px 36px' }
const footerText = { fontSize: '13px', color: '#a8a29e', lineHeight: '1.6', margin: '0 0 8px' }

/**
 * Shared footer: states why the message was received, repeats the action link
 * as plain text (some clients strip buttons), and identifies the sender.
 */
export const Footer = ({
  reason,
  actionUrl,
  siteUrl = SITE_URL,
  locale,

}: {
  reason: string
  actionUrl?: string
  siteUrl?: string
  locale?: string
}) => (
  <Section style={footerBar}>
    <Text style={footerText}>{reason}</Text>
    {actionUrl ? (
      <Text style={footerText}>
        {locale === 'pt-BR'
          ? 'Se o botão não funcionar, copie e cole este link no seu navegador:'
          : 'If the button does not work, copy and paste this link into your browser:'}
        <br />
        <Link href={actionUrl} style={{ color: BRAND, wordBreak: 'break-all' as const }}>
          {actionUrl}
        </Link>
      </Text>
    ) : null}
    <Text style={footerText}>
      {locale === 'pt-BR'
        ? 'StoryMode — um estúdio de escrita para romances, não-ficção, roteiros e campanhas.'
        : 'StoryMode — a writing studio for novels, non-fiction, scripts, and campaigns.'}
      <br />
      <Link href={siteUrl} style={{ color: BRAND }}>
        {siteUrl.replace('https://', '')}
      </Link>{' '}
      · Paraty, RJ, Brazil
    </Text>
  </Section>
)

