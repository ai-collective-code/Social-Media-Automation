import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUESTS_FILE = path.join(DATA_DIR, "requests.json");
const RESULTS_DIR = path.join(DATA_DIR, "results");

export type Competitor = { name: string; url?: string };

export type ResearchStatus = "pending" | "researching" | "complete";

export type ResearchRequest = {
  id: string;
  companyName: string;
  domain?: string;
  industry?: string;
  competitors: Competitor[];
  status: ResearchStatus;
  createdAt: string;
};

export type PlatformFinding = {
  platform: string;
  handle?: string;
  url?: string;
  followers?: number;
  engagementRate?: number;
  postingFrequency?: string;
  topContentThemes?: string[];
  gaps?: string[];
  notes?: string;
};

export type CompetitorFinding = {
  name: string;
  platforms: PlatformFinding[];
  summary?: string;
};

export type ResearchResult = {
  requestId: string;
  companyName: string;
  competitors: CompetitorFinding[];
  keyGaps: string[];
  recommendations: string[];
  researchedAt: string;
  sources: string[];
};

async function ensureDataDir() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

export async function listRequests(): Promise<ResearchRequest[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(REQUESTS_FILE, "utf-8");
    return JSON.parse(raw) as ResearchRequest[];
  } catch {
    return [];
  }
}

export async function getRequest(id: string): Promise<ResearchRequest | undefined> {
  const requests = await listRequests();
  return requests.find((r) => r.id === id);
}

export async function saveRequests(requests: ResearchRequest[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2), "utf-8");
}

export async function createRequest(
  input: Omit<ResearchRequest, "id" | "status" | "createdAt">
): Promise<ResearchRequest> {
  const requests = await listRequests();
  const request: ResearchRequest = {
    ...input,
    id: `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  requests.unshift(request);
  await saveRequests(requests);
  return request;
}

export async function getResult(id: string): Promise<ResearchResult | undefined> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as ResearchResult;
  } catch {
    return undefined;
  }
}
