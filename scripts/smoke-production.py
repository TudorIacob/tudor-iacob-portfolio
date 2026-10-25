"""Local standalone smoke checks. No real secrets, emails or AI requests."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[1]
standalone = root / '.next/standalone'
shutil.copytree(root / 'public', standalone / 'public', dirs_exist_ok=True)
shutil.copytree(root / '.next/static', standalone / '.next/static', dirs_exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
env = os.environ.copy()
for name in ['K_SERVICE', 'VERCEL', 'GOOGLE_APPLICATION_CREDENTIALS']:
    env.pop(name, None)
for name in ['BACKEND_URL', 'BACKEND_API_KEY', 'TAI_BACKEND_URL', 'RESEND_API_KEY',
             'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'LLM_API_KEY',
             'SUPABASE_SECRET_KEY', 'CONTACT_EMAIL_FROM', 'CONTACT_EMAIL_TO']:
    env[name] = ''
origin = 'https://tudoriacob.cloud.run'
env.update(PORT=str(port), HOSTNAME='127.0.0.1', NODE_ENV='production', SITE_URL=origin,
           NEXT_TELEMETRY_DISABLED='1')
base = f'http://127.0.0.1:{port}'
checks = 0

def request(path, data=None, headers=None):
    req = urllib.request.Request(base + path, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, response.headers, response.read().decode()
    except urllib.error.HTTPError as response:
        return response.code, response.headers, response.read().decode()

with open(os.devnull, 'w') as log:
    process = subprocess.Popen(['node', 'server.js'], cwd=standalone, env=env, stdout=log, stderr=log)
    try:
        for attempt in range(100):
            if process.poll() is not None:
                raise RuntimeError('Standalone server exited before startup')
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.2)
        else:
            raise TimeoutError('Standalone startup timeout')
        slugs = [p['slug'] for p in json.loads((root/'data/portfolio.json').read_text())['projects']]
        for path in ['/', *['/projects/' + slug for slug in slugs], '/robots.txt', '/sitemap.xml']:
            status, headers, body = request(path)
            assert status == 200, (path, status)
            assert origin in body, path
            assert headers['X-Content-Type-Options'] == 'nosniff'
            assert headers['X-Frame-Options'] == 'DENY'
            assert headers['Strict-Transport-Security'] == 'max-age=86400'
            assert headers['Content-Security-Policy-Report-Only']
            checks += 1
        for message in ['Hello', 'Salut']:
            status, headers, body = request('/api/chat', json.dumps({'message':message}).encode(),
                                           {'Origin':origin, 'Content-Type':'application/json'})
            events = [json.loads(line) for line in body.splitlines()]
            assert status == 200 and events[-1] == {'type':'done','mode':'demo'}
            assert any(event['type']=='token' for event in events)
            assert headers['Cache-Control'] == 'no-store'
            checks += 1
        for path in ['/api/chat', '/api/contact']:
            status, _, _ = request(path, b'{}', {'Origin':'https://attacker.example', 'Content-Type':'application/json'})
            assert status == 403
            checks += 1
        assert request('/api/chat', b'{}', {'Origin':origin,'Content-Type':'text/plain'})[0] == 415
        checks += 1
        print(f'Local standalone HTTP smoke checks: {checks} passed (no live providers).')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
