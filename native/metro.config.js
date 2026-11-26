// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require("expo/metro-config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

/**
 * Metro has to be told to look OUTSIDE this directory, because the bridge protocol and the host
 * policy live in the web app's lib/ and are imported from here rather than copied.
 *
 * That is the point of choosing React Native in the first place (see NATIVE-REBUILD-PLAN.md's
 * "Decisions already made"): the Prisma-free lib/ modules stay single-source, so the page and the
 * shell cannot drift into disagreeing about the protocol between them. Phase 3 widens this to the
 * dosing and chlorine-demand modules; the wiring is the same.
 */
const repoRoot = path.resolve(__dirname, "..");
const config = getDefaultConfig(__dirname);

// Both roots are watched, so an edit in lib/ triggers a reload here like a local one.
config.watchFolders = [repoRoot];

// `@/lib/...` resolves the same way it does in the Next.js app. Named `@` rather than a relative
// path so the import statements are identical on both sides of the bridge.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@": repoRoot,
};

// node_modules is resolved HERE FIRST, then at the root. Without this order a shared dependency
// would resolve to the web app's copy -- react, most of all, and two copies of react in one
// bundle is a class of error whose symptom is an unrelated hook crash.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules"), path.resolve(repoRoot, "node_modules")];

module.exports = config;
