import { lstat, readdir } from 'node:fs/promises';

const outputDirectory = new URL('../dist/', import.meta.url);
const requiredFiles = ['index.html', 'passport/index.html', '.well-known/security.txt'];
const maximumStaticBytes = 10 * 1024 * 1024;

async function measure(directory) {
  let bytes = 0;
  let files = 0;

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      const child = await measure(new URL(`${entry.name}/`, directory));
      bytes += child.bytes;
      files += child.files;
    } else if (entry.isFile()) {
      bytes += (await lstat(url)).size;
      files += 1;
    }
  }

  return { bytes, files };
}

for (const file of requiredFiles) {
  const metadata = await lstat(new URL(file, outputDirectory));
  if (!metadata.isFile()) throw new Error(`Required deployment asset is not a file: ${file}`);
}

const output = await measure(outputDirectory);
if (output.bytes > maximumStaticBytes) {
  throw new Error(
    `Static deployment output is ${output.bytes} bytes; limit is ${maximumStaticBytes} bytes`
  );
}

console.log(
  `Verified Vercel static output: ${output.files} files, ${(output.bytes / 1024 / 1024).toFixed(2)} MiB`
);
