import Link from "next/link";
import TopBar from "@/components/TopBar";
import {
  Badge,
  Card,
  Dot,
  Label,
  SectionHeading,
  Table,
  TableWrap,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { posts as samplePosts, qcStatusMeta, type QCStatus } from "@/lib/mock-data";
import { getActiveCycle, type CalendarPost } from "@/lib/active-brand";
import { Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   Presentation maps

   `pillarColors` / `qcStatusMeta.className` in mock-data are hard-coded
   dark-only palettes, so the colours are resolved here through semantic tones
   instead. Labels still come from mock-data so the copy stays in one place.

   Content pillars deliberately do NOT get a hue: the status hues (good / warn /
   run / bad) mean "review state" everywhere else in the app, and painting a
   pillar amber would read as "needs attention". Pillars are identified by their
   name in a neutral chip.
--------------------------------------------------------------------------- */

const QC_TONE: Record<QCStatus, Tone> = {
  approved: "good",
  revision_requested: "warn",
  pending: "neutral",
};

const QC_ORDER: QCStatus[] = ["approved", "revision_requested", "pending"];

const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2025-01-27` -> `Jan 27`. Parsed by hand so the output can't drift with the
 *  runtime's locale or timezone. Unrecognised input is passed through. */
function shortDate(iso: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;
  const month = MONTHS[Number(parts[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(parts[3])}`;
}

/** `07:00 PM` -> minutes since midnight, for ordering posts inside one day. */
function minutesOfDay(time: string) {
  const parts = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!parts) return Number.MAX_SAFE_INTEGER;
  const hour = Number(parts[1]) % 12;
  const pm = parts[3].toUpperCase() === "PM";
  return (hour + (pm ? 12 : 0)) * 60 + Number(parts[2]);
}

type DayColumn = { day: string; date?: string; dayPosts: CalendarPost[] };

/** Every weekday gets a column whether or not it has a post — an empty day is
 *  information. Any post whose `day` isn't a known weekday still gets its own
 *  column appended rather than being dropped. */
function buildWeek(all: CalendarPost[]): DayColumn[] {
  const byDay = new Map<string, CalendarPost[]>();
  for (const day of WEEK_DAYS) byDay.set(day, []);
  for (const post of all) {
    const bucket = byDay.get(post.day);
    if (bucket) bucket.push(post);
    else byDay.set(post.day, [post]);
  }
  return Array.from(byDay, ([day, dayPosts]) => ({
    day,
    date: dayPosts[0]?.date,
    dayPosts: [...dayPosts].sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time)),
  }));
}

/** The sample week, mapped into the same shape as real pipeline output. */
function sampleAsCalendarPosts(): CalendarPost[] {
  return samplePosts.map((p) => ({
    id: p.id,
    day: p.day,
    date: p.date,
    time: p.time,
    platform: p.platform,
    pillar: p.pillar,
    buyerStage: p.buyerStage,
    contentType: p.contentType,
    topic: p.topic,
    note: p.expectedEngagement,
    qcStatus: p.qc.status,
    qcFeedback: p.qc.feedback,
    hook: p.hook,
    caption: p.caption,
    hashtags: p.hashtags,
  }));
}

