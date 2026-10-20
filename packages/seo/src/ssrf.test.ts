import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeUrl, isPrivateIp, UnsafeUrlError } from "./ssrf";

const pub = async () => ["93.184.216.34"];
const rejects = (u: string, lookup = pub) => assert.rejects(assertSafeUrl(u, lookup), UnsafeUrlError, u);

test("private, loopback, link-local and metadata IPv4 are refused", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255", "198.18.0.1"])
    assert.equal(isPrivateIp(ip), true, ip);
});

test("public IPv4 is allowed, including edges of private ranges", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.15.0.1", "172.32.0.1", "11.0.0.1", "169.253.1.1", "100.63.0.1", "100.128.0.1"])
    assert.equal(isPrivateIp(ip), false, ip);
});

test("IPv6 loopback, ULA, link-local, mapped and NAT64 private addresses are refused", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "2001:db8::1"])
    assert.equal(isPrivateIp(ip), true, ip);
  assert.equal(isPrivateIp("2606:4700:4700::1111"), false);
  assert.equal(isPrivateIp("::ffff:8.8.8.8"), false);
});

test("bad schemes, ports, credentials and local names are refused", async () => {
  for (const u of ["file:///etc/passwd", "ftp://example.com", "gopher://example.com", "javascript:alert(1)", "data:text/html,hi", "http://example.com:8080/", "https://example.com:22/", "https://user:pw@example.com/",
    "http://localhost/", "http://foo.localhost/", "http://printer.local/", "http://db.internal/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://2130706433/", "not a url", ""])
    await rejects(u);
});

test("hostnames that resolve to private addresses are refused (DNS tricks)", async () => {
  await rejects("https://evil.example.com/", async () => ["10.0.0.1"]);
  await rejects("https://evil.example.com/", async () => ["93.184.216.34", "127.0.0.1"]);   // one bad record is enough
  await rejects("https://nxdomain.example.com/", async () => { throw new Error("ENOTFOUND"); });
  await rejects("https://empty.example.com/", async () => []);
});

test("ordinary public sites pass, with and without explicit standard ports", async () => {
  assert.equal((await assertSafeUrl("https://example.com/a?b=1", pub)).hostname, "example.com");
  assert.equal((await assertSafeUrl("http://example.com:80/", pub)).port, "");
  assert.equal((await assertSafeUrl("https://example.com:443/", pub)).hostname, "example.com");
  assert.equal((await assertSafeUrl("https://93.184.216.34/", pub)).hostname, "93.184.216.34");
});
