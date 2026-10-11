#!/usr/bin/env python3
"""Regenerate test/matrix.fixtures.json from a real TI-84 Plus (OS 2.55MP).

The fixtures are what the real calculator answered, read back at full 14-digit
precision; test/matrix.test.js replays them against the JS engine. This script
needs a headless TilEm harness (ti84.py) and a TI-84 Plus ROM image, neither of
which is part of this repository. It is kept here so the provenance of the
numbers is not a mystery.

    python3 -I test/gen-matrix-fixtures.py /path/to/ti84-emu/harness

Statements use the project's own lexer syntax (js/math/tokens.js), so the same
string drives the real calculator and the JS engine.
"""
import json, os, random, sys
from decimal import Decimal as D

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/ti84-emu/harness'))
import ti84

random.seed(84)


def lit(M):
    return '[' + ''.join('[' + ','.join(cell(x) for x in row) + ']' for row in M) + ']'


def cell(x):
    s = format(x, 'f') if isinstance(x, D) else str(x)
    return s.replace('-', '~')


def rnd_int(r, c):
    return [[random.randint(-9, 9) for _ in range(c)] for _ in range(r)]


def rnd_dec(r, c):
    def one():
        d = ''.join(random.choice('0123456789') for _ in range(random.choice([1, 3, 6, 14])))
        v = D(d or '0').scaleb(-random.randint(0, 3))
        return -v if random.random() < .4 else v
    return [[one() for _ in range(c)] for _ in range(r)]


def dec(v):
    if isinstance(v, list):
        return [dec(x) for x in v]
    return None if v is None else str(v)


cases = []


def case(*stmts, note=''):
    cases.append({'stmts': list(stmts), 'note': note})


# ---- hand-written semantics ------------------------------------------------
A, B = '[[1,2][3,4]]', '[[5,6][7,8]]'
C, Dm = '[[1,2,3][4,5,6]]', '[[1,2][3,4][5,6]]'
N = '[[~1.5,2.5][~3.7,4.2]]'
for e in [A + '+' + B, A + '-' + B, A + '*' + B, C + '*' + Dm, Dm + '*' + C, C + '*' + C,
          A + '+' + C, '2*' + A, A + '*2', A + '/2', '2/' + A, '2+' + A, A + '+2', '~' + A,
          A + '^2', A + '^3', A + '^0', A + '^1', A + '^~1', A + '^~2', A + '^.5', C + '^2',
          A + '^100', '2^' + A, A + '²', A + '³', A + '⁻¹', C + '⁻¹', '[[2,0][0,2]]⁻¹',
          A + '=' + A, A + '=' + B, A + '≠' + B, A + '<' + B, A + '=' + C,
          'abs(' + N + ')', 'round(' + N + ')', 'round(' + N + ',0)', 'iPart(' + N + ')',
          'fPart(' + N + ')', 'int(' + N + ')', 'min(' + A + ')', 'sqrt(' + A + ')', 'abs(' + A + ',1)',
          'det(' + A + ')', 'det(' + C + ')', 'det([[5]])', 'dim(' + C + ')', 'dim(' + A + ')',
          'identity(3)', 'identity(1)', 'identity(0)', 'identity(100)',
          'augment(' + A + ',' + B + ')', 'augment(' + A + ',' + C + ')', 'augment(' + A + ',' + Dm + ')',
          C + '^T', 'cumSum(' + C + ')', 'cumSum(' + A + ')',
          'rowSwap(' + A + ',1,2)', 'rowSwap(' + A + ',1,3)', 'row+(' + A + ',1,2)', 'row+(' + A + ',2,1)',
          '*row(2,' + A + ',1)', '*row(0,' + A + ',1)', '*row(~1,' + A + ',2)',
          '*row+(2,' + A + ',1,2)', '*row+(~3,' + A + ',1,2)',
          'rref(' + C + ')', 'ref(' + C + ')', 'rref(' + Dm + ')', 'ref(' + Dm + ')',
          '[[1,2][3]]', '[[1,2,3][4,5]]', '[[1+1,2*3][4/2,5-1]]', '[[~1.5,.25]]', '[[]]', '[1,2]',
          '[[3]]⁻¹', '[[0]]⁻¹', '[[2]]^~1', '[[1]]+[[2]]',
          '{1,2,3}', '{1,2,3}+{4,5,6}', '{1,2,3}*2', '{1,2,3}+{4,5}', '{1,2}+[[1,2]]',
          '{1,2}*[[1,2]]', 'abs({~1,2})', 'sqrt({4,9})', '{4,9}⁻¹', '~{1,2}',
          '{1,2}^2', '2^{1,2}', '{1,2}={1,3}', '{1,2}>1', '{1,2}/{4,8}', '2/{4,8}', '{4,8}/2',
          '{1,2}-{1,1}', '5+{1,2}', 'min({3,1,2})', 'max({3,1,2})',
          'dim({1,2,3})', 'cumSum({1,2,3})', 'augment({1,2},{3})',
          '{.1,.2}+{.2,.1}-{.3,.3}', '{1,2,3}/3*3', '{1E50,1}+{1,1E50}', '{1,2}*{1E60,1E60}*{1E60,1}']:
    case(e)
