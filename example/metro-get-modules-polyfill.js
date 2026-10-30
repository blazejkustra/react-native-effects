// Worklets Bundle Mode calls require.getModules(), which Expo's module system
// only defines in dev builds. Must run before the first __d registers a module.
if (!global.__r.getModules) {
  const modules = global.__c();
  global.__r.getModules = () => modules;
}
