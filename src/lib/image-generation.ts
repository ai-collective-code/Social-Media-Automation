import { promises as fs } from "fs";
import path from "path";
import {
  createImageJob,
  recordImageJob,
  updateImageJob,
  type ImageJobResult,
} from "@/lib/canva-store";
import { getCreativeResult, getBucketResult } from "@/lib/pipeline-store";
import { getPromptOverride } from "@/lib/prompt-override-store";
import { mediaDir } from "@/lib/app-paths";
import { brandContextForRequest, type BrandContext } from "@/lib/brand-context";
import { getReel } from "@/lib/reels";
import { parseAssetId } from "@/lib/reel-types";
import {
  isOpenAiImageConfigured,
  generateImage as generateWithOpenAi,
} from "@/lib/openai-image";
import {
  isPollinationsEnabled,
  generateImage as generateWithPollinations,
} from "@/lib/pollinations-image";

/**
 * One place that turns a creative brief into an image file.
 *
 * Both entry points (the research page's per-brief button and the Asset
 * Library's generate-all) call this, so the provider precedence and the
 * prompt construction can't drift apart between them.
 */

export type ImageProvider = "openai" | "pollinations" | "canva";

/**
 * Precedence: a paid, unwatermarked provider is never displaced by the free
 * one. Chosen on presence of configuration, not on success — a failing paid
 * provider surfaces its error rather than silently downgrading quality.
 */
export function activeImageProvider(): ImageProvider {
  if (isOpenAiImageConfigured()) return "openai";
  if (isPollinationsEnabled()) return "pollinations";
  return "canva";
}

/**
 * Minimum gap between consecutive generations.
 *
 * Pollinations' anonymous tier allows one image per 15 seconds and answers a
 * burst with HTTP 429, so a batch has to be paced rather than fired in
 * parallel. The extra second is headroom against clock skew.
 */
export function providerSpacingMs(provider: ImageProvider): number {
  return provider === "pollinations" ? 16_000 : 1_000;
}

/** Hex codes — an image model can't match one, and often paints the glyphs. */
const HEX_CODE = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * Aspect ratios written into the brief. Listed explicitly rather than matched
 * as `\d+:\d+` so clock times ("6:30 golden hour") survive.
 */
const ASPECT_RATIO = /\b(?:1:1|4:5|5:4|16:9|9:16|3:2|2:3|4:3|3:4|21:9)\b/g;

/**
 * Quoted spans with no lowercase letter — 'RIDE 034', "DEPART 06:00". In a
 * brief those are always copy meant to sit ON the image, which is exactly what
 * an image model cannot render. Quotes containing lowercase ('golden hour')
 * are ordinary description and are kept.
 */
const SHOUTED_QUOTE = /['"‘’“”][^'"‘’“”]{1,120}['"‘’“”]/g;

const NO_TEXT_RULE =
  "Purely photographic: no text, letters, numbers, captions, signage, watermarks or logos anywhere in the frame.";

/**
 * The craft floor under every generated image.
 *
 * Without it the models default to "stock photo": flat frontal light, everything
 * in focus, oversaturated. Naming a real camera discipline — one light
 * direction, a real lens, restrained grading — is what separates a brand image
 * from a clip-art one, and it costs nothing to apply. Kept to a short
 * specification rather than a pile of quality adjectives ("8k, masterpiece,
 * award-winning"), which these models largely ignore and which crowd out the
 * part of the prompt that actually describes the picture.
 */
const CRAFT_SPEC =
  "Shot as international-standard editorial brand photography: full-frame camera, prime lens, " +
  "one motivated light source with visible direction, shallow depth of field, true-to-life " +
  "colour, natural skin and material texture, fine grain, deliberate composition with clean " +
  "negative space. Not stock photography, not oversaturated, not HDR, not flatly lit. " +
  // People are where generated images fail most visibly — the smooth,
  // symmetrical, doll-like face that reads instantly as fake. Asking for
  // ordinary faces and real skin pushes back on it, though only so far: how
  // convincing a face gets is set by the model, not the prompt.
  "Any people are real, ordinary-looking adults candidly photographed — asymmetric faces, " +
  "visible pores, fine lines, stray hair, unposed expressions. Not a 3D render, not CGI, " +
  "not airbrushed, not a doll, not a fashion model, no plastic skin, no perfect symmetry.";

/**
 * Strip the parts of a brief an image model cannot execute.
 *
 * creative.ts now instructs the brief-writing model to avoid these, but this
 * still has work to do: briefs written before those rules existed keep their
 * old prompts on disk, and the palette is *deliberately* allowed to carry hex
 * codes because it also feeds humans and design tools. Cleaning at the point
 * of use fixes both without re-running any billed model calls.
 */
