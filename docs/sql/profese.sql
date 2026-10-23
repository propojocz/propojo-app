-- docs/sql/profese.sql – VYGENEROVÁNO skriptem scripts/profese-sql.py z docs/profese-navrh.json
-- Profese místo oborů (Matej 23. 10. 2026): poskytovatel vybere profesi, zákazník ji najde i pod příbuznými slovy.
-- Používá dnešní tabulku subcategories: profese = nové řádky (slug „p-…“), dnešní obory se označí jako
-- vyřazené (retired) s odkazem na profesi (replaced_by) a karty, položky ceníku, poptávky a katalog úkonů
-- se převedou na profesi. Nic se nemaže (staré vazby zůstanou, aplikace vyřazené obory nezobrazuje).
-- Projekt svtrlztjlxxjrbncukmp. Běží jako jedna transakce – chyba vrátí vše.

-- 1) Nové sloupce
alter table public.subcategories add column if not exists synonyms text[] not null default '{}';
alter table public.subcategories add column if not exists retired boolean not null default false;
alter table public.subcategories add column if not exists replaced_by uuid references public.subcategories(id);
alter table public.subcategories add column if not exists sort_order integer;

-- 2) Profese (147) – dočasná tabulka, ať se seznam nepíše dvakrát
create temp table _profese (cat text, slug text, name text, syn text[], ord int) on commit drop;
insert into _profese (cat, slug, name, syn, ord) values
  ('krasa', 'p-kadernik-kadernice', 'Kadeřník / kadeřnice', array['kadeřnictví', 'střih', 'stříhání', 'barvení vlasů', 'melír', 'foukaná', 'účes', 'dětský střih']::text[], 1),
  ('krasa', 'p-barber', 'Barber', array['holič', 'barbershop', 'pánský střih', 'vousy', 'holení', 'úprava vousů']::text[], 2),
  ('krasa', 'p-kosmeticka', 'Kosmetička', array['kosmetika', 'pleť', 'čištění pleti', 'ošetření pleti', 'kosmetický salon']::text[], 3),
  ('krasa', 'p-manikerka-a-nehtova-designerka', 'Manikérka a nehtová designérka', array['manikúra', 'nehty', 'gelové nehty', 'gel lak', 'modeláž nehtů', 'nehtové studio']::text[], 4),
  ('krasa', 'p-pedikerka', 'Pedikérka', array['pedikúra', 'péče o nohy', 'mokrá pedikúra']::text[], 5),
  ('krasa', 'p-rasy-a-oboci', 'Řasy a obočí', array['prodlužování řas', 'laminace řas', 'laminace obočí', 'lash', 'úprava obočí', 'barvení obočí']::text[], 6),
  ('krasa', 'p-vizazistka', 'Vizážistka', array['make-up', 'líčení', 'svatební líčení', 'svatební účes', 'líčení na ples']::text[], 7),
  ('krasa', 'p-permanentni-make-up', 'Permanentní make-up', array['PMU', 'microblading', 'pudrové obočí', 'tetování obočí', 'rty', 'linky']::text[], 8),
  ('krasa', 'p-depilace', 'Depilace', array['epilace', 'voskování', 'cukrová pasta', 'laserová epilace']::text[], 9),
  ('krasa', 'p-tater', 'Tatér', array['tetování', 'tattoo', 'tetovací studio']::text[], 10),
  ('krasa', 'p-piercing', 'Piercing', array['propichování', 'piercer', 'náušnice']::text[], 11),
  ('krasa', 'p-solarium-a-samoopalovani', 'Solárium a samoopalování', array['solárium', 'opalování', 'spray tan']::text[], 12),
  ('zdravi', 'p-maser-maserka', 'Masér / masérka', array['masáž', 'masáže', 'relaxační masáž', 'sportovní masáž', 'lymfatická masáž', 'thajská masáž']::text[], 1),
  ('zdravi', 'p-fyzioterapeut', 'Fyzioterapeut', array['fyzioterapie', 'rehabilitace', 'bolest zad', 'fyzio']::text[], 2),
  ('zdravi', 'p-osobni-trener', 'Osobní trenér', array['trenér', 'fitness', 'cvičení', 'posilování', 'skupinové lekce', 'kruhový trénink']::text[], 3),
  ('zdravi', 'p-lektor-jogy-a-pilates', 'Lektor jógy a pilates', array['jóga', 'pilates', 'lekce jógy']::text[], 4),
  ('zdravi', 'p-vyzivovy-poradce', 'Výživový poradce', array['výživa', 'jídelníček', 'hubnutí', 'nutriční terapeut']::text[], 5),
  ('zdravi', 'p-psycholog-a-kouc', 'Psycholog a kouč', array['psychoterapie', 'terapeut', 'koučink', 'osobní rozvoj', 'poradenství']::text[], 6),
  ('zdravi', 'p-instruktor-plavani', 'Instruktor plavání', array['plavání', 'výuka plavání', 'plavecký kurz']::text[], 7),
  ('zdravi', 'p-instruktor-lyzovani-a-snowboardu', 'Instruktor lyžování a snowboardu', array['lyžování', 'snowboard', 'lyžařská škola']::text[], 8),
  ('zdravi', 'p-trener-bojovych-sportu', 'Trenér bojových sportů', array['box', 'kickbox', 'MMA', 'sebeobrana', 'judo', 'karate']::text[], 9),
  ('zdravi', 'p-trener-tenisu', 'Trenér tenisu', array['tenis', 'lekce tenisu']::text[], 10),
  ('zdravi', 'p-porodni-asistentka-a-dula', 'Porodní asistentka a dula', array['porodní asistence', 'dula', 'péče o miminko', 'šestinedělí']::text[], 11),
  ('zdravi', 'p-sauna-a-wellness', 'Sauna a wellness', array['sauna', 'wellness', 'vířivka']::text[], 12),
  ('zdravi', 'p-cykloservis', 'Cykloservis', array['servis kol', 'oprava kola', 'kolo', 'elektrokolo']::text[], 13),
  ('zdravi', 'p-servis-lyzi-a-snowboardu', 'Servis lyží a snowboardů', array['broušení lyží', 'voskování lyží', 'servis snowboardu']::text[], 14),
  ('remesla', 'p-malir-a-naterac', 'Malíř a natěrač', array['malování', 'malíř pokojů', 'natírání', 'natěrač', 'lakýrník', 'štukování', 'tapetování', 'malířství']::text[], 1),
  ('remesla', 'p-elektrikar', 'Elektrikář', array['elektro', 'elektroinstalace', 'zásuvky', 'jističe', 'rozvaděč', 'revize elektro', 'hromosvod']::text[], 2),
  ('remesla', 'p-instalater', 'Instalatér', array['vodoinstalace', 'voda', 'kohoutek', 'baterie', 'odpad', 'bojler', 'WC', 'instalatérství']::text[], 3),
  ('remesla', 'p-topenar', 'Topenář', array['topení', 'kotel', 'radiátory', 'tepelné čerpadlo', 'podlahové topení', 'topenářství']::text[], 4),
  ('remesla', 'p-plynar', 'Plynař', array['plyn', 'plynové spotřebiče', 'revize plynu']::text[], 5),
  ('remesla', 'p-podlahar', 'Podlahář', array['podlahy', 'plovoucí podlaha', 'vinyl', 'parkety', 'linoleum', 'broušení parket', 'pokládka podlah']::text[], 6),
  ('remesla', 'p-obkladac', 'Obkladač', array['obklady', 'dlažba', 'dlaždič', 'koupelna']::text[], 7),
  ('remesla', 'p-zednik', 'Zedník', array['zednické práce', 'omítky', 'zdění', 'betonáž', 'základy', 'hrubá stavba', 'bourání', 'bourací práce']::text[], 8),
  ('remesla', 'p-sadrokartonar', 'Sádrokartonář', array['sádrokarton', 'SDK', 'podhledy', 'příčky']::text[], 9),
  ('remesla', 'p-tesar', 'Tesař', array['tesařství', 'krov', 'krovy', 'dřevostavba', 'dřevěné konstrukce']::text[], 10),
  ('remesla', 'p-truhlar', 'Truhlář', array['truhlářství', 'nábytek na míru', 'kuchyňská linka', 'vestavěné skříně', 'schodiště', 'dřevěné schody']::text[], 11),
  ('remesla', 'p-pokryvac', 'Pokrývač', array['střecha', 'střechy', 'krytina', 'oprava střechy', 'střešní okna']::text[], 12),
  ('remesla', 'p-klempir', 'Klempíř', array['okapy', 'oplechování', 'klempířství', 'žlaby']::text[], 13),
  ('remesla', 'p-fasady-a-zatepleni', 'Fasády a zateplení', array['fasáda', 'fasádník', 'zateplení', 'omítka fasády', 'kontaktní zateplení']::text[], 14),
  ('remesla', 'p-zamecnik-a-svarec', 'Zámečník a svářeč', array['zámečnictví', 'svařování', 'kovovýroba', 'zábradlí', 'vrata', 'brány', 'otevírání zámků']::text[], 15),
  ('remesla', 'p-okna-a-dvere', 'Okna a dveře', array['plastová okna', 'výměna oken', 'montáž dveří', 'seřízení oken']::text[], 16),
  ('remesla', 'p-sklenar', 'Sklenář', array['sklo', 'zasklení', 'sklenářství', 'zrcadla']::text[], 17),
  ('remesla', 'p-kominik', 'Kominík', array['komín', 'čištění komína', 'revize komína']::text[], 18),
  ('remesla', 'p-kamnar', 'Kamnář', array['krby', 'kamna', 'krbová vložka', 'kachlová kamna']::text[], 19),
  ('remesla', 'p-klimatizace-a-vzduchotechnika', 'Klimatizace a vzduchotechnika', array['klimatizace', 'rekuperace', 'vzduchotechnika', 'montáž klimatizace']::text[], 20),
  ('remesla', 'p-rekonstrukce-na-klic', 'Rekonstrukce na klíč', array['rekonstrukce bytu', 'rekonstrukce koupelny', 'rekonstrukce kuchyně', 'stavební firma']::text[], 21),
  ('remesla', 'p-projektant-a-stavebni-dozor', 'Projektant a stavební dozor', array['projekt', 'projektová dokumentace', 'stavební povolení', 'statik', 'CAD', 'technický dozor']::text[], 22),
  ('remesla', 'p-geodet', 'Geodet', array['zaměření', 'vytyčení', 'geometrický plán', 'geodetické práce']::text[], 23),
  ('remesla', 'p-energeticky-specialista', 'Energetický specialista', array['PENB', 'energetický štítek', 'energetický audit']::text[], 24),
  ('remesla', 'p-studnar', 'Studnař', array['studna', 'vrt', 'vrtání studny']::text[], 25),
  ('remesla', 'p-revizni-technik', 'Revizní technik', array['revize', 'kontrola', 'požární zařízení', 'hydranty', 'výtahy']::text[], 26),
  ('dum-a-byt', 'p-hodinovy-manzel', 'Hodinový manžel', array['drobné opravy', 'údržba', 'pověšení', 'vrtání', 'opravy v domácnosti']::text[], 1),
  ('dum-a-byt', 'p-montaz-nabytku', 'Montáž nábytku', array['skládání nábytku', 'IKEA', 'montáž kuchyně', 'sestavení nábytku']::text[], 2),
  ('dum-a-byt', 'p-opravar-spotrebicu', 'Opravář spotřebičů', array['pračka', 'myčka', 'lednice', 'sporák', 'servis spotřebičů']::text[], 3),
  ('dum-a-byt', 'p-calounik', 'Čalouník', array['čalounictví', 'přečalounění', 'sedačka', 'potahy']::text[], 4),
  ('dum-a-byt', 'p-cisteni-odpadu-a-kanalizace', 'Čištění odpadů a kanalizace', array['ucpaný odpad', 'krtkování', 'kanalizace', 'kamera do potrubí']::text[], 5),
  ('dum-a-byt', 'p-deratizace-a-dezinsekce', 'Deratizace a dezinsekce', array['škůdci', 'štěnice', 'švábi', 'myši', 'dezinfekce']::text[], 6),
  ('dum-a-byt', 'p-zaluzie-a-stinici-technika', 'Žaluzie a stínicí technika', array['žaluzie', 'rolety', 'markýzy', 'sítě proti hmyzu']::text[], 7),
  ('dum-a-byt', 'p-zabezpeceni-a-kamery', 'Zabezpečení a kamery', array['alarm', 'kamerový systém', 'zabezpečení domu', 'přístupový systém']::text[], 8),
  ('dum-a-byt', 'p-chytra-domacnost', 'Chytrá domácnost', array['smart home', 'automatizace domu', 'chytré osvětlení']::text[], 9),
  ('zahrada', 'p-zahradnik', 'Zahradník', array['zahrada', 'údržba zahrady', 'sekání trávy', 'stříhání keřů', 'pokládka trávníku', 'trávník', 'zahradnické práce']::text[], 1),
  ('zahrada', 'p-arborista', 'Arborista', array['kácení stromů', 'prořez stromů', 'řez stromů', 'rizikové kácení', 'frézování pařezů']::text[], 2),
  ('zahrada', 'p-pergoly-a-altany', 'Pergoly a altány', array['pergola', 'altán', 'zastřešení terasy', 'stavba pergoly', 'terasa']::text[], 3),
  ('zahrada', 'p-zahradni-architekt', 'Zahradní architekt', array['návrh zahrady', 'zahradní architektura', 'výsadba']::text[], 4),
  ('zahrada', 'p-zamkova-dlazba', 'Zámková dlažba', array['dlažba', 'pokládka dlažby', 'chodník', 'příjezdová cesta']::text[], 5),
  ('zahrada', 'p-ploty-a-oploceni', 'Ploty a oplocení', array['plot', 'oplocení', 'pletivo', 'podezdívka']::text[], 6),
  ('zahrada', 'p-bazeny-a-jezirka', 'Bazény a jezírka', array['bazén', 'jezírko', 'servis bazénu', 'zahradní jezírko']::text[], 7),
  ('zahrada', 'p-zavlahy', 'Závlahy', array['závlahový systém', 'automatická závlaha', 'kapková závlaha']::text[], 8),
  ('zahrada', 'p-cisteni-okapu-fasad-a-strech', 'Čištění okapů, fasád a střech', array['čištění okapů', 'mytí fasády', 'tlakové mytí', 'mytí teras', 'mytí střechy']::text[], 9),
  ('zahrada', 'p-zimni-udrzba', 'Zimní údržba', array['odklízení sněhu', 'posyp', 'shrnování sněhu']::text[], 10),
  ('zahrada', 'p-servis-zahradni-techniky', 'Servis zahradní techniky', array['sekačka', 'křovinořez', 'motorová pila', 'oprava sekačky']::text[], 11),
  ('uklid', 'p-uklid-domacnosti', 'Úklid domácností', array['uklízečka', 'úklid bytu', 'úklid domu', 'pravidelný úklid']::text[], 1),
  ('uklid', 'p-generalni-uklid', 'Generální úklid', array['úklid po rekonstrukci', 'úklid po malování', 'velký úklid', 'úklid po nájemníkovi']::text[], 2),
  ('uklid', 'p-uklid-firem-a-spolecnych-prostor', 'Úklid firem a společných prostor', array['úklid kanceláří', 'úklid provozoven', 'úklid domu', 'úklid schodiště']::text[], 3),
  ('uklid', 'p-myti-oken', 'Mytí oken', array['okna', 'mytí výloh', 'mytí solárních panelů']::text[], 4),
  ('uklid', 'p-cisteni-kobercu-a-calouneni', 'Čištění koberců a čalounění', array['tepování', 'čištění sedačky', 'čištění matrací']::text[], 5),
  ('uklid', 'p-zehleni-a-prani', 'Žehlení a praní', array['žehlení', 'praní prádla', 'prádelna']::text[], 6),
  ('stehovani', 'p-stehovani', 'Stěhování', array['stěhovák', 'stěhovací firma', 'stěhování bytu', 'stěhování firmy']::text[], 1),
  ('stehovani', 'p-vyklizeni-a-odvoz', 'Vyklízení a odvoz', array['vyklízení bytu', 'odvoz nábytku', 'odvoz odpadu', 'kontejner']::text[], 2),
  ('stehovani', 'p-autodoprava-a-kuryr', 'Autodoprava a kurýr', array['dovoz', 'přeprava', 'dodávka', 'kurýr', 'velké zásilky', 'nákladní doprava']::text[], 3),
  ('auto', 'p-automechanik', 'Automechanik', array['autoservis', 'servis auta', 'oprava auta', 'výměna oleje', 'STK', 'brzdy']::text[], 1),
  ('auto', 'p-pneuservis', 'Pneuservis', array['přezutí', 'pneumatiky', 'gumy', 'mobilní pneuservis']::text[], 2),
  ('auto', 'p-autoelektrikar', 'Autoelektrikář', array['autoelektrika', 'diagnostika', 'baterie auta']::text[], 3),
  ('auto', 'p-karosar-a-lakovna', 'Karosář a lakovna', array['autolakovna', 'autoklempíř', 'lakování auta', 'promáčkliny']::text[], 4),
  ('auto', 'p-autosklo', 'Autosklo', array['čelní sklo', 'výměna skla', 'oprava skla']::text[], 5),
  ('auto', 'p-detailing-a-myti-aut', 'Detailing a mytí aut', array['mytí auta', 'čištění interiéru', 'leštění', 'keramika', 'leštění světlometů']::text[], 6),
  ('auto', 'p-motoservis', 'Motoservis', array['motorka', 'servis motorky', 'skútr']::text[], 7),
  ('auto', 'p-odtahova-sluzba', 'Odtahová služba', array['odtah', 'odtahovka', 'asistence']::text[], 8),
  ('auto', 'p-autoskola', 'Autoškola', array['řidičák', 'kondiční jízdy', 'výuka řízení']::text[], 9),
  ('auto', 'p-ridic', 'Řidič', array['odvoz osob', 'taxi', 'osobní řidič']::text[], 10),
  ('it', 'p-servis-pocitacu', 'Servis počítačů', array['oprava počítače', 'notebook', 'IT podpora', 'záchrana dat', 'instalace Windows']::text[], 1),
  ('it', 'p-servis-mobilu', 'Servis mobilů', array['oprava telefonu', 'výměna displeje', 'tablet', 'baterie mobilu']::text[], 2),
  ('it', 'p-site-a-wi-fi', 'Sítě a Wi-Fi', array['wifi', 'router', 'internet', 'síťový administrátor']::text[], 3),
  ('it', 'p-anteny-tv-a-audio', 'Antény, TV a audio', array['anténa', 'satelit', 'montáž televize', 'domácí kino']::text[], 4),
  ('it', 'p-programator', 'Programátor', array['vývoj aplikací', 'webový vývojář', 'mobilní aplikace', 'databáze', 'PLC', 'automatizace', 'data analytik']::text[], 5),
  ('it', 'p-it-bezpecnost', 'IT bezpečnost', array['kybernetická bezpečnost', 'zabezpečení sítě', 'penetrační test']::text[], 6),
  ('it', 'p-3d-tisk', '3D tisk', array['3D tiskárna', 'modelování', '3D model']::text[], 7),
  ('it', 'p-pilot-dronu', 'Pilot dronu', array['dron', 'letecké snímky', 'letecké video']::text[], 8),
  ('online', 'p-tvorba-webu-a-e-shopu', 'Tvorba webů a e-shopů', array['web', 'webové stránky', 'e-shop', 'webdesign', 'UX', 'správa webu']::text[], 1),
  ('online', 'p-grafik', 'Grafik', array['grafický design', 'logo', 'firemní identita', 'vizitky', 'letáky']::text[], 2),
  ('online', 'p-copywriter', 'Copywriter', array['texty', 'textař', 'články', 'copywriting']::text[], 3),
  ('online', 'p-online-marketing', 'Online marketing', array['PPC', 'SEO', 'reklama', 'Google Ads', 'e-mailing', 'marketingové poradenství']::text[], 4),
  ('online', 'p-sprava-socialnich-siti', 'Správa sociálních sítí', array['sociální sítě', 'Instagram', 'Facebook', 'TikTok', 'social media']::text[], 5),
  ('online', 'p-strih-videa', 'Střih videa', array['video', 'editace videa', 'střihač']::text[], 6),
  ('online', 'p-prekladatel-a-tlumocnik', 'Překladatel a tlumočník', array['překlady', 'tlumočení', 'soudní překlad']::text[], 7),
  ('online', 'p-virtualni-asistentka', 'Virtuální asistentka', array['asistentka', 'administrativa', 'zadávání dat']::text[], 8),
  ('online', 'p-ai-a-automatizace', 'AI a automatizace', array['umělá inteligence', 'chatbot', 'automatizace procesů']::text[], 9),
  ('online', 'p-tvorba-online-kurzu', 'Tvorba online kurzů', array['e-learning', 'online kurz', 'videokurz']::text[], 10),
  ('doucovani', 'p-doucovani', 'Doučování', array['doučování základní škola', 'doučování střední škola', 'příprava na přijímačky', 'příprava na maturitu', 'dospělí']::text[], 1),
  ('doucovani', 'p-matematika', 'Matematika', array['doučování matematiky', 'matika']::text[], 2),
  ('doucovani', 'p-cestina', 'Čeština', array['český jazyk', 'literatura', 'doučování češtiny']::text[], 3),
  ('doucovani', 'p-anglictina', 'Angličtina', array['anglický jazyk', 'lektor angličtiny', 'konverzace']::text[], 4),
  ('doucovani', 'p-nemcina', 'Němčina', array['německý jazyk', 'lektor němčiny']::text[], 5),
  ('doucovani', 'p-dalsi-cizi-jazyky', 'Další cizí jazyky', array['francouzština', 'španělština', 'italština', 'ruština', 'jazyky']::text[], 6),
  ('doucovani', 'p-prirodni-vedy-a-zemepis', 'Přírodní vědy a zeměpis', array['chemie', 'fyzika', 'biologie', 'dějepis', 'zeměpis']::text[], 7),
  ('doucovani', 'p-vyuka-hudby', 'Výuka hudby', array['kytara', 'klavír', 'zpěv', 'hudební nástroj']::text[], 8),
  ('doucovani', 'p-vyuka-tance', 'Výuka tance', array['tanec', 'taneční', 'lekce tance']::text[], 9),
  ('doucovani', 'p-vytvarne-kurzy', 'Výtvarné kurzy', array['malování', 'kreslení', 'keramika']::text[], 10),
  ('doucovani', 'p-pocitacove-kurzy-a-programovani', 'Počítačové kurzy a programování', array['kurz Excel', 'práce s počítačem', 'programování pro děti']::text[], 11),
  ('pece-o-lidi', 'p-chuva', 'Chůva', array['hlídání dětí', 'babysitting', 'au-pair']::text[], 1),
  ('pece-o-lidi', 'p-pece-o-seniory', 'Péče o seniory', array['pečovatelka', 'senior', 'domácí péče']::text[], 2),
  ('pece-o-lidi', 'p-osobni-asistent', 'Osobní asistent', array['asistence', 'doprovod', 'pomoc s nákupem']::text[], 3),
  ('zvirata', 'p-groomer', 'Groomer', array['stříhání psů', 'psí salon', 'úprava srsti', 'koupání psa']::text[], 1),
  ('zvirata', 'p-hlidani-a-venceni', 'Hlídání a venčení', array['venčení psů', 'pet sitting', 'hlídání psa', 'hlídání kočky']::text[], 2),
  ('zvirata', 'p-vycvik-psu', 'Výcvik psů', array['trenér psů', 'kynolog', 'poslušnost']::text[], 3),
  ('zvirata', 'p-veterinar', 'Veterinář', array['veterina', 'veterinární péče', 'očkování psa']::text[], 4),
  ('zvirata', 'p-preprava-zvirat', 'Přeprava zvířat', array['doprava zvířat', 'převoz psa', 'převoz koně']::text[], 5),
  ('zvirata', 'p-podkovar', 'Podkovář', array['podkovářství', 'kopyta', 'kůň']::text[], 6),
  ('pravo-finance', 'p-advokat', 'Advokát', array['právník', 'právní služby', 'smlouvy', 'převod nemovitosti', 'exekuce', 'insolvence']::text[], 1),
  ('pravo-finance', 'p-ucetni', 'Účetní', array['účetnictví', 'mzdy', 'daňové přiznání', 'personalistika']::text[], 2),
  ('pravo-finance', 'p-danovy-poradce', 'Daňový poradce', array['daně', 'daňové poradenství']::text[], 3),
  ('pravo-finance', 'p-financni-poradce', 'Finanční poradce', array['hypotéka', 'úvěr', 'pojištění', 'investice']::text[], 4),
  ('pravo-finance', 'p-realitni-makler', 'Realitní makléř', array['reality', 'prodej bytu', 'pronájem', 'odhad nemovitosti']::text[], 5),
  ('firmy', 'p-bozp-a-pozarni-ochrana', 'BOZP a požární ochrana', array['BOZP', 'PO', 'školení BOZP']::text[], 1),
  ('firmy', 'p-firemni-skoleni', 'Firemní školení', array['školení', 'kurzy pro firmy', 'teambuilding']::text[], 2),
  ('firmy', 'p-tisk-a-reklamni-predmety', 'Tisk a reklamní předměty', array['tiskárna', 'polepy', 'reklamní předměty', 'potisk']::text[], 3),
  ('udalosti', 'p-fotograf', 'Fotograf', array['focení', 'svatební fotograf', 'fotky', 'portrét']::text[], 1),
  ('udalosti', 'p-kameraman', 'Kameraman', array['video', 'svatební video', 'natáčení']::text[], 2),
  ('udalosti', 'p-dj-a-hudba', 'DJ a hudba', array['DJ', 'kapela', 'živá hudba', 'ozvučení', 'osvětlení']::text[], 3),
  ('udalosti', 'p-cukrar', 'Cukrář', array['dorty', 'cukrářství', 'zákusky', 'svatební dort']::text[], 4),
  ('udalosti', 'p-catering-a-kuchar', 'Catering a kuchař', array['catering', 'kuchař', 'raut', 'jídlo na akci']::text[], 5),
  ('udalosti', 'p-dekorace-a-kvetiny', 'Dekorace a květiny', array['výzdoba', 'aranžmá', 'květinová výzdoba', 'floristka']::text[], 6),
  ('udalosti', 'p-animator-pro-deti', 'Animátor pro děti', array['dětská oslava', 'program pro děti', 'klaun', 'malování na obličej']::text[], 7),
  ('udalosti', 'p-moderator', 'Moderátor', array['moderování', 'konferenciér']::text[], 8),
  ('udalosti', 'p-svatebni-koordinator', 'Svatební koordinátor', array['svatba', 'wedding planner', 'organizace svatby']::text[], 9),
  ('udalosti', 'p-pujcovna-vybaveni', 'Půjčovna vybavení', array['půjčovna', 'pronájem stanů', 'skákací hrad', 'vybavení na akce']::text[], 10);

