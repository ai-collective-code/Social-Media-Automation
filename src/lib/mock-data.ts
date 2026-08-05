// Mock data modeled on the JSON shapes defined in the workflow docs at the repo root
// (content_buckets.json, qa_report.json, publish_log.json, etc). Swap for real API data later.

export type WorkflowStepStatus = "complete" | "in_progress" | "pending";

export type WorkflowStep = {
  id: string;
  label: string;
  status: WorkflowStepStatus;
  detail?: string;
};

export type PillarKey =
  | "Education"
  | "Transformation"
  | "Transparency"
  | "Cruelty-Free Values"
  | "Community";

export type QCStatus = "approved" | "revision_requested" | "pending";

export type Post = {
  id: string;
  day: string;
  date: string;
  time: string;
  platform: string;
  pillar: PillarKey;
  buyerStage: "Awareness" | "Consideration" | "Decision" | "Implementation";
  topic: string;
  contentType: string;
  format: string;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  expectedEngagement: string;
  imageAsset?: string;
  videoAsset?: string;
  qc: {
    status: QCStatus;
    visualChecks: { label: string; passed: boolean | null }[];
    copyChecks: { label: string; passed: boolean | null }[];
    feedback?: string;
  };
  publish: {
    status: "scheduled" | "live" | "queued";
    url?: string;
    likes?: number;
    comments?: number;
    shares?: number;
  };
};

export const client = {
  name: "Glow & Grace Skincare",
  industry: "Clean Beauty / Skincare",
  week: "Week 1 — January 27–31, 2025",
  weekNumber: 1,
  totalWeeks: 52,
};

export const workflowSteps: WorkflowStep[] = [
  { id: "competitor_analysis", label: "Competitor Analysis", status: "complete" },
  { id: "trend_analysis", label: "Trend Analysis", status: "complete" },
  { id: "content_strategy", label: "Content Strategy", status: "complete" },
  { id: "content_bucketing", label: "Content Bucketing", status: "complete" },
  { id: "creative_director", label: "Creative Director", status: "complete" },
  { id: "content_execution", label: "Content Execution", status: "complete" },
  {
    id: "quality_check",
    label: "Quality Check",
    status: "in_progress",
    detail: "4/7 approved, 1 revision, 2 pending",
  },
  {
    id: "publishing",
    label: "Publishing",
    status: "pending",
    detail: "Waiting on QC approval",
  },
];

