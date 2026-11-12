// SPDX-License-Identifier: MPL-2.0
// Reading one chosen file, and decoding it as JSON, strictly. Used where a
// caller names a file as input. The reader is bounded and never follows a
// symbolic link; any failure is INVALID_INPUT with nothing else disclosed.
import fs from 'node:fs';
import {ModuleError} from './runtime.mjs';

export function readBoundedBytes(file,limit){
  let fd;
  try{
    if(!fs.lstatSync(file).isFile())throw new ModuleError('INVALID_INPUT');
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|(fs.constants.O_NONBLOCK??0));
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size>limit)throw new ModuleError('INVALID_INPUT');
    const buffer=Buffer.alloc(limit+1);let used=0;
    while(used<buffer.length){const count=fs.readSync(fd,buffer,used,buffer.length-used,null);if(!count)break;used+=count;}
    if(used>limit)throw new ModuleError('INVALID_INPUT');
    return buffer.subarray(0,used);
  }catch(error){
    if(error instanceof ModuleError)throw error;
    throw new ModuleError('INVALID_INPUT');
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
export const decodeUtf8=bytes=>{
  try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch{throw new ModuleError('INVALID_INPUT');}
};

// Strict: valid UTF-8, no byte-order mark, exactly one JSON value, and no
// object that repeats a key (JSON.parse would silently keep the last one).
export function parseStrictJson(bytes){
  const source=decodeUtf8(bytes);
  if(source.charCodeAt(0)===0xfeff)throw new ModuleError('INVALID_INPUT');
  let value;
  try{value=JSON.parse(source);}catch{throw new ModuleError('INVALID_INPUT');}
  // The text is now known to be valid JSON, so a flat scan is enough.
  const stack=[];let expectKey=false;
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(ch==='{'){stack.push(new Set());expectKey=true;}
    else if(ch==='['){stack.push(null);expectKey=false;}
    else if(ch==='}'||ch===']'){stack.pop();expectKey=false;}
    else if(ch===','){expectKey=stack.length>0&&stack[stack.length-1]!==null;}
    else if(ch===':')expectKey=false;
    else if(ch==='"'){
      let j=i+1;
      while(source[j]!=='"')j+=source[j]==='\\'?2:1;
      if(expectKey){
        const key=JSON.parse(source.slice(i,j+1)),keys=stack[stack.length-1];
        if(keys.has(key))throw new ModuleError('INVALID_INPUT');
        keys.add(key);expectKey=false;
      }
      i=j;
    }
  }
  return value;
}
