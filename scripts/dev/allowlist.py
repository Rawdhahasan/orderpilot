"""Rewrites the SECURITY DEFINER allowlist in 001_schema_guards with the given additions (sorted)."""
import re, sys
p = 'supabase/tests/database/001_schema_guards.test.sql'
s = open(p).read()
start = s.index("  array['accept_invitation'")
end = s.index("],", start) + 2
names = set(re.findall(r"'([a-z_]+)'", s[start:end])) | set(sys.argv[1:])
lines, cur = [], "  array["
for n in sorted(names):
    t = f"'{n}', "
    if len(cur) + len(t) > 110:
        lines.append(cur.rstrip()); cur = "        "
    cur += t
lines.append(cur.rstrip().rstrip(',') + '],')
open(p, 'w').write(s[:start] + '\n'.join(lines) + s[end:])
