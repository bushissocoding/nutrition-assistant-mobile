# Implementation Plan: Project Platform — V1

Source spec: [SPEC-project-platform.md](../SPEC-project-platform.md)

Status: approved

## Overview

Complete the issue #5 baseline that supports work across issues #1–#4: make runtime and local configuration reproducible, extend CI with an Expo export and a high/critical dependency gate, validate API startup configuration, add bounded graceful shutdown, and document security/operations limits accurately. Keep the existing API, diary, grocery, and planner behavior stable. No production hosting or real health data is introduced.

## Dependency graph

```text
Runtime and dependency baseline ─┬─> API config and lifecycle ──┐
                                 ├─> CI checks ────────────────┼─> operations docs and clean handoff
                                 └─> safe environment examples ┘
```

The dependency review runs first because the existing audit has 22 moderate advisories and some suggested fixes downgrade Expo/Jest major versions. Runtime declarations, server config, CI, and docs can then be implemented in separate reviewable slices. Final verification depends on all slices.

## Architecture decisions

- Keep the current Expo/Express stack and `package-lock.json`; do not add runtime or tooling dependencies for this baseline.
- Declare the currently documented Expo-compatible Node range in `package.json` and retain Node 22 as the primary CI line. Verify the npm/lockfile range with clean installs before finalizing the declaration.
- Triage `npm audit` advisories by package, severity, direct/transitive status, exposure, and compatible fix. Apply only compatible targeted updates that pass the existing test suites; do not use blanket `npm audit fix` or downgrade Expo/Jest to satisfy an advisory mechanically.
- Add a small pure API configuration reader for `PORT` and other currently supported server environment values. Validate once at startup, return concise non-secret errors, and keep request handlers independent of raw environment access.
- Keep `/health` as the current secret-free process readiness response; there is no database or external dependency to probe. Install SIGINT/SIGTERM handling that stops accepting new requests, waits for active requests, and exits within a bounded deadline.
- Keep the existing CORS behavior and workflow permissions unchanged. Any CORS behavior or permission change requires separate explicit review.
- Provide root Expo and server configuration examples with local-only values and clear comments. Use Node's built-in env-file support only if official Node documentation confirms it exists across the declared minimum version; otherwise document shell-based setup rather than adding a package.
- Extend the current GitHub Actions job with the same local checks: `npm ci`, all three required test commands, Expo Android export, and `npm audit --audit-level=high`. Keep logs free of secrets and user data.
- Add `docs/security-and-operations.md` with assets/trust points, current controls and residual risks, local demo data lifecycle, dependency triage, incident reporting path, and prerequisites for any future real-data or public deployment.

## Implementation sequence

### Phase 1: Preserve completed plan and establish runtime/dependency baseline

The completed API Foundation plan/task-list are already preserved under module-specific filenames. Add `.nvmrc` for the primary Node line and supported Node/npm metadata in `package.json`, then record a focused audit triage. Do not change package versions until each advisory's reachable impact and compatible fix are understood.

**Checkpoint:** clean `npm ci` works on the primary CI Node line and the supported local runtime; audit findings have a recorded disposition without an unverified major downgrade.

### Phase 2: Validate API configuration and process lifecycle

Add pure config parsing for supported API settings, fail fast on invalid values, preserve the existing health response, and implement orderly SIGINT/SIGTERM shutdown. Keep CORS semantics unchanged. Add focused tests for config errors, health behavior, startup failure, and bounded shutdown.

**Checkpoint:** `npm run test:unit` and `npm run test:api` pass; existing `/api/v1` responses remain unchanged; malformed configuration never starts a misleadingly healthy server.

### Phase 3: Make local setup reproducible

Add safe root/server environment examples and update contributor instructions with clean install, API/app startup, demo-mode enablement, target-specific API URLs, `/health` verification, and Metro-versus-API troubleshooting. State clearly which values are public in the mobile bundle and which demo routes remain unavailable in production.

**Checkpoint:** a contributor can follow the documented local setup without a personal secret; examples contain no real credentials or user data.

### Phase 4: Extend CI with reproducible app/security checks

Add the Expo Android export and high/critical npm audit threshold to the existing workflow. Keep the unit, UI, and API checks required and preserve least-privilege workflow permissions. Run the same commands locally.

**Checkpoint:** all workflow commands are reproducible from a clean install and a failed command fails CI. The Android export is reported as bundle verification, not device verification.

### Phase 5: Document security and operations limits

Write the minimal threat model, sensitive-data/logging rules, demo-store lifecycle and deletion limits, dependency review record, incident reporting path, known owner/reviewer gaps, and prerequisites before deployment or real health data. Link it from the root and server READMEs; do not claim backup, retention, authentication, compliance, or clinical readiness.

**Checkpoint:** docs agree with actual code/config and `CONSTRAINTS.md`, and explicitly distinguish implemented controls from unresolved responsibilities.

### Phase 6: Final verification and scope review

Run `npm ci`, `npm run test:unit`, `npm run test:ui`, `npm run test:api`, `npx expo export --platform android`, `npm audit --audit-level=high`, and `git diff --check`. Review the staged diff for secrets, real health data, generated artifacts, unrelated changes, and API contract drift.

**Checkpoint:** all required checks pass or a narrow exception is written with its reason and scope; no runtime demo store or build output is tracked.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Mechanical audit fixes downgrade Expo/Jest or break SDK compatibility | High | Review each advisory and fix path; target compatible releases only; rerun all required suites and Expo export. |
| Environment examples imply production readiness or leak a secret | High | Use synthetic local values, mark public Expo variables, document demo-only settings, and review tracked diff. |
| Shutdown logic hides in-flight failures or hangs CI | Medium | Use a bounded deadline and process-level smoke tests for both signals. |
| CI checks drift from local commands | Medium | Keep command strings identical and document every gate in README. |
| Incident/security owners are unknown | High before public use | State the maintainer/reviewer gap directly; do not claim issue #5 fully closes this prerequisite until the owner is assigned. |
| CI audit depends on registry availability | Medium | Run the exact command locally and report registry failures distinctly from vulnerability findings. |

## Open questions

- The spec's open questions remain: named incident/dependency contact; qualified privacy/security and nutrition reviewers; future production CORS policy. These do not block a demo-only baseline but must be answered before public deployment or real health data.
- If official Node documentation does not support the proposed env-file option across the declared minimum, use documented shell environment setup and update the spec before implementation.

## Out of scope

Production hosting, Docker/staging, a database, authentication, production backup/retention, real health data, CORS behavior changes, and clinical/legal claims.
