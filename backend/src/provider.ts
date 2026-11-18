import { z } from "zod";

export type ProviderRecord = {
  accounts: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  interactions: Array<Record<string, unknown>>;
};

const responseSchema = z.object({}).passthrough();

export class ConfigurationError extends Error {}

export class EnsembleDataProvider {
  private token = process.env.ENSEMBLEDATA_API_TOKEN?.trim();
  private baseUrl = process.env.ENSEMBLEDATA_BASE_URL?.replace(/\/$/, "") ||
    "https://ensembledata.com/apis";

  async fetch(operation: string, params: Record<string, unknown>): Promise<ProviderRecord> {
    if (!this.token) throw new ConfigurationError("ENSEMBLEDATA_API_TOKEN is not configured");

    const configuredPath = process.env[`ENSEMBLEDATA_${operation.toUpperCase()}_PATH`];
    const path = configuredPath || this.getDefaultPath(operation);
    const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    url.searchParams.set("token", this.token);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Provider request failed (${response.status})`);
    }
    const json = responseSchema.parse(await response.json());
    return this.normalizeResponse(operation, json);
  }

  private getDefaultPath(operation: string) {
    const paths: Record<string, string> = {
      account: "tiktok/user/info",
      post: "tiktok/post/info",
      keyword: "tiktok/post/search",
      hashtag: "tiktok/post/hashtag",
      trending: "tiktok/post/trending",
      mixed: "tiktok/post/search",
    };
    return paths[operation] || "tiktok/post/search";
  }

  private normalizeResponse(operation: string, json: Record<string, unknown>): ProviderRecord {
    const data = json.data;
    const rows = Array.isArray(data) ? data : data && typeof data === "object"
      ? [data]
      : [];
    if (operation === "account") {
      return { accounts: rows, posts: [], interactions: [] };
    }
    return { accounts: [], posts: rows, interactions: [] };
  }
}
