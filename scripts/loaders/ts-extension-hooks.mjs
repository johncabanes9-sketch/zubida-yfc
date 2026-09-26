// Node's ESM loader requires file extensions; TypeScript source omits them.
// This hook retries an extensionless relative specifier as `.ts` (then as a
// directory `index.ts`) so prove scripts can import real source modules
// without the source having to carry bundler-specific extensions.
const EXTENSIONLESS = /\.[a-zA-Z0-9]+$/;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!isRelative || EXTENSIONLESS.test(specifier)) throw err;
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Try the next candidate; the original error is thrown if none work.
      }
    }
    throw err;
  }
}
