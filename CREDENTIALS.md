# API Credentials Guide

Copy `.env.example` → `.env.local` (in this `web/` folder) and fill in only what you need.

**Don't paste keys into chat.** Put them straight into `.env.local`. Anything sent through a
conversation ends up in its history.

---

## Difficulty at a glance

| Credential | Effort | Approval needed? | Cost |
|---|---|---|---|
| `LLM_API_KEY` (NVIDIA / GLM-5.2) | 3 min | No | Free credits, then per use |
| `VIDEO_API_KEY` (fal.ai / Replicate) | 5 min | No | Pay per generation |
| Canva (images) | — | No — MCP already works | Free tier exists |
| `APIFY_API_TOKEN` | 5 min | No | Free tier, then per use |
| **Instagram / Facebook** | **Days–weeks** | **Yes — App Review** | Free |
| **TikTok** | **Days–weeks** | **Yes — app audit** | Free |
| **LinkedIn (company page)** | **Days–weeks** | **Yes — partner program** | Free |
| YouTube | 30 min | No (quota limits apply) | Free |

---

## Start here: the LLM provider

This one section unlocks 4 of the 7 workflows — trend analysis, content strategy,
bucketing, creative briefs, and caption writing. Highest value per minute spent.

The integration is **provider-agnostic**: it speaks the OpenAI-compatible protocol, which
almost every provider except Anthropic supports. Switching provider means editing three
lines in `.env.local` — never any code.

```
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_MODEL=z-ai/glm-5.2
LLM_API_KEY=nvapi-...
```

### Default: GLM-5.2 on NVIDIA NIM

1. Go to <https://build.nvidia.com/z-ai/glm-5.2>
2. Sign in → **Get API Key**
3. Paste it into `LLM_API_KEY` in `.env.local` (starts with `nvapi-`)

Why this model: **1,000,000-token context window.** The pipeline chains outputs
(competitor analysis → trends → strategy → bucketing → creative briefs), so a 1M window
lets the creative-brief step hold *all* prior research at once, with no chunking or
summarization. Free credits on signup, MIT-licensed, and strong at reasoning.

Two things to know:

- **Rate limit is ~40 requests/minute by default.** Fine for a sequential pipeline;
  increases are requestable via the NVIDIA developer forums.
- **NVIDIA retires these on a cadence** (GLM-5 went in April 2026). That's exactly why
  the model is an env var — when 5.3 lands, it's a one-line change.

### Swapping provider

Replace the three `LLM_` lines. Commented-out configs for each are in `.env.example`:

| Provider | Why you'd pick it |
|---|---|
| **OpenRouter** | One key → 300+ models including Gemini, GPT, and Claude. Best if you want to A/B models per workflow step. Has free tiers. |
| **Google Gemini** | Genuinely generous free tier; strong at long-form strategy writing. |
| **Groq** | Free tier, extremely fast. |
| **DeepSeek** | Not free, but pennies at volume. |

### `LLM_MODEL_CREATIVE` — worth knowing about

Reasoning-tuned models (GLM included) are excellent at the analytical steps but can be
weaker at brand voice, hooks, and headline writing. This optional variable points *only*
the creative steps at a different model, leaving strategy and bucketing on the cheap one:

```
LLM_MODEL=z-ai/glm-5.2
LLM_MODEL_CREATIVE=google/gemini-2.5-flash   # via OpenRouter, for example
```

Leave it blank until you've seen the output and decided it needs upgrading. Don't
pre-optimize this.

---

## Video generation

Set `VIDEO_PROVIDER` and `VIDEO_API_KEY`. Optional — leave blank and the UI keeps video
marked "not wired up" rather than pretending assets exist.

- **fal.ai** (recommended) — <https://fal.ai/dashboard/keys>. One key → Kling, MiniMax/Hailuo,
  Wan, Veo. Pay per generation, no subscription, so you can run one brief through three
  models and compare.
- **Replicate** — <https://replicate.com/account/api-tokens>. Same idea, similar catalog.
- **Higgsfield** — you may already hold this key from your existing skill.

---

## Images

**Already working via the Canva MCP connector — no key required.** Two static Instagram
posts have been generated and exported through it end to end.

Only set `IMAGE_PROVIDER` / `IMAGE_API_KEY` if you want an AI image model (FLUX, SDXL) as
an alternative. fal.ai and Replicate host those too, so you can reuse the video key.

---

## Competitor scraping (optional)

`APIFY_API_TOKEN` is only needed to run competitor research **unattended**. Right now that
research runs via browser tooling in a Claude session with no key at all — so this is
genuinely optional.

Why Apify rather than the official platform APIs: Instagram and TikTok don't offer a read
API for *other people's* public profiles. Apify runs maintained scrapers, so you skip four
separate app-review processes.

<https://console.apify.com> → **Settings → Integrations → Personal API token**.
You may already have this from your `insta-audit` skill — check before creating a new one.

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

Also note: the API can't post to Stories for most app types, carousels have their own
endpoint flow, and access tokens expire and need refresh logic.

### TikTok
<https://developers.tiktok.com> → Content Posting API. The catch worth knowing upfront:
**until your app passes audit, it can only post private/self-only videos.** You can build
and test, but not publish publicly, until audit clears.

### LinkedIn
<https://developer.linkedin.com>. Posting to a *personal* profile is reasonably accessible.
Posting as a *company page* needs Community Management API access, requiring partner approval.

### YouTube
Easiest of the four. Google Cloud Console → enable **YouTube Data API v3** → OAuth client →
generate a refresh token. No review needed, but uploads consume a large daily quota
(~1600 units each against a 10,000 default), so roughly 6 uploads/day.

---

## A practical suggestion

Given the review timelines above, a common approach is to **not fully automate publishing
at first**: have the system generate everything and prepare the post, then either publish
manually or push into a scheduler you already pay for (Buffer, Later, Metricool) that has
already cleared these approvals. You get the automation value immediately and skip weeks
of app review.

Worth deciding deliberately rather than defaulting into it.
