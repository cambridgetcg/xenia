// SPDX-License-Identifier: MPL-2.0
// Explicit CLI host for chosen local context; no ambient root/package discovery.
import path from 'node:path';
import {createModuleRuntime,ModuleError} from './runtime.mjs';
import {loadReviewedStarter,separateContextRoots} from './provider.mjs';
import {createLocalStarterModule} from './adapters/local-starter.mjs';
import {commandFailure,finishProvider} from './command-state.mjs';
import {readBoundedBytes,decodeUtf8} from './input-file.mjs';

const chosenText=file=>decodeUtf8(readBoundedBytes(file,16384));

export async function runContextCommand(args){
  const [operation,...rest]=args;
  if(!['init','status','render','handoff'].includes(operation)||rest.length%2)throw new ModuleError('INVALID_ARGUMENTS');
  const flags=new Map();
  const allowed=operation==='handoff'?['--package','--dir','--input','--expect']:['--package','--dir'];
  for(let i=0;i<rest.length;i+=2){
    if(!allowed.includes(rest[i])||flags.has(rest[i])||!rest[i+1])throw new ModuleError('INVALID_ARGUMENTS');
    flags.set(rest[i],rest[i+1]);
  }
  if(flags.size!==allowed.length||allowed.some(key=>!flags.has(key)))throw new ModuleError('INVALID_ARGUMENTS');
  let input={};
  if(operation==='handoff'){
    if(!/^[a-f0-9]{64}$/.test(flags.get('--expect')))throw new ModuleError('INVALID_INPUT');
    input={text:chosenText(path.resolve(flags.get('--input'))),expectedSha256:flags.get('--expect')};
  }
  const {packageDir,dir}=separateContextRoots(path.resolve(flags.get('--package')),path.resolve(flags.get('--dir')));
  const provider=await loadReviewedStarter(packageDir);
  const id='agenttool.local-context';
  const writes=['init','handoff'].includes(operation);
  const runtime=createModuleRuntime({authorize:request=>request.module.id===id&&request.operation===operation&&
    request.module.revision===1&&request.effects.every(effect=>effect==='local-read'||(writes&&effect==='local-write'))});
  let registered=false,output,failure;
  const state={phase:'register',returned:[],verification:'not_run'};
  try{
    runtime.register(createLocalStarterModule({starter:provider.starter,dir,version:provider.release.version,source:provider.release.source}));
    registered=true;runtime.activate(id);
    state.phase=operation;
    const result=await runtime.invoke(id,operation,input);
    state.returned.push(operation);
    output={kind:'explicit-local-context-command',result,
      interpretation:'This process closed its module admission. Notes remain separate; another explicit command creates a new runtime. Rendered prose is data, not authority.'};
  }catch(error){failure=commandFailure(error,state);}
  try{
    if(registered){const retirement=runtime.retire(id);if(output)output.retirement=retirement;}
  }catch(error){failure??=commandFailure(error,state,'retirement');}
  finishProvider(provider,state,failure);
  return output;
}
