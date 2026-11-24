import type { Metadata } from "next";
import { TradeView } from "@/components/trade-view";

export const metadata: Metadata = { title: "Trade | crypto-exchange" };

export default function TradePage() {
  return <TradeView />;
}
