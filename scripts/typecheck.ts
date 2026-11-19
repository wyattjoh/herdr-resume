// Copy Herdr's installed mod declarations into a repo-local cache, then run tsc.
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { Glob } from "bun";

const root = resolve(import.meta.dir, "..");
const appHome = process.env.HERDR_APP_HOME ?? join(homedir(), ".config/herdr-app");
const host = join(appHome, "herdr.d.ts");
// Herdr rewrites gpui-kit.d.ts in every live mod folder on start; disabled or stale folders lag, so take the newest.
const kit = [...new Glob("mods/*/gpui-kit.d.ts").scanSync({ cwd: appHome, absolute: true })]
  .map((path) => ({ path, mtime: Bun.file(path).lastModified }))
  .sort((a, b) => b.mtime - a.mtime)[0]?.path;

if (!(await Bun.file(host).exists()) || !kit) {
  console.error(
    `Missing Herdr declarations under ${appHome} (herdr.d.ts and mods/*/gpui-kit.d.ts).`,
  );
  process.exit(1);
}

const cache = join(root, "node_modules/.cache/herdr-resume");
await Bun.write(join(cache, "herdr.d.ts"), Bun.file(host));
await Bun.write(join(cache, "gpui-kit.d.ts"), Bun.file(kit));
const tsc = Bun.spawn([join(root, "node_modules/.bin/tsc"), "-p", join(root, "tsconfig.json")], {
  stdout: "inherit",
  stderr: "inherit",
  timeout: 120_000,
});
process.exit(await tsc.exited);
