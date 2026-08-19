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

## Child Agent adapter

This package includes a small, package-owned Bun Agent/MCP reference service under `agent/`. It
implements the stable root ABI without moving vehicle fields, prompts or vector-store choices
into the root platform:

- `catalog.upsert` stores a generic public offer projection and only indexes `active` offers.
- `retrieval.query` returns `matchplane.retrieval/v1` candidates with canonical `offer_id`,
  explainable reasons and explicit low-evidence risks. The reference implementation uses a
  bounded SQLite lexical index; a production operator may replace it with a vector-backed
  implementation behind the same MCP tools.
- `media.upload` stores bounded attachments in a content-addressed child directory and returns an
  opaque `media://` reference. The basic scanner is deliberately conservative; production should
  put an approved malware/image scanning service in front of durable publication.

Run it locally with:

```sh
MATCHPLANE_AUTO_MCP_TOKEN=change-me bun run agent:serve
```

The endpoint is `http://127.0.0.1:8787/mcp` by default. In production set
`MATCHPLANE_AUTO_PLATFORM_PATH`, `MATCHPLANE_AUTO_TENANT_ID`, `MATCHPLANE_AUTO_DOMAIN_ID`,
`MATCHPLANE_AUTO_MCP_TOKEN` and a persistent `MATCHPLANE_AUTO_DATA_DIR`; expose it through an
operator-controlled HTTPS endpoint and bind the manifest key `used-car` in
`MATCHPLANE_SUBPLATFORM_MCP_ENDPOINTS_JSON`. The service does not create MatchPlane accounts,
issue capability tokens, return contact details, or settle payments.

## Publishing

The source commit and generated static artifact are still recorded by digest. A root operator
registers a repository URL or a verified archive, validates the manifest, and then records the
subplatform path. Arbitrary server-side code from a plugin is never executed by the root service.

This package deliberately opts into `assets.dependencyPolicy: "latest"`: it does not ship a
`bun.lock`, and the isolated builder resolves the current versions declared by `package.json` on
each build. The package also does not pin a Bun runtime or release. The builder resolves `bun`
from its operator-managed `PATH` (or from the absolute `MATCHPLANE_SUBPLATFORM_BUILDER_BUN`
setting), so an operator may install the current Bun release with Bun's official installer without
changing this package. Every build still records source, manifest and artifact digests; operators
who need reproducibility should switch the package back to the default locked policy and commit a
lockfile.
