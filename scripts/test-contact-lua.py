"""Execute the production Lua script with an in-memory Redis command adapter.

Requires test-only lupa==2.6. No network, real Redis, email, or credentials.
The adapter implements Redis GET/INCR/EXPIRE/TTL, not the limiter algorithm.
"""
from pathlib import Path
import re
import unittest

from lupa.lua51 import LuaRuntime


class ContactQuotaTests(unittest.TestCase):
    def setUp(self):
        source = (Path(__file__).resolve().parents[1] / 'lib/contact-rate-limit.ts').read_text()
        self.script = re.search(r'CONTACT_LIMIT_SCRIPT = `([\s\S]*?)`;', source).group(1)
        self.rows = {}
        self.now = 0
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.lua.globals().redis = self.lua.table_from({'call': self.command})

    def command(self, command, key, seconds=None):
        row = self.rows.get(key)
        if row and row[1] is not None and row[1] <= self.now:
            del self.rows[key]
            row = None
        if command == 'GET':
            return str(row[0]) if row else False
        if command == 'TTL':
            return -2 if row is None else (-1 if row[1] is None else row[1] - self.now)
        if command == 'INCR':
            row = [row[0] + 1, row[1]] if row else [1, None]
            self.rows[key] = row
            return row[0]
        if command == 'EXPIRE':
            if row:
                row[1] = self.now + seconds
            return 1 if row else 0
        raise AssertionError(f'Unexpected Redis command: {command}')

    def attempt(self, visitor):
        self.lua.globals().KEYS = self.lua.table_from([visitor, 'global'])
        self.lua.globals().ARGV = self.lua.table_from(['5', '600', '100', '3600'])
        return self.lua.execute(self.script)

    def test_rejected_visitor_cannot_consume_global_quota(self):
        for _ in range(5):
            self.assertEqual(self.attempt('visitor-a'), 0)
        before = {key: list(row) for key, row in self.rows.items()}
        for _ in range(200):
            self.assertEqual(self.attempt('visitor-a'), 600)
        self.assertEqual(self.rows, before)
        self.assertEqual(self.attempt('visitor-b'), 0)
        self.assertEqual(self.rows['global'][0], 6)

    def test_global_cap_blocks_without_consuming_new_visitor_quota(self):
        for visitor in range(20):
            for _ in range(5):
                self.assertEqual(self.attempt(f'visitor-{visitor}'), 0)
        self.assertEqual(self.attempt('new-visitor'), 3600)
        self.assertNotIn('new-visitor', self.rows)
        self.assertEqual(self.rows['global'][0], 100)

    def test_rejections_do_not_extend_windows_and_expired_quota_recovers(self):
        for _ in range(5):
            self.assertEqual(self.attempt('visitor-a'), 0)
        self.now = 599
        self.assertEqual(self.attempt('visitor-a'), 1)
        self.now = 600
        self.assertEqual(self.attempt('visitor-a'), 0)
        self.assertEqual(self.rows['visitor-a'], [1, 1200])
        self.assertEqual(self.rows['global'], [6, 3600])
        self.now = 3600
        self.assertEqual(self.attempt('visitor-a'), 0)
        self.assertEqual(self.rows['global'], [1, 7200])

    def test_legacy_over_limit_counters_and_missing_expiry_fail_closed(self):
        self.rows = {'visitor-a': [201, 600], 'global': [300, 3600]}
        self.assertEqual(self.attempt('visitor-a'), 3600)
        self.assertEqual(self.rows['global'][0], 300)
        self.rows = {'visitor-a': [5, None]}
        self.assertEqual(self.attempt('visitor-a'), 600)
        self.assertNotIn('global', self.rows)


if __name__ == '__main__':
    unittest.main()
