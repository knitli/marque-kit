# SPDX-FileCopyrightText: 2026 Knitli Inc.
#
# SPDX-License-Identifier: AGPL-3.0-only
"""Extract the help and vocabulary fixtures from an engine checkout.

    python3 fixtures/extract.py <engine-checkout> <ism-ismcat data/ISMCAT dir>

Writes fixtures/memo.vocab.json (shaped like the engine's vocab JSON, the
engine's vocabulary source) and fixtures/memo.manual.json (the CAPCO-2016
sections the memo cites, sliced by page). Every citation quote the memo
and the help entries use is checked against its slice; a quote that can't
be found fails the run. Not a build step: run it by hand when the engine's
data moves, and review the diff.
"""
import csv, json, re, sys, tomllib, xml.etree.ElementTree as ET
from pathlib import Path

dev, ismcat = Path(sys.argv[1]), Path(sys.argv[2])
here = Path(__file__).parent

# ── vocabulary ──────────────────────────────────────────────────────────
def read_csv(name):
    with open(ismcat / 'CVE/ISMCAT' / name, encoding='utf-8-sig') as f:
        return [r for r in csv.DictReader(f) if not r['DeprecationDate']]

tetra_codes = {r['Value'] for r in read_csv('CVEnumISMCATTetragraph.csv')}
relto = read_csv('CVEnumISMCATRelTo.csv')
names = {r['Value']: r['Description'] for r in relto}
# A three-letter group (NSG) is a tetragraph-list value, not a country.
trigraphs = [{'code': r['Value'], 'name': r['Description']} for r in relto if re.fullmatch(r'[A-Z]{3}', r['Value']) and r['Value'] not in tetra_codes]

ns = {'ism': 'urn:us:gov:ic:ism'}
tetragraphs = []
for t in ET.parse(ismcat / 'Taxonomy/ISMCAT/TetragraphTaxonomyDenormalized.xml').getroot().iter():
    if not t.tag.endswith('Tetragraph') or t.tag.endswith('TetraToken'):
        continue
    tok = next((c.text for c in t.iter() if c.tag.endswith('TetraToken')), None)
    if tok not in tetra_codes:
        continue
    members = [c.text for c in t.iter() if c.tag.endswith('Country')]
    tetragraphs.append({'code': tok, 'name': names.get(tok), 'decomposable': t.get('decomposable') == 'Yes', 'members': members})

# ── help, in the engine's HelpJson shape ────────────────────────────────
anchors = tomllib.loads((dev / 'crates/capco/data/help_anchors.toml').read_text())
help_ = {}
for e in anchors['entry']:
    sec = e['section'] + (f".{e['subsection']}" if e.get('subsection') else '')
    sponsor, _, basis = (e.get('marking_sponsor') or '').partition('/')
    help_[e['canonical']] = {
        'code': e['canonical'], 'short': e['short'], 'long': e.get('long'),
        'citation': f"§{sec} p{e['page']}", 'examples': e.get('examples', []),
        'plain': e.get('plain'), 'tips': e.get('tips', []),
        'sponsor': sponsor or None, 'policy_basis': basis or None,
    }

# ── the manual, sliced by page ──────────────────────────────────────────
lines = (dev / 'crates/capco/docs/CAPCO-2016.md').read_text().split('\n')
begin = {int(m.group(1)): i for i, l in enumerate(lines) if (m := re.match(r'\s*begin page (\d+)\b', l))}
end = {int(m.group(1)): i for i, l in enumerate(lines) if (m := re.match(r'\s*end page (\d+)\b', l))}

# Section, title and page range, from CAPCO-2016_citation_index.yml; the NOFORN
# node there runs to p168, past PROPIN, so its range is the pages it occupies.
SLICES = [
    ('C', 'Portion marks', 25, 26),
    ('E.2', 'Derivative classification authority', 32, 32),
    ('H.3', 'JOINT classification markings', 55, 59),
    ('H.8', 'Not releasable to foreign nationals (NOFORN)', 145, 147),
    ('H.8', 'Authorized for release to (REL TO)', 150, 153),
]
sections = [{'section': s, 'title': t, 'pages': [a, b], 'text': '\n'.join(lines[begin[a]:end[b] + 1])} for s, t, a, b in SLICES]

# ── verify: every quote lands in its slice ─────────────────────────────
flat = lambda t: re.sub(r'\s+', ' ', re.sub(r'[*_#]', '', re.sub(r'(?m)^\s*-\s+', '', t))).strip()  # list bullets and emphasis aren't words
def lands(section, page, short):
    s = next((x for x in sections if x['section'] == section and x['pages'][0] <= page <= x['pages'][1]), None)
    if not s:
        return None
    return all(flat(part) in flat(s['text']) for part in short.split('…') if part.strip())

findings = json.loads((here / 'memo.findings.json').read_text())
cites = [c for f in findings['findings'] + findings['document']['artifacts'] for c in
         [f['says'].get('citation')] + [d.get('citation') for d in f.get('derivation', [])] if c]
bad = [c for c in cites if not lands(c['section'], c['page'], c['short'])]
for code in ('NF',):  # the memo's help tokens that have an entry
    m = re.match(r'§(\S+) p(\d+)', help_[code]['citation'])
    if not lands(m.group(1), int(m.group(2)), help_[code]['short']):
        bad.append(help_[code])
if bad:
    sys.exit('quote not found in its section:\n' + '\n'.join(json.dumps(b)[:200] for b in bad))

ismcat_version = ismcat.parent.parent.name.removeprefix('ism-ismcat-')
(here / 'memo.vocab.json').write_text(json.dumps({
    'schema': 'marque-vocab-fixture-1',
    'note': "Shaped like the engine's vocab JSON. Sliced from CAPCO-2016, a U.S. Government document in the public domain; regenerated by fixtures/extract.py. All markings are fictional examples.",
    'version': {'ismcat': ismcat_version, 'help': anchors.get('schema_version')},
    'trigraphs': trigraphs, 'tetragraphs': tetragraphs, 'help': help_,
}, indent=1, ensure_ascii=False) + '\n')
(here / 'memo.manual.json').write_text(json.dumps({
    'schema': 'marque-manual-fixture-1',
    'note': 'The CAPCO-2016 sections the memo cites, sliced by page from the CAPCO-2016 manual (U.S. Government, public domain) by fixtures/extract.py. Every quote the memo uses was found in its section when this was generated. All markings are fictional examples.',
    'source': 'capco_2016', 'sections': sections,
}, indent=1, ensure_ascii=False) + '\n')
print(f'{len(trigraphs)} trigraphs, {len(tetragraphs)} tetragraphs, {len(help_)} help entries, {len(sections)} sections; {len(cites) + 1} quotes verified')
