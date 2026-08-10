import { cookies } from "next/headers";
import { listBrands, getBrand } from "@/lib/brand-store";
import type { Brand } from "@/lib/brand-types";
import { listRunsForBrand } from "@/lib/run-store";
import type { Run } from "@/lib/run-types";
import { getBucketResult, getCreativeResult } from "@/lib/pipeline-store";
import type { BucketPost, CreativeBrief } from "@/lib/pipeline-store";
import { listDecisions, type QCStatus } from "@/lib/qc-store";

/**
 * The "active brand" — what the sidebar switcher selects, and what the
 * operational pages (calendar, quality check, assets) scope themselves to.
 *
 * Before this existed, those pages imported a single hardcoded week from
 * mock-data, so choosing a brand changed nothing outside /brands. The switcher
 * writes this cookie client-side and refreshes; every server page reads it.
 */

export { ACTIVE_BRAND_COOKIE } from "@/lib/active-brand-cookie";
import { ACTIVE_BRAND_COOKIE } from "@/lib/active-brand-cookie";

/** The selected brand, falling back to the first one so pages are never empty. */
export async function getActiveBrand(): Promise<Brand | undefined> {
  const store = await cookies();
  const id = store.get(ACTIVE_BRAND_COOKIE)?.value;
  if (id) {
    const brand = await getBrand(id);
    // A stale cookie (brand deleted) falls through rather than erroring.
    if (brand) return brand;
  }
  return (await listBrands())[0];
}

/**
 * One post as the operational pages need it.
 *
 * Deliberately a separate shape from mock-data's `Post`: real pipeline output
 * has fields the mock doesn't (whyThisPost) and lacks fields the mock invented
 * (date, expectedEngagement). Optional fields are the honest representation —
 * better a blank cell than a fabricated number.
 */
export type CalendarPost = {
  id: string;
  day: string;
  date?: string;
  time: string;
  platform: string;
  pillar: string;
  buyerStage: string;
  contentType: string;
  topic: string;
  /** Why the strategy picked this post — real data only. */
  note?: string;
  qcStatus: QCStatus;
  qcFeedback?: string;
  /** Copy from the creative brief, when a brief exists for this post. */
  hook?: string;
  caption?: string;
  hashtags?: string[];
  /** True when the brief specifies a video treatment. */
  isVideo?: boolean;
};

export type ActiveCycle = {
  brand: Brand;
  run?: Run;
  /** The request whose results these posts came from — used to scope QC. */
  requestId?: string;
  posts: CalendarPost[];
  /** True when there is a brand but no completed calendar yet. */
  awaitingRun: boolean;
};

/**
 * QC decisions are keyed per request, since bucket post ids ("MON_001") repeat
 * across brands and runs — see qc-store's `qcKeyFor`.
 */
function resolveQc(
  decisions: Record<string, { status: QCStatus; feedback?: string }>,
  requestId: string,
  postId: string,
): { qcStatus: QCStatus; qcFeedback?: string } {
  const scoped = decisions[`${requestId}:${postId}`];
  if (scoped) return { qcStatus: scoped.status, qcFeedback: scoped.feedback };
  return { qcStatus: "pending" };
}

function toCalendarPost(
  post: BucketPost,
  brief: CreativeBrief | undefined,
  qc: { qcStatus: QCStatus; qcFeedback?: string },
): CalendarPost {
  return {
    id: post.id,
    day: post.day,
    time: post.time,
    platform: post.platform,
    pillar: post.pillar,
    buyerStage: post.buyerStage,
    contentType: post.contentType,
    topic: post.topic,
    note: post.whyThisPost,
    hook: brief?.copyDirection.hookExamples[0],
    caption: brief?.copyDirection.captionExample,
    hashtags: brief?.copyDirection.hashtags,
    isVideo: brief ? brief.videoPrompt !== null : undefined,
    ...qc,
  };
}

/**
 * The active brand's most recent run that actually produced a calendar.
 *
 * Walks runs newest-first rather than taking only the latest: a failed or
 * still-running attempt shouldn't hide the last good week of content.
 */
export async function getActiveCycle(): Promise<ActiveCycle | undefined> {
  const brand = await getActiveBrand();
  if (!brand) return undefined;

  const [runs, decisions] = await Promise.all([listRunsForBrand(brand.id), listDecisions()]);

  for (const run of runs) {
    if (!run.requestId) continue;
    const bucket = await getBucketResult(run.requestId);
    if (!bucket || bucket.posts.length === 0) continue;

    const creative = await getCreativeResult(run.requestId);
    const briefs = new Map((creative?.briefs ?? []).map((b) => [b.postId, b]));

    return {
      brand,
      run,
      requestId: run.requestId,
      awaitingRun: false,
      posts: bucket.posts.map((p) =>
        toCalendarPost(p, briefs.get(p.id), resolveQc(decisions, run.requestId!, p.id)),
      ),
    };
  }

  return { brand, awaitingRun: true, posts: [] };
}
