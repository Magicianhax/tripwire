# Public product site

Set `TRIPWIRE_PUBLIC_SITE=1` when building **and running** the public website deployment.
This deployment serves the product homepage and packaged static assets only. All APIs,
rules, history and the usage ledger return 404, even if a hosting proxy forwards a
localhost Host. Do not deploy the public site with this setting unset.

Set `TRIPWIRE_REPOSITORY_URL` to the actual release repository once it is available
(format: `https://github.com/OWNER/REPO`). Do not configure that example literally.
Until a real repository is configured, the homepage shows the download as coming soon.

Keep the local extension backend as a separate process/deployment with this flag unset.
Its existing loopback Host and pinned extension Origin restrictions remain unchanged.
The marketing site does not provide a hosted extension API, user accounts or shared rules.

Do not provision Nansen credentials, CLI login files or the local application database to
the public deployment. Internal call accounting and budget enforcement remain in the local
backend; they are not part of the product website or toolbar popup.

Public paths are explicitly allowlisted in `apps/web/proxy.ts`: `/`, `/_next/static/*`,
`/logos/*`, `/showcase/*`, `/favicon.ico` and `/icon.png`, for GET/HEAD only.
Add new static asset namespaces deliberately. The public deployment must use Next's
server/proxy routing; serving generated private pages through a separate static-file
server is unsupported.

## Extension screenshots

The homepage uses actual extension screenshots in `apps/web/public/showcase/`.
It does not fetch live market metrics or call `/api/public-brief`. Screenshots fill the
content width below a full first-screen hero and rotate every three seconds with a450ms
horizontal transform transition. Small edge arrows and pause/dot controls remain; there is no surrounding heading,
caption, site-tab row, dated banner or full-size link. Pointer hover does not suspend rotation;
keyboard focus, offscreen and hidden-tab states do. Reduced motion starts paused and suppresses
transitions; keyboard navigation and dot selection are instant. Initial image has high fetch
priority; other images load at low priority. End clones provide seamless forward/backward looping.
The genuine I AM EXIT LIQUIDITY warning captured on Uniswap is first in the six-image sequence.
The FAQ and image descriptions identify screenshot figures as recorded examples, not live quotes.

When refreshing captures, use the extension on the named site, verify the correct
asset/chain, and exclude private account information. Do not substitute synthetic
screenshots or alter the displayed financial figures. Keep source capture details
alongside the assets.

The older market-brief collector remains internal, unused by the product homepage.
Its refresh flag, artifact publishing and Nansen credentials are not required for
this public site.
