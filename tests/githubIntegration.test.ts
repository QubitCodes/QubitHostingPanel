import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { matchingCoolifyGithubSource } from "@services/github/coolifyGithubSourceService";
import { normalizeGithubPrivateKey } from "@services/github/githubAppService";

describe("GitHub deployment integration", () => {
  it("normalizes GitHub PKCS1 private keys to PKCS8", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs1" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    expect(privateKey).toContain("BEGIN RSA PRIVATE KEY");
    expect(normalizeGithubPrivateKey(privateKey)).toContain(
      "BEGIN PRIVATE KEY",
    );
  });

  it("matches a Coolify source by app and installation identity", () => {
    const sources = [
      { app_id: 10, id: 1, installation_id: 20, uuid: "source-a" },
      { app_id: 10, id: 2, installation_id: 21, uuid: "source-b" },
    ];
    expect(matchingCoolifyGithubSource(sources, 10, 21)?.uuid).toBe("source-b");
    expect(matchingCoolifyGithubSource(sources, 11, 21)).toBeUndefined();
  });
});
