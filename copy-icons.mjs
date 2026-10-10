import { cpSync, mkdirSync } from 'node:fs';

// Native copies avoid the vulnerable glob dependency tree in rollup-plugin-copy.
export default function copyIcons() {
  return {
    name: 'copy-icons',
    buildStart() {
      for (const directory of ['icons', 'icons2']) {
        mkdirSync(`dist/${directory}`, { recursive: true });
        cpSync(`src/${directory}`, `dist/${directory}`, { recursive: true });
      }
    },
  };
}
