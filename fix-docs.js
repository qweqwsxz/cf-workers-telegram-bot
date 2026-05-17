import fs from 'fs';
import path from 'path';

function walk(dir) {
	for (let f of fs.readdirSync(dir)) {
		let p = path.join(dir, f);
		if (fs.statSync(p).isDirectory()) {
			walk(p);
		} else if (p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.xml')) {
			let c = fs.readFileSync(p, 'utf8');
			if (c.includes('functions/')) {
				fs.writeFileSync(p, c.replace(/functions\//g, 'fns/'));
			}
		}
	}
}

try {
	fs.renameSync('docs/functions', 'docs/fns');
	walk('docs');
	console.log('Successfully renamed functions directory to fns to fix Cloudflare Pages routing.');
} catch (e) {
	if (e.code === 'ENOENT') {
		console.log('docs/functions directory not found, nothing to do.');
	} else {
		console.error('Error fixing docs:', e);
		process.exit(1);
	}
}
