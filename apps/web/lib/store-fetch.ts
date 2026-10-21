import "server-only";
import { assertSafeUrl } from "@acezilla/seo";

/** fetch for store addresses typed in by users: each request is checked first, so a store URL can never point at our own network. */
export const guardedFetch: typeof fetch = async (input, init) => {
  await assertSafeUrl(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  return fetch(input, init);
};
