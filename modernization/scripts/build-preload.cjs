const esbuild=require('esbuild');
const path=require('node:path');

esbuild.buildSync({
  entryPoints:[path.join(__dirname,'../desktop/preload.cjs')],
  outfile:path.join(__dirname,'../desktop/preload.bundle.cjs'),
  bundle:true,
  platform:'node',
  format:'cjs',
  target:'node20',
  external:['electron'],
  logLevel:'warning',
});
