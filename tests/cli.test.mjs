import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../skills/branch-official-import/scripts/workspace.mjs', import.meta.url));

async function fixture(t) {
  const root = process.env.SKILL_TEST_ROOT || tmpdir();
  await mkdir(root, {recursive:true});
  const home = await mkdtemp(join(root, '网点 skill test-'));
  const sessions = new Map();
  const pendingCallbacks = new Set();
  const state = {access:null, refresh:null, refreshes:0, exchanges:0, revoked:false, calls:[], holdRefresh:null};
  let origin;
  const server = createServer(async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const send = (status, value) => {res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(value));};
      const path = new URL(req.url, origin).pathname;
      if (path === '/map/oauth/register') {
        const input = JSON.parse(body);
        assert.equal(input.token_endpoint_auth_method, 'none');
        assert.match(input.redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
        const id = randomBytes(12).toString('hex');
        sessions.set(id, {redirect:input.redirect_uris[0]});
        return send(201, {client_id:id});
      }
      if (path === '/map/oauth/token') {
        const input = new URLSearchParams(body);
        assert.equal(input.get('resource'), origin + '/map/mcp');
        const session = sessions.get(input.get('client_id'));
        if (!session) return send(400, {error:'invalid_client'});
        if (input.get('grant_type') === 'authorization_code') {
          assert.equal(input.get('redirect_uri'), session.redirect);
          assert.equal(createHash('sha256').update(input.get('code_verifier')).digest('base64url'), session.challenge);
          if (input.get('code') !== 'synthetic-code' || session.used) return send(400, {error:'invalid_grant'});
          session.used = true;
          state.exchanges++;
        } else {
          if (state.revoked || input.get('refresh_token') !== state.refresh) return send(400, {error:'invalid_grant'});
          state.refreshes++;
        }
        state.revoked = false;
        state.access = randomBytes(24).toString('base64url');
        state.refresh = randomBytes(24).toString('base64url');
        if (input.get('grant_type') === 'refresh_token' && state.holdRefresh) await state.holdRefresh();
        return send(200, {access_token:state.access, refresh_token:state.refresh, token_type:'Bearer', expires_in:state.refreshes ? 3600 : 0});
      }
      if (path === '/map/oauth/revoke') {
        const input = new URLSearchParams(body);
        if (input.get('token') === state.refresh) state.revoked = true;
        return send(200, {});
      }
      if (path === '/map/mcp') {
        if (state.revoked || req.headers.authorization !== 'Bearer ' + state.access) return send(401, {error:'unauthorized'});
        assert.match(req.headers.accept, /application\/json/);
        assert.match(req.headers.accept, /text\/event-stream/);
        const input = JSON.parse(body);
        assert.equal(input.method, 'tools/call');
        state.calls.push(input.params);
        const result = input.params.name === 'list_official_banks'
          ? {banks:[{id:'boc', name:'中国银行'}]}
          : {query:input.params.arguments.query, total:0, items:[]};
        return send(200, {jsonrpc:'2.0', id:input.id, result:{structuredContent:result}});
      }
      return send(404, {error:'not_found'});
    } catch {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'mock_contract_failed'}));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const cli = async (...args) => {
    const result = await execute(process.execPath, [script, ...args], {
      env:{...process.env, WANGDIAN_HOME:home, WANGDIAN_BASE_URL:origin+'/map'}, timeout:60000,
    });
    for (const token of [state.access, state.refresh]) if (token) assert.ok(!result.stdout.includes(token));
    return JSON.parse(result.stdout);
  };
  const login = async () => {
    const url = new URL((await cli('login')).authorizationUrl);
    assert.equal(url.origin, origin);
    assert.equal(url.searchParams.get('scope'), 'branches:maintain');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const session = sessions.get(url.searchParams.get('client_id'));
    session.challenge = url.searchParams.get('code_challenge');
    const callback = new URL(session.redirect);
    callback.searchParams.set('state', url.searchParams.get('state'));
    callback.searchParams.set('code', 'synthetic-code');
    pendingCallbacks.add(callback.href);
    return callback;
  };
  const approve = async callback => {
    const response = await fetch(callback);
    pendingCallbacks.delete(callback.href);
    return response;
  };
  t.after(async () => {
    for (const value of pendingCallbacks) {
      const url = new URL(value);
      url.searchParams.set('error', 'access_denied');
      try {await fetch(url, {signal:AbortSignal.timeout(3000)});} catch {}
    }
    await new Promise(resolve => server.close(resolve));
    await rm(home, {recursive:true, force:true, maxRetries:10, retryDelay:100});
  });
  return {cli, login, approve, state, home, origin};
}

