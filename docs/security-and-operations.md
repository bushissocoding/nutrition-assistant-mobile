# Security and Operations Baseline

Last reviewed: 2026-11-17

This repository is a demonstration prototype. It is not an authenticated health service and is not approved for real personal or health data, public deployment, clinical use, or legal-compliance claims.

## Dependency review

The npm audit on 2026-11-17 reported 22 moderate package-path findings, no high or critical findings, and two distinct advisories. The affected paths are in Expo fingerprinting/build tooling and the Jest test toolchain; the findings concern denial-of-service in glob matching, not a report of exploitable API request handling.

| Advisory | Affected package path | Severity | Review and disposition |
|---|---|---:|---|
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | `glob` through Jest and related test packages (`glob` 10.5.0 and 13.0.7 in the lockfile) | Moderate | The advisory affects `glob` 9.0.0 through 14.0.1; its patched release is 14.0.2. `npm audit fix --dry-run` leaves the findings. The forced plan downgrades Jest 30 to 29.7.0, outside the project's tested line. Keep Jest 30; re-review when its dependency path has a compatible fix. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `minimatch` through `@expo/fingerprint` and Jest tooling (`minimatch` 9.0.9 and 10.2.6 in the lockfile) | Moderate | The advisory affects `minimatch` 7.0.0 through versions before 11.0.1; its patched release is 11.0.1. The Expo fingerprint dependency accepts `^10.2.6`, so the patched major is outside that range. The forced plan downgrades Expo 58 to 52.0.49. Do not make that incompatible downgrade; re-review when Expo's SDK 58 dependency path has a compatible fix. |

The audit currently aggregates these paths into 22 package findings. Direct top-level versions are Expo `58.0.25`, Jest `30.5.2`, and jest-expo `58.0.14`. Both findings are in development/build tooling; the API does not expose user-controlled glob patterns. No package versions were changed to silence them. The dependency risk owner is not assigned; the repository maintainer must review these findings before a public release or any new deployment target is selected.

Before changing dependencies, run `npm audit --json`, inspect the installed dependency paths, classify severity and reachability, and check whether a fix stays within the supported Expo/Jest major lines. Run the required tests and Expo export after every targeted update. Never use `npm audit fix --force` as a blanket remediation.

## Current data and trust boundaries

- The Expo app stores consent and a minimal prototype profile locally through SecureStore. This is not a server identity or proof of consent compliance.
- Diary and grocery API data is persisted in `server/.local-data/demo-store.json` only when `DEMO_DATA_ENABLED=true`. Demo routes are disabled by default and always disabled in production.
- `X-Demo-Namespace` is caller-controlled. It separates local demo collections but is not authentication, authorization, or account ownership.
- Catalog and planner values are estimates with the source limitations recorded in `server/data/sources.json`. They are not clinical advice and the catalog does not claim to be official Vietnamese Institute of Nutrition data.
- API routes validate request bodies and log only limited operational metadata. Do not add request bodies, headers, credentials, profile fields, diary entries, or grocery contents to logs.

## Local configuration and API lifecycle

The root `.env` contains Expo `EXPO_PUBLIC_*` configuration. Expo embeds those values in the client bundle, so they are public and must never contain credentials. API-only values belong in ignored `server/.env`; the tracked `server/.env.example` contains development defaults and keeps demo storage disabled. Shell environment values take precedence over that file. The example's wildcard CORS origin is for local development; public deployment needs a reviewed origin policy and a separate deployment configuration.

`GET /health` returns a fixed status and service name without probing user or health data. SIGINT and SIGTERM stop new connections and allow active requests to finish, with a 10-second deadline before remaining connections are closed. Shutdown logs contain fixed messages and error codes only. These controls do not provide process supervision, availability, authentication, or production readiness.

## Storage, deletion, and retention

The demo JSON store is local development data. It has no encryption guarantee, backup/restore service, retention scheduler, multi-instance synchronization, or production durability. App profile/consent deletion first requests the diary and grocery namespace purges; a failed purge must preserve local state and offer retry. The demo store can still remain in a developer-controlled file until that file is removed. No retention or deletion guarantee beyond these implemented prototype paths is claimed.

Only synthetic data is allowed. Before real health data is considered, the project needs authenticated identity and ownership, qualified privacy/security review, an approved retention and deletion policy, transport/storage protections, and tested backup/restore and incident handling.

The CI Android export verifies that Metro can produce a bundle for Android; it does not verify installation, device networking, or physical-device behavior. The high/critical audit threshold is an automated dependency gate and does not remove the moderate findings recorded above.

## Incident reporting and unresolved ownership

Do not post credentials, exploit details, or real health information in a public issue. If GitHub private vulnerability reporting is enabled, report security issues there; otherwise contact the repository maintainer through a private channel. The maintainer/security contact and qualified privacy/security reviewer have not been assigned in this project. Assign them before public deployment or real-data use.

For suspected exposure, stop the affected demo API, preserve only logs that contain no sensitive payloads, remove exposed credentials from their source, and ask the repository maintainer to assess scope and affected demo files. This repository has no production incident-response or breach-notification service.

### Credential exposure and rotation

The current sample environment files contain no credentials, and no deployment credential provider is configured. If a credential is ever exposed, treat it as compromised: revoke or rotate it with its issuer immediately; deleting the value from the working tree alone does not invalidate it. Replace it only in the approved local or deployment environment configuration, never in `.env.example`, source code, or an `EXPO_PUBLIC_*` value. Remove the exposed value from tracked files and logs/artifacts where possible; if it was pushed, ask the repository maintainer to coordinate history cleanup and notify collaborators because old clones may still contain it. Review access and possible data exposure privately with the maintainer. The incident contact and owner still need to be assigned by the project maintainer.