-- 2a) Obor se stejným názvem ve stejné kategorii se rovnou stane profesí (zachová vazby)
update public.subcategories o
set slug = p.slug, synonyms = p.syn, sort_order = p.ord, is_approved = true, retired = false
from _profese p
join public.categories c on c.slug = p.cat
where o.id = (
    select y.id from public.subcategories y
    where y.category_id = c.id and y.name = p.name and y.slug not like 'p-%'
    order by y.id limit 1
  )
  and not exists (select 1 from public.subcategories x where x.slug = p.slug);

-- 2b) Ostatní profese jako nové řádky
insert into public.subcategories (category_id, slug, name, is_approved, synonyms, sort_order)
select c.id, p.slug, p.name, true, p.syn, p.ord
from _profese p
join public.categories c on c.slug = p.cat
where not exists (select 1 from public.subcategories s where s.slug = p.slug);

-- 3) Dnešní obory → profese
update public.subcategories o
set retired = true, replaced_by = n.id
from (values
  ('p-kadernik-kadernice', array['Kadeřnictví', 'Dětský střih']::text[]),
  ('p-barber', array['Barber', 'Barbershop a pánské střihy']::text[]),
  ('p-kosmeticka', array['Kosmetička', 'Kosmetika a pleťová péče']::text[]),
  ('p-manikerka-a-nehtova-designerka', array['Manikúra a nehtový design', 'Manikúra a pedikúra']::text[]),
  ('p-pedikerka', array['Pedikúra']::text[]),
  ('p-rasy-a-oboci', array['Řasy a obočí']::text[]),
  ('p-vizazistka', array['Vizážistika a svatební líčení', 'Svatební make-up a účes']::text[]),
  ('p-permanentni-make-up', array['Permanentní make-up']::text[]),
  ('p-depilace', array['Depilace']::text[]),
  ('p-tater', array['Tetování', 'Tatér']::text[]),
  ('p-piercing', array['Piercing']::text[]),
  ('p-solarium-a-samoopalovani', array['Solárium a samoopalování']::text[]),
  ('p-maser-maserka', array['Masáže', 'Lymfatické masáže']::text[]),
  ('p-fyzioterapeut', array['Fyzioterapie']::text[]),
  ('p-osobni-trener', array['Osobní trenér', 'Skupinové lekce']::text[]),
  ('p-lektor-jogy-a-pilates', array['Jóga', 'Jóga a pilates', 'Pilates']::text[]),
  ('p-vyzivovy-poradce', array['Výživové poradenství', 'Výživový poradce']::text[]),
  ('p-psycholog-a-kouc', array['Psychologické poradenství', 'Koučink a osobní rozvoj']::text[]),
  ('p-instruktor-plavani', array['Plavecký instruktor', 'Výuka plavání']::text[]),
  ('p-instruktor-lyzovani-a-snowboardu', array['Lyžařská a snowboardová výuka']::text[]),
  ('p-trener-bojovych-sportu', array['Bojové sporty']::text[]),
  ('p-trener-tenisu', array['Tenis']::text[]),
  ('p-porodni-asistentka-a-dula', array['Porodní asistence a péče o miminko']::text[]),
  ('p-sauna-a-wellness', array['Sauna a wellness']::text[]),
  ('p-cykloservis', array['Servis kol']::text[]),
  ('p-servis-lyzi-a-snowboardu', array['Servis lyží a snowboardů']::text[]),
  ('p-malir-a-naterac', array['Malíř a lakýrník', 'Malířství a natěračství']::text[]),
  ('p-elektrikar', array['Elektrikář', 'Elektrikářství', 'Elektro', 'Hromosvod']::text[]),
  ('p-instalater', array['Instalatér', 'Instalatérství']::text[]),
  ('p-topenar', array['Topenář a kotle', 'Topenářství', 'Kotel', 'Tepelné čerpadla']::text[]),
  ('p-plynar', array['Plynař']::text[]),
  ('p-podlahar', array['Podlahář', 'Pokládka podlah']::text[]),
  ('p-obkladac', array['Obkladač', 'Obklady a dlažby']::text[]),
  ('p-zednik', array['Zedník', 'Zednické práce', 'Hrubá stavba', 'Základy a betonáž', 'Bourací práce']::text[]),
  ('p-sadrokartonar', array['Sádrokartonář', 'Sádrokartony']::text[]),
  ('p-tesar', array['Tesařství', 'Tesař / truhlář']::text[]),
  ('p-truhlar', array['Truhlářství a nábytek na míru', 'Schodiště']::text[]),
  ('p-pokryvac', array['Pokrývač']::text[]),
  ('p-klempir', array['Klempíř']::text[]),
  ('p-fasady-a-zatepleni', array['Fasádník', 'Zateplení']::text[]),
  ('p-zamecnik-a-svarec', array['Zámečník', 'Zámečnictví', 'Svařování a kovovýroba', 'Vrata a brány']::text[]),
  ('p-okna-a-dvere', array['Okna a dveře']::text[]),
  ('p-sklenar', array['Sklenář', 'Sklenářství']::text[]),
  ('p-kominik', array['Kominík']::text[]),
  ('p-kamnar', array['Krby a kamna']::text[]),
  ('p-klimatizace-a-vzduchotechnika', array['Klimatizace a vzduchotechnika']::text[]),
  ('p-rekonstrukce-na-klic', array['Rekonstrukce bytu', 'Rekonstrukce koupelny', 'Rekonstrukce kuchyně', 'Rekonstrukce na klíč']::text[]),
  ('p-projektant-a-stavebni-dozor', array['Projektant', 'CAD konstruktér', 'Stavební dozor', 'Projektová dokumentace']::text[]),
  ('p-geodet', array['Geodet', 'Geodetické práce']::text[]),
  ('p-energeticky-specialista', array['Energetický specialista (PENB)', 'Energetické štítky a audity']::text[]),
  ('p-studnar', array['Studny a vrty']::text[]),
  ('p-revizni-technik', array['Revize a kontroly', 'Požárně bezpečnostní zařízení', 'Hydrant', 'Výtah']::text[]),
  ('p-hodinovy-manzel', array['Hodinový manžel', 'Drobné opravy']::text[]),
  ('p-montaz-nabytku', array['Montáž nábytku', 'Montáž nábytku při stěhování']::text[]),
  ('p-opravar-spotrebicu', array['Opravy spotřebičů', 'Oprava domácích spotřebičů']::text[]),
  ('p-calounik', array['Čalounictví']::text[]),
  ('p-cisteni-odpadu-a-kanalizace', array['Čištění odpadů a kanalizace']::text[]),
  ('p-deratizace-a-dezinsekce', array['Deratizace, dezinfekce a dezinsekce', 'Dezinfekce a dezinsekce']::text[]),
  ('p-zaluzie-a-stinici-technika', array['Stínicí technika a žaluzie']::text[]),
  ('p-zabezpeceni-a-kamery', array['Zabezpečení a kamerové systémy', 'Kamery a zabezpečení']::text[]),
  ('p-chytra-domacnost', array['Chytrá domácnost (smart home)', 'Smart home instalace']::text[]),
  ('p-zahradnik', array['Zahradník', 'Zahradnické práce', 'Sekání trávy', 'Sekání trávy a údržba trávníku', 'Pokládka trávníku', 'sekání keře']::text[]),
  ('p-arborista', array['Kácení stromů a arboristika', 'Kácení a prořez stromů', 'Řez stromů a keřů']::text[]),
  ('p-pergoly-a-altany', array['Pergoly a altány', 'Stavba pergoly']::text[]),
  ('p-zahradni-architekt', array['Zahradní architektura']::text[]),
  ('p-zamkova-dlazba', array['Zámková dlažba']::text[]),
  ('p-ploty-a-oploceni', array['Ploty a oplocení']::text[]),
  ('p-bazeny-a-jezirka', array['Bazény a jezírka']::text[]),
  ('p-zavlahy', array['Závlahové systémy']::text[]),
  ('p-cisteni-okapu-fasad-a-strech', array['Čištění okapů', 'Mytí fasád a teras', 'Tlakové mytí střech']::text[]),
  ('p-zimni-udrzba', array['Zimní údržba']::text[]),
  ('p-servis-zahradni-techniky', array['Oprava zahradní techniky']::text[]),
  ('p-uklid-domacnosti', array['Úklid domácnosti']::text[]),
  ('p-generalni-uklid', array['Generální úklid', 'Úklid po rekonstrukci']::text[]),
  ('p-uklid-firem-a-spolecnych-prostor', array['Úklid firem a provozoven', 'Úklid komerčních prostor', 'Úklid společných prostor']::text[]),
  ('p-myti-oken', array['Mytí oken', 'Mytí solárních panelů']::text[]),
  ('p-cisteni-kobercu-a-calouneni', array['Čištění koberců a čalounění']::text[]),
  ('p-zehleni-a-prani', array['Žehlení a praní prádla']::text[]),
  ('p-stehovani', array['Stěhování', 'Stěhování a vyklízení']::text[]),
  ('p-vyklizeni-a-odvoz', array['Vyklízení nemovitostí', 'Odvoz odpadu a nábytku']::text[]),
  ('p-autodoprava-a-kuryr', array['Autodoprava', 'Kurýr / velké zásilky', 'Nákladní doprava a dovoz']::text[]),
  ('p-automechanik', array['Autoservis', 'Příprava na STK', 'Výměna oleje']::text[]),
  ('p-pneuservis', array['Pneuservis', 'Pneuservis mobilní']::text[]),
  ('p-autoelektrikar', array['Autoelektrika', 'Autoelektrikář']::text[]),
  ('p-karosar-a-lakovna', array['Autoklempířství a lakovna', 'Autolakovna']::text[]),
  ('p-autosklo', array['Autosklo', 'Výměna autoskel']::text[]),
  ('p-detailing-a-myti-aut', array['Detailing auta', 'Mytí a čištění vozů', 'Mytí auta', 'Leštění světlometů']::text[]),
  ('p-motoservis', array['Motoservis']::text[]),
  ('p-odtahova-sluzba', array['Odtahová služba']::text[]),
  ('p-autoskola', array['Autoškola']::text[]),
  ('p-ridic', array['Řidič a odvoz osob']::text[]),
  ('p-servis-pocitacu', array['Oprava počítačů a notebooků', 'Servis počítačů a notebooků', 'Zálohování a záchrana dat', 'IT podpora a poradenství', 'IT poradenství']::text[]),
  ('p-servis-mobilu', array['Oprava telefonů', 'Servis mobilů a tabletů']::text[]),
  ('p-site-a-wi-fi', array['Nastavení wifi a sítě', 'Počítačové sítě a Wi-Fi', 'Síťový administrátor']::text[]),
  ('p-anteny-tv-a-audio', array['Antény a satelity', 'Instalace TV a audio']::text[]),
  ('p-programator', array['Vývoj aplikací', 'Webový vývojář', 'Mobile developer', 'Embedded / firmware vývojář', 'PLC programátor', 'Automatizační inženýr', 'Robotický inženýr', 'Elektronický konstruktér', 'Databáze a systémy', 'Databázový administrátor', 'Data analytik', 'Technický konzultant / PM']::text[]),
  ('p-it-bezpecnost', array['IT bezpečnost', 'Kybernetická bezpečnost']::text[]),
  ('p-3d-tisk', array['3D tiskař a modelář']::text[]),
  ('p-pilot-dronu', array['Drone pilot']::text[]),
  ('p-tvorba-webu-a-e-shopu', array['Tvorba webových stránek', 'Správa a údržba webu', 'Tvorba a správa e-shopu', 'UI/UX designer']::text[]),
  ('p-grafik', array['Grafický designer', 'Grafický design', 'Logo a firemní identita']::text[]),
  ('p-copywriter', array['Copywriter a textař', 'Copywriting a texty']::text[]),
  ('p-online-marketing', array['PPC a placená reklama', 'SEO a optimalizace pro vyhledávače', 'SEO specialista', 'E-mailový marketing', 'Marketingové poradenství']::text[]),
  ('p-sprava-socialnich-siti', array['Správa sociálních sítí', 'Správce sociálních sítí']::text[]),
  ('p-strih-videa', array['Střih videa']::text[]),
  ('p-prekladatel-a-tlumocnik', array['Překlady a tlumočení', 'Překlady', 'Tlumočení']::text[]),
  ('p-virtualni-asistentka', array['Virtuální asistence']::text[]),
  ('p-ai-a-automatizace', array['Automatizace a AI nástroje']::text[]),
  ('p-tvorba-online-kurzu', array['Tvorba online kurzů']::text[]),
  ('p-doucovani', array['Doučování — základní škola', 'Doučování — střední škola', 'Doučování pro dospělé', 'Příprava na přijímačky', 'Příprava na maturitu']::text[]),
  ('p-matematika', array['Matematika']::text[]),
  ('p-cestina', array['Český jazyk a literatura', 'Čeština']::text[]),
  ('p-anglictina', array['Angličtina']::text[]),
  ('p-nemcina', array['Němčina']::text[]),
  ('p-dalsi-cizi-jazyky', array['Francouzština', 'Španělština', 'Italština', 'Ruština', 'Další cizí jazyky', 'Jiný jazyk']::text[]),
  ('p-prirodni-vedy-a-zemepis', array['Chemie', 'Fyzika', 'Biologie', 'Chemie, fyzika a biologie', 'Dějepis a zeměpis']::text[]),
  ('p-vyuka-hudby', array['Hudba', 'Výuka hudby']::text[]),
  ('p-vyuka-tance', array['Výuka tance']::text[]),
  ('p-vytvarne-kurzy', array['Výtvarné kurzy']::text[]),
  ('p-pocitacove-kurzy-a-programovani', array['Kurzy práce s počítačem', 'Programování a IT']::text[]),
  ('p-chuva', array['Hlídání dětí']::text[]),
  ('p-pece-o-seniory', array['Péče o seniory']::text[]),
  ('p-osobni-asistent', array['Osobní asistent']::text[]),
  ('p-groomer', array['Grooming psů a koček', 'Stříhání psů']::text[]),
  ('p-hlidani-a-venceni', array['Hlídání zvířat (pet sitting)', 'Venčení psů']::text[]),
  ('p-vycvik-psu', array['Výcvik psů']::text[]),
  ('p-veterinar', array['Veterinární péče']::text[]),
  ('p-preprava-zvirat', array['Doprava zvířat', 'Přeprava zvířat']::text[]),
  ('p-podkovar', array['Podkovářství']::text[]),
  ('p-advokat', array['Advokátní služby', 'Právní služby', 'Sepsání smluv', 'Právo nemovitostí a převody', 'Dluhy, exekuce a insolvence']::text[]),
  ('p-ucetni', array['Účetnictví', 'Mzdy a personalistika', 'Daňové přiznání']::text[]),
  ('p-danovy-poradce', array['Daňový poradce']::text[]),
  ('p-financni-poradce', array['Finanční poradenství', 'Hypotéky a úvěry', 'Pojištění']::text[]),
  ('p-realitni-makler', array['Realitní makléř', 'Realitní služby', 'Odhad nemovitostí']::text[]),
  ('p-bozp-a-pozarni-ochrana', array['BOZP a požární ochrana']::text[]),
  ('p-firemni-skoleni', array['Firemní školení']::text[]),
  ('p-tisk-a-reklamni-predmety', array['Tisk a reklamní předměty']::text[]),
  ('p-fotograf', array['Fotograf']::text[]),
  ('p-kameraman', array['Kameraman']::text[]),
  ('p-dj-a-hudba', array['DJ a hudba', 'DJ a živá hudba', 'Živá hudba a kapely', 'Ozvučení a osvětlení']::text[]),
  ('p-cukrar', array['Cukrářství a dorty', 'Dorty a cukrářství']::text[]),
  ('p-catering-a-kuchar', array['Catering a kuchař']::text[]),
  ('p-dekorace-a-kvetiny', array['Dekorace a aranžmá', 'Dekorace a květiny', 'Květinová výzdoba']::text[]),
  ('p-animator-pro-deti', array['Animační programy pro děti', 'Program pro děti']::text[]),
  ('p-moderator', array['Moderování akcí']::text[]),
  ('p-svatebni-koordinator', array['Svatební koordinace']::text[]),
  ('p-pujcovna-vybaveni', array['Pronájem vybavení na akce', 'Půjčovna vybavení']::text[])
) as m(new_slug, old_names)
join public.subcategories n on n.slug = m.new_slug
where o.slug not like 'p-%' and o.name = any(m.old_names);

