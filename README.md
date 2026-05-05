This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

> **The canonical test command for this project is `bun run test`.**
>
> It executes `bunx vitest run` (see the `test` script in `package.json`) and
> is the command used by CI, the Sprint 1 verification gate, and the Vercel
> Preview release-readiness checklist.
>
> **Do NOT use `bun test`.** That invokes Bun's built-in, Jest-like native test
> runner, which is *not* the project's test runner. Bun's native runner does
> not understand Vitest's `vi.*` mock API, our `vitest.config.ts`, the
> `happy-dom` environment, or the path aliases we rely on, and will report
> false-positive failures on tests that pass under Vitest.

```bash
# Canonical — use this.
bun run test

# Watch mode (dev only).
bun run test:watch

# CI reporter.
bun run test:ci
```

Other verification gates used by CI and the release-readiness checklist:

```bash
bunx tsc --noEmit   # typecheck
bun run lint        # biome lint + tsc
bun run build       # production build
```

We intentionally keep Vitest as the test framework; this note only
disambiguates the *command* used to run it.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