export const posts: Post[] = [
  {
    id: "MON_001",
    day: "Monday",
    date: "2025-01-27",
    time: "09:00 AM",
    platform: "Instagram Reel",
    pillar: "Education",
    buyerStage: "Awareness",
    topic: "5-minute skincare routine for busy professionals",
    contentType: "Educational Reel",
    format: "Vertical video (1080x1920)",
    hook: "Save this for your busy morning! ⏰",
    caption:
      "We get it — you're busy. Work, life, Netflix... where's skincare supposed to fit? Here's a 5-minute routine that actually works.",
    hashtags: ["#BusyProfessional", "#SkincareTips", "#5MinRoutine"],
    cta: "Save this & tag someone who needs it",
    expectedEngagement: "4.5%+",
    videoAsset: "MON_video.mp4",
    qc: {
      status: "approved",
      visualChecks: [
        { label: "Colors match brand?", passed: true },
        { label: "Professional quality?", passed: true },
        { label: "Matches creative brief?", passed: true },
        { label: "Text readable?", passed: true },
        { label: "Aspect ratio correct?", passed: true },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: true },
        { label: "Tone matches brand?", passed: true },
        { label: "Follows copy direction?", passed: true },
        { label: "Hashtags relevant?", passed: true },
        { label: "CTA clear?", passed: true },
      ],
    },
    publish: {
      status: "live",
      url: "https://instagram.com/p/ABC123",
      likes: 245,
      comments: 12,
      shares: 3,
    },
  },
  {
    id: "TUE_001",
    day: "Tuesday",
    date: "2025-01-28",
    time: "10:00 AM",
    platform: "Instagram Carousel",
    pillar: "Transformation",
    buyerStage: "Consideration",
    topic: "30-day customer transformation results",
    contentType: "Before/After Carousel",
    format: "9-slide carousel (1080x1350)",
    hook: "30 days. Real skin. Real results.",
    caption:
      "Swipe through Sarah's 30-day journey — no filters, no gimmicks, just consistent care.",
    hashtags: ["#RealResults", "#TransformationStory", "#BeforeAfter"],
    cta: "Tag someone starting their journey",
    expectedEngagement: "3.5%+",
    imageAsset: "TUE_carousel.png",
    qc: {
      status: "revision_requested",
      visualChecks: [
        { label: "Colors match brand?", passed: true },
        { label: "Professional quality?", passed: true },
        { label: "Matches creative brief?", passed: true },
        { label: "Text readable?", passed: true },
        { label: "Aspect ratio correct?", passed: true },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: false },
        { label: "Tone matches brand?", passed: true },
        { label: "Follows copy direction?", passed: true },
        { label: "Hashtags relevant?", passed: true },
        { label: "CTA clear?", passed: true },
      ],
      feedback: "Hook too weak — needs a stronger open before the swipe.",
    },
    publish: { status: "queued" },
  },
  {
    id: "WED_001",
    day: "Wednesday",
    date: "2025-01-29",
    time: "06:00 PM",
    platform: "Instagram Reel + Stories",
    pillar: "Transparency",
    buyerStage: "Decision",
    topic: "Behind-the-scenes: How we source ingredients",
    contentType: "Transparency/BTS Reel",
    format: "Vertical video (1080x1920) + Stories",
    hook: "From farm to bottle — here's the full journey.",
    caption:
      "Ever wonder where your skincare actually comes from? We're taking you behind the curtain.",
    hashtags: ["#Sustainable", "#BehindTheScenes", "#Transparency"],
    cta: "Ask us anything in the comments",
    expectedEngagement: "2.1x higher",
    videoAsset: "WED_video.mp4",
    qc: {
      status: "approved",
      visualChecks: [
        { label: "Colors match brand?", passed: true },
        { label: "Professional quality?", passed: true },
        { label: "Matches creative brief?", passed: true },
        { label: "Text readable?", passed: true },
        { label: "Aspect ratio correct?", passed: true },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: true },
        { label: "Tone matches brand?", passed: true },
        { label: "Follows copy direction?", passed: true },
        { label: "Hashtags relevant?", passed: true },
        { label: "CTA clear?", passed: true },
      ],
    },
    publish: { status: "scheduled" },
  },
  {
    id: "THU_001",
    day: "Thursday",
    date: "2025-01-30",
    time: "02:00 PM",
    platform: "Instagram Reel",
    pillar: "Education",
    buyerStage: "Awareness",
    topic: "Skincare 101: The basics everyone needs to know",
    contentType: "Educational Reel",
    format: "Vertical video (1080x1920)",
    hook: "No one taught you this in school.",
    caption: "The 4 skincare basics that actually matter — no 10-step routine required.",
    hashtags: ["#SkincareTips", "#Skincare101", "#BeautyBasics"],
    cta: "Save this for later",
    expectedEngagement: "4.2%+",
    videoAsset: "THU_video.mp4",
    qc: {
      status: "pending",
      visualChecks: [
        { label: "Colors match brand?", passed: null },
        { label: "Professional quality?", passed: null },
        { label: "Matches creative brief?", passed: null },
        { label: "Text readable?", passed: null },
        { label: "Aspect ratio correct?", passed: null },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: null },
        { label: "Tone matches brand?", passed: null },
        { label: "Follows copy direction?", passed: null },
        { label: "Hashtags relevant?", passed: null },
        { label: "CTA clear?", passed: null },
      ],
    },
    publish: { status: "queued" },
  },
  {
    id: "FRI_001",
    day: "Friday",
    date: "2025-01-31",
    time: "07:00 PM",
    platform: "TikTok Reel",
    pillar: "Education",
    buyerStage: "Awareness",
    topic: "Top 5 skincare myths debunked",
    contentType: "Educational Myth-Busting",
    format: "Vertical video (1080x1920)",
    hook: "Stop doing these 5 things to your skin.",
    caption: "Myth vs. reality — how many of these have you believed?",
    hashtags: ["#SkincareMythBusting", "#CleanBeauty", "#Skincare101"],
    cta: "Which one surprised you? Comment below",
    expectedEngagement: "4.2%+",
    videoAsset: "FRI_video.mp4",
    qc: {
      status: "pending",
      visualChecks: [
        { label: "Colors match brand?", passed: null },
        { label: "Professional quality?", passed: null },
        { label: "Matches creative brief?", passed: null },
        { label: "Text readable?", passed: null },
        { label: "Aspect ratio correct?", passed: null },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: null },
        { label: "Tone matches brand?", passed: null },
        { label: "Follows copy direction?", passed: null },
        { label: "Hashtags relevant?", passed: null },
        { label: "CTA clear?", passed: null },
      ],
    },
    publish: { status: "queued" },
  },
  {
    id: "SAT_001",
    day: "Saturday",
    date: "2025-02-01",
    time: "09:00 AM",
    platform: "Instagram Reel",
    pillar: "Community",
    buyerStage: "Implementation",
    topic: "Customer spotlight: Meet Sarah (transformation story)",
    contentType: "User-Generated Content",
    format: "Vertical video (1080x1920)",
    hook: "Meet Sarah — 90 days in.",
    caption: "We asked Sarah to share her honest experience. Here's what she told us.",
    hashtags: ["#CommunityLove", "#RealResults", "#CustomerStories"],
    cta: "Share your own story with us",
    expectedEngagement: "Higher authenticity",
    videoAsset: "SAT_video.mp4",
    qc: {
      status: "approved",
      visualChecks: [
        { label: "Colors match brand?", passed: true },
        { label: "Professional quality?", passed: true },
        { label: "Matches creative brief?", passed: true },
        { label: "Text readable?", passed: true },
        { label: "Aspect ratio correct?", passed: true },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: true },
        { label: "Tone matches brand?", passed: true },
        { label: "Follows copy direction?", passed: true },
        { label: "Hashtags relevant?", passed: true },
        { label: "CTA clear?", passed: true },
      ],
    },
    publish: { status: "scheduled" },
  },
  {
    id: "SUN_001",
    day: "Sunday",
    date: "2025-02-02",
    time: "07:00 PM",
    platform: "LinkedIn Article",
    pillar: "Cruelty-Free Values",
    buyerStage: "Decision",
    topic: "Why clean beauty is the future of the industry",
    contentType: "Thought Leadership Article",
    format: "LinkedIn article (1000-1500 words)",
    hook: "The beauty industry is changing — faster than most brands realize.",
    caption:
      "Consumers aren't just asking for cruelty-free anymore — they expect it. Here's what that means for the industry.",
    hashtags: ["#CleanBeauty", "#Sustainability", "#BeautyIndustry"],
    cta: "What's your take? Let's discuss",
    expectedEngagement: "High authority positioning",
    imageAsset: "SUN_static.png",
    qc: {
      status: "approved",
      visualChecks: [
        { label: "Colors match brand?", passed: true },
        { label: "Professional quality?", passed: true },
        { label: "Matches creative brief?", passed: true },
        { label: "Text readable?", passed: true },
        { label: "Aspect ratio correct?", passed: true },
      ],
      copyChecks: [
        { label: "Hook is strong?", passed: true },
        { label: "Tone matches brand?", passed: true },
        { label: "Follows copy direction?", passed: true },
        { label: "Hashtags relevant?", passed: true },
        { label: "CTA clear?", passed: true },
      ],
    },
    publish: { status: "scheduled" },
  },
];