export default async function CalendarPage() {
  const cycle = await getActiveCycle();

  // Real posts when the active brand has a completed calendar; otherwise the
  // sample week, clearly labelled rather than passed off as this brand's plan.
  const usingSample = !cycle || cycle.posts.length === 0;
  const posts = usingSample ? sampleAsCalendarPosts() : cycle.posts;

  const week = buildWeek(posts);
  const scheduledDays = week.filter((column) => column.dayPosts.length > 0).length;

  const counts = posts.reduce(
    (acc, post) => {
      acc[post.qcStatus] += 1;
      return acc;
    },
    { approved: 0, revision_requested: 0, pending: 0 } as Record<QCStatus, number>,
  );

  return (
    <>
      <TopBar
        title="Content Calendar"
        subtitle={
          usingSample
            ? "Sample week — no generated calendar yet"
            : `${cycle!.brand.name} — ${posts.length} posts from the latest run`
        }
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {usingSample && (
          <Callout tone="warn" title="This is the built-in sample week">
            {cycle
              ? `${cycle.brand.name} has no completed content calendar yet. Run the full process from the brand page and this will show its real posts.`
              : "No brands yet. Add a brand, run the full process, and its calendar will appear here."}
          </Callout>
        )}

        {/* Summary doubles as the legend for the review-state chips below. */}
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-fg">
              <span className="tabular">{posts.length}</span> posts this week
            </p>
            <p className="mt-0.5 text-xs text-fg-3">
              <span className="tabular">{scheduledDays}</span> of{" "}
              <span className="tabular">{week.length}</span> days have content
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Review state key">
            {QC_ORDER.map((status) => (
              <li key={status}>
                <Badge tone={QC_TONE[status]}>
                  <Dot tone={QC_TONE[status]} />
                  {qcStatusMeta[status].label}
                  <span className="tabular ml-0.5 font-semibold">{counts[status]}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <section aria-labelledby="week-grid-heading">
          <SectionHeading
            className="mb-3"
            title={<span id="week-grid-heading">Week view</span>}
            subtitle="One column per day, Monday through Sunday"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 lg:gap-2">
            {week.map(({ day, date, dayPosts }) => (
              <div key={day} className="flex min-w-0 flex-col gap-2">
                {/* Column header: shown once the layout is actually columnar.
                    On a single-column phone the day sits on the card instead. */}
                <div className="hidden items-baseline justify-between gap-1.5 border-b border-line px-1 pb-1.5 sm:flex">
                  <span className="truncate text-xs font-semibold text-fg" title={day}>
                    {day}
                  </span>
                  {date && (
                    <span className="tabular shrink-0 text-[11px] text-fg-3">
                      {shortDate(date)}
                    </span>
                  )}
                </div>

                {dayPosts.length === 0 ? (
                  <div className="flex min-h-28 flex-1 flex-col justify-center rounded-xl border border-dashed border-line-strong px-3 py-4 text-center">
                    <span className="text-xs font-semibold text-fg sm:hidden">{day}</span>
                    <span className="text-[11px] text-fg-3">No post scheduled</span>
                  </div>
                ) : (
                  dayPosts.map((post) => <DayPostCard key={post.id} post={post} />)
                )}
              </div>
            ))}
          </div>
        </section>

        {/* The grid clamps long values to keep the columns narrow; this table is
            the un-truncated record of the same seven posts. */}
        <section aria-labelledby="schedule-detail-heading">
          <SectionHeading
            className="mb-3"
            title={<span id="schedule-detail-heading">Schedule detail</span>}
            subtitle="Full field values for every post in the week"
          />

          <TableWrap>
            <Table>
              <caption className="sr-only">
                Week 1 publishing schedule with platform, pillar, buyer stage, content type,
                topic, predicted engagement and review state for each post.
              </caption>
              <thead>
                <tr>
                  <Th scope="col">Day</Th>
                  <Th scope="col">Date</Th>
                  <Th scope="col">Time</Th>
                  <Th scope="col">Platform</Th>
                  <Th scope="col">Pillar</Th>
                  <Th scope="col">Buyer stage</Th>
                  <Th scope="col">Content type</Th>
                  <Th scope="col">Topic</Th>
                  <Th scope="col">{usingSample ? "Predicted engagement" : "Why this post"}</Th>
                  <Th scope="col">Review state</Th>
                  <Th scope="col">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {week.flatMap(({ dayPosts }) =>
                  dayPosts.map((post) => {
                    const qc = qcStatusMeta[post.qcStatus];
                    const tone = QC_TONE[post.qcStatus];
                    return (
                      <tr key={post.id}>
                        <Td className="whitespace-nowrap font-medium text-fg">{post.day}</Td>
                        <Td className="tabular whitespace-nowrap">{post.date ?? "—"}</Td>
                        <Td className="tabular whitespace-nowrap">{post.time}</Td>
                        <Td className="whitespace-nowrap">{post.platform}</Td>
                        <Td className="whitespace-nowrap">{post.pillar}</Td>
                        <Td className="whitespace-nowrap">{post.buyerStage}</Td>
                        <Td className="whitespace-nowrap">{post.contentType}</Td>
                        <Td className="min-w-56 text-fg">
                          {post.topic}
                          {post.qcFeedback && (
                            <span className="mt-1 block text-xs text-fg-3">{post.qcFeedback}</span>
                          )}
                        </Td>
                        <Td className="min-w-48">{post.note ?? "—"}</Td>
                        <Td className="whitespace-nowrap">
                          <Badge tone={tone}>
                            <Dot tone={tone} />
                            {qc.label}
                          </Badge>
                        </Td>
                        <Td className="whitespace-nowrap text-right">
                          <ReviewLink post={post} />
                        </Td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </Table>
          </TableWrap>
        </section>
      </div>
    </>
  );
}

function DayPostCard({ post }: { post: CalendarPost }) {
  const qc = qcStatusMeta[post.qcStatus];
  const tone = QC_TONE[post.qcStatus];

  return (
    <article className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-line bg-canvas-raised p-3 transition-colors hover:border-line-strong">
      {/* Phone layout has no column header, so the day is repeated here. */}
      <div className="flex items-baseline justify-between gap-2 sm:hidden">
        <span className="text-xs font-semibold text-fg">{post.day}</span>
        {post.date && (
          <span className="tabular text-[11px] text-fg-3">{shortDate(post.date)}</span>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="tabular text-sm font-semibold leading-none text-fg">{post.time}</span>
        <span className="min-w-0 truncate text-[11px] text-fg-2" title={post.platform}>
          {post.platform}
        </span>
      </div>

      <p className="clamp-3 text-[13px] font-medium leading-snug text-fg" title={post.topic}>
        {post.topic}
      </p>

      <dl className="space-y-1">
        <Meta term="Pillar" detail={post.pillar} />
        <Meta term="Type" detail={post.contentType} />
        <Meta term="Stage" detail={post.buyerStage} />
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <Badge tone={tone}>
          <Dot tone={tone} />
          {qc.label}
        </Badge>
        <ReviewLink post={post} />
      </div>
    </article>
  );
}

function Meta({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <dt className="shrink-0">
        <Label>{term}</Label>
      </dt>
      <dd className="min-w-0 text-[11px] leading-tight text-fg-2">{detail}</dd>
    </div>
  );
}

function ReviewLink({ post }: { post: CalendarPost }) {
  return (
    <Link
      href="/quality-check"
      aria-label={`Review ${post.day} post: ${post.topic}`}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
    >
      Review
    </Link>
  );
}
