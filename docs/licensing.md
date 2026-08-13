# Licensing

Sojourn is free software, licensed under the **GNU Affero General Public
License, version 3** — see [LICENSE](../LICENSE) (`AGPL-3.0-only`). It is
distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.

Copyright © 2026 the Sojourn authors.

## What that means in practice

- **Self-host it freely, forever.** Run it for yourself or anyone else, and
  modify it however you like.
- **Offering it as a service?** Also fine — the AGPL simply requires making the
  source of your modified version available to the people who use it.
- **The "Sojourn" name and logo are not covered by the code licence.** Fork the
  code as much as you like; call your fork something else.

## Running a modified version

AGPL §13 requires you to offer your users the source of the version they are
actually running. The site footer carries that link, and it is runtime
configuration rather than something baked into the build — point `SOURCE_URL` at
your own repository and every deployment of your image says so:

```bash
SOURCE_URL=https://git.example.org/you/sojourn
```

Unmodified deployments need do nothing; it already points upstream.

## Contributing

Contributions come with a lightweight Developer Certificate of Origin and a
relicensing grant rather than a heavyweight CLA — see
[CONTRIBUTING.md](../CONTRIBUTING.md) for both, and for what the grant does and
does not cover.

## Third-party code

Sojourn bundles other people's work — MapLibre GL JS, React, Next.js and some
370 more — each under its own terms, reproduced in
[THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt). Regenerate it with
`npm run notices` after changing dependencies; a test fails if it drifts.

The Docker image additionally embeds LGPL-3.0 libvips by way of `sharp`.
