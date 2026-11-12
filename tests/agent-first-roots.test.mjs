// SPDX-License-Identifier: MPL-2.0
// The notes root and the package root are compared by filesystem identity, so
// letter case, symlinks and nesting in either direction cannot hide an overlap.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {separateContextRoots,loadReviewedStarter} from '../agent-first/0.1/provider.mjs';
const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));

function scratch(){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'xenia-roots-')));
  return {root,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const overlap=(pkg,dir)=>assert.throws(()=>separateContextRoots(pkg,dir),{code:'CONTEXT_ROOT_OVERLAP'});
const run=(s,argv,env={})=>spawnSync(process.execPath,[cli,...argv],{cwd:s.root,encoding:'utf8',timeout:15000,env:{PATH:'',HOME:s.root,TMPDIR:s.root,...env}});

test('notes inside the package are refused, existing or new',()=>{
  const s=scratch();
  try{
    const pkg=path.join(s.root,'pkg');fs.mkdirSync(path.join(pkg,'existing'),{recursive:true});
    overlap(pkg,path.join(pkg,'new'));
    overlap(pkg,path.join(pkg,'existing'));
    overlap(pkg,pkg);
  }finally{s.cleanup();}
});

test('a package inside the notes root is refused (the other direction)',()=>{
  const s=scratch();
  try{
    const notes=path.join(s.root,'notes'),pkg=path.join(notes,'pkgcopy');
    fs.mkdirSync(pkg,{recursive:true});
    overlap(pkg,notes);
    const result=run(s,['context','status','--package',pkg,'--dir',notes]);
    assert.equal(result.status,1);
    const body=JSON.parse(result.stdout);
    assert.equal(body.error.code,'CONTEXT_ROOT_OVERLAP');
    assert.equal(body.error.operation_started,false);
  }finally{s.cleanup();}
});

test('a symlinked parent cannot hide notes inside the package',{skip:process.platform==='win32'&&'symbolic links need elevated rights on Windows'},()=>{
  const s=scratch();
  try{
    const pkg=path.join(s.root,'pkg');fs.mkdirSync(pkg);
    const alias=path.join(s.root,'alias');fs.symlinkSync(pkg,alias,'dir');
    overlap(pkg,path.join(alias,'notes'));
    overlap(alias,path.join(pkg,'notes'));
    // and the package reached through a link, with notes at its real name
    fs.mkdirSync(path.join(pkg,'inner'));
    overlap(alias,path.join(pkg,'inner'));
    const result=run(s,['context','init','--package',alias,'--dir',path.join(alias,'notes')]);
    assert.equal(JSON.parse(result.stdout).error.code,'CONTEXT_ROOT_OVERLAP');
    assert.equal(fs.existsSync(path.join(pkg,'notes')),false);
  }finally{s.cleanup();}
});

// A case variant is an alias only where the filesystem ignores case.
const caseInsensitive=(()=>{
  const probe=fs.mkdtempSync(path.join(tmpdir(),'xenia-case-probe-'));
  try{return fs.existsSync(path.join(path.dirname(probe),path.basename(probe).toUpperCase()));}
  finally{fs.rmSync(probe,{recursive:true,force:true});}
})();
const caseSkip=!caseInsensitive&&'case-sensitive filesystem: a case variant names a different directory here, so the alias cannot occur';

test('a case-variant path cannot hide an overlap on a case-insensitive filesystem',{skip:caseSkip},()=>{
  const s=scratch();
  try{
    const pkg=path.join(s.root,'pkg');fs.mkdirSync(pkg);
    const variant=path.join(s.root,'PKG');
    assert.ok(fs.existsSync(variant));
    overlap(pkg,path.join(variant,'notesD'));
    overlap(variant,path.join(pkg,'notesE'));
    const result=run(s,['context','init','--package',pkg,'--dir',path.join(variant,'notesF')]);
    assert.equal(JSON.parse(result.stdout).error.code,'CONTEXT_ROOT_OVERLAP');
    assert.equal(fs.existsSync(path.join(pkg,'notesF')),false);
    // a package nested in the notes root, spelled with another case
    const notes=path.join(s.root,'notes');fs.mkdirSync(path.join(notes,'p'),{recursive:true});
    overlap(path.join(s.root,'NOTES','p'),notes);
  }finally{s.cleanup();}
});

test('separate roots are accepted and returned as real paths',()=>{
  const s=scratch();
  try{
    const pkg=path.join(s.root,'pkg'),notes=path.join(s.root,'notes');
    fs.mkdirSync(pkg);
    const roots=separateContextRoots(pkg,notes);
    assert.equal(roots.packageDir,fs.realpathSync(pkg));
    assert.equal(roots.dir,path.join(fs.realpathSync(s.root),'notes'));
    fs.mkdirSync(notes);
    assert.doesNotThrow(()=>separateContextRoots(pkg,notes));
  }finally{s.cleanup();}
});

test('a TMPDIR inside the package or the notes root is refused before any copy is made',async()=>{
  const s=scratch();
  try{
    const pkg=path.join(s.root,'pkg'),notes=path.join(s.root,'notes');
    fs.mkdirSync(path.join(pkg,'tmp'),{recursive:true});fs.mkdirSync(path.join(notes,'tmp'),{recursive:true});
    for(const where of [path.join(pkg,'tmp'),path.join(notes,'tmp'),pkg,notes]){
      const result=run(s,['context','status','--package',pkg,'--dir',notes],{TMPDIR:where});
      assert.equal(result.status,1,where);
      const body=JSON.parse(result.stdout);
      assert.equal(body.error.code,'SNAPSHOT_LOCATION_OVERLAP',where);
      assert.equal(body.error.operation_started,false);
      assert.equal(body.problem.code,'SNAPSHOT_LOCATION_OVERLAP');
      assert.equal(body.problem.terminal,false);
      assert.deepEqual(fs.readdirSync(where).filter(name=>name.startsWith('xenia-reviewed-provider-')),[]);
    }
    // a TMPDIR outside both roots reaches the pin check instead
    const outside=path.join(s.root,'elsewhere');fs.mkdirSync(outside);
    const ok=run(s,['context','status','--package',pkg,'--dir',notes],{TMPDIR:outside});
    assert.notEqual(JSON.parse(ok.stdout).error.code,'SNAPSHOT_LOCATION_OVERLAP');
  }finally{s.cleanup();}
});

test('loadReviewedStarter refuses a snapshot location inside the notes root it is told about',async()=>{
  const s=scratch();
  const saved=process.env.TMPDIR;
  try{
    const pkg=path.join(s.root,'pkg'),notes=path.join(s.root,'notes');
    fs.mkdirSync(pkg);fs.mkdirSync(path.join(notes,'tmp'),{recursive:true});
    process.env.TMPDIR=path.join(notes,'tmp');
    await assert.rejects(loadReviewedStarter(fs.realpathSync(pkg),{notesDir:notes}),{code:'SNAPSHOT_LOCATION_OVERLAP'});
  }finally{if(saved===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=saved;s.cleanup();}
});
