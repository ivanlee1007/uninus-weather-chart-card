import resolve from 'rollup-plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import copyIcons from './copy-icons.mjs';

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/weather-chart-card.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    resolve(),
    copyIcons(),
    serve({
      contentBase: ['dist', '.'],
      host: '0.0.0.0',
      port: 5500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    }),
  ],
  watch: {
    include: 'src/**',
  },
};
