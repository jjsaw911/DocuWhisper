import { AsyncLocalStorage } from "node:async_hooks";

type RequestContextValue = {
  userId?: string;
  userEmail?: string | null;
  method?: string;
  path?: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContextValue>();

export const runWithRequestContext = <T>(
  value: RequestContextValue,
  callback: () => T,
): T => requestContextStorage.run(value, callback);

export const getRequestContext = (): RequestContextValue | undefined =>
  requestContextStorage.getStore();
