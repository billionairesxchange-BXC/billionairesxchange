const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');

esbuild.build({
  entryPoints: [path.join(root, 'wallet.js')],
  outfile: path.join(root, 'wallet.bundle.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  inject: [path.join(__dirname, 'buffer-inject.js')],
  legalComments: 'none'
}).then(() => {
  console.log('Built local self-custody wallet bundle.');
}).catch((error) => {
  console.error('Wallet bundle build failed:', error);
  process.exitCode = 1;
});
