import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { exchangeApi } from "@/lib/api/exchange-api";
import { bookReducer } from "./book-slice";
import { prefsReducer } from "./prefs-slice";
import { streamReducer } from "./stream-slice";
import { tradesReducer } from "./trades-slice";

export function makeStore() {
  return configureStore({
    reducer: {
      [exchangeApi.reducerPath]: exchangeApi.reducer,
      book: bookReducer,
      trades: tradesReducer,
      stream: streamReducer,
      prefs: prefsReducer,
    },
    middleware: (getDefault) => getDefault().concat(exchangeApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
