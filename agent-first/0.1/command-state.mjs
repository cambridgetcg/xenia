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
  if(known){for(const key of ['mismatch','valid'])if(error[key]!==undefined)failure[key]=error[key];}
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
