# Inactive deployment files

> **Do not use these files for deployment. They are kept as historical
> reference only.**

The Development Transparency Map is deployed to **Vercel**. Vercel
consumes `next.config.js` (at the repository root) and `vercel.json`
(at the repository root) directly — there is no Docker or Netlify step
in the production pipeline.

The files in this directory are left in the repository so that:

1. Prior commits that referenced Docker / Netlify paths still have the
   corresponding artefacts available when checked out.
2. A future decision to re-introduce a container or a Netlify mirror
   has a starting point.

## Files

| File | Original purpose | Current status |
|---|---|---|
| `Dockerfile` | Multi-stage container build for the Next.js app. | **Inactive.** Not referenced by any CI workflow, not used by Vercel. Build flags are likely out of date with `next.config.js`. |
| `Dockerfile.base` | Base image used by `Dockerfile`. | **Inactive.** |
| `netlify.toml` | Netlify build configuration. Historically pointed `publish` at `.next`, which conflicted with the production `BUILD_DIR=.next-build` output. | **Inactive.** |

## If you re-activate one of these

Before re-enabling any of these targets:

1. Reconcile the build output directory with `next.config.js`. The
   production build writes to `.next-build` (see `BUILD_DIR` in
   `package.json` → `scripts.build`), not `.next`.
2. Re-validate that the HTTP security headers emitted by
   `next.config.js` reach the client through the new stack (Netlify's
   plugin, Docker reverse proxy, etc. may strip or duplicate headers).
3. Update `docs/release-readiness-checklist.md` to reflect the new
   deployment target.
4. Confirm the Upstash + Sentry env vars documented in
   `docs/release-readiness-checklist.md` are available in the new
   platform's secret manager.

Until those steps are completed, assume these files are **broken** and
do not ship them to production.