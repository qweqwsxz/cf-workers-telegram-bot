import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function walk(dir) {
	for (let f of fs.readdirSync(dir)) {
		let p = path.join(dir, f);
		if (fs.statSync(p).isDirectory()) {
			walk(p);
		} else if (p.endsWith('.html') || p.endsWith('.xml')) {
			let c = fs.readFileSync(p, 'utf8');
			if (c.includes('functions/')) {
				fs.writeFileSync(p, c.replace(/functions\//g, 'fns/'));
			}
		} else if (p.endsWith('navigation.js')) {
			let c = fs.readFileSync(p, 'utf8');
			const match = c.match(/window\.navigationData = "([^"]+)"/);
			if (match) {
				const base64 = match[1];
				const buffer = Buffer.from(base64, 'base64');
				const decompressed = zlib.inflateSync(buffer).toString();
				const fixed = decompressed.replace(/functions\//g, 'fns/');
				const recompressed = zlib.deflateSync(fixed).toString('base64');
				fs.writeFileSync(p, `window.navigationData = "${recompressed}"`);
				console.log('Successfully patched navigation.js');
			}
		} else if (p.endsWith('search.js')) {
			let c = fs.readFileSync(p, 'utf8');
			const match = c.match(/window\.searchData = "([^"]+)"/);
			if (match) {
				const base64 = match[1];
				const buffer = Buffer.from(base64, 'base64');
				const decompressed = zlib.inflateSync(buffer).toString();
				const fixed = decompressed.replace(/functions\//g, 'fns/');
				const recompressed = zlib.deflateSync(fixed).toString('base64');
				fs.writeFileSync(p, `window.searchData = "${recompressed}"`);
				console.log('Successfully patched search.js');
			}
		}
	}
}

try {
	if (fs.existsSync('docs/functions')) {
		fs.renameSync('docs/functions', 'docs/fns');
	}
	walk('docs');
	console.log('Successfully renamed functions directory to fns and patched navigation/search data.');
} catch (e) {
	console.error('Error fixing docs:', e);
	process.exit(1);
}
