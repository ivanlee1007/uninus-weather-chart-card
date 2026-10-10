import resolve from 'rollup-plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import copyIcons from './copy-icons.mjs';

const dev = process.env.ROLLUP_WATCH;

const serveopts = {
  contentBase: ['./dist'],
  host: '0.0.0.0',
  port: 5500,
  allowCrossOrigin: true,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
};

export default {
  input: 'src/main.js',
  output: [
    {
      file: 'dist/weather-chart-card.js',
      format: 'cjs',
      name: 'WeatherChartCard',
      sourcemap: dev ? true : false,
    },
    {
      file: 'dist/weather-chart-card-ha.js',
      format: 'cjs',
      name: 'WeatherChartCard',
      sourcemap: dev ? true : false,
    }
  ],
  plugins: [
    resolve(),
    dev && serve(serveopts),
    copyIcons()
  ],
};