for st in [
    ['[A]'],
    ['[[1,2][3,4]]→[A]', '[A]'],
    ['[[1,2][3,4]]→[A]', '[A](1,2)'], ['[[1,2][3,4]]→[A]', '[A](2,1)'],
    ['[[1,2][3,4]]→[A]', '[A](3,1)'], ['[[1,2][3,4]]→[A]', '[A](0,1)'], ['[[1,2][3,4]]→[A]', '[A](1,3)'],
    ['[[1,2][3,4]]→[A]', '[A](1)'], ['[[1,2][3,4]]→[A]', '[A](1.5,1)'],
    ['[[1,2][3,4]]→[A]', '9→[A](1,2)', '[A]'], ['[[1,2][3,4]]→[A]', '9→[A](3,1)'],
    ['[[1,2][3,4]]→[A]', '[A](1,1)+[A](2,2)'], ['[[1,2][3,4]]→[A]', '[A]→[B]', '[B]'],
    ['[[1,2][3,4]]→[A]', '2[A]'], ['[[1,2][3,4]]→[A]', '[A][A]'], ['[[1,2][3,4]]→[A]', '[A]*[A]+[A]'],
    ['5→[A]'], ['[[1,2][3,4]]→[A]', '[A]→X'],
    ['[[1,2][3,4]]', 'Ans+Ans'], ['[[1,2][3,4]]', 'Ans*Ans'], ['[[1,2][3,4]]', 'Ans⁻¹'],
    ['[[1,2,3][4,5,6]]→[A]', 'dim([A])'],
    ['[[1,2,3][4,5,6]]→[A]', '{3,2}→dim([A])', '[A]'],
    ['[[1,2,3][4,5,6]]→[A]', '{3,3}→dim([A])', '[A]'],
    ['[[1,2,3][4,5,6]]→[A]', '{1,2}→dim([A])', '[A]'],
    ['{2,2}→dim([B])', '[B]'], ['{100,2}→dim([B])'], ['{0,2}→dim([B])'],
    ['[[1,2][3,4]]→[A]', 'Fill(7,[A])', '[A]'],
    ['randM(0,3)'],
    ['{1,2,3}→L1', '{4,5,6}→L2', 'List>matr(L1,L2,[A])', '[A]'],
    ['[[1,2][3,4]]→[A]', 'Matr>list([A],1,L1)', 'L1'],
    ['[[1,2][3,4]]→[A]', 'Matr>list([A],L1,L2)', 'L2'],
    ['[[1,2][3,4]]→[A]', 'Matr>list([A],3,L1)'],
    ['{1,2,3}→L1', 'L1(2)'], ['{1,2,3}→L1', '9→L1(2)', 'L1'], ['{1,2,3}→L1', 'L1(5)'],
    ['{1,2,3}→L1', '2L1+1'], ['{1,2,3}→L1', '{1,2,3,4}→L1', 'L1'],
    ['[[1,2][3,4]]→[A]', '[[5,6][7,8]]→[B]', '[A]*[B]-[B]*[A]'],
    ['[[2,1][1,3]]→[A]', '[A]⁻¹*[A]'], ['[[2,1][1,3]]→[A]', '[A]^2-3[A]+[[1,0][0,1]]'],
]:
    case(*st)

