import { API_URL } from "@/lib/env";
import { ASSET_DECIMALS, type Asset } from "@/lib/config/markets";
import { formatAmount } from "@/lib/decimal";
import type { ApiErrorBody } from "./types";

export type ApiRequest = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  accountId?: string;
};

// serializable error shape stored by rtk query
export type ApiFailure = { status: number; data: ApiErrorBody };

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && typeof (value as ApiErrorBody).error === "string";
}

export async function apiRequest<T>({ path, method = "GET", query, body, accountId }: ApiRequest): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accountId) headers["X-Account-Id"] = accountId;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, { error: "network_error" });
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, isErrorBody(parsed) ? parsed : { error: `http_${res.status}` });
  }
  return parsed as T;
}

function isApiFailure(value: unknown): value is ApiFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiFailure).status === "number" &&
    isErrorBody((value as ApiFailure).data)
  );
}

function assetDecimals(asset: string | undefined): number {
  return asset && asset in ASSET_DECIMALS ? ASSET_DECIMALS[asset as Asset] : 8;
}

// one human sentence for any api error body
export function describeApiError(err: unknown): string {
  const body = err instanceof ApiError ? err.body : isApiFailure(err) ? err.data : null;
  if (!body) return "Something went wrong.";

  switch (body.error) {
    case "insufficient_funds": {
      const decimals = assetDecimals(body.asset);
      return `Insufficient ${body.asset}: need ${formatAmount(body.required ?? "0", decimals)}, have ${formatAmount(body.available ?? "0", decimals)}.`;
    }
    case "invalid_input": {
      const issues = (body.details ?? [])
        .map((i) => (i.path && i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
      return issues ? `Invalid input. ${issues}.` : "Invalid input.";
    }
    case "order_not_found":
      return "Order not found. It may have already filled or been canceled.";
    case "account_not_found":
      return "Account not found.";
    case "database_unavailable":
      return "The exchange database is unavailable.";
    case "network_error":
      return "Cannot reach the API.";
    case "internal_error":
      return "The API hit an internal error.";
    default:
      return `Request failed (${body.error}).`;
  }
}
