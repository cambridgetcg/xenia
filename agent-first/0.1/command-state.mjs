// SPDX-License-Identifier: MPL-2.0
import {ModuleError} from './runtime.mjs';

// Composite CLI commands must not erase earlier returned operations when a
// later verification or code-snapshot cleanup fails. No argument bodies or
// underlying exception text enter this diagnostic projection.
export function commandFailure(error,state,phase=state.phase){
  const started=state.returned.length>0||(error instanceof ModuleError&&error.operation_started);
  const fallback=phase==='cleanup'?'CLEANUP_FAILED':phase==='verification'?'VERIFICATION_FAILED':'CLI_FAILED';
  const failure=new ModuleError(error instanceof ModuleError?error.code:fallback,started);
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
