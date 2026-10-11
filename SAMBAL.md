# Studio Sambal-versie van Enhanced for Todoist

Dit is een fork van [julesvbertolino/todoist-enhanced](https://github.com/julesvbertolino/todoist-enhanced)
met vier eigen extra's erbovenop. De originele app blijft de basis; de extra's
staan zo veel mogelijk in eigen bestanden, zodat updates van het origineel
binnen te halen blijven.

## Takken

| Tak | Wat erin zit |
|---|---|
| `main` | Gelijk aan het origineel. Hier komt niets eigens in. |
| `extra/projectenkaart` | De projectenkaart, vanaf `main`. |
| `extra/teammappen` | Mappen van een teamwerkruimte in de zijbalk, vanaf `main`. |
| `extra/mijn-taken` | Instelling "Taken van anderen verbergen", vanaf `main`. |
| `extra/nederlands` | Nederlands als derde taal, en Nederlandse datum-invoer, vanaf `main`. |
| `sambal` | De vier extra's samen. Dit is de versie die je draait. |

Elke `extra/`-tak staat los van de andere en is zo als pull request bij
de maker in te dienen. Op `sambal` staat daarnaast wat twee extra's tegelijk
nodig heeft: met "Taken van anderen verbergen" aan telt de kaart ook
afgeronde taken van collega's niet mee, en de teksten van de kaart en van die
instelling staan er ook in het Nederlands (in `src/i18n/nl.ts`).

## De extra's

**Projectenkaart** (`#/map`, in de zijbalk onder Tags). Elk project is een bol,
zo groot als het aantal open taken of de geschatte tijd. De kleur zegt wat er
gebeurt: in beweging (iets afgerond in 14 dagen), stilgevallen, niet gestart,
doorlopend, slapend of leeg. Rechts staat wat je als eerste kunt afmaken, en
je kunt maximaal drie projecten in focus zetten. De focus en wat je als
doorlopend markeert, reizen mee met je instellingen; wat je op de kaart toont
of verbergt, blijft per apparaat.

**Teammappen.** Todoist bewaart de mappen van een teamwerkruimte apart; het
origineel las ze niet, dus een werkruimte met mappen was één platte lijst. Nu
staan de projecten onder hun map. Alleen lezen: een project naar een andere
map slepen kan hier nog niet.

**Taken van anderen verbergen.** Instellingen → Algemeen. Laat in elke lijst,
teller en belasting de taken weg die aan iemand anders zijn toegewezen. Taken
van jou of van niemand blijven staan.

**Nederlands.** Instellingen → Algemeen → Taal, of op het inlogscherm. De hele
interface is vertaald (`src/i18n/nl.ts`), en wat je typt wordt in het
Nederlands gelezen: *morgen om 14:00*, *overmorgen*, *volgende week*, *over 3
dagen*, *vrijdagmiddag*, *3 mei*, en herhalingen als *elke maandag*, *elke 3
dagen*, *elke werkdag om 9 uur*, *om de week*, *elke 1e vrijdag*, *elke! 5
dagen*. Een herhaling gaat in het Nederlands naar Todoist, in de woorden die
Todoist zelf documenteert; wat je anders schrijft (*iedere*, *wo*, *tweede*,
*'s ochtends*) wordt daarnaar omgezet. De release-notities ("Wat is er nieuw")
blijven Engels: die schrijft de maker.

Komt er in het origineel een nieuwe tekst bij, dan faalt `npm run typecheck`
op `nl.ts` tot die tekst ook daar staat. Dat is de bedoeling.

## Het origineel bijwerken

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main

# per extra, en daarna voor sambal:
git checkout extra/projectenkaart && git merge main
git checkout extra/teammappen     && git merge main
git checkout extra/mijn-taken     && git merge main
git checkout extra/nederlands     && git merge main
git checkout sambal
git merge extra/teammappen && git merge extra/mijn-taken && git merge extra/projectenkaart
git merge extra/nederlands

npm ci && npm run typecheck && npm run lint && npm test && npm run build
```

`upstream` is het origineel; voeg het één keer toe met
`git remote add upstream https://github.com/julesvbertolino/todoist-enhanced`.

Conflicten zijn te verwachten in de bestaande bestanden die een extra raakt:

- kaart: `src/App.tsx`, `src/hooks/useRoute.ts`, `src/domain/sidebar.ts`,
  `src/components/Sidebar.tsx`, `src/components/SidebarNavEditor.tsx`,
  `src/components/Icon.tsx`, `src/components/overlays/Search.tsx`,
  `src/store/prefs.ts`, `src/domain/types.ts`, `src/i18n/en.ts`, `src/i18n/fr.ts`
- teammappen: `src/api/sync.ts`, `src/store/sync.ts`, `src/store/selectors.ts`,
  `src/components/Sidebar.tsx`, `src/domain/types.ts`
- mijn taken: `src/hooks/useData.ts`, `src/store/prefs.ts`,
  `src/views/SettingsView.tsx`, `src/i18n/en.ts`, `src/i18n/fr.ts`

Het gaat telkens om een paar regels. De eigen bestanden
(`src/domain/projectMap.ts`, `src/domain/mapLayout.ts`, `src/views/MapView.tsx`,
`src/styles/map.css`, `src/domain/assignment.ts`) raakt het origineel niet.

## Bouwen en hosten

De site draait op `https://taken.studiosambal.nl/` en wordt door FlyWP uit
deze repository gebouwd, vanaf de tak `sambal`:

| Veld in FlyWP | Waarde |
|---|---|
| Runtime | Static |
| Package manager | npm |
| Build command | `npm run build:sambal` |
| Web directory | `/dist` |
| Branch | `sambal` |
| Push to deploy | aan |

Met "Push to deploy" aan komt elke push naar `sambal` vanzelf online.

`npm run build:sambal` is de gewone build met het adres erbij
(`PUBLIC_URL=https://taken.studiosambal.nl/`). Dat adres is nodig voor
"Continue with Todoist": Todoist stuurt je alleen terug naar het adres dat in
`oauth/client.json` staat, en de build schrijft dat bestand voor het adres dat
je opgeeft. Verhuist de site, pas dan het adres in dat script aan. Inloggen
met een API-token werkt ook zonder.

De `.htaccess` in de build is voor Apache en OpenLiteSpeed. Draait de site op
Nginx, dan wordt dat bestand niet gelezen: de app werkt, maar de
beveiligingsheaders die erin staan (onder meer de Content-Security-Policy)
gelden pas als je ze in de Nginx Config Editor van de site zet.

## Indienen bij de maker

Open een pull request vanaf een `extra/`-tak naar `main` van het origineel.
De README vraagt om bij een nieuw idee eerst een issue te openen; voor de
kaart is dat verstandig, de andere twee zijn gaten die elke gebruiker met een
teamwerkruimte heeft.