export const assets = {
  images: [
    { name: "MON_static.png", postId: "MON_001" },
    { name: "TUE_carousel.png", postId: "TUE_001" },
    { name: "WED_static.png", postId: "WED_001" },
    { name: "THU_static.png", postId: "THU_001" },
    { name: "SAT_carousel.png", postId: "SAT_001" },
    { name: "SUN_static.png", postId: "SUN_001" },
  ],
  videos: [
    { name: "MON_video.mp4", postId: "MON_001" },
    { name: "WED_video.mp4", postId: "WED_001" },
    { name: "THU_video.mp4", postId: "THU_001" },
    { name: "FRI_video.mp4", postId: "FRI_001" },
    { name: "SAT_video.mp4", postId: "SAT_001" },
  ],
};

export const reports = [
  { name: "Competitor Analysis Report", format: "PDF", updated: "2025-01-20" },
  { name: "Trend Analysis Report", format: "PDF", updated: "2025-01-21" },
  { name: "Content Strategy Report", format: "PDF", updated: "2025-01-22" },
  { name: "Quality Check Report", format: "PDF", updated: "2025-01-29" },
  { name: "Publishing Log", format: "CSV", updated: "2025-01-27" },
  { name: "Engagement Metrics", format: "Live Dashboard", updated: "Live" },
];

export function getPostById(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}

export const pillarColors: Record<PillarKey, string> = {
  Education: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Transformation: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Transparency: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Cruelty-Free Values": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Community: "bg-pink-500/15 text-pink-300 border-pink-500/30",
};

export const qcStatusMeta: Record<
  QCStatus,
  { label: string; className: string }
> = {
  approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  revision_requested: { label: "Revision requested", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  pending: { label: "Pending review", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};
