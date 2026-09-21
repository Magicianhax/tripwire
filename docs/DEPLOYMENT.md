# Deploying the hosted backend

The extension talks to `https://tripwire.magician.wtf` out of the box. That host is one Fly.io
machine running `apps/web` with SQLite on a persistent volume. Users install the extension and
nothing else; the operator pays for the Nansen credits. Design and reasoning: ADR-0014.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Backend + product page | Fly.io app `tripwire-magician`, one machine | `Dockerfile`, `fly.toml` at the repo root |
| Database | Fly volume `tripwire_data` at `/data` | `TRIPWIRE_DB=/data/tripwire.db` |
| Domain | `tripwire.magician.wtf` | CNAME to the Fly app, TLS by Fly |
| Nansen key | Fly secret `NANSEN_API_KEY` | never in `fly.toml`, never in the image |

One machine on purpose: SQLite wants one writer, and at the expected install count one
`shared-cpu-1x` is plenty. `min_machines_running = 1` and `auto_stop_machines = "off"` keep it
warm so the first card of the day has no cold start.

## Environment

Set in `fly.toml` (not secret):

| Variable | Value | Meaning |
|---|---|---|
| `TRIPWIRE_HOSTED` | `1` | install tokens required; personal state scoped per install |
| `TRIPWIRE_HOSTED_HOST` | `tripwire.magician.wtf` | the only Host and page Origin accepted |
| `TRIPWIRE_DB` | `/data/tripwire.db` | on the volume |
| `NANSEN_PER_INSTALL_DAILY_CREDITS` | `3000` | one install's daily allowance on our key |
| `NANSEN_GLOBAL_DAILY_CREDITS` | `20000` | the hard stop on the bill; change with `fly deploy` |

Set as secrets (`fly secrets set`, never committed):

| Secret | What it is |
|---|---|
| `NANSEN_API_KEY` | the operator's Nansen key |
| `TRIPWIRE_IP_SALT` | random string salting the per-IP mint counter; the backend refuses to mint without it |
| `TRIPWIRE_OWNER_TOKEN` | random string that opens `/ledger`; unset means nobody can |

Optional: `TRIPWIRE_MINTS_PER_IP` (default 2/day), `TRIPWIRE_MINTS_PER_DAY` (default 2000/day).
The per-IP cap reads only `Fly-Client-IP`, which Fly's edge sets; a hosted mint with no client
address is refused. With the defaults one address can use at most 2 × 3000 = 6000 of the 20000
global credits in a day.

## First deploy

Run these yourself, in your own terminal. They create billable resources, set credentials and
change DNS.

```bash
cd F:/Tools/Nansen

# 1. Create the app and its volume (same region as primary_region in fly.toml).
fly apps create tripwire-magician
fly volumes create tripwire_data --app tripwire-magician --region iad --size 1

# 2. Secrets. The two random ones are generated here and never printed.
fly secrets set --app tripwire-magician --stage NANSEN_API_KEY="<your key>"
fly secrets set --app tripwire-magician --stage TRIPWIRE_IP_SALT="$(openssl rand -hex 32)"
fly secrets set --app tripwire-magician --stage TRIPWIRE_OWNER_TOKEN="$(openssl rand -hex 32)"

# 3. Build remotely and deploy.
fly deploy --remote-only

# 4. Domain and TLS.
fly certs add tripwire.magician.wtf --app tripwire-magician
#    then at your DNS provider:  CNAME  tripwire  ->  tripwire-magician.fly.dev
fly certs check tripwire.magician.wtf --app tripwire-magician
```

To read the owner token later: `fly ssh console -C 'printenv TRIPWIRE_OWNER_TOKEN'`. The ledger
is then at `https://tripwire.magician.wtf/ledger#owner=<token>` — the fragment never reaches the
server log, and the page wipes it from the address bar.

## Checking it

```bash
# The Host check answers only the real name, so test through it:
curl -s -o /dev/null -w "%{http_code}\n" https://tripwire.magician.wtf/          # 200
curl -s -X POST https://tripwire.magician.wtf/api/install -H "Origin: chrome-extension://hocgbioagcfmdpgcnfgnneopohjfkeoj"
#   -> {"token":"…","hosted":true}
curl -s -o /dev/null -w "%{http_code}\n" https://tripwire.magician.wtf/api/rules  # 401, no token
fly logs --app tripwire-magician
```

Then load the extension unpacked and open a token on X: the popup should read "Connected" with no
settings touched.

## Updating

`fly deploy --remote-only`. The schema migrates itself on boot, additively and idempotently; a
self-hoster's database takes the same migration.

## Backups

The whole state is one file. `fly ssh sftp get /data/tripwire.db ./tripwire-backup.db` copies
it; Fly also snapshots volumes daily (5-day retention by default).

## Self-hosting instead

Nothing above is needed to run Tripwire for yourself: leave `TRIPWIRE_HOSTED` unset, run
`pnpm -F web dev`, and choose "Advanced: self-hosted backend" in the popup. No tokens, one user,
your own key — exactly the pre-hosting behaviour.
