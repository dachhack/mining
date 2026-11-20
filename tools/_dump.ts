import { createRun, knownSquare } from '../src/engine';
import { blockDefByCode } from '../src/data';
const seed = Number(process.argv[2]);
const s = createRun(seed, 'none', 'standard');
console.log('    ' + Array.from({ length: 32 }, (_, x) => String(x % 10)).join(''));
for (let y = 0; y < 32; y++) { let row = ''; for (let x = 0; x < 32; x++) { const k = knownSquare(s, x, y); if (k.tree) row += 'T'; else { const n = blockDefByCode(k.top!.block).name; row += n === 'Dirt' ? 'd' : n === 'Stone' ? '#' : n.startsWith('Coal') ? 'c' : n.startsWith('Timber') ? 't' : '?'; } } console.log(String(y).padStart(2) + '  ' + row); }
