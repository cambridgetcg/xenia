// SPDX-License-Identifier: MPL-2.0
import {ModuleError} from './runtime.mjs';

// Composite CLI commands must not erase earlier returned operations when a
// later verification or code-snapshot cleanup fails. No argument bodies or
// underlying exception text enter this diagnostic projection.
export function commandFailure(error,state,phase=state.phase){
  const started=state.returned.length>0||(error instanceof ModuleError&&error.operation_started);
  const fallback=phase==='cleanup'?'CLEANUP_FAILED':phase==='verification'?'VERIFICATION_FAILED':'CLI_FAILED';
  const known=error instanceof ModuleError;
  const failure=new ModuleError(known?error.code:fallback,started,known?{module:error.module,operation:error.operation,
    module_version:error.module_version,module_revision:error.module_revision}:{});
  // A declared refusal keeps its own meaning, unless earlier operations of this
  // command already returned (then the command-level outcome stays unknown).
  if(known&&error.refusal){failure.refusal=error.refusal;if(!state.returned.length)failure.effect_outcome=error.effect_outcome;}
  if(known){for(const key of ['mismatch','valid','reason','pointer','keyword','expected','schema_refusal'])if(error[key]!==undefined)failure[key]=error[key];}
  failure.phase=phase;
  failure.returned_operations=[...state.returned];
  failure.verification=state.verification??'not_run';
  failure.snapshot_cleanup=state.snapshot_cleanup??'not_attempted';
  return failure;
}

export function finishProvider(provider,state,failure){
  try{provider.dispose();state.snapshot_cleanup='returned';}
  catch(error){
    state.snapshot_cleanup='failed';
    if(!failure)failure=commandFailure(error,state,'cleanup');
  }
  if(failure){failure.snapshot_cleanup=state.snapshot_cleanup;throw failure;}
}

// What a failure says about itself in output. Only the fields named here are
// read, so nothing else an error carries (a message, a stack, a cause) is
// printed. `pointer`, `keyword` and `expected` are set when an input did not
// match the schema on an operation's card: where in the input, which schema
// keyword, and the card's own word for it; none of the three repeats anything
// from the input. `schema_refusal` is set when a module's own input schema
// was refused. A field that is not set is left out by JSON.
export function errorProjection(error,retryable=error.retryable){
  return {code:error.code,operation_started:error.operation_started,effect_outcome:error.effect_outcome,retryable,module:error.module,operation:error.operation,
    module_version:error.module_version,module_revision:error.module_revision,refusal:error.refusal,reason:error.reason,
    pointer:error.pointer,keyword:error.keyword,expected:error.expected,schema_refusal:error.schema_refusal,
    phase:error.phase,returned_operations:error.returned_operations,verification:error.verification,snapshot_cleanup:error.snapshot_cleanup};
}

// What a failure output does not establish, by the effect the error records.
export function failureNotEstablished(error){
  const lines=['that a suggested next action will succeed'];
  if(error.effect_outcome==='unknown')lines.push('whether the failed operation changed anything');
  if(error.effect_outcome==='not_applied')lines.push('anything about state beyond this one declined operation',
    'that the operation did nothing before declining: not_applied is the module’s own declaration, and the runtime did not observe or verify it');
  return lines;
}
