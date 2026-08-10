import { readDoc, writeDoc } from "@/lib/doc-store";


const REQUESTS_KEY = "requests.json";
const resultKey = (id: string) => `results/${id}.json`;

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

export async function listRequests(): Promise<ResearchRequest[]> {
  return readDoc<ResearchRequest[]>(REQUESTS_KEY, []);
}

export async function getRequest(id: string): Promise<ResearchRequest | undefined> {
  const requests = await listRequests();
  return requests.find((r) => r.id === id);
}

export async function saveRequests(requests: ResearchRequest[]): Promise<void> {
  await writeDoc(REQUESTS_KEY, requests);
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
  return readDoc<ResearchResult | undefined>(resultKey(id), undefined);
}

export async function saveResult(result: ResearchResult): Promise<void> {
  await writeDoc(resultKey(result.requestId), result);
}

export async function setRequestStatus(
  id: string,
  status: ResearchStatus
): Promise<void> {
  const requests = await listRequests();
  const req = requests.find((r) => r.id === id);
  if (!req) return;
  req.status = status;
  await saveRequests(requests);
}
