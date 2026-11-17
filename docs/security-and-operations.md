# Security and Operations Baseline

Last reviewed: 2026-11-17

This repository is a demonstration prototype. It is not an authenticated health service and is not approved for real personal or health data, public deployment, clinical use, or legal-compliance claims.

## Dependency review

The npm audit on 2026-11-17 reported 22 moderate findings and no high or critical findings. The affected paths are in Expo fingerprinting/build tooling and the Jest test toolchain; the findings are denial-of-service risks in glob matching, not a report of exploitable API request handling.

| Advisory | Affected package path | Severity | Review and disposition |
|---|---|---:|---|
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | `glob` through Jest and related test packages | Moderate | `npm audit fix --dry-run` did not clear the advisory. Forced remediation proposes downgrading Jest from 30 to 29.7.0. Keep the current tested Jest line; re-review when a compatible upstream fix is available. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `minimatch` through `@expo/fingerprint` and Jest tooling | Moderate | `npm audit fix --dry-run` did not clear the advisory. Forced remediation proposes downgrading Expo from 58 to 52.0.49. Do not make that incompatible downgrade; re-review when Expo's SDK 58 dependency path has a compatible fix. |

The audit currently aggregates these paths into 22 package findings. Direct top-level versions are Expo `58.0.25`, Jest `30.5.2`, and jest-expo `58.0.14`. No package versions were changed to silence the current moderate findings. The dependency risk owner is not assigned; the repository maintainer must review these findings before a public release or any new deployment target is selected.

Before changing dependencies, run `npm audit --json`, inspect the installed dependency paths, classify severity and reachability, and check whether a fix stays within the supported Expo/Jest major lines. Run the required tests and Expo export after every targeted update. Never use `npm audit fix --force` as a blanket remediation.

## Current data and trust boundaries

- The Expo app stores consent and a minimal prototype profile locally through SecureStore. This is not a server identity or proof of consent compliance.
- Diary and grocery API data is persisted in `server/.local-data/demo-store.json` only when `DEMO_DATA_ENABLED=true`. Demo routes are disabled by default and always disabled in production.
- `X-Demo-Namespace` is caller-controlled. It separates local demo collections but is not authentication, authorization, or account ownership.
- Catalog and planner values are estimates with the source limitations recorded in `server/data/sources.json`. They are not clinical advice and the catalog does not claim to be official Vietnamese Institute of Nutrition data.
- API routes validate request bodies and log only limited operational metadata. Do not add request bodies, headers, credentials, profile fields, diary entries, or grocery contents to logs.

## Storage, deletion, and retention

The demo JSON store is local development data. It has no encryption guarantee, backup/restore service, retention scheduler, multi-instance synchronization, or production durability. App profile/consent deletion first requests the diary and grocery namespace purges; a failed purge must preserve local state and offer retry. The demo store can still remain in a developer-controlled file until that file is removed. No retention or deletion guarantee beyond these implemented prototype paths is claimed.

Only synthetic data is allowed. Before real health data is considered, the project needs authenticated identity and ownership, qualified privacy/security review, an approved retention and deletion policy, transport/storage protections, and tested backup/restore and incident handling.

## Incident reporting and unresolved ownership

Do not post credentials, exploit details, or real health information in a public issue. If GitHub private vulnerability reporting is enabled, report security issues there; otherwise contact the repository maintainer through a private channel. The maintainer/security contact and qualified privacy/security reviewer have not been assigned in this project. Assign them before public deployment or real-data use.

For suspected exposure, stop the affected demo API, preserve only logs that contain no sensitive payloads, remove exposed credentials from their source, and ask the repository maintainer to assess scope and affected demo files. This repository has no production incident-response or breach-notification service.
