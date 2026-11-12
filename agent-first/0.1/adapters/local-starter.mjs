// SPDX-License-Identifier: MPL-2.0
import path from 'node:path';
import {isProxy} from 'node:util/types';
import {ModuleError} from '../runtime.mjs';

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
  const empty=input=>{
    if(input!==null && (typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).length))throw new ModuleError('INVALID_INPUT');
  };
  return {
    id:'agenttool.local-context',version,contract:'xenia.module.agenttool-local-context/0.1-development',
    title:'Chosen continuity',motif:'continuity',
    description:'Optional AgentTool files-only context at one host-selected root. Retained notes are data, not authority. Retirement does not delete them.',
    source:source??'Caller-supplied AgentTool local-starter/v1 implementation; source not verified by this factory.',
    operations:{
      init:{description:'Create a new notes root only; refuses existing destinations. No host hooks or registration.',effects:['local-read','local-write'],
        run(input){empty(input);return functions.initStarter(dir);}},
      status:{description:'Inspect all fixed slots, including disabled slots, for metadata only.',effects:['local-read'],
        run(input){empty(input);return functions.inspectStarter(dir);}},
      render:{description:'Read only selected local context under the provider’s freshness and byte limits.',effects:['local-read'],
        run(input){empty(input);return functions.renderStarter(dir);}},
      handoff:{description:'Replace only handoff.md using the caller’s expected current hash; no automatic retry or enablement.',effects:['local-read','local-write'],
        run(input){
          if(!input||typeof input!=='object'||Array.isArray(input)||
            Reflect.ownKeys(input).length!==2||typeof input.text!=='string'||
            typeof input.expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedSha256))throw new ModuleError('INVALID_INPUT');
          return functions.writeHandoff(dir,input.text,input.expectedSha256);
        }},
    },
  };
}
