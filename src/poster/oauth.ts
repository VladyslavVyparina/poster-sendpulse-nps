import { config } from "../config.js";
import { logger } from "../logger.js";

export function getPosterConnectUrl(): string {
  return `${config.publicBaseUrl}/poster-connect`;
}

export function getPosterAuthorizeUrl(account?: string): string {
  const redirectUri = encodeURIComponent(getPosterConnectUrl());
  const appId = config.posterApplicationId;
  if (account) {
    return `https://${account}.joinposter.com/api/auth?application_id=${appId}&redirect_uri=${redirectUri}&response_type=code`;
  }
  return `https://joinposter.com/api/auth?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code`;
}

export async function exchangePosterAuthCode(opts: {
  account: string;
  code: string;
}): Promise<{ access_token: string; account: string }> {
  const account = opts.account.trim();
  const code = opts.code.trim();
  if (!account || !code) {
    throw new Error("Missing account or code from Poster OAuth redirect");
  }
  if (!config.posterApplicationId || !config.posterApplicationSecret) {
    throw new Error("POSTER_APPLICATION_ID and POSTER_APPLICATION_SECRET must be set");
  }

  const redirectUri = getPosterConnectUrl();
  const url = `https://${account}.joinposter.com/api/v2/auth/access_token`;
  const body = new FormData();
  body.set("application_id", String(config.posterApplicationId));
  body.set("application_secret", config.posterApplicationSecret);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirectUri);
  body.set("code", code);

  const response = await fetch(url, { method: "POST", body });
  const json = (await response.json()) as {
    access_token?: string;
    error_message?: string;
    message?: string;
    code?: number | string;
  };

  if (!response.ok || !json.access_token) {
    logger.error("Poster OAuth token exchange failed", {
      account,
      status: response.status,
      body: json,
    });
    throw new Error(
      json.error_message || json.message || `Poster OAuth failed (HTTP ${response.status})`,
    );
  }

  return { access_token: json.access_token, account };
}
