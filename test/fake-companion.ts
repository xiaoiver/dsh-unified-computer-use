import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
/** A child process fixture: the production bridge is never redirected through DSH's parent. */
export async function fakeCompanion(ready = true) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-companion-unit-'))
  const executable = join(directory, 'fixture')
  await writeFile(executable, `#!/usr/bin/env node
if (${ready}) process.send({type:'dsh-cua/ready',version:1,electron:'44.7.0'});
process.on('message', request => {
  if(request.type==='dsh-cua/shutdown'){process.disconnect();return;}
  if(request.type!=='dsh-cua/request')return;
  process.send({type:'dsh-cua/reply',version:1,id:request.id,result:{content:[{type:'text',text:JSON.stringify({fixture:true,kind:request.operation.kind,owner:request.owner})}],structuredContent:{fixture:true,kind:request.operation.kind,owner:request.owner}}});
});
process.on('disconnect',()=>process.exit(0));
`, { mode: 0o755 })
  return { executable, directory, dispose: () => rm(directory, { recursive: true, force: true }) }
}
