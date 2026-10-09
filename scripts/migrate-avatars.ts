import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import {
  avatarUrlUpdates,
  validateAvatarManifest,
  verifyAvatarBytes,
} from "../database/avatar-import";

const args = process.argv.slice(2);
if (
  args.length !== 7 ||
  args[0] !== "--manifest" ||
  args[2] !== "--source" ||
  args[4] !== "--output" ||
  args[6] !== "--local"
)
  throw new Error(
    "Usage: node --import tsx scripts/migrate-avatars.ts --manifest avatars.json --source export.json --output urls.sql --local",
  );
const manifest = validateAvatarManifest(JSON.parse(await readFile(args[1], "utf8")));
const source = JSON.parse(await readFile(args[3], "utf8"));
if (source.format !== "holoplax-postgres-v1" || !Array.isArray(source.tables?.User))
  throw new Error("Invalid user export");
const updates = avatarUrlUpdates(manifest, source.tables.User);
// Validate all source bytes before writing anything. This command never uses remote bindings.
const files = await Promise.all(
  manifest.objects.map(async (object) => {
    const bytes = await readFile(resolve(dirname(args[1]), object.file));
    await verifyAvatarBytes(object, bytes);
    return { object, bytes };
  }),
);
const platform = await getPlatformProxy<Env>({
  remoteBindings: false,
  ...(process.env.HOLOPLAX_LOCAL_CONFIG ? { configPath: process.env.HOLOPLAX_LOCAL_CONFIG } : {}),
  ...(process.env.HOLOPLAX_LOCAL_STATE
    ? { persist: { path: join(process.env.HOLOPLAX_LOCAL_STATE, "v3") } }
    : {}),
});
try {
  for (const { object, bytes } of files) {
    const existing = await platform.env.AVATARS.get(object.key);
    if (existing) {
      await verifyAvatarBytes(object, new Uint8Array(await existing.arrayBuffer()));
      if (existing.httpMetadata?.contentType !== object.contentType)
        throw new Error(`Avatar MIME mismatch ${object.key}`);
    } else {
      const written = await platform.env.AVATARS.put(object.key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: object.contentType },
      });
      if (!written) throw new Error(`Avatar appeared during import ${object.key}`);
    }
    const saved = await platform.env.AVATARS.get(object.key);
    if (!saved) throw new Error(`Avatar missing after import ${object.key}`);
    await verifyAvatarBytes(object, new Uint8Array(await saved.arrayBuffer()));
  }
  await writeFile(args[5], `${updates.join("\n")}\n`, { flag: "wx", mode: 0o600 });
  console.log(
    `Verified ${files.length} local R2 objects. Prepared ${updates.length} URL updates; D1 was not changed.`,
  );
} finally {
  await platform.dispose();
}
