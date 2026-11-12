// SPDX-License-Identifier: MPL-2.0
// `invoke <module-id> <operation-id> --input <file>`: one process registers,
// activates, invokes once and retires a core module, then prints a receipt.
// Only operations that declare no effects can be invoked here. There is no
// host gate in this command, so an operation that declares effects is refused
// before anything runs.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ModuleError,MODULE_INPUT_LIMITS} from './runtime.mjs';
import {readBoundedBytes,parseStrictJson} from './input-file.mjs';

const NEEDS_BUILD={
  'xenia.surface':()=>fs.existsSync(new URL('../../dist/surface-0.1.js',import.meta.url)),
  'xenia.work':()=>fs.existsSync(new URL('../../node_modules/ajv/package.json',import.meta.url)),
};
const NOT_ESTABLISHED=[
  'any external effect: effect-free is what the operation declares, not something this receipt observed',
  'that the result conforms to anything beyond the native function’s own checks',
  'that anyone has authority or has consented to act on the result',
  'that the module stays retired: a later command starts a fresh runtime',
  'that the input file still has this hash',
];

function parseArgs(args){
  if(args.length!==4||args[2]!=='--input'||args[0].startsWith('-')||args[1].startsWith('-')||!args[3])throw new ModuleError('INVALID_ARGUMENTS');
  return {id:args[0],operation:args[1],file:args[3]};
}

// adapters: static metadata rows (id, operations[{id,effects}]). They are never bound here.
export async function runInvoke(args,{runtime,adapters}){
  const {id,operation,file}=parseArgs(args);
  const context={module:id,operation};
  const adapter=adapters.find(item=>item.id===id);
  if(adapter){
    const op=adapter.operations.find(item=>item.id===operation);
    if(!op)throw new ModuleError('OPERATION_NOT_FOUND',false,context);
    const failure=new ModuleError(op.effects.length?'HOST_GATE_REQUIRED':'MODULE_NOT_BOUND',false,context);
    failure.effects=[...op.effects];
    throw failure;
  }
  const described=runtime.describe(id);   // throws MODULE_NOT_FOUND
  const op=described.operations.find(item=>item.id===operation);
  if(!op)throw new ModuleError('OPERATION_NOT_FOUND',false,{...context,module_version:described.version,module_revision:described.revision});
  if(op.effects.length){
    const failure=new ModuleError('HOST_GATE_REQUIRED',false,{...context,module_version:described.version,module_revision:described.revision});
    failure.effects=[...op.effects];
    throw failure;
  }
  if(NEEDS_BUILD[id]&&!NEEDS_BUILD[id]())throw new ModuleError('BUILD_REQUIRED');
  const bytes=readBoundedBytes(file,MODULE_INPUT_LIMITS.maxBytes);
  const value=parseStrictJson(bytes);
  const input={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    decoding:'UTF-8, no byte-order mark, one JSON value, no repeated object keys'};
  runtime.activate(id);
  const receipt=(fields)=>({kind:'one-shot-invocation-receipt',module:{id:described.id,version:described.version,contract:described.contract,revision:described.revision},
    operation,effects:[...op.effects],input,...fields,
    lifecycle:{steps:['register','activate','invoke','retire'],final_state:runtime.describe(id).state,scope:'this process only'},not_established:[...NOT_ESTABLISHED]});
  let result,failure;
  try{result=await runtime.invoke(id,operation,value);}catch(error){failure=error;}
  runtime.retire(id);
  if(failure){
    if(failure instanceof ModuleError&&failure.operation_started){
      failure.receipt=receipt({outcome:failure.code==='DECLINED'?'declined':'failed'});
    }
    throw failure;
  }
  return receipt({outcome:result.outcome,result:result.value});
}
