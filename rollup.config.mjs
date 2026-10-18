import resolve from 'rollup-plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import copyIcons from './copy-icons.mjs';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const dev = process.env.ROLLUP_WATCH;

export default {
  input: 'src/main.js',
  // Each file is standalone: HACS may install only its selected release asset.
  // Guard the ENTIRE bundle, before Lit/Chart initialization, across filenames,
  // classic/module script loads and cache-busting URLs. First loaded build wins
  // for the lifetime of the page; upgrades require a full browser reload.
  output: ['uninus-weather-chart-card.js', 'weather-chart-card-ha.js', 'weather-chart-card.js'].map((filename) => ({
    file: `dist/${filename}`,
    format: 'iife',
    indent: '',
    banner: `/* uninus-weather-chart-card v${version} */`,
    intro: "if (!globalThis[Symbol.for('uninus-weather-chart-card.loaded')]) {",
    outro: "globalThis[Symbol.for('uninus-weather-chart-card.loaded')] = true;\n}",
    sourcemap: !!dev,
  })),
  plugins: [
    resolve(),
    dev && serve({
      contentBase: ['dist', '.'],
      host: '0.0.0.0',
      port: 5500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
    copyIcons(),
  ],
};
