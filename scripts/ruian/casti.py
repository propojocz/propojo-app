"""Části obcí a městské části z RÚIAN (adresní místa) -> JSON pro lib/obce.ts.
Použití: python -I casti.py <adr.zip> <obce.json> <out.json>
Souřadnice = průměr adresních míst skupiny, převod S-JTSK -> WGS84."""
import sys, csv, io, json, math, zipfile, unicodedata

def jtsk2wgs(X, Y, H=245.0):
    a = 6377397.15508; e = 0.081696831215303; n = 0.97992470462083
    konst_u_ro = 12310230.12797036
    sinUQ = 0.863499969506341; cosUQ = 0.504348889819882
    sinVQ = 0.420215144586493; cosVQ = 0.907424504992097
    alfa = 1.000597498371542; k = 1.003419163966575
    ro = math.sqrt(X * X + Y * Y)
    epsilon = 2 * math.atan(Y / (ro + X))
    D = epsilon / n
    S = 2 * math.atan(math.exp(1 / n * math.log(konst_u_ro / ro))) - math.pi / 2
    sinS, cosS = math.sin(S), math.cos(S)
    sinU = sinUQ * sinS - cosUQ * cosS * math.cos(D)
    cosU = math.sqrt(1 - sinU * sinU)
    sinDV = math.sin(D) * cosS / cosU
    cosDV = math.sqrt(1 - sinDV * sinDV)
    sinV = sinVQ * cosDV - cosVQ * sinDV
    cosV = cosVQ * cosDV + sinVQ * sinDV
    L = 2 * math.atan(sinV / (1 + cosV)) / alfa
    t = math.exp(2 / alfa * math.log((1 + sinU) / cosU / k))
    pom = (t - 1) / (t + 1)
    while True:
        sinB = pom
        pom = t * math.exp(e * math.log((1 + e * sinB) / (1 - e * sinB)))
        pom = (pom - 1) / (pom + 1)
        if abs(pom - sinB) < 1e-15:
            break
    B = math.atan(pom / math.sqrt(1 - pom * pom))
    # Bessel -> XYZ
    f_1 = 299.152812853
    e2 = 1 - (1 - 1 / f_1) ** 2
    rho = a / math.sqrt(1 - e2 * math.sin(B) ** 2)
    x = (rho + H) * math.cos(B) * math.cos(L)
    y = (rho + H) * math.cos(B) * math.sin(L)
    z = ((1 - e2) * rho + H) * math.sin(B)
    # Helmert S-JTSK -> WGS84
    dx, dy, dz = 570.69, 85.69, 462.84
    wz = -5.2611 / 3600 * math.pi / 180
    wy = -1.58676 / 3600 * math.pi / 180
    wx = -4.99821 / 3600 * math.pi / 180
    m = 3.543e-6
    xn = dx + (1 + m) * (x + wz * y - wy * z)
    yn = dy + (1 + m) * (-wz * x + y + wx * z)
    zn = dz + (1 + m) * (wy * x - wx * y + z)
    # XYZ -> WGS84
    a = 6378137.0; f_1 = 298.257223563
    a_b = f_1 / (f_1 - 1)
    p = math.sqrt(xn * xn + yn * yn)
    e2 = 1 - (1 - 1 / f_1) ** 2
    theta = math.atan(zn * a_b / p)
    st, ct = math.sin(theta), math.cos(theta)
    tt = (zn + e2 * a_b * a * st ** 3) / (p - e2 * a * ct ** 3)
    lat = math.atan(tt)
    lon = 2 * math.atan(yn / (p + xn))
    return math.degrees(lat), math.degrees(lon)

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip()

def hav(a1, o1, a2, o2):
    r = math.radians
    d = math.sin(r(a2 - a1) / 2) ** 2 + math.cos(r(a1)) * math.cos(r(a2)) * math.sin(r(o2 - o1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(d))

zpath, obce_path, out_path = sys.argv[1:4]
obce = json.load(open(obce_path, encoding='utf-8'))
by_name = {}
for o in obce:
    by_name.setdefault(norm(o['obec']), []).append(o)

groups = {}   # (kod_obce, norm name) -> dict
towns = {}    # kod_obce -> [name, sumY, sumX, n]
with zipfile.ZipFile(zpath) as z:
    for name in z.namelist():
        if not name.endswith('.csv'):
            continue
        text = z.read(name).decode('cp1250')
        for r in csv.DictReader(io.StringIO(text), delimiter=';'):
            try:
                Y = float(r['Souřadnice Y']); X = float(r['Souřadnice X'])
            except (ValueError, TypeError):
                continue
            kod = r['Kód obce']; obec = r['Název obce']
            t = towns.setdefault(kod, [obec, 0.0, 0.0, 0]); t[1] += Y; t[2] += X; t[3] += 1
            cands = []
            if r.get('Název MOMC'):
                cands.append(('m', r['Název MOMC']))
            if r.get('Název části obce'):
                cands.append(('c', r['Název části obce']))
            for typ, nm in cands:
                if norm(nm) == norm(obec):
                    continue
                key = (kod, norm(nm))
                g = groups.setdefault(key, {'n': nm, 'kod': kod, 'p': obec, 't': typ, 'Y': 0.0, 'X': 0.0, 'c': 0})
                if typ == 'm':
                    g['t'] = 'm'   # městská část má přednost před stejnojmennou částí obce
                g['Y'] += Y; g['X'] += X; g['c'] += 1

# okres obce: stejnojmenná obec z číselníku nejblíž středu adres obce
town_info = {}
miss = 0
diffs = []
extra = []   # obce, které v číselníku chybí (nebo jen jejich vzdálený jmenovec) – okres podle nejbližší obce
for kod, (nm, sy, sx, c) in towns.items():
    lat, lon = jtsk2wgs(sx / c, sy / c)
    cand = by_name.get(norm(nm), [])
    best = min(cand, key=lambda o: hav(lat, lon, o['latitude'], o['longitude'])) if cand else None
    d = hav(lat, lon, best['latitude'], best['longitude']) if best else 1e9
    if best and d <= 5:
        diffs.append(d)
        town_info[kod] = (best['obec'], best['okres'])
        continue
    near = min(obce, key=lambda o: hav(lat, lon, o['latitude'], o['longitude']))
    miss += 1; print("DOPLNENO", nm, '->', near['okres'])
    town_info[kod] = (nm, near['okres'])
    extra.append({'n': nm, 'p': nm, 'o': near['okres'], 't': 'o', 'la': round(lat, 5), 'lo': round(lon, 5)})

out = []
for g in groups.values():
    if g['kod'] not in town_info:
        continue
    lat, lon = jtsk2wgs(g['X'] / g['c'], g['Y'] / g['c'])
    p, okres = town_info[g['kod']]
    out.append({'n': g['n'], 'p': p, 'o': okres, 't': g['t'], 'la': round(lat, 5), 'lo': round(lon, 5)})
out.extend(extra)
out.sort(key=lambda x: (norm(x['p']), norm(x['n'])))
json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
diffs.sort()
print('obce v RÚIAN', len(towns), 'doplněných obcí', miss, 'částí', len(out),
      'městských částí', sum(1 for x in out if x['t'] == 'm'))
print('odchylka středu obce od číselníku km: medián %.2f, 95 %% %.2f, max %.1f' % (
    diffs[len(diffs) // 2], diffs[int(len(diffs) * 0.95)], diffs[-1]))
