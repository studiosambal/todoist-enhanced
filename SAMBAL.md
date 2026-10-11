# Studio Sambal-versie van Enhanced for Todoist

Dit is een fork van [julesvbertolino/todoist-enhanced](https://github.com/julesvbertolino/todoist-enhanced)
met drie eigen extra's erbovenop. De originele app blijft de basis; de extra's
staan zo veel mogelijk in eigen bestanden, zodat updates van het origineel
binnen te halen blijven.

## Takken

| Tak | Wat erin zit |
|---|---|
| `main` | Gelijk aan het origineel. Hier komt niets eigens in. |
| `extra/projectenkaart` | De projectenkaart, vanaf `main`. |
| `extra/teammappen` | Mappen van een teamwerkruimte in de zijbalk, vanaf `main`. |
| `extra/mijn-taken` | Instelling "Hide tasks assigned to others", vanaf `main`. |
| `sambal` | De drie extra's samen. Dit is de versie die je draait. |

Elke `extra/`-tak staat los van de andere twee en is zo als pull request bij
de maker in te dienen. Op `sambal` staat daarnaast één koppeling die twee
extra's nodig heeft: met "Hide tasks assigned to others" aan telt de kaart ook
afgeronde taken van collega's niet mee.

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

**Taken van anderen verbergen.** Instellingen → General. Laat in elke lijst,
teller en belasting de taken weg die aan iemand anders zijn toegewezen. Taken
van jou of van niemand blijven staan.

## Het origineel bijwerken

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main

# per extra, en daarna voor sambal:
git checkout extra/projectenkaart && git merge main
git checkout extra/teammappen     && git merge main
git checkout extra/mijn-taken     && git merge main
git checkout sambal
git merge extra/teammappen && git merge extra/mijn-taken && git merge extra/projectenkaart

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
