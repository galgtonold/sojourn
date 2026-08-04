import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A backup story is only worth what its restore is worth, and every line below
// is something that made a restore silently wrong during the one full cycle
// these scripts were put through: back up a serving site, destroy both volumes,
// rebuild from nothing, restore, and check what a reader actually sees.

const BACKUP = readFileSync("scripts/backup.sh", "utf8");
const RESTORE = readFileSync("scripts/restore.sh", "utf8");

describe("backup.sh takes both halves", () => {
  it("dumps every schema, not just public", () => {
    // `auth` holds the accounts. Dump `public` alone and the restore gives you
    // a blog you cannot log in to — which is not obvious until you try.
    expect(BACKUP).toMatch(/pg_dump[^\n]*postgres/);
    expect(BACKUP, "a -n/--schema flag would exclude auth").not.toMatch(
      /pg_dump[^\n]*(-n |--schema[= ])/,
    );
  });

  it("dumps in a form that can be loaded over an existing database", () => {
    // A restore lands on a stack that has already run its migrations, so every
    // table it is about to write already exists.
    expect(BACKUP).toContain("--clean");
    expect(BACKUP).toContain("--if-exists");
  });

  it("takes the photographs too, in the same archive", () => {
    // Separately taken halves drift apart, and a dump whose photo files are an
    // hour older is a set of captions pointing at things that are not there.
    expect(BACKUP).toContain("storage-data");
    expect(BACKUP).toMatch(/storage\.tar/);
    expect(BACKUP).toMatch(/tar czf sojourn\.tar\.gz .*MANIFEST db\.sql storage\.tar/);
  });
});

describe("restore.sh puts both halves back", () => {
  it("replaces the photo directory rather than merging into it", () => {
    // Merging leaves deleted photographs resurrected and makes the restore
    // depend on what happened to be there first.
    expect(RESTORE).toMatch(/rm -rf \/data\/\*/);
  });

  it("counts what actually landed instead of announcing success", () => {
    // The number someone checks when they are already having a bad day.
    expect(RESTORE).toMatch(/select count\(\*\) from posts/);
    expect(RESTORE).toMatch(/select count\(\*\) from auth\.users/);
  });

  it("tells you to RECREATE the app container, not restart it", () => {
    // Next caches rendered pages inside the container's filesystem, and a
    // restart keeps them. Measured: after a verified-good restore the site went
    // on serving the empty pages it had built from the old data, and the
    // restore looked like it had failed.
    expect(RESTORE).toMatch(/--force-recreate web/);
    expect(RESTORE, "restart is not enough").not.toMatch(/ restart web/);
  });

  it("asks before replacing everything", () => {
    expect(RESTORE).toMatch(/--yes/);
    expect(RESTORE).toMatch(/read -r/);
  });
});

describe("both scripts survive being run from Git Bash", () => {
  // The author's own machine. Every one of these produced an error naming a
  // path nobody wrote: `C:/Program Files/Git/data`, or `Cannot connect to C:`.
  it("scopes the MSYS escape to docker, never exporting it", () => {
    // Exported globally it breaks the host's own tar, which then reads the `C:`
    // in an archive path as a machine to connect to.
    for (const [name, src] of [["backup", BACKUP], ["restore", RESTORE]] as const) {
      expect(src, `${name} exports MSYS globally`).not.toMatch(
        /^export MSYS_NO_PATHCONV/m,
      );
      expect(src, `${name} has no scoped escape`).toMatch(/NOCONV=/);
    }
  });

  it("never hands tar an archive path to parse", () => {
    // `tar xzf C:/backups/x.tar.gz` treats `C:` as a remote host, and
    // --force-local is GNU-only so it is not the portable answer.
    expect(RESTORE).toMatch(/tar xz -C "\$WORK" < "\$ARCHIVE"/);
  });
});
