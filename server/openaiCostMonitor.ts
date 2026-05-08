import { getEffectiveAiProviderSource, getOpenAiApiKeyForSource } from "./openaiClient";

export type OpenAiCostSummary = {
  available: boolean;
  totalUsd: number | null;
  currency: string | null;
  source: "openai_costs_api";
  error: string | null;
};

type CostBucket = {
  amount?: {
    value?: number;
    currency?: string;
  };
};

type CostApiResponse = {
  data?: Array<{
    results?: CostBucket[];
  }>;
  next_page?: string | null;
};

const OPENAI_COSTS_API_URL = "https://api.openai.com/v1/organization/costs";

export async function fetchOpenAiCostSummary(params: {
  startDate: Date;
  endDate?: Date;
}): Promise<OpenAiCostSummary> {
  const preferredKey =
    getOpenAiApiKeyForSource("personal") || getOpenAiApiKeyForSource(getEffectiveAiProviderSource());

  if (!preferredKey) {
    return {
      available: false,
      totalUsd: null,
      currency: null,
      source: "openai_costs_api",
      error: "No OpenAI API key available for cost lookup.",
    };
  }

  const startTime = Math.floor(params.startDate.getTime() / 1000);
  const endTime = Math.floor((params.endDate || new Date()).getTime() / 1000);
  const bucketDays = Math.max(1, Math.ceil((endTime - startTime) / 86400));
  const url = new URL(OPENAI_COSTS_API_URL);
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("end_time", String(endTime));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", String(Math.min(bucketDays + 1, 180)));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${preferredKey}`,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return {
        available: false,
        totalUsd: null,
        currency: null,
        source: "openai_costs_api",
        error: `Costs API returned ${response.status}${message ? `: ${message}` : ""}`,
      };
    }

    const payload = (await response.json()) as CostApiResponse;
    const buckets = Array.isArray(payload?.data) ? payload.data : [];
    let totalUsd = 0;
    let currency: string | null = null;

    for (const bucket of buckets) {
      const results = Array.isArray(bucket?.results) ? bucket.results : [];
      for (const result of results) {
        const value = result?.amount?.value;
        if (typeof value === "number" && Number.isFinite(value)) {
          totalUsd += value;
          if (!currency && typeof result?.amount?.currency === "string") {
            currency = result.amount.currency;
          }
        }
      }
    }

    return {
      available: true,
      totalUsd,
      currency: currency || "usd",
      source: "openai_costs_api",
      error: null,
    };
  } catch (error: any) {
    return {
      available: false,
      totalUsd: null,
      currency: null,
      source: "openai_costs_api",
      error: error?.message || "OpenAI costs lookup failed.",
    };
  }
}
