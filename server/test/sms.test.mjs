import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';

async function startApi(dir, fakeUrl) {
  const child = spawn(process.execPath, ['index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {...process.env, DATA_DIR:dir, PORT:'0', NODE_ENV:'development',
      TWILIO_ACCOUNT_SID:'ACfake', TWILIO_AUTH_TOKEN:'fake-local-token',
      TWILIO_VERIFY_SERVICE_SID:'VAfake', SMS_THROTTLE_SECRET:'test-secret-32-bytes-for-persist-0000',
      DEV_TWILIO_VERIFY_URL:fakeUrl, LIVEKIT_API_KEY:''},
    stdio:['ignore','pipe','pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', bytes => {
      text += bytes;
      const port = text.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`API exited: ${code}; ${text}`)));
  });
  return {base, async close() {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child,'exit'); child.kill('SIGTERM'); await done;
    }
  }};
}

async function post(base, path, body) {
  const response = await fetch(base + '/api/auth/' + path, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    signal:AbortSignal.timeout(5000),
  });
  return {status:response.status, data:await response.json()};
}

test('SMS Verify HTTP adapter, account recovery and durable per-phone resend limits', {timeout:30000}, async t => {
  const dir = await mkdtemp(join(tmpdir(),'street-circle-sms-'));
  const calls = [];
  const fake = createServer(async (req,res) => {
    let body = '';
    for await (const bytes of req) body += bytes;
    calls.push({path:req.url, body:new URLSearchParams(body)});
    const result = req.url === '/VerificationCheck'
      ? {status:new URLSearchParams(body).get('Code') === '123456' ? 'approved' : 'pending'}
      : {status:'pending'};
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(result));
  });
  fake.listen(0,'127.0.0.1'); await once(fake,'listening');
  let api = await startApi(dir,`http://127.0.0.1:${fake.address().port}`);
  t.after(async () => { await api.close(); await new Promise(resolve=>fake.close(resolve)); await rm(dir,{recursive:true,force:true}); });
  const phone = '+15551234567';
  assert.equal((await post(api.base,'sms',{phone,consent:false})).status,400);
  assert.equal((await post(api.base,'sms',{phone,consent:true})).status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/Verifications');
  assert.equal(calls[0].body.get('Channel'),'sms');
  assert.equal(calls[0].body.get('To'),phone);
  assert.equal((await post(api.base,'sms',{phone,consent:true})).status,429);

  await api.close(); api = await startApi(dir,`http://127.0.0.1:${fake.address().port}`);
  assert.equal((await post(api.base,'sms',{phone,consent:true})).status,429); // The restart did not bypass it.
  assert.equal((await post(api.base,'verify',{phone,code:'999999',name:'SmsVerifiedE2E'})).status,401);
  const accepted = await post(api.base,'verify',{phone,code:'123456',name:'SmsVerifiedE2E'});
  assert.equal(accepted.status,200);
  assert.equal(accepted.data.user.name,'SmsVerifiedE2E');
  const recovery = await post(api.base,'verify',{phone,code:'123456'});
  assert.equal(recovery.status,200);
  assert.equal(recovery.data.user.id,accepted.data.user.id);
  assert.notEqual(recovery.data.token,accepted.data.token);

  const db = new DatabaseSync(join(dir,'street-circle.sqlite'));
  const rows = db.prepare('SELECT phone_key FROM sms_throttle').all();
  assert.equal(rows.length,1);
  assert.notEqual(rows[0].phone_key,phone);
  for (let i = 1; i < 10; i++) {
    db.prepare('UPDATE sms_throttle SET last_sent=0').run();
    assert.equal((await post(api.base,'sms',{phone,consent:true})).status,200);
  }
  db.prepare('UPDATE sms_throttle SET last_sent=0').run();
  assert.equal((await post(api.base,'sms',{phone,consent:true})).status,429); // Ten per rolling day.
  assert.equal(db.prepare('SELECT send_count FROM sms_throttle').get().send_count,10);
  assert.equal(calls.filter(c=>c.path==='/Verifications').length,10);
  db.close();
});
