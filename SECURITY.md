# Security

If you've found a security problem in StoryMode, please report it privately:
**[report a vulnerability](https://github.com/sakhnenko/storymode-community/security/advisories/new)**
(the repository's **Security** tab → **Report a vulnerability**). Only the
maintainer can see it there.

Please don't open a public issue or discussion for it, and don't test against
anyone else's StoryMode, including the
[hosted version](https://storymode.waldenpond.net): use your own copy.

Helpful to include:
- what an attacker could do, and what they'd need first (an account, an admin
  account, nothing at all);
- the steps to show it;
- the version (`git log -1 --format=%cd` in your StoryMode folder).

There's no bug bounty, but reports are read and fixed problems are credited
in the release notes if you'd like.

## Keeping your own copy safe

- Your Supabase access token is only needed during setup and updates: revoke
  it afterwards at [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).
- Keep your OpenRouter key on Supabase (the setup wizard puts it there), never
  in the web app, and give it a monthly credit limit.
- Update regularly with `npm run setup` → **Update to the latest version**.
