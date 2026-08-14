Inter and Fraunces, vendored so that building Sojourn needs no network.

next/font/google downloads these during `next build`. That makes every build —
including `docker compose up -d --build` on a self-hoster's machine, and the
arm64 half of the release image — depend on fonts.googleapis.com answering. It
does not always: one release build failed on "Failed to fetch `Inter` from
Google Fonts" after ten minutes under emulation, and there are networks and
countries where it never will. For a project that sells portability, a build
that needs Google is a contradiction.

These .woff2 files were lifted out of a build made with next/font/google, so
they are the same bytes, the same subsets and the same unicode-ranges that
shipped before. The @font-face rules that use them are in src/app/fonts.css.

Both families are licensed under the SIL Open Font License 1.1, which permits
redistribution provided the licence travels with the fonts — hence the two
LICENSE.txt files beside them. Neither font is modified.

  Inter     (c) 2016 The Inter Project Authors      https://github.com/rsms/inter
  Fraunces  (c) 2018 The Fraunces Project Authors    https://github.com/undercasetype/Fraunces
