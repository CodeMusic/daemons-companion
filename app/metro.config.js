// The app reads what DAEMONS exports into server/data/ (the week, for its themes, and the daemons' art), so Metro
// watches that folder too. C-111: a phone hosting on its own runs the companion's own rules -- server/src's portable
// modules (core.ts, routes.ts, store.ts, the save reader and writer) -- so Metro reads those as well. They import each
// other as Node does, "./core.js" for core.ts; here that is resolved to the .ts, and the packages they need (Babel's
// helpers) come from the app's own node_modules.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const serverSrc = path.resolve(__dirname, "../server/src");
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../server/data"), serverSrc];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
const resolveOther = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  const resolve = resolveOther ?? context.resolveRequest;
  if (context.originModulePath.startsWith(serverSrc) && name.startsWith(".") && name.endsWith(".js"))
    return resolve(context, name.slice(0, -3), platform);
  return resolve(context, name, platform);
};
module.exports = config;
