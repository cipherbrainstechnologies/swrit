import { loadEnvFiles } from "./_cli";

loadEnvFiles();

/**
 * Checks that storage works and that the R2 bucket is NOT publicly readable.
 * Writes, reads and deletes a small test object (no family data).
 */
async function main() {
  const { getStorage, newObjectKey } = await import("../src/server/storage");
  const storage = await getStorage();
  const key = newObjectKey("tmp");
  const body = Buffer.from(`dear-swritsinh storage check ${new Date().toISOString()}`);
  await storage.put(key, body, "text/plain", body.length);
  const head = await storage.head(key);
  if (!head || head.bytes !== body.length) throw new Error("HEAD after PUT did not match");
  const signed = await storage.presignGet(key, 60);
  console.log(`Driver: ${storage.driver}. Write/read OK.`);
  if (storage.driver === "r2") {
    const r = await fetch(signed);
    console.log(`Signed GET: ${r.status === 200 ? "OK" : `FAILED (${r.status})`}`);
    const unsigned = signed.split("?")[0];
    const u = await fetch(unsigned);
    console.log(`Unsigned GET (must be denied): ${u.status === 200 ? "PUBLIC! Disable public access on the bucket now." : `denied (${u.status}) OK`}`);
  }
  await storage.delete(key);
  console.log("Cleanup OK.");
}

main().catch((err) => {
  console.error("Storage check failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
