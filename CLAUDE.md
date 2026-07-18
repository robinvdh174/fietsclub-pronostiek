# fietsclub-pronostiek

## Geheugen (memory-vault) — verplicht, elke sessie

Dit project gebruikt de privérepo `robinvdh174/memory-vault` als
persistent geheugen van de gebruiker.

**Bij de start van elke sessie:**
1. Voeg `robinvdh174/memory-vault` toe aan deze sessie (add_repo) en
   clone hem.
2. Lees daar `90-meta/memory-index.md`, de dagnotitie van vandaag en de
   projectnotitie van dit project in `20-projecten/`.

**Na elk afgerond stuk werk (automatisch, niet op verzoek):**
- Log beslissingen en open punten in de dagnotitie en de projectnotitie
  van memory-vault, en volg verder alle regels in `CLAUDE.md` van die
  repo (frontmatter, commit-discipline, zelf mergen naar main).

Lukt het toevoegen van memory-vault niet (geen toegang in deze sessie),
meld dat dan expliciet aan de gebruiker in plaats van zonder geheugen
door te werken.

## Specifiek voor deze repo

- Dit is de **publieke deploy-repo** van de app: GitHub Pages publiceert
  de root van `main` automatisch (zie `.github/workflows/pages.yml`).
- De **bron van waarheid** (incl. unit tests, spec en plan) staat in
  memory-vault onder `20-projecten/fietsclub-pronostiek/app/`. Wijzig
  daar, test daar, en kopieer dan de app-bestanden hierheen.
- Geen gevoelige gegevens hier committen — alles in deze repo is publiek.
