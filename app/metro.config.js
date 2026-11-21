// The app reads what DAEMONS exports into server/data/ (the week, for its themes, and the daemons' art), so Metro
// watches that folder too. C-111: a phone hosting on its own runs the companion's own rules -- server/src's portable
// modules (core.ts, routes.ts, store.ts, the save reader and writer) -- so Metro reads those as well. They import each
// other as Node does, "./core.js" for core.ts; here that is resolved to the .ts, and the packages they need (Babel's
// helpers) come from the app's own node_modules. C-430: GOALS run on PRAXIS's engine, which those modules import.
// C-435: the engine is its own repository, daemons-praxis, pinned by tag in app/package.json as in server/package.json.
// It is TypeScript and imports its own files the same way, so they are resolved alike; and server/src is always given
// the app's copy, so the phone carries the engine the app pins, whatever server/node_modules holds.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const serverSrc = path.resolve(__dirname, "../server/src");
const praxis = `${path.sep}node_modules${path.sep}@daemons${path.sep}praxis${path.sep}`;
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../server/data"), serverSrc];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
const resolveOther = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  const resolve = resolveOther ?? context.resolveRequest;
  const from = context.originModulePath;
  if (name === "@daemons/praxis" && from.startsWith(serverSrc))
    return resolve({ ...context, originModulePath: path.join(__dirname, "index.ts") }, name, platform);
  if ((from.startsWith(serverSrc) || from.includes(praxis)) && name.startsWith(".") && name.endsWith(".js"))
    return resolve(context, name.slice(0, -3), platform);
  return resolve(context, name, platform);
};
module.exports = config;
