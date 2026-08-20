import { cp, mkdir, rm } from 'node:fs/promises';

const outputDirectory = new URL('../dist/', import.meta.url);

const publicFiles = [
  'contact.html',
  'ecosystem-nav.js',
  'ecosystem.css',
  'favicon.svg',
  'index.html',
  'privacy.html',
  'refunds.html',
  'robots.txt',
  'script.js',
  'styles.css',
  'terms.html',
];

const publicDirectories = [
  '.well-known',
  'auth',
  'cockpit',
  'components',
  'core',
  'dashboard',
  'ecosystem',
  'passport',
  'products',
  'states',
  'static',
  'vault',
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of [...publicFiles, ...publicDirectories]) {
  await cp(new URL(`../${entry}`, import.meta.url), new URL(entry, outputDirectory), {
    recursive: true,
  });
}
