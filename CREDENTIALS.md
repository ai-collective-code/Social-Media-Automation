# API Credentials Guide

Copy `.env.example` → `.env.local` (in this `web/` folder) and fill in only what you need.

**Don't paste keys into chat.** Put them straight into `.env.local`. Anything sent through a
conversation ends up in its history.

---

## Difficulty at a glance

| Credential | Effort | Approval needed? | Cost |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | 2 min | No | Pay per use |
| `APIFY_API_TOKEN` | 5 min | No | Free tier, then per use |
| `OPENAI_API_KEY` | 2 min | No | Pay per use |
| Higgsfield / Runway / Kling | 5–10 min | No | Subscription or credits |
| Canva | 15 min | No (MCP already works) | Free tier exists |
| **Instagram / Facebook** | **Days–weeks** | **Yes — App Review** | Free |
| **TikTok** | **Days–weeks** | **Yes — app audit** | Free |
| **LinkedIn (company page)** | **Days–weeks** | **Yes — partner program** | Free |
| YouTube | 30 min | No (quota limits apply) | Free |

---

## Start here: `ANTHROPIC_API_KEY`

This single key unlocks 4 of the 7 workflows (trend analysis → content strategy →
bucketing → creative briefs, plus caption writing). Highest value per minute spent.

1. Go to <https://console.anthropic.com>
2. Sign in → **API keys** → **Create key**
3. Copy it (starts with `sk-ant-`) into `.env.local`
4. Add billing credit — new keys have no balance

---

## Competitor data: `APIFY_API_TOKEN`

Only needed if you want competitor research to run **unattended**. Right now I can do
this research live in chat with no key at all, so this is genuinely optional.

Why Apify rather than the official platform APIs: Instagram and TikTok don't offer a
read API for *other people's* public profiles. Apify runs maintained scrapers that
handle this, so you skip four separate app-review processes.

1. <https://console.apify.com> → sign up
2. **Settings → Integrations → Personal API token**

You may already have this from your `insta-audit` skill — check before creating a new one.

---

## Content execution: images and video

**Images —** try Canva through the MCP connector you already have wired up before
setting up any API credentials. It may need nothing at all. Only add `CANVA_CLIENT_ID`
/ `CANVA_CLIENT_SECRET` (from <https://www.canva.com/developers>) if you want the
website itself calling Canva without me in the loop.

**Video —** pick one, you don't need all three:

- **Higgsfield** — you already have a `higgsfield-generator` skill, so you may hold this key already
- **Runway** — <https://dev.runwayml.com>
- **Kling** — <https://klingai.com> → API console

---

## Publishing — read this before you start

This is where most social-automation projects stall, so here's the honest picture.

**None of these are "get a key and post."** Every platform treats automated posting as a
privileged capability requiring review, because it's an obvious spam vector.

### Instagram / Facebook
Hard requirements, all of them:
- Instagram account converted to **Business** or **Creator** (personal accounts cannot use the API)
- That account **linked to a Facebook Page**
- A Meta app at <https://developers.facebook.com>
- **App Review** approval for `instagram_content_publish`

Also note: the API can't post to Stories for most app types, and carousels have their own
endpoint flow. Access tokens expire and need refresh logic.

### TikTok
<https://developers.tiktok.com> → Content Posting API. The catch worth knowing upfront:
**until your app passes audit, it can only post private/self-only videos.** So you can
build and test, but not actually publish publicly, until audit clears.

### LinkedIn
<https://developer.linkedin.com>. Posting to a *personal* profile is reasonably
accessible. Posting as a *company page* needs Community Management API access, which
requires partner approval.

### YouTube
Easiest of the four. Google Cloud Console → enable **YouTube Data API v3** → OAuth
client → generate a refresh token. No review needed, but uploads consume a large daily
quota (~1600 units each against a 10,000 default), so roughly 6 uploads/day.

---

## A practical suggestion

Given the review timelines above, a common approach is to **not fully automate
publishing at first**: have the system generate everything and prepare the post, then
either publish manually or use a scheduling tool you already pay for (Buffer, Later,
Metricool) that has already cleared these approvals. You get the automation value
immediately and skip weeks of app review.

Worth deciding deliberately rather than defaulting into it.
