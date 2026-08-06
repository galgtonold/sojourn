# Contributing to Sojourn

Thanks for your interest! Bug reports, docs fixes, translations, and features are all welcome. For anything larger than a small fix, please open an issue first so we can agree on the direction before you invest time.

## Getting set up

Follow **[Running it locally](docs/development.md#running-it-locally)** — you'll need Docker + the Supabase CLI for the local stack. `supabase/seed.sql` gives you sample trips, posts, and admin users so every feature is exercisable locally.

Before opening a PR, make sure all four pass:

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

CI runs the same four on every pull request.

## Ground rules

- **User-facing copy lives in `src/lib/i18n.ts` (de + en) — never hard-code UI strings.** New strings need both languages; if your German or English is shaky, say so in the PR and we'll polish it together.
- **Keep PRs focused.** One change per PR reviews faster and lands sooner.
- **Behavior changes come with tests.** The suite runs on vitest (`test/unit/`, `test/e2e/`); match the existing style.
- **Content is public-read, only `/admin` is gated.** Anything touching auth, RLS, or the service-role path gets extra scrutiny — please call it out explicitly in the PR description.

## Licensing of contributions

Sojourn is licensed under **AGPL-3.0-only** (see [LICENSE](LICENSE)). To keep the project sustainable — commercial and white-label licenses fund development — contributions come with two lightweight conditions instead of a heavyweight CLA:

1. **Developer Certificate of Origin.** You certify the [DCO v1.1](https://developercertificate.org/): you wrote your contribution, or otherwise have the right to submit it under the project license. Sign off each commit with `git commit -s`, which adds the `Signed-off-by:` line.
2. **Relicensing grant.** By submitting a contribution you additionally grant the project maintainer (Philipp Gergen) a perpetual, worldwide, non-exclusive, irrevocable, royalty-free, **sublicensable** right to use, reproduce, modify, distribute and license your contribution, as part of Sojourn, under other terms — including proprietary ones. You also grant every recipient of Sojourn a perpetual, worldwide, non-exclusive, irrevocable, royalty-free patent licence to make, use, sell and otherwise transfer your contribution, covering only those patent claims you can license that are necessarily infringed by it alone or by combining it with Sojourn. Your contribution itself always remains available under the AGPL-3.0 as well.

If either condition doesn't work for you, open an issue and we'll talk.
