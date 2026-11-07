#!/usr/bin/env python3
"""Render reproducible all-engine reference inventory; never label refs as integration."""
import importlib.util
from pathlib import Path
p=Path(__file__).with_name('engine-integration-audit.py')
spec=importlib.util.spec_from_file_location('inventory',p)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
d=mod.inventory()
lines=['# Engine integration reference inventory','',d['scope'],'',
       'Scanned consumer directories: root JS, core, engines, ui, actors, compat, direction, render.',
       'Every row still requires runtime contract verification. A consumer may be UI-only, a comment, or a guard.',
       'Dynamic WA[name] dispatch is not resolved here. Do not infer dead code from an empty consumer list.','',
       '| Engine | Namespace exports | Consumer files | Direct workflow registration | Entry reference |',
       '|---|---|---:|---|---|']
for row in d['engines']:
    consumers=set(x for values in row['consumers'].values() for x in values)
    lines.append('| '+row['file']+' | '+', '.join(row['exports'])+' | '+str(len(consumers))+' | '+str(row['workflowRegistrationReference'])+' | '+', '.join(row['loaderReferences'])+' |')
lines.extend(['',f"Total engine files: {d['count']}",'',
 'Rebuild: `python3 tests/engine-integration-report.py > docs/engine-integration-inventory.md`'])
print('\n'.join(lines))