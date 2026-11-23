// @feature SHL-077
import { describe, expect, it } from "vitest";
import type { SocialEnv } from "~/lib/config";
import { socialEnvFrom } from "~/lib/config";
import { socialEnvForVersion, socialVersionCookie, socialVersionFromCookie, socialVersionFromQuery } from "./version";

const DEV: SocialEnv = {
  manifestUrl: "https://surface-abc.coolifydev.sefaria.org/manifest.json",
  allowedOrigins: ["https://surface-abc.coolifydev.sefaria.org"],
  apiOrigin: "https://app-abc.coolifydev.sefaria.org",
  relayOrigin: "wss://relay-abc.coolifydev.sefaria.org",
  environment: "staging",
  previews: true,
};

describe("?social_version", () => {
  it("reads a pull request number or clear from the query, and ignores anything else", () => {
    expect(socialVersionFromQuery("?social_version=42")).toEqual({ set: "42" });
    expect(socialVersionFromQuery("?a=1&social_version=clear")).toEqual({ clear: true });
    expect(socialVersionFromQuery("?social_version=evil.example.org")).toBeNull();
    expect(socialVersionFromQuery("?social_version=")).toBeNull();
    expect(socialVersionFromQuery("")).toBeNull();
  });

  it("remembers the version in a session cookie and forgets it", () => {
    expect(socialVersionCookie("42", true)).toBe("social_version=42; path=/; SameSite=Lax; Secure");
    expect(socialVersionCookie(null)).toBe("social_version=; max-age=0; path=/; SameSite=Lax");
    expect(socialVersionFromCookie("a=1; social_version=42; b=2")).toBe("42");
    expect(socialVersionFromCookie("social_version=x")).toBeNull();
    expect(socialVersionFromCookie("")).toBeNull();
  });

  it("points every origin at pull request n's preview host, and drops a dev entry", () => {
    expect(socialEnvForVersion({ ...DEV, devEntry: "http://localhost:3200/src/surface/entry.ts" }, "42")).toEqual({
      manifestUrl: "https://42.surface-abc.coolifydev.sefaria.org/manifest.json",
      allowedOrigins: ["https://42.surface-abc.coolifydev.sefaria.org"],
      apiOrigin: "https://42.app-abc.coolifydev.sefaria.org",
      relayOrigin: "wss://42.relay-abc.coolifydev.sefaria.org",
      environment: "staging",
      previews: true,
    });
  });

  it("keeps the configured deployment without a version, without previews, or in production", () => {
    expect(socialEnvForVersion(DEV, null)).toBe(DEV);
    const off = { ...DEV, previews: false };
    expect(socialEnvForVersion(off, "42")).toBe(off);
    const prod = { ...DEV, environment: "production" as const };
    expect(socialEnvForVersion(prod, "42")).toBe(prod);
    expect(socialEnvForVersion(undefined, "42")).toBeUndefined();
  });

  it("allows previews only when PUBLIC_SOCIAL_PREVIEWS is 1 and the environment is not production", () => {
    const base = { PUBLIC_SOCIAL_MANIFEST_URL: DEV.manifestUrl, PUBLIC_SOCIAL_ORIGINS: DEV.allowedOrigins[0] };
    expect(socialEnvFrom({ ...base, PUBLIC_SOCIAL_ENVIRONMENT: "staging", PUBLIC_SOCIAL_PREVIEWS: "1" })?.previews).toBe(true);
    expect(socialEnvFrom({ ...base, PUBLIC_SOCIAL_ENVIRONMENT: "staging" })?.previews).toBeUndefined();
    expect(socialEnvFrom({ ...base, PUBLIC_SOCIAL_ENVIRONMENT: "production", PUBLIC_SOCIAL_PREVIEWS: "1" })?.previews).toBeUndefined();
  });
});
