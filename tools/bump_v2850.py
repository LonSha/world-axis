import io, os, re, glob
files = ['index.js','manifest.json','README.md','ITERATION_LOG.md'] + sorted(glob.glob('tests/*.js')) + sorted(glob.glob('tests/*.json'))
tot = 0
for f in files:
    if not os.path.exists(f):
        continue
    s = io.open(f, encoding='utf-8', errors='surrogateescape').read()
    n = s.count('2.84.0')
    if n:
        s = s.replace('2.84.0', '2.85.0')
        io.open(f, 'w', encoding='utf-8', errors='surrogateescape').write(s)
        print('%-46s %3d' % (f, n))
        tot += n
print('TOTAL', tot)
