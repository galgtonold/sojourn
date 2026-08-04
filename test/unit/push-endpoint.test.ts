import { describe, it, expect } from "vitest";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";

// /api/push accepts viewer subscriptions anonymously — a visitor opting their
// own browser in — and stored whatever URL it was handed, which the push sender
// later POSTs to. That is an SSRF primitive behind an open endpoint.

describe("real push endpoints still work", () => {
  for (const url of [
    "https://fcm.googleapis.com/fcm/send/dGhpc2lzYWZha2V0b2tlbg",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://web.push.apple.com/QMEAAAAA",
    "https://sfo.notify.windows.com/w/?token=abc",
    // Self-hosted push services exist; this is not an allowlist of vendors.
    "https://push.example.org/subscription/abc123",
  ]) {
    it(`accepts ${new URL(url).host}`, () => {
      expect(isAllowedPushEndpoint(url)).toBe(true);
    });
  }
});

describe("it refuses anything aimed back at the host or its network", () => {
  for (const [url, why] of [
    ["http://fcm.googleapis.com/x", "not HTTPS"],
    ["https://localhost/x", "loopback by name"],
    ["https://127.0.0.1/x", "loopback"],
    ["https://[::1]/x", "loopback, IPv6"],
    ["https://10.0.0.5:8080/x", "private range"],
    ["https://172.16.4.1/x", "private range"],
    ["https://192.168.1.1/x", "private range"],
    ["https://169.254.169.254/latest/meta-data/", "cloud metadata"],
    ["https://100.64.0.1/x", "carrier-grade NAT"],
    ["https://0.0.0.0/x", "unspecified"],
    ["https://[fd00::1]/x", "unique-local IPv6"],
    ["https://[fe80::1]/x", "link-local IPv6"],
    ["https://[::ffff:10.0.0.1]/x", "IPv4-mapped private"],
    ["https://db/x", "bare hostname — resolves on the host's own network"],
    ["https://redis.internal/x", "internal TLD"],
    ["https://printer.local/x", "mDNS"],
    ["https://user:pass@fcm.googleapis.com/x", "credentials in the URL"],
    ["file:///etc/passwd", "not a URL we send to"],
    ["not a url at all", "unparseable"],
  ] as const) {
    it(`refuses ${url} (${why})`, () => {
      expect(isAllowedPushEndpoint(url)).toBe(false);
    });
  }
});
