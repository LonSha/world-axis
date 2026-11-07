#!/usr/bin/env python3
"""Conservative static wiring inventory. References are evidence, not runtime proof."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', 'node_modules', '.agents', 'vendor', 'dist'}

def inventory():
    sources = {}
    paths = list(ROOT.glob('*.js'))
    for folder in ('core', 'engines', 'ui', 'actors', 'compat', 'direction', 'render'):
        if (ROOT / folder).is_dir():
            paths.extend((ROOT / folder).rglob('*.js'))
    for path in paths:
        rel = path.relative_to(ROOT)
        if any(part in EXCLUDED for part in rel.parts) or rel.parts[0] in {'tests', 'tools'}:
            continue
        sources[str(rel)] = path.read_text(errors='replace')
    rows = []
    for path in sorted((ROOT / 'engines').glob('*.js')):
        rel = str(path.relative_to(ROOT))
        text = sources.get(rel, '')
        # Only direct namespace assignments; aliases and computed exports require review.
        exports = sorted(set(re.findall(r'\bWA\.([A-Za-z_$][\w$]*)\s*=\s*(?!=)', text)))
        consumers = {}
        for symbol in exports:
            pattern = re.compile(r'\bWA\.' + re.escape(symbol) + r'\b')
            consumers[symbol] = [name for name, source in sorted(sources.items())
                                 if name != rel and pattern.search(source)]
        calls = sorted(set(re.findall(r'\bWA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(', text)))
        entry = [name for name in ('index.js', 'tests/run.js')
                 if rel in (ROOT / name).read_text(errors='replace')]
        rows.append({'file': rel, 'exports': exports, 'consumers': consumers,
                     'calls': ['.'.join(call) for call in calls],
                     'loaderReferences': entry,
                     'transactionReference': bool(re.search(r'\bWA\.store\.transact\s*\(', text)),
                     'workflowRegistrationReference': bool(re.search(r'\bWA\.workflow\.register\s*\(', text)),
                     'review': 'no-direct-consumer' if exports and not any(consumers.values()) else
                               'export-detection-required' if not exports else 'runtime-contract-required'})
    return {'scope': 'All engines; production direct textual references only. Comments and guards may count; indirect calls may be missed. No runtime reachability claim.',
            'count': len(rows), 'engines': rows}

if __name__ == '__main__':
    print(json.dumps(inventory(), ensure_ascii=False, indent=2))
