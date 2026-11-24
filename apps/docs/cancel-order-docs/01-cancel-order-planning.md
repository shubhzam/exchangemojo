# Cancel Order - Planning

## Functional Knowledge

A resting order (`NEW` or `PARTIALLY_FILLED`) can be removed from the book before it fully matches. Right now there's no way to do this - matching is the only exit from the book. Canceling a `PARTIALLY_FILLED` order cancels only the *remaining* unmatched quantity; whatever already executed stays executed - trades are immutable (Order Matching, core entities), so there's no other option, and this matches real exchange behavior. A `FILLED` order has already left the book entirely - nothing to cancel, this is a not-found case, not a special status transition.

Worth naming plainly: cancellation is unauthenticated, same as everything else in this project, but this is a sharper edge of that decision than Place Order's was - removing someone else's resting liquidity is a clearer abuse vector than adding your own order. Standing decision, not a new one, but worth saying out loud rather than letting it be an accidental gap.

## Identified Pattern

**Contention again - the same race class as Order Matching, not a new one.** A cancel for order X could arrive while a concurrent match is mid-computation against X's price level. The fix is the same mechanism already proven there: removal from the in-memory book must be synchronous and uninterrupted, so the event loop can't interleave a cancel and a match against the same order. This feature inherits that discipline; it doesn't reinvent it.

## Core Entities

No new entity. `Order` gains a fourth `status` value, `CANCELED`. No new `Trade` - a cancel produces no execution, only removes resting liquidity.

## Access Patterns

1. Cancel: given an `orderId`, find it in the book - **not** by price, by id. `OrderBook` currently has no id-based lookup, only price-level scanning. This is a genuine gap the class needs to close, not a reuse of something that already exists.
2. Read after cancel: no new pattern - `getDepth` already filters `status IN (NEW, PARTIALLY_FILLED)`, so a `CANCELED` order falls out of that query with zero changes needed there.

## Object Design

No new pattern. `OrderBook` gains an internal `Map<orderId, BookOrder>` alongside its existing price-level arrays, for O(1) cancel lookup. This creates a new invariant `match()` didn't have before: removing a fully-filled maker from a price level must *also* remove it from this id map, or a future cancel against an already-filled order silently misses and returns not-found for the wrong reason.

## Concurrency

Same mechanism as Order Matching, applied to a second operation. Cancellation's lookup-and-remove must be one synchronous block, no `await` in the middle, for the identical reason match() requires it. Because both operations mutate the same book synchronously, they can never interleave with each other either - a cancel and a match racing for the same order resolve deterministically: whichever's synchronous block runs first wins, the other correctly finds nothing.

## Decision Log

1. Cancel affects only remaining quantity on a partial fill → forced by trades being immutable (Order Matching, core entities) → locks in `executedQty` unchanged, only `remainingQuantity`'s fate changes → rejected: nothing, there's no real alternative once trades are immutable.
2. Cancellation is synchronous, same mechanism as `match()` → forced by identical contention analysis → locks in no `await` between id lookup and in-memory removal → rejected: nothing new here either - this is direct reuse, not a fresh tradeoff.
3. `OrderBook` gains an id-indexed `Map` → forced by the access pattern needing id lookup, not price lookup → locks in `match()`'s fill-removal path must also delete from this map → rejected: linear scan across all price levels per cancel, wrong once book depth grows.
4. `remainingQuantity` is left as-is at cancel time, not zeroed → forced by wanting the canceled row to still honestly record how much was unfilled when it was pulled → rejected: zeroing it, which would erase real information for no benefit once `status: CANCELED` already signals nothing more will happen.

## Where This Breaks First / Open Questions

No new breakage mode beyond what Order Matching already accepted - this reuses that mechanism exactly. The one thing worth confirming rather than assuming: canceling an already-`FILLED`, already-`CANCELED`, or nonexistent `orderId` all return the same 404 - Binance itself doesn't distinguish these cases either (single error code, `-2011`), and from the client's side "nothing left to cancel" is one condition, not three.

## Definition of Done

- Canceling a resting `NEW` order removes it from the book, returns `status: CANCELED`
- Canceling a `PARTIALLY_FILLED` order cancels only the remainder; `executedQty` reflects what already filled
- Order-book read no longer shows the canceled order
- Canceling an already-terminal or nonexistent `orderId` returns a clean 404, not a crash
- Concurrency check: a cancel and a crossing match racing for the same order resolve deterministically, never both partially succeeding
- Restart check: a canceled order does not reappear in the book after a rebuild