test('fresh install reports unconnected and fails closed without authorization', async t => {
  const f = await fixture(t);
  assert.equal((await f.cli('status')).connectedLocally, false);
  await assert.rejects(f.cli('call', 'list_official_banks'), error => {
    assert.match(JSON.parse(error.stdout).error, /login/); return true;
  });
  await assert.rejects(f.cli('call', 'private_visits'), error => {
    assert.match(JSON.parse(error.stdout).error, /不支持/); return true;
  });
  assert.equal(f.state.calls.length, 0);
});

test('browser login, PKCE, concurrent refresh and Chinese input work through real CLI processes', async t => {
  const f = await fixture(t);
  const callback = await f.login();
  const wrong = new URL(callback);
  wrong.searchParams.set('state', 'x'.repeat(43));
  assert.equal((await fetch(wrong)).status, 403);
  const approved = await f.approve(callback);
  assert.equal(approved.status, 200);
  assert.match(await approved.text(), /已连接/);
  assert.equal((await f.cli('status')).connectedLocally, true);
  const results = await Promise.all([f.cli('call','list_official_banks'), f.cli('call','list_official_banks')]);
  assert.ok(results.every(result => result.banks[0].id === 'boc'));
  assert.equal(f.state.refreshes, 1);
  const input = join(f.home, '中文 参数.json');
  await writeFile(input, JSON.stringify({query:'石家庄 长安区'}), 'utf8');
  assert.equal((await f.cli('call','search_branches','--input',input)).query, '石家庄 长安区');
  await writeFile(input, JSON.stringify({branchIds:['synthetic-branch'],apply:false,preferMapAddress:true}), 'utf8');
  await f.cli('call','locate_branches','--input',input);
  assert.deepEqual(f.state.calls.at(-1), {name:'locate_branches',arguments:{branchIds:['synthetic-branch'],apply:false,preferMapAddress:true}});
  assert.equal((await f.cli('logout')).disconnected, true);
  assert.equal(f.state.revoked, true);
  assert.equal((await f.cli('status')).connectedLocally, false);
});

test('logout cancels an outstanding browser authorization', async t => {
  const f = await fixture(t);
  const callback = await f.login();
  assert.equal((await f.cli('logout')).disconnected, true);
  assert.equal((await f.approve(callback)).status, 400);
  assert.equal(f.state.exchanges, 0);
  assert.equal((await f.cli('status')).connectedLocally, false);
});

test('logout waits for a rotating request then revokes the newest connection', async t => {
  const f = await fixture(t);
  assert.equal((await f.approve(await f.login())).status, 200);
  let release, started;
  const ready = new Promise(resolve => {started=resolve;});
  const barrier = new Promise(resolve => {release=resolve;});
  f.state.holdRefresh = async () => {started(); await barrier;};
  const calling = f.cli('call', 'list_official_banks');
  await ready;
  let ended = false;
  const logout = f.cli('logout').then(value => {ended=true; return value;});
  try {
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(ended, false);
  } finally {release();}
  await calling;
  assert.equal((await logout).disconnected, true);
  assert.equal(f.state.revoked, true);
  assert.equal((await f.cli('status')).connectedLocally, false);
});

test('browser denial leaves the installation unconnected', async t => {
  const f = await fixture(t);
  const callback = await f.login();
  callback.searchParams.set('error','access_denied');
  assert.equal((await f.approve(callback)).status, 400);
  assert.equal((await f.cli('status')).connectedLocally, false);
  assert.equal(f.state.exchanges, 0);
});
