/**
 * `?try=<scenario-id>` deep link: opening the playground with this parameter
 * loads and starts that scenario in the Compare tab.
 *
 * The value is only ever used as a lookup key into the scenario list. Anything
 * that is not exactly the id of a known scenario is ignored.
 */
export const TRY_PARAM = "try";

// Scenario ids are lowercase words joined by hyphens. Rejecting anything else
// before the lookup keeps odd input from ever reaching it.
const TRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRY_ID_MAX_LENGTH = 64;

export function resolveTryScenario<T extends { id: string }>(
  search: string | null | undefined,
  scenarios: readonly T[],
): T | null {
  if (!search) return null;
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get(TRY_PARAM);
  } catch {
    return null;
  }
  if (!raw || raw.length > TRY_ID_MAX_LENGTH || !TRY_ID_PATTERN.test(raw)) return null;
  return scenarios.find(scenario => scenario.id === raw) ?? null;
}
