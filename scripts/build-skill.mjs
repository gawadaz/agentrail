import { build } from 'esbuild';
import { cpSync, rmSync, chmodSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bundle the CLI and copy workflow templates into `outDir`.
 * Produces: <outDir>/cli.js  and  <outDir>/templates/workflows/*.yaml
 */
export async function buildSkill(outDir) {
  const target = resolve(outDir);
  mkdirSync(target, { recursive: true });

  const cliPath = join(target, 'cli.js');
  await build({
    entryPoints: [join(repoRoot, 'src', 'cli.ts')],
    outfile: cliPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    minify: false,
    logLevel: 'silent',
  });

  // The ESM bundle pulls in CJS deps (e.g. mute-stream) that call `require`.
  // esbuild leaves those as `require(...)`, which throws under an ESM entry, so
  // shim a real `require` via createRequire. src/cli.ts already carries a
  // `#!/usr/bin/env node` shebang which esbuild keeps on line 1 — insert the
  // shim right after it so the shebang stays first.
  const shim =
    "import { createRequire as __agentrailCreateRequire } from 'node:module';\n" +
    'const require = __agentrailCreateRequire(import.meta.url);\n';
  let bundled = readFileSync(cliPath, 'utf-8');
  if (bundled.startsWith('#!')) {
    const nl = bundled.indexOf('\n') + 1;
    bundled = bundled.slice(0, nl) + shim + bundled.slice(nl);
  } else {
    bundled = shim + bundled;
  }
  writeFileSync(cliPath, bundled);
  chmodSync(cliPath, 0o755);

  const templatesSrc = join(repoRoot, 'templates');
  const templatesDest = join(target, 'templates');
  rmSync(templatesDest, { recursive: true, force: true });
  cpSync(templatesSrc, templatesDest, { recursive: true });

  return { cliPath, templatesDest };
}

// Run when invoked directly: `node scripts/build-skill.mjs [outDir]`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-skill.mjs')) {
  const outDir = process.argv[2] ?? join(repoRoot, 'skill', 'agentrail');
  buildSkill(outDir)
    .then(({ cliPath }) => {
      console.log(`Built skill CLI -> ${cliPath}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
