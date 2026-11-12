// SPDX-License-Identifier: MPL-2.0
import path from 'node:path';
import {isProxy} from 'node:util/types';
import {ModuleError,Decline} from '../runtime.mjs';

// The host supplies reviewed code and an explicit root. No package, credential,
// notes-root or host-session discovery is performed by this adapter.
export function createLocalStarterModule({starter,dir,version,source}={}) {
  const names=['initStarter','inspectStarter','renderStarter','writeHandoff'];
  if(!starter||typeof starter!=='object'||isProxy(starter)||typeof dir!=='string'||
    !path.isAbsolute(dir)||/[\x00-\x1f\x7f]/.test(dir)||typeof version!=='string')throw new ModuleError('INVALID_PROVIDER');
  const functions={};
  for(const name of names){
    const descriptor=Object.getOwnPropertyDescriptor(starter,name);
    if(!descriptor||typeof descriptor.value!=='function')throw new ModuleError('INVALID_PROVIDER');
    functions[name]=descriptor.value;
  }
  const invalid={code:'invalid_input',effect:'not_applied',meaning:'The input does not match this operation\u2019s shape. Nothing was read or written.',
    next:'Send the documented input shape for this operation.'};
  const noRoot={code:'missing_root',effect:'not_applied',meaning:'The notes root does not exist. Nothing was read or written.',
    next:'Run init for this root, or check the --dir path.'};
  const unsafeRoot={code:'unsafe_root',effect:'not_applied',meaning:'The provider refused this root as unsafe. Nothing was read or written.',
    next:'Choose a plain directory you own, outside the provider package.'};
  // For handoff the provider checks the root after it has taken the lock and
  // written a temporary file, so only the handoff file itself is known untouched.
  const unsafeRootHandoff={code:'unsafe_root',effect:'not_applied',meaning:'The provider refused this root as unsafe. The handoff file was not replaced; a lock or temporary file may remain in the notes root.',
    next:'Choose a plain directory you own, outside the provider package, and run status on it.'};
  const unsafeParent={code:'parent_unavailable',effect:'not_applied',meaning:'The parent directory is not usable. No root was created.',
    next:'Create the parent directory first, or choose another --dir.'};
  const known=(list)=>new Set(list.map(r=>r.code));
  // Only codes the provider contract names, and only where the provider fails
  // before it changes the file it would replace, are declared not_applied.
  // Anything else (write_uncertain, write_failed, init_uncertain, ...) stays
  // OPERATION_FAILED with an unknown effect.
  const declines=(refusals,fn)=>{
    const codes=known(refusals);
    return input=>{
      try{return fn(input);}
      catch(error){
        if(error instanceof ModuleError&&error.code==='INVALID_INPUT')throw new Decline('invalid_input');
        if(error&&error.name==='StarterError'&&typeof error.code==='string'&&codes.has(error.code))throw new Decline(error.code);
        throw error;
      }
    };
  };
  const empty=input=>{
    if(input!==null && (typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).length))throw new ModuleError('INVALID_INPUT');
  };
  // init is deliberately without unsafe_root: the provider creates the
  // directory first and may report unsafe_root afterwards, so that failure
  // stays an unknown effect (OPERATION_FAILED) and points at status.
  const initRefusals=[invalid,unsafeParent,
    {code:'already_exists',effect:'not_applied',meaning:'The destination already exists; init never overwrites. Nothing was changed.',
      next:'Use status on this root, or choose a new --dir.'}];
  const readRefusals=[invalid,noRoot,unsafeRoot];
  const handoffRefusals=[invalid,noRoot,unsafeRootHandoff,
    {code:'write_conflict',effect:'not_applied',meaning:'The handoff file changed since the hash you supplied. The file was not replaced.',
      next:'Run status, read the current handoff sha256, then retry with it as --expect if you still want this text.'},
    {code:'write_locked',effect:'not_applied',meaning:'Another writer holds the handoff lock. The file was not replaced.',
      next:'Wait for the other writer, then run status and retry.'},
    {code:'invalid_expected_hash',effect:'not_applied',meaning:'The expected hash is not a 64-character lowercase hex sha256. Nothing was written.',
      next:'Copy the handoff sha256 from status.'},
    {code:'invalid_handoff',effect:'not_applied',meaning:'The text is too large for the handoff slot or contains disallowed characters. Nothing was written.',
      next:'Shorten or clean the text; status shows the slot limit.'},
    {code:'unsafe_handoff',effect:'not_applied',meaning:'The existing handoff file is not a safe regular file. Nothing was written.',
      next:'Inspect the notes root by hand; this kit will not replace it.'}];
  return {
    id:'agenttool.local-context',version,contract:'xenia.module.agenttool-local-context/0.1-development',
    title:'Chosen continuity',motif:'continuity',
    description:'Optional AgentTool files-only context at one host-selected root. Retained notes are data, not authority. Retirement does not delete them.',
    source:source??'Caller-supplied AgentTool local-starter/v1 implementation; source not verified by this factory.',
    operations:{
      init:{description:'Create a new notes root only; refuses existing destinations. No host hooks or registration.',effects:['local-read','local-write'],refusals:initRefusals,
        run:declines(initRefusals,input=>{empty(input);return functions.initStarter(dir);})},
      status:{description:'Inspect all fixed slots, including disabled slots, for metadata only.',effects:['local-read'],refusals:readRefusals,
        run:declines(readRefusals,input=>{empty(input);return functions.inspectStarter(dir);})},
      render:{description:'Read only selected local context under the provider’s freshness and byte limits.',effects:['local-read'],refusals:readRefusals,
        run:declines(readRefusals,input=>{empty(input);return functions.renderStarter(dir);})},
      handoff:{description:'Replace only handoff.md using the caller’s expected current hash; no automatic retry or enablement.',effects:['local-read','local-write'],refusals:handoffRefusals,
        run:declines(handoffRefusals,input=>{
          if(!input||typeof input!=='object'||Array.isArray(input)||
            Reflect.ownKeys(input).length!==2||typeof input.text!=='string'||
            typeof input.expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedSha256))throw new ModuleError('INVALID_INPUT');
          return functions.writeHandoff(dir,input.text,input.expectedSha256);
        })},
    },
  };
}
