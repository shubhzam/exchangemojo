import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import type { CreateOrderInput, Market } from "@repo/shared";
import type { Asset } from "@/lib/config/markets";
import { ApiError, apiRequest, type ApiFailure, type ApiRequest } from "./client";
import type {
  AccountResponse,
  CancelOrderResponse,
  DepthResponse,
  OpenOrder,
  OrderResponse,
} from "./types";

const baseQuery: BaseQueryFn<ApiRequest, unknown, ApiFailure> = async (req) => {
  try {
    return { data: await apiRequest<unknown>(req) };
  } catch (err) {
    if (err instanceof ApiError) return { error: { status: err.status, data: err.body } };
    return { error: { status: 0, data: { error: "client_error" } } };
  }
};

// account-scoped endpoints take accountId as their argument, so each account
// gets its own cache entry and switching accounts never shows stale data.
export const exchangeApi = createApi({
  reducerPath: "exchangeApi",
  baseQuery,
  tagTypes: ["Account", "OpenOrders"],
  endpoints: (build) => ({
    getAccount: build.query<AccountResponse, string>({
      query: (accountId) => ({ path: "/api/v3/account", accountId }),
      providesTags: (_result, _error, accountId) => [{ type: "Account", id: accountId }],
    }),
    getOpenOrders: build.query<OpenOrder[], { accountId: string; symbol?: Market }>({
      query: ({ accountId, symbol }) => ({ path: "/api/v3/openOrders", accountId, query: { symbol } }),
      providesTags: (_result, _error, { accountId }) => [{ type: "OpenOrders", id: accountId }],
    }),
    // fetched imperatively by useMarketStream and written into the book slice
    getDepth: build.query<DepthResponse, Market>({
      query: (symbol) => ({ path: "/api/v3/depth", query: { symbol } }),
      keepUnusedDataFor: 0,
    }),
    createAccount: build.mutation<AccountResponse, { balances: Partial<Record<Asset, string>> }>({
      query: (body) => ({ path: "/api/v1/accounts", method: "POST", body }),
    }),
    placeOrder: build.mutation<OrderResponse, { accountId: string; order: CreateOrderInput }>({
      query: ({ accountId, order }) => ({ path: "/api/v3/order", method: "POST", accountId, body: order }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: "Account", id: accountId },
        { type: "OpenOrders", id: accountId },
      ],
    }),
    cancelOrder: build.mutation<CancelOrderResponse, { accountId: string; symbol: Market; orderId: string }>({
      query: ({ accountId, symbol, orderId }) => ({
        path: "/api/v3/order",
        method: "DELETE",
        accountId,
        query: { symbol, orderId },
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: "Account", id: accountId },
        { type: "OpenOrders", id: accountId },
      ],
    }),
  }),
});

export const {
  useGetAccountQuery,
  useLazyGetAccountQuery,
  useGetOpenOrdersQuery,
  useCreateAccountMutation,
  usePlaceOrderMutation,
  useCancelOrderMutation,
} = exchangeApi;
