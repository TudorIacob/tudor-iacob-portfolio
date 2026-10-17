// Compile application TypeScript for Node tests without a Next.js runtime.
// server-only is removed only inside this test loader; production guards remain.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const compiled = new Map();
async function moduleUrl(url) {
  if (compiled.has(url.href)) return compiled.get(url.href);
  const source = await readFile(url, "utf8");
  let code = url.pathname.endsWith(".json")
    ? `export default ${source};`
    : ts.transpileModule(source.replaceAll('import "server-only";', ""), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
  for (const match of [...code.matchAll(/from "([^"]+)"/g)]) {
    const specifier = match[1];
    let resolved;
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const target = specifier.startsWith("@/")
        ? new URL("../" + specifier.slice(2), import.meta.url)
        : new URL(specifier, url);
      if (!/\.(ts|tsx|json)$/.test(target.pathname)) target.pathname += ".ts";
      resolved = await moduleUrl(target);
    } else
      resolved = specifier.startsWith("node:")
        ? specifier
        : pathToFileURL(require.resolve(specifier)).href;
    code = code.replaceAll(
      `from "${specifier}"`,
      `from ${JSON.stringify(resolved)}`,
    );
  }
  const result =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  compiled.set(url.href, result);
  return result;
}
export async function load(relative) {
  return import(await moduleUrl(new URL(relative, import.meta.url)));
}
