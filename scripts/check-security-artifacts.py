"""Check generated artifacts without printing credentials or reading live providers."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
static = root / '.next/static'
standalone = root / '.next/standalone'
if not static.is_dir() or not standalone.is_dir():
    sys.exit('Build artifacts missing; run pnpm build first.')
patterns = [rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}',
            rb'\bsb_secret_[A-Za-z0-9_-]{16,}',
            rb'\bgh[pousr]_[A-Za-z0-9]{20,}',
            rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
# Exact local values supplement patterns; values are never logged.
secrets = []
for envfile in [root / '.env.local', root / 'backend/.env']:
    if not envfile.exists():
        continue
    for line in envfile.read_text(encoding='utf-8').splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        value = value.strip().strip(chr(34) + chr(39))
        if any(label in key.upper() for label in ['KEY', 'TOKEN', 'SECRET', 'PASSWORD']) and len(value) >= 8:
            secrets.append(value.encode())
failed = False
count = 0
for path in static.rglob('*'):
    if path.is_file():
        count += 1
        data = path.read_bytes()
        if any(re.search(pattern, data) for pattern in patterns) or any(value in data for value in secrets):
            print('Potential credential in browser artifact:', path.relative_to(root))
            failed = True
for path in standalone.rglob('*'):
    if path.is_file() and secrets and any(value in path.read_bytes() for value in secrets):
        print('Local credential in standalone artifact:', path.relative_to(root))
        failed = True
    if path.is_file() and (path.name == '.env' or path.name.startswith('.env.') or path.suffix in ['.pem', '.key', '.p12', '.pfx']):
        print('Forbidden credential file in standalone output:', path.relative_to(root))
        failed = True
print(f'Browser files checked: {count}; exact local credential values checked: {len(secrets)} (values suppressed).')
sys.exit(1 if failed else 0)