-- 4) Ostatní dnešní obory („Jiné“, testovací) vyřadit bez náhrady – jen ty, které existují teď
update public.subcategories set retired = true where slug not like 'p-%' and retired = false;

-- 5) Převod vazeb na profesi
insert into public.service_subcategories (service_id, subcategory_id)
select distinct ss.service_id, o.replaced_by
from public.service_subcategories ss
join public.subcategories o on o.id = ss.subcategory_id
where o.replaced_by is not null
  and not exists (select 1 from public.service_subcategories x where x.service_id = ss.service_id and x.subcategory_id = o.replaced_by);

update public.services s set subcategory_id = o.replaced_by
from public.subcategories o where s.subcategory_id = o.id and o.replaced_by is not null;

update public.service_items si set subcategory_id = o.replaced_by
from public.subcategories o where si.subcategory_id = o.id and o.replaced_by is not null;

update public.requests r set subcategory_id = o.replaced_by
from public.subcategories o where r.subcategory_id = o.id and o.replaced_by is not null;

update public.service_types t set subcategory_id = o.replaced_by
from public.subcategories o where t.subcategory_id = o.id and o.replaced_by is not null;

-- 6) Kategorie karty = kategorie hlavní profese (např. Malíř z „Dům a byt“ → „Stavba, rekonstrukce a řemesla“)
update public.services s set category = c.slug
from public.subcategories sc
join public.categories c on c.id = sc.category_id
where sc.id = s.subcategory_id and not sc.retired and s.category is distinct from c.slug;

