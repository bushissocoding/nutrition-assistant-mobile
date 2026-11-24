# Spec: Account-backed nutrition personalization preferences V1

Status: implementation complete in repository; live Supabase RLS and qualified nutrition review remain release gates.

## Objective

Persist a person's meal preferences and display choices with their verified account so the choices survive reloads and can inform the meal-plan request. Health profile values, allergies, and confirmed hard limits remain authoritative server-owned data; preference settings cannot disable or weaken them.

## Decisions

- Store only the finite choices already shown in `PersonalizationScreen`: dietary variety (`simple`, `balanced`, `varied`), the six preference chips (`vegetarian`, `low_sugar`, `low_salt`, `mild`, `Vietnamese`, `easy_cook`), an allergy-label reminder switch, and a confirmed-target display switch.
- Derive the server owner from verified Auth. Expose only `GET/PUT /api/v1/me/personalization`; validate exact keys and allowlists at the route and database RPC boundary. Use owner RLS for reads and an `auth.uid()` security-definer RPC for atomic writes.
- Keep allergy exclusions and server profile hard limits unconditional. The allergy reminder only changes the user-facing reminder. The target switch only controls display of user-entered confirmed ranges; it never changes meal-plan constraints.
- Send selected dietary variety, preference labels and the meal-planning screen's optional free-text preference as a bounded preference string to the current deterministic selector. Preferences are ranking hints only. When the current recipe/source set cannot match a hint, keep the plan's existing unmet-preference warning; never claim a guarantee.
- Export preferences with the account. Auth deletion cascades the row.

## Acceptance

- Preferences load for the signed-in owner, save across restart, and reject unknown keys, duplicate/unsupported chip values and invalid enum values.
- A failed save leaves the previous selection visible and offers retry.
- Allergies and hard limits remain enforced when every preference switch is off.
- Confirmed-target display is shown only for a patient profile whose owner has marked the values as confirmed. The display labels those values as user-entered, non-clinical targets.
- No preference is described as a medical recommendation or a guaranteed meal-plan outcome.

## Verification

- Repository/RPC migration contract tests, owner API tests, API-client tests and focused Personalization/MealPlan/Dashboard UI tests.
- Required full unit/UI/API checks, Android export, catalog validation and `git diff --check` before handoff.
- Real Supabase RLS and physical-device checks are external when their runtimes are unavailable.
