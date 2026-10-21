import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/o/northstar/dashboard", "/o/northstar/dashboard"],
    ["/invite/abc?x=1", "/invite/abc?x=1"],
    ["/a/../workspaces", "/workspaces"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/",
    "//evil.example/steal",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/x\u0000y",
    "",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/workspaces");
  });

  it("rejects non-strings and uses the given fallback", () => {
    expect(safeNextPath(null, "/sign-in")).toBe("/sign-in");
    expect(safeNextPath(["/a"], "/sign-in")).toBe("/sign-in");
  });
});
