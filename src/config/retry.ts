import { RetryConfig } from "ts-retry-promise";

export const baseRetryConfig: Partial<RetryConfig<any>> = {
  retries: "INFINITELY",
  timeout: "INFINITELY",
  logger: console.log,
  delay: 500,
  backoff: "FIXED",
};
