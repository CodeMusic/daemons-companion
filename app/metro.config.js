// The app reads what DAEMONS exports into server/data/ (the week, for its themes, and the daemons' art), so Metro
// watches that folder too. C-111: a phone hosting on its own runs the companion's own rules -- server/src's portable
// modules (core.ts, routes.ts, store.ts, the save reader and writer) -- so Metro reads those as well. They import each
// other as Node does, "./core.js" for core.ts; here that is resolved to the .ts, and the packages they need (Babel's
// helpers) come from the app's own node_modules. C-430: GOALS run on PRAXIS's engine, packages/praxis/src, which those
// modules import the same way -- so Metro watches it and resolves it alike.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const serverSrc = path.resolve(__dirname, "../server/src");
const praxisSrc = path.resolve(__dirname, "../packages/praxis/src");
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../server/data"), serverSrc, praxisSrc];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
const resolveOther = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  const resolve = resolveOther ?? context.resolveRequest;
  const from = context.originModulePath;
  if ((from.startsWith(serverSrc) || from.startsWith(praxisSrc)) && name.startsWith(".") && name.endsWith(".js"))
    return resolve(context, name.slice(0, -3), platform);
  return resolve(context, name, platform);
};
module.exports = config;
