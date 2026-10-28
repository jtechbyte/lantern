import { inspectRealDebridName } from '../src/providers/real-debrid/filename-filter.mjs';

const names = process.argv.slice(2);
if (!names.length) {
  console.error('Usage: npm run check:rd-name -- "original filename.mkv"');
  process.exitCode = 1;
} else {
  for (const name of names) console.log(JSON.stringify({ name, ...inspectRealDebridName(name) }, null, 2));
}
