// SPDX-License-Identifier: MPL-2.0
// Optional, explicit code-loading boundary. The runtime itself imports no provider.
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ModuleError} from './runtime.mjs';

const FILES=['package.json','dist/core.mjs','dist/files.mjs','LICENSE','NOTICE'];

// The host knows both roots here; the data-only adapter cannot infer where its
// supplied namespace was installed. Resolve aliases before importing any code.
export function separateContextRoots(packageDir,notesDir){
  let packageRoot,notesRoot;
  try{
    packageRoot=fs.realpathSync(packageDir);
    if(!fs.statSync(packageRoot).isDirectory())throw new Error('not a package directory');
  }catch{throw new ModuleError('PROVIDER_UNAVAILABLE');}
  try{
    const selected=path.resolve(notesDir);
    let stat;
    try{stat=fs.lstatSync(selected);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(stat){
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('not a regular directory');
      notesRoot=fs.realpathSync(selected);
    }else{
      const parent=fs.realpathSync(path.dirname(selected));
      if(!fs.statSync(parent).isDirectory())throw new Error('not a parent directory');
      notesRoot=path.join(parent,path.basename(selected));
    }
  }catch{throw new ModuleError('INVALID_CONTEXT_ROOT');}
  const relative=path.relative(packageRoot,notesRoot);
  if(relative===''||(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw new ModuleError('CONTEXT_ROOT_OVERLAP');
  return {packageDir:packageRoot,dir:notesRoot};
}

export async function loadReviewedStarter(packageDir){
  if(typeof packageDir!=='string'||!path.isAbsolute(packageDir))throw new ModuleError('INVALID_PROVIDER');
  const lock=JSON.parse(fs.readFileSync(new URL('./agenttool.lock.json',import.meta.url),'utf8')).local_starter;
  if(JSON.stringify(Object.keys(lock.files).sort())!==JSON.stringify([...FILES].sort()))throw new ModuleError('PROVIDER_PIN_MISMATCH');
  const copies=new Map();
  let snapshot;
  try{
    const root=fs.realpathSync(packageDir);
    for(const name of FILES){
      const file=path.join(root,name),relative=path.relative(root,fs.realpathSync(file));
      if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new ModuleError('PROVIDER_PIN_MISMATCH');
      if(!fs.lstatSync(file).isFile())throw new ModuleError('PROVIDER_PIN_MISMATCH');
      const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|(fs.constants.O_NONBLOCK??0));
      let bytes;
      try{
        const limit=256*1024,stat=fs.fstatSync(fd);
        if(!stat.isFile()||stat.size>limit)throw new ModuleError('PROVIDER_PIN_MISMATCH');
        const buffer=Buffer.alloc(limit+1);let used=0;
        while(used<buffer.length){const count=fs.readSync(fd,buffer,used,buffer.length-used,null);if(!count)break;used+=count;}
        if(used>limit)throw new ModuleError('PROVIDER_PIN_MISMATCH');
        bytes=buffer.subarray(0,used);
      }
      finally{fs.closeSync(fd);}
      if(createHash('sha256').update(bytes).digest('hex')!==lock.files[name])throw new ModuleError('PROVIDER_PIN_MISMATCH');
      copies.set(name,bytes);
    }
    const metadata=JSON.parse(copies.get('package.json').toString('utf8'));
    if(metadata.name!==lock.name||metadata.version!==lock.version)throw new ModuleError('PROVIDER_PIN_MISMATCH');
    // Import only an owned snapshot of the bytes just checked. No provider
    // install script, MCP bundle, hosted companion or mutable source path runs.
    snapshot=fs.mkdtempSync(path.join(tmpdir(),'xenia-reviewed-provider-'));
    fs.mkdirSync(path.join(snapshot,'dist'),{mode:0o700});
    for(const [name,bytes]of copies)fs.writeFileSync(path.join(snapshot,name),bytes,{flag:'wx',mode:0o600});
    const starter=await import(pathToFileURL(path.join(snapshot,'dist/core.mjs')).href);
    let disposed=false;
    return {starter,release:lock,dispose(){if(!disposed){disposed=true;fs.rmSync(snapshot,{recursive:true,force:true});}}};
  }catch(error){
    if(snapshot)fs.rmSync(snapshot,{recursive:true,force:true});
    if(error instanceof ModuleError)throw error;
    throw new ModuleError('PROVIDER_UNAVAILABLE');
  }
}
