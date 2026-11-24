"use client";

import { useEffect } from "react";
import type { Market } from "@repo/shared";
import { exchangeApi } from "@/lib/api/exchange-api";
import { isDepthEvent, isTradeEvent } from "@/lib/api/types";
import { WS_URL } from "@/lib/env";
import { marketStreamReset } from "@/lib/store/actions";
import { depthEventReceived, snapshotFailed, snapshotReceived, snapshotRequested } from "@/lib/store/book-slice";
import { useAppDispatch } from "@/lib/store/store";
import { socketStatusChanged } from "@/lib/store/stream-slice";
import { tradeReceived } from "@/lib/store/trades-slice";
import { openReconnectingSocket } from "@/lib/ws/reconnecting-socket";

// depth events have no sequence ids, so the snapshot is also refetched on a
// timer as a safety net against missed events
const SNAPSHOT_REFRESH_MS = 30_000;

// opens <SYMBOL>@depth and <SYMBOL>@trade for the given market. every open or
// reconnect of the depth socket refetches the snapshot and replaces the book.
// changing symbol closes both sockets and clears book and trades.
export function useMarketStream(symbol: Market) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let disposed = false;
    let snapshotSeq = 0;
    dispatch(marketStreamReset(symbol));

    const requestSnapshot = async () => {
      const seq = ++snapshotSeq;
      dispatch(snapshotRequested(symbol));
      const request = dispatch(
        exchangeApi.endpoints.getDepth.initiate(symbol, { subscribe: false, forceRefetch: true }),
      );
      try {
        const depth = await request.unwrap();
        if (disposed || seq !== snapshotSeq) return;
        dispatch(snapshotReceived(depth));
      } catch {
        if (disposed || seq !== snapshotSeq) return;
        dispatch(snapshotFailed(symbol));
      }
    };

    const depth = openReconnectingSocket(`${WS_URL}/ws/${symbol}@depth`, {
      onOpen: () => {
        dispatch(socketStatusChanged({ symbol, stream: "depth", status: "open" }));
        void requestSnapshot();
      },
      onClose: () => dispatch(socketStatusChanged({ symbol, stream: "depth", status: "reconnecting" })),
      onMessage: (data) => {
        if (isDepthEvent(data) && data.s === symbol) dispatch(depthEventReceived(data));
      },
    });

    const trade = openReconnectingSocket(`${WS_URL}/ws/${symbol}@trade`, {
      onOpen: () => dispatch(socketStatusChanged({ symbol, stream: "trade", status: "open" })),
      onClose: () => dispatch(socketStatusChanged({ symbol, stream: "trade", status: "reconnecting" })),
      onMessage: (data) => {
        if (isTradeEvent(data) && data.s === symbol) dispatch(tradeReceived(data));
      },
    });

    const refresh = setInterval(() => void requestSnapshot(), SNAPSHOT_REFRESH_MS);

    return () => {
      disposed = true;
      clearInterval(refresh);
      depth.close();
      trade.close();
    };
  }, [dispatch, symbol]);
}
