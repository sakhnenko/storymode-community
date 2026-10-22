<div align="center">

<img src="public/logo.png" alt="" width="72">

# Story<i>Mode</i>

<sub><code>community edition</code></sub>

**A calm place to write your story.**

[![License: FSL-1.1-ALv2](https://img.shields.io/badge/license-FSL--1.1--ALv2-c2410c)](LICENSE.md)
[![Self-hosted on Supabase and Vercel](https://img.shields.io/badge/self--hosted-Supabase%20%2B%20Vercel-3ecf8e)](#how-to-set-it-up)
[![AI through OpenRouter](https://img.shields.io/badge/AI-OpenRouter-6366f1)](https://openrouter.ai)
[![Node 18+](https://img.shields.io/badge/node-18%2B-339933)](https://nodejs.org)

<br>

<a href="https://www.youtube.com/watch?v=dl9jcZfYyHI">
  <img src=".github/screenshots/video.webp" alt="Watch on YouTube: StoryMode (Community Edition): Run Your Own AI Writing Studio in 10 Minutes" width="720">
</a>

<sub>▶️ <a href="https://www.youtube.com/watch?v=dl9jcZfYyHI">Watch the 10-minute setup on YouTube</a></sub>

</div>

This is the community edition of [StoryMode](https://storymode.waldenpond.net),
for running your own copy with your own AI key. It's free for you to host. The
[hosted version](https://storymode.waldenpond.net) is there if you'd rather not.

## What you get

<table>
  <tr>
    <td width="33%" valign="top">✍️ <b>Chapters and drafts</b><br>Write in a quiet editor. Keep several drafts of each chapter and export them.</td>
    <td width="33%" valign="top">🤖 <b>AI Editor</b><br>Ask about your chapter in the margin, with Fast, Thoughtful or Creative answers.</td>
    <td width="33%" valign="top">🗂️ <b>Folios</b><br>Boards of notebooks for characters, places, factions and events, linked to your chapters.</td>
  </tr>
  <tr>
    <td width="33%" valign="top">🗺️ <b>Maps</b><br>Paint the terrain of your world and pin notebooks where things happen.</td>
    <td width="33%" valign="top">🎨 <b>AI Draw</b><br>Describe a place and get an illustrated sticker for your map.</td>
    <td width="33%" valign="top">⏳ <b>Timelines</b><br>Lay out what happens when.</td>
  </tr>
  <tr>
    <td width="33%" valign="top">📖 <b>Codex</b><br>A reference for your world that keeps up with what you write.</td>
    <td width="33%" valign="top">📷 <b>Scan pages</b><br>Take a photo of a page of notes and get the text in a notebook.</td>
    <td width="33%" valign="top">🕵️ <b>An example to explore</b><br>Every new account starts with <i>A Study in Scarlet</i>, including a map of London.</td>
  </tr>
</table>

## How to set it up

You'll need [Node.js 18 or newer](https://nodejs.org).

1. **Get your accounts and keys ready.** Supabase and Vercel are free. On
   OpenRouter, buy a little credit first. The setup opens these pages for you,
   but here's where each one is:

   | What | Where |
   |---|---|
   | Supabase project | [database.new](https://database.new). Supabase asks you to create an organization first if you don't have one; Free is fine. Keep the **database password** you set. |
   | Supabase access token | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens): your organization, **7 days**, **Full access**. Only setup and updates use it; revoke it afterwards if you like. |
   | Vercel account | [vercel.com/signup](https://vercel.com/signup). No key needed: the setup signs you in through your browser. |
   | OpenRouter credit | [Settings → Credits](https://openrouter.ai/settings/credits). Buy some even if you'll use your own OpenAI / Anthropic / Google key ([Settings → Integrations](https://openrouter.ai/settings/integrations)): OpenRouter's free plan can't use your own keys. Once you've bought credit, your own keys cost nothing extra for the first $25,000 a month. |
   | OpenRouter key | [Settings → Keys](https://openrouter.ai/settings/keys) → **Create Key**, with **no expiration** (StoryMode uses it for every AI request). Starts with `sk-or-`. A monthly credit limit on it is a good idea. |
   | Resend key *(only for open sign-ups)* | [resend.com/api-keys](https://resend.com/api-keys). To email anyone, verify a domain under [Domains](https://resend.com/domains) first. |

2. **Download StoryMode and start the setup.**
   ```sh
   git clone https://github.com/sakhnenko/storymode-community.git storymode
   cd storymode
   npm run setup
   ```
3. **Answer the setup's questions.** It checks each key as you paste it, sets
   up the database and puts your site on Vercel. It never saves your keys.
4. **Choose who can sign up.** Pick just you, people you add, or anyone. Only
   the last one needs [Resend](https://resend.com) to send emails.
5. **Open your site and sign up.** The first account becomes the admin. If you
   chose *Just me*, use the email you sign in to supabase.com with.

To update later, run `npm run setup` again and choose **Update to the latest version**.

Stuck? The [setup guide](GUIDE.md) explains each step and has fixes for common problems.

## Where to get help

[Report a bug](https://github.com/sakhnenko/storymode-community/issues/new?template=bug_report.yml),
or ask questions and share ideas in [Discussions](https://github.com/sakhnenko/storymode-community/discussions).
Please report security problems [privately](https://github.com/sakhnenko/storymode-community/security/advisories/new).
StoryMode is made by one person, so there's no promise of a reply or a fix date.

This repository doesn't accept pull requests ([CONTRIBUTING.md](CONTRIBUTING.md)),
but forks are welcome.

## License

[Functional Source License 1.1, Apache 2.0 future license](LICENSE.md). You can
use, modify and self-host StoryMode for any purpose except offering it as a
competing product or service. Each release becomes Apache 2.0 two years after
it's published.

"StoryMode" and its logo are trademarks: forks need their own name.
