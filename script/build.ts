import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const message = args.map((arg) => String(arg)).join(" ");
    if (message.includes("A PostCSS plugin did not pass the `from` option to `postcss.parse`")) {
      return;
    }
    originalWarn(...(args as Parameters<typeof console.warn>));
  };
  try {
    await viteBuild();
  } finally {
    console.warn = originalWarn;
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    target: "node20",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    // Keep server bundle unminified for Node runtime stability and clearer crash traces.
    minify: false,
    external: externals,
    logLevel: "warning",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
