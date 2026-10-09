import { describe, expect, it } from "vitest";
import { resolveTryScenario } from "../../features/tryLink";
import { SCENARIOS } from "../../../web/scenarios";

describe("?try=<scenario-id> deep link", () => {
  it("resolves every shipped scenario by id", () => {
    for (const scenario of SCENARIOS) {
      expect(resolveTryScenario(`?try=${scenario.id}`, SCENARIOS)?.id).toBe(scenario.id);
    }
    expect(resolveTryScenario("?try=replay-guard", SCENARIOS)?.name).toBe("Replay against a guarded sink");
  });

  it("works alongside other parameters and a hash-free search string", () => {
    expect(resolveTryScenario("?flag=ff_metrics&try=ts-vs-position", SCENARIOS)?.id).toBe("ts-vs-position");
  });

  it("ignores unknown ids, empty values and a missing parameter", () => {
    for (const search of ["", "?", "?try=", "?try=nope", "?scenario=replay-guard", "?trying=replay-guard", null, undefined]) {
      expect(resolveTryScenario(search, SCENARIOS)).toBeNull();
    }
  });

  it("treats the value only as a lookup key: markup, paths, case changes and overlong ids never match", () => {
    const hostile = [
      "<img src=x onerror=alert(1)>",
      "replay-guard<script>",
      "replay-guard%0A",
      "../replay-guard",
      "REPLAY-GUARD",
      " replay-guard",
      "replay-guard ",
      "replay_guard",
      "__proto__",
      "constructor",
      "a".repeat(5000),
    ];
    for (const value of hostile) {
      expect(resolveTryScenario(`?try=${encodeURIComponent(value)}`, SCENARIOS)).toBeNull();
    }
  });

  it("uses the first value when the parameter repeats", () => {
    expect(resolveTryScenario("?try=nope&try=replay-guard", SCENARIOS)).toBeNull();
    expect(resolveTryScenario("?try=replay-guard&try=nope", SCENARIOS)?.id).toBe("replay-guard");
  });
});
