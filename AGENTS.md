# Repository instructions

Read [`CONSTRAINTS.md`](CONSTRAINTS.md) before changing code. Its project rules and checks are the acceptance bar for work in this repository.

## Working in this repository

- Follow the feature and layer boundaries in [`docs/architecture.md`](docs/architecture.md). Move reusable UI to `shared/components` when multiple features genuinely use it.
- Preserve the `/api/v1` contract. Validate request data at the API boundary and keep domain behavior deterministic and independently testable.
- Treat the product as a demonstration prototype. Follow the health-data, food-source, and non-clinical boundaries in `CONSTRAINTS.md`; consult [`docs/architecture.md`](docs/architecture.md) and [`server/README.md`](server/README.md) for implementation context.
- Update or add focused tests when behavior changes. Before handoff, run the checks required by `CONSTRAINTS.md` and report any command that could not run, with the reason.
- Keep changes within the requested scope. Do not add dependencies, generated artifacts, or unrelated cleanup without a concrete need.

## Completion

Work is ready to hand off when the requested change is implemented, applicable checks pass (or a documented exception is accepted), and the final summary names the changed files and check results.
