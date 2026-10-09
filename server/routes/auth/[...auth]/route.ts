import { Auth } from "@auth/core";
import { getAuthOptions } from "../../../../lib/auth";
import { getBaseUrl } from "../../../../lib/base-url";

const handler = (request: Request) => {
  const url = new URL(request.url);
  const canonical = new URL(url.pathname + url.search, getBaseUrl());
  return Auth(new Request(canonical, request), getAuthOptions());
};

export { handler as GET, handler as POST };
