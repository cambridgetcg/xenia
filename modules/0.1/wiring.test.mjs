// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
test('the checkout has one module command and retains independent release boundaries',async()=>{
 const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
 assert.equal(pkg.scripts['xenia:modules'],'node modules/0.1/cli.mjs','The module command is not wired into the checkout');
 assert.match(pkg.scripts.test,/npm run test:modules/);
 assert.match(pkg.scripts['test:modules'],/modules\/0\.1/);
 assert.equal(pkg.version,'0.1.0-beta.7');
 assert.ok(!Object.keys(pkg.exports).some(key=>key.includes('modules')));
 assert.ok(!pkg.files.some(entry=>entry.startsWith('modules')));
 const readme=await readFile(new URL('README.md',root),'utf8');
 assert.match(readme,/AGENT-FIRST\.md/);
 assert.match(readme,/source-only module/i);
 const catalog=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url),'utf8'));
 for(const entry of catalog.components) assert.ok((await readFile(new URL(entry.entry,root))).byteLength>0,entry.id);
});