# ---- generated ---------------------------------------------------------------
for t in range(60):
    n = random.choice([1, 2, 2, 3, 3, 4, 5])
    M = rnd_int(n, n) if t % 3 else rnd_dec(n, n)
    case('det(' + lit(M) + ')')
    case(lit(M) + '⁻¹')
for t in range(40):
    n = random.choice([2, 3, 4])
    M = rnd_int(n, n) if t % 2 else rnd_dec(n, n)
    case(lit(M) + '^' + str(random.choice([2, 3, 4, 5, 8, 10])))
    case(lit(M) + '^T')
for t in range(50):
    r, k, c = (random.randint(1, 5) for _ in range(3))
    mk = rnd_int if t % 2 else rnd_dec
    case(lit(mk(r, k)) + '*' + lit(mk(k, c)))
    case(lit(mk(r, c)) + '+' + lit(mk(r, c)))
    case(lit(mk(r, c)) + '-' + lit(mk(r, c)))
for t in range(40):
    c = random.randint(2, 6)
    r = random.randint(1, min(c, 4))
    M = rnd_int(r, c) if t % 2 else rnd_dec(r, c)
    if t % 4 == 0 and r >= 3:
        M[r - 1] = [M[0][j] + M[1][j] for j in range(c)]
    case('rref(' + lit(M) + ')')
    case('ref(' + lit(M) + ')')
def wide(r, c):
    out = []
    for _ in range(r):
        row = []
        for _ in range(c):
            d = ''.join(random.choice('0123456789') for _ in range(random.choice([2, 5, 10, 14])))
            v = D(d or '1').scaleb(random.choice([-6, -3, 0, 4, 8, 12]))
            row.append(-v if random.random() < .4 else v)
        out.append(row)
    return out
for t in range(30):
    r, k, c = (random.randint(2, 5) for _ in range(3))
    case(lit(wide(r, k)) + '*' + lit(wide(k, c)))
    n = random.randint(2, 4)
    case(lit(wide(n, n)) + '^' + str(random.choice([2, 3, 4])))
    case('det(' + lit(wide(n, n)) + ')')
    case(lit(wide(n, n)) + '⁻¹')
for t in range(15):
    n = random.randint(2, 4)
    M = rnd_int(n, n)
    case('2.5' + lit(M)) if False else case('2.5*' + lit(M))
    case('cumSum(' + lit(M) + ')')
    case('abs(' + lit(rnd_dec(n, n)) + ')')

out = []
for k, c in enumerate(cases):
    keys = ['clear']
    for s in c['stmts']:
        keys += ti84.lexkeys(s) + ['enter']
    r = ti84.run(keys, classic=True)
    entry = {'stmts': c['stmts'], 'err': r.error}
    if not r.error:
        entry['ans'] = dec(r.exact.get('Ans'))
        entry['mats'] = {k2[1]: dec(v) for k2, v in r.exact.items() if k2.startswith('[') and v is not None}
        entry['lists'] = {k2: dec(v) for k2, v in r.exact.items() if k2 in ('L1', 'L2', 'L3') and v}
    out.append(entry)
    if k % 25 == 0:
        print(k, '/', len(cases), file=sys.stderr)

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'matrix.fixtures.json')
with open(path, 'w') as f:
    json.dump(out, f, indent=0)
print('wrote', len(out), 'cases to', path)
