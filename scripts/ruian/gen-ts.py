import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
lines = ['\t'.join([x['n'], x['p'], x['o'], x['t'], str(x['la']), str(x['lo'])]) for x in d]
assert not any('\t' in x['n'] or '\n' in x['n'] for x in d)
body = '\n'.join(lines)
head = ('// lib/data/casti-obci.ts – VYGENEROVÁNO (20. 10. 2026) z RÚIAN, adresní místa k 30. 9. 2026 (ČÚZK, CC BY 4.0).\r\n'
        '// Části obcí a městské části (Praha 3, Žižkov, Brno-Židenice, Poruba…) + 15 obcí, které chybí v tabulce `obce`.\r\n'
        '// Řádek: název \t obec \t okres \t typ (m = městská část, c = část obce, o = obec) \t zeměpisná šířka \t délka.\r\n'
        '// Souřadnice = střed adres části (průměr), převod S-JTSK → WGS84. Okres doplněn podle obce z tabulky `obce`.\r\n'
        '// Nepsat ručně – přegenerovat skriptem (viz docs/plan-mapy.md).\r\n\r\n')
open(sys.argv[2], 'w', encoding='utf-8', newline='').write(head + 'export const CASTI_OBCI_TSV = ' + json.dumps(body, ensure_ascii=False) + '\r\n')
print(len(lines))
