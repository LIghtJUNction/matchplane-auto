# MatchPlane Auto subplatform

This repository is the automotive presentation adapter for MatchPlane. It is deliberately
separate from the root platform: the root owns identities, memberships, matching contracts,
contact consent, payment interfaces and audit; this package owns vehicle copy, fields, filters,
seller promotion presentation and the buyer/seller/platform workspace UI.

## Contract

`matchplane.subplatform.json` is the manifest consumed by the root platform. A host mounts this
package at `/used-car`, resolves the tenant/domain and membership scope from that path, and injects
root API clients. The package must not create its own account database or issue independent
capability tokens.

The first integration keeps the components framework-neutral at the boundary:

- `BuyerDashboard` renders demand-side vehicle discovery.
- `SellerDashboard` renders supply-side exposure and promotion controls.
- `PlatformDashboard` renders tenant-facing settlement and gateway status.
- `ListingSheet` renders consented offline contact and viewing actions.
- `src/styles.css` contains the subplatform visual language.

The adapter contains no seeded vehicle records or fabricated performance metrics. Sellers submit
schema-defined vehicle JSON through the root upload callback; the root stores it as a pending review
submission and only an approved record is eligible for buyer matching.

This package does not ship a retrieval index or MCP server, so its manifest intentionally declares
no MCP tools. A deployment that wants AI/vector retrieval or other Agent tools must provide a
separate child-owned endpoint, add only the implemented tool names to the manifest, and configure
the server-side credential; until then the root matcher is the deterministic fallback.

## Publishing

Builds are immutable. A root operator registers a repository URL or a verified archive, validates
the manifest, pins a commit/digest, and then records the subplatform path. Arbitrary server-side
code from a plugin is never executed by the root service.

The package does not pin a Bun runtime or a Bun release in its manifest. The isolated builder
resolves `bun` from its operator-managed `PATH` (or from the absolute
`MATCHPLANE_SUBPLATFORM_BUILDER_BUN` setting), so an operator may install the current Bun release
with Bun's official installer without changing this package. JavaScript dependencies use the
`latest` tag; `bun.lock` records the resolved integrity data for a repeatable build until the
operator intentionally refreshes the package.
