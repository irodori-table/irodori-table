import { describe, expect, it } from "vitest";
import {
  connectionEnvironment,
  groupConnectionProfiles,
} from "@/features/connections/connection-groups";
import {
  newDraft,
  type ConnectionDraft,
} from "@/features/connections/connection-profiles";

// newDraft points at 127.0.0.1, which alone reads as "local"; the tests set
// a remote host so only the field under test decides the bucket.
function remote(
  seed: number,
  patch: Partial<ConnectionDraft> = {},
): ConnectionDraft {
  return { ...newDraft(seed), host: "db.example.internal", ...patch };
}

describe("connection groups", () => {
  it("guesses the environment from the profile's name, host, database, and URL", () => {
    expect(connectionEnvironment(remote(1, { name: "Orders prod" }))).toBe(
      "prod",
    );
    expect(
      connectionEnvironment(remote(2, { host: "db.staging.internal" })),
    ).toBe("stg");
    expect(connectionEnvironment(remote(3, { database: "qa" }))).toBe("dev");
    expect(
      connectionEnvironment(remote(4, { url: "postgres://localhost/app" })),
    ).toBe("local");
    expect(connectionEnvironment(remote(5, { name: "Shared" }))).toBe("other");
  });

  it("keeps the fixed group order and omits empty groups", () => {
    const groups = groupConnectionProfiles([
      remote(1, { name: "Local", host: "localhost" }),
      remote(2, { name: "Production" }),
      remote(3, { name: "Second local", host: "127.0.0.1" }),
    ]);

    expect(groups.map((group) => group.id)).toEqual(["prod", "local"]);
    expect(groups[1].profiles.map((profile) => profile.name)).toEqual([
      "Local",
      "Second local",
    ]);
    expect(groups[0].labelKey).toBe("connection.group.prod");
  });
});
