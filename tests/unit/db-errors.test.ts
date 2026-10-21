import { messageForDbError } from "@/lib/db-errors";

describe("messageForDbError", () => {
  it("maps stable error keys to friendly messages", () => {
    expect(messageForDbError({ code: "55000", message: "last_owner" })).toMatch(
      /at least one active Owner/,
    );
    expect(messageForDbError({ code: "42501", message: "mfa_required" })).toMatch(/two-factor/);
    expect(messageForDbError({ code: "55000", message: "invitation_used" })).toMatch(
      /already been used/,
    );
  });

  it("maps workflow errors", () => {
    expect(messageForDbError({ code: "55000", message: "stale_version" })).toMatch(
      /Someone else changed this/,
    );
    expect(messageForDbError({ code: "42501", message: "independent_approval_required" })).toMatch(
      /another approver/,
    );
    expect(messageForDbError({ code: "55000", message: "insufficient_on_hand" })).toMatch(
      /not enough stock/,
    );
  });

  it("shows validation details without SQL", () => {
    expect(
      messageForDbError({ code: "22023", message: "validation_failed: unknown time zone" }),
    ).toBe("Unknown time zone.");
  });

  it("never echoes raw database messages", () => {
    const raw =
      'duplicate key value violates unique constraint "organization_members_organization_id_user_id_key"';
    expect(messageForDbError({ code: "23505", message: raw })).toBe(
      "Something went wrong. Try again in a moment.",
    );
    expect(
      messageForDbError({ code: "42501", message: "permission denied for table customers" }),
    ).toMatch(/permission/);
    expect(messageForDbError(null)).toBe("Something went wrong. Try again in a moment.");
  });
});