-- 7) Řádek pod názvem karty = profese (dřív se skládal z oborů)
update public.services s set subtitle = p.names
from (
  select ss.service_id, string_agg(sc.name, ' · ' order by sc.sort_order nulls last, sc.name) as names
  from public.service_subcategories ss
  join public.subcategories sc on sc.id = ss.subcategory_id
  where not sc.retired
  group by ss.service_id
) p
where p.service_id = s.id;

-- 8) Hledání: i podle příbuzných slov profese, bez vyřazených oborů
create or replace function public.search_service_ids(patterns text[])
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.id
  from services s
  left join categories c on c.slug = s.category
  where s.is_active
    and exists (
      select 1 from unnest(patterns) p
      where lower(unaccent(concat_ws(' ', s.title, s.subtitle, s.description, s.category, c.name))) like '%' || p || '%'
    )
  union
  select si.service_id
  from service_items si
  where si.is_active
    and exists (select 1 from unnest(patterns) p where lower(unaccent(si.name)) like '%' || p || '%')
  union
  select ss.service_id
  from service_subcategories ss
  join subcategories sc on sc.id = ss.subcategory_id
  where sc.is_approved and not sc.retired
    and exists (
      select 1 from unnest(patterns) p
      where lower(unaccent(concat_ws(' ', sc.name, array_to_string(sc.synonyms, ' ')))) like '%' || p || '%'
    )
$$;
grant execute on function public.search_service_ids(text[]) to anon, authenticated;

-- Kontrola: počet profesí, vyřazených oborů a karet s profesí
select
  (select count(*) from public.subcategories where slug like 'p-%') as profese,
  (select count(*) from public.subcategories where retired) as vyrazene_obory,
  (select count(distinct ss.service_id) from public.service_subcategories ss join public.subcategories sc on sc.id = ss.subcategory_id where not sc.retired) as karty_s_profesi;
