// Run real TS source with only framework request context replaced. DB is injected
// explicitly; integration tests supply a real isolated Prisma client.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

exports.context = function context(db, env = process.env) {
  const jar = new Map();
  const cache = new Map();
  const cookieStore = { get: name => jar.get(name), set: (name, value, options) => jar.set(name, { value, options }), delete: name => jar.delete(name) };
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    function dependency(name) {
      if (name === '@/lib/db') { if (!db) throw new Error('Explicit test DB required'); return { db }; }
      if (name === 'next/headers') return { cookies: async () => cookieStore, headers: async () => new Headers() };
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name.startsWith('@/')) return load('src/' + name.slice(2));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name));
      return require(name);
    }
    new Function('module', 'exports', 'require', 'process', output)(module, module.exports, dependency, { env });
    return module.exports;
  }
  return { load, jar, cookieStore };
};