export function sanitizeScene(text: string): string {
  return text
    .replace(SHOUTED_QUOTE, "")
    .replace(HEX_CODE, "")
    .replace(ASPECT_RATIO, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(\s*[,;:])+/g, "$1")
    .trim();
}

export function buildImagePrompt(brief: {
  imagePrompt: { detailedPrompt: string; styleReference: string; avoid: string };
  visualDirection: { palette: string[] };
}): string {
  const palette = brief.visualDirection.palette
    .map(sanitizeScene)
    .filter(Boolean);

  return [
    sanitizeScene(brief.imagePrompt.detailedPrompt),
    `Style reference: ${sanitizeScene(brief.imagePrompt.styleReference)}.`,
    palette.length > 0 ? `Colour palette: ${palette.join(", ")}.` : "",
    `Avoid: ${sanitizeScene(brief.imagePrompt.avoid)}, text, lettering, watermarks.`,
    CRAFT_SPEC,
    NO_TEXT_RULE,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Reel frames get a phone-documentary spec, not the editorial one.
 *
 * A reel storyboard is written as self-shot diary footage; wrapping its frames
 * in "editorial brand photography, full-frame camera, prime lens" fights that
 * brief and is precisely what makes them read as glossy AI renders. Asking for
 * the look of an actual phone camera — hard sun, imperfect framing, real skin
 * — is the strongest realism lever the prompt has.
 */
const REEL_CRAFT_SPEC =
  "Looks like real smartphone camera footage, not professional photography: slightly " +
  "imperfect framing, harsh natural daylight with true shadows, mild sensor grain, subtle " +
  "lens smudge flare, realistic skin with pores, sun-damage and shine, wind-blown hair, " +
  "dust on clothing and gear. Candid and unposed, mid-moment. " +
  "Not a render, not CGI, not airbrushed, no studio lighting, no beauty retouching.";

/**
 * Wrap an art-director scene description in the same craft and no-text rules a
 * brief-derived prompt gets.
 *
 * Refinements go through the identical tail so a refined image can't quietly
 * drop below the baseline quality of an unrefined one — the art director is
 * told the rules, but this is what actually holds the line.
 */
export function composeScenePrompt(
  scene: string,
  style: "editorial" | "phone" = "editorial",
): string {
  return [
    sanitizeScene(scene),
    style === "phone" ? REEL_CRAFT_SPEC : CRAFT_SPEC,
    NO_TEXT_RULE,
  ].join("\n");
}

/**
 * Append the brand's own visual bans to a composed prompt.
 *
 * Applied at the very end, after the craft spec and the no-text rule, because
 * these models weight the tail of a prompt heavily for exclusions — and
 * because a brand-level ban must survive an art-director refinement that
 * rewrote everything before it.
 */
export function appendBrandVisualRules(prompt: string, brand?: BrandContext): string {
  const avoid = sanitizeScene(brand?.avoidVisuals ?? "");
  return avoid ? `${prompt}\nNever show, for this brand specifically: ${avoid}.` : prompt;
}

export type AssetSubject = {
  /** Scene text alone — what the art director starts from and rewrites. */
  basePrompt: string;
  /** Fully composed prompt, used when there is no art-director override. */
  fullPrompt: string;
  day: string;
  topic: string;
  designType: string;
};

/**
 * Work out what a given asset id is a picture *of*.
 *
 * An id is either a post ("MON_001"), whose subject comes from its creative
 * brief, or one scene of a reel ("TUE_001__s2"), whose subject is that scene's
 * shot description. Resolving both here is what lets reel frames reuse the
 * entire existing pipeline — job records, art-director refinement, revert,
 * file cleanup — instead of growing a parallel copy of it.
 */
export async function resolveAssetSubject(
  requestId: string,
  assetId: string,
): Promise<AssetSubject | undefined> {
  const { postId, sceneIndex } = parseAssetId(assetId);

  if (sceneIndex !== undefined) {
    const reel = await getReel(requestId, postId);
    const scene = reel?.scenes[sceneIndex];
    if (!reel || !scene) return undefined;

    // The SHOT leads and the cast follows. The first draft led with the cast,
    // and on the small free model that failed visibly: it spent its attention
    // on the face and dropped the scene — every frame came back a portrait
    // with no motorcycle, no location, no action. Scene first keeps the frame
    // about what happens; the cast line still pins who it happens to. Folded
    // into basePrompt too, so an art-director refinement of one scene can't
    // quietly drop the character and reintroduce a stranger.
    const shot = reel.cast
      ? `${sanitizeScene(scene.shot)} The person in this shot: ${sanitizeScene(reel.cast)}`
      : scene.shot;

    return {
      basePrompt: sanitizeScene(shot),
      fullPrompt: composeScenePrompt(shot, "phone"),
      day: reel.day,
      topic: `${reel.topic} — scene ${sceneIndex + 1}`,
      designType: "reel_frame",
    };
  }

  const [creativeResult, bucketResult] = await Promise.all([
    getCreativeResult(requestId),
    getBucketResult(requestId),
  ]);

  const brief = creativeResult?.briefs.find((b) => b.postId === postId);
  if (!brief) return undefined;

  const post = bucketResult?.posts.find((p) => p.id === postId);
  return {
    basePrompt: sanitizeScene(brief.imagePrompt.detailedPrompt),
    fullPrompt: buildImagePrompt(brief),
    day: post?.day ?? postId,
    topic: post?.topic ?? brief.conceptName,
    designType: brief.videoPrompt !== null ? "instagram_reel_cover" : "instagram_post",
  };
}

export type GenerateOutcome =
  | { kind: "generated"; provider: ImageProvider }
  | { kind: "queued" }
  | { kind: "failed"; error: string }
  | { kind: "skipped"; reason: string };

/**
 * Generate (or queue) the image for one post, or one reel scene.
 *
 * Records the job as `generating` *before* the network call so a batch in
 * progress is visible on refresh rather than looking like nothing happened.
 */
export async function generateImageForPost(
  requestId: string,
  assetId: string,
): Promise<GenerateOutcome> {
  const [subject, override, brand] = await Promise.all([
    resolveAssetSubject(requestId, assetId),
    getPromptOverride(requestId, assetId),
    brandContextForRequest(requestId),
  ]);

  if (!subject) {
    return { kind: "skipped", reason: `Nothing to generate for ${assetId}` };
  }

  const fields = {
    requestId,
    postId: assetId,
    day: subject.day,
    topic: subject.topic,
    // An art-director refinement wins until it's cleared, so plain
    // "Regenerate" reproduces what the user last asked for rather than
    // silently reverting their changes. Refined reel frames keep the
    // phone-documentary style their unrefined siblings get.
    prompt: appendBrandVisualRules(
      override
        ? composeScenePrompt(
            override.prompt,
            subject.designType === "reel_frame" ? "phone" : "editorial",
          )
        : subject.fullPrompt,
      brand,
    ),
    designType: subject.designType,
  };

  const provider = activeImageProvider();

  if (provider === "canva") {
    await createImageJob(fields);
    return { kind: "queued" };
  }

  const job = await recordImageJob({ ...fields, status: "generating" });

  try {
    const image =
      provider === "openai"
        ? await generateWithOpenAi(fields.prompt)
        : await generateWithPollinations(fields.prompt, { seed: brand?.imageSeed });

    const extension = "extension" in image ? image.extension : "png";
    const generatedDir = mediaDir();
    await fs.mkdir(generatedDir, { recursive: true });

    // A fresh filename per generation is what busts the cache. A stable name
    // plus a `?v=` query string does not work here: next/image rejects query
    // strings unless they're allowlisted in `images.localPatterns`, and that
    // allowlist matches `search` exactly — so a changing timestamp could never
    // match, and omitting `search` would permit arbitrary query strings.
    const stem = `${requestId}_${assetId}`;
    const fileName = `${stem}_${Date.now()}.${extension}`;

    // Drop this asset's previous renders so regenerating doesn't accumulate
    // files indefinitely. The job record is the source of truth for which one
    // is current, so older files have no remaining reference.
    //
    // The tail must be a bare timestamp, not merely any suffix: scene ids
    // extend their post id ("TUE_001" -> "TUE_001__s1"), so a prefix test
    // alone would make regenerating a post's own image delete every scene
    // frame belonging to its reel.
    const prefix = `${stem}_`;
    const isPriorRender = (name: string) =>
      name === `${stem}.${extension}` ||
      (name.startsWith(prefix) && /^\d+\.[a-z0-9]+$/i.test(name.slice(prefix.length)));

    for (const existing of await fs.readdir(generatedDir).catch(() => [])) {
      if (isPriorRender(existing)) {
        await fs.rm(path.join(generatedDir, existing), { force: true });
      }
    }

    await fs.writeFile(path.join(generatedDir, fileName), image.bytes);

    const result: ImageJobResult = {
      provider,
      localPath: `/generated/${fileName}`,
      width: image.width,
      height: image.height,
      exportedAt: new Date().toISOString(),
    };

    await updateImageJob(job.id, { status: "complete", result });
    return { kind: "generated", provider };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await updateImageJob(job.id, { status: "failed", error });
    return { kind: "failed", error };
  }
}
