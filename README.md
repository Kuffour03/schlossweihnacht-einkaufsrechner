# Schlossweihnacht – Einkaufs- und Vorratsliste

Kleines Hilfsmittel für den Stand auf der Schlossweihnacht: Was wurde wann geholt,
was ist noch da, was muss heute nachbestellt werden. Eine einzelne Datei
(`index.html`) mit eingebettetem JavaScript und CSS – kein Server, kein Login,
keine Internetverbindung nötig. Pilot nach Ticket OPS-T-0301.

## Benutzen

`index.html` im Browser öffnen (Handy oder Rechner). Es gibt nichts zu installieren
und zu bauen. Oben steht der **Stichtag** (Vorgabe: heute); alle Ansichten rechnen
für diesen Tag. Ein anderer Stichtag zeigt, was an dem Tag fällig wäre.

| Ansicht | Zweck |
| --- | --- |
| Heute | Nachkaufliste: was nach Rhythmus oder Mindestbestand fällig ist, mit Grund je Eintrag; „Einkauf erfassen“ springt mit vorgewähltem Artikel ins Formular |
| Erfassen | Einkauf (Menge, Datum, optional Laden und Gesamtpreis), Verbrauch oder Zählung; die letzten Erfassungen lassen sich löschen |
| Bestand | aktueller Bestand je Artikel zum Stichtag, unter Mindestbestand hervorgehoben |
| Übersicht | je Artikel die letzten drei Einkäufe mit Datum, Menge, Laden und Kosten, dazu die Summe aller Einkäufe |
| Artikel | Artikelstamm anlegen, bearbeiten, löschen; „Beispielartikel laden“ |
| Daten | CSV-Export und -Import, alles löschen |

### Artikelstamm

Name, Einheit (frei, z. B. Stück, kg, Kiste, Packung), Kategorie (Lebensmittel
frisch, Lebensmittel haltbar, Verbrauchsartikel), Bestellrhythmus und optional ein
Mindestbestand. Rhythmen:

- **täglich** – fällig, sobald nicht heute gekauft wurde;
- **alle N Tage** und **wöchentlich** (= alle 7 Tage) – fällig, wenn der letzte Einkauf mindestens N Tage zurückliegt oder noch nie gekauft wurde;
- **einmalig zu Beginn** – fällig, bis es einmal gekauft wurde;
- **nach Bedarf** – nie nach Rhythmus fällig, nur über den Mindestbestand.

Unabhängig vom Rhythmus ist ein Artikel fällig, sobald sein Bestand **unter** dem
Mindestbestand liegt. Sind beide Gründe zutreffend, stehen beide da.

„Beispielartikel laden“ ergänzt 13 Artikel (ohne bereits vorhandene Namen):
täglich Brötchen und Handbrotteig; Lachs und Salat alle 2 Tage, Schnittlauch alle 3
Tage; wöchentlich Champignons und Lauch; einmalig zu Beginn Schmand, Crème fraîche
und Kartoffelsalat; nach Bedarf Servietten, Küchenrolle und Handschuhe. Rhythmen und
Einheiten lassen sich danach frei ändern. Mindestbestände sind in den Beispielen
nicht gesetzt.

### Bestand

Ein **Einkauf** erhöht den Bestand, ein **Verbrauch** verringert ihn (nie unter 0),
eine **Zählung** setzt ihn auf die gezählte Menge. Erfassungen gelten nach Datum
geordnet, am selben Tag in der Reihenfolge der Eingabe. Erfassungen nach dem
Stichtag zählen für den Stichtag nicht. Der Preis ist der **Gesamtpreis** des
Einkaufs in Euro (Komma oder Punkt).

## Datenhaltung

Die Daten liegen ausschließlich im Browser des Geräts (`localStorage`, Schlüssel
`schlossweihnacht-vorrat-v1`). Nichts wird an einen Server gesendet. Folgen:

- Pro Gerät und Browser gibt es einen eigenen Datenbestand; „Browserdaten löschen“ oder ein privates Fenster löscht ihn.
- Deshalb regelmäßig exportieren (siehe unten).
- Kann der Browser nicht speichern, steht oben eine rote Fehlermeldung „Nicht gespeichert“, bis ein späteres Speichern gelingt; eine Erfolgsmeldung gibt es dann nicht. Die Änderungen gelten nur bis zum Schließen oder Neuladen der Seite – sofort als CSV exportieren.

## Export und Import (CSV)

Unter „Daten“ gibt es zwei Dateien, beide UTF-8, Trennzeichen `;`, Texte mit
Sonderzeichen in Anführungszeichen:

- **Artikelstamm** – Spalten `id;name;unit;category;rhythm;every_days;min_stock`.
  `category`: `frisch`, `haltbar`, `verbrauch`. `rhythm`: `daily`, `every` (dann
  `every_days` setzen), `weekly`, `once`, `asneeded`.
- **Einkäufe** – Spalten `id;article_id;type;qty;date;shop;price`. `type`:
  `purchase` (Einkauf), `consume` (Verbrauch), `count` (Zählung). `date` als
  `JJJJ-MM-TT`. Die Datei enthält auch Verbrauch und Zählungen, damit der Bestand
  vollständig übertragen wird.

Der Import **ersetzt** den jeweiligen Bestand nach Rückfrage. Reihenfolge: erst
Artikelstamm, dann Einkäufe (diese verweisen über `article_id` auf den Stamm). Ein
Import mit auch nur einem fehlerhaften Datensatz wird ganz abgelehnt, mit Angabe der
Datensatznummer; es wird nichts halb übernommen. Export und Re-Import ergeben
denselben Bestand und dieselben Kosten (durch Tests belegt). So lassen sich Daten
zwischen Geräten übertragen.

## Tests

Voraussetzung: Node.js (getestet mit Version 24), sonst nichts; kein Netz.

```
node tests/static-check.js
node --test tests/logic.test.js tests/ui-smoke.test.js
```

oder beides mit `npm test`. Die Tests laden die Skripte direkt aus `index.html` und
prüfen damit dieselbe Logik, die die Seite ausführt:

- `tests/logic.test.js` – Fälligkeit je Rhythmus, Gegenprobe mit den Beispieldaten (Stichtag nach drei Tagen), Bestand nach Einkauf, Verbrauch und Zählung, Kosten, CSV-Rundlauf und Fehlerfälle;
- `tests/ui-smoke.test.js` – Bedienpfade der Seite gegen eine Attrappe des Browsers (kein echter Browser);
- `tests/static-check.js` – keine externen Abhängigkeiten, IDs und Aktionen verdrahtet, keine Hostpfade.

Grenze: Das Aussehen und die Bedienung am Handy sind nicht automatisch geprüft und
brauchen einen kurzen Blick im Browser.

## Nicht enthalten

Gemeinsame Liste für mehrere Geräte, Server, Login, Bestellung bei Lieferanten,
Rezepte und Mengenplanung aus Gästezahlen.

## Bestellplan nach Lieferant und Veranstaltungstag (Version 2)

Unter **Lieferanten & Tage** Lieferanten mit Bestellvorlauf (0 bis 365
Kalendertage, Vorgabe 1) und Veranstaltungstage mit Datum, Bezeichnung und
optionaler Wetter-/Tagesnotiz anlegen. „Bearbeiten“ lädt den jeweiligen Datensatz
ins Formular; „Neu / Abbrechen“ leert es für einen weiteren Datensatz.
Die Bezeichnungen dürfen sich wiederholen (etwa zwei Pausentage).
Ein Datum kann einzeln geändert werden; „Termine verschieben“ verschiebt alle
Tage relativ zum frühesten Tag. Mengen und Tagesnotizen bleiben dabei erhalten,
auch über Monats-, Jahreswechsel und Schalttage.

Jeder Artikel hat unter **Artikel** einen Lieferanten und ein freies Gebinde
(z. B. „Kiste 3 kg“, „10x1kg“). Bestehende Artikel erhalten zunächst den
Lieferanten „Nicht zugeordnet“ mit Vorlauf 1 und ihre Einheit als Gebinde.
Den Lieferanten anschließend passend zuordnen. Die geplante Menge bezieht sich
auf die **Einheit des Artikels**; die Gebindeangabe dient als Bestellhilfe und
rechnet Mengen nicht automatisch um.

Unter **Bestellplan** Mengen für Artikel × Veranstaltungstag eingeben. Für das
Handy gibt es „Ein Tag“ oder „Ein Artikel“, für den Rechner „Ganze Tabelle“
(horizontal scrollbar). Nach Verlassen einer Mengenzelle wird gespeichert.
Leere Zellen bedeuten 0, `100+100` ergibt 200; Kommazahlen sind möglich.
Ungültige Mengen werden gemeldet und nicht gespeichert.

**Heute bestellen** berechnet zum Stichtag für jeden Lieferanten:
`Bestelldatum = Liefertag − Bestellvorlauf`. Es erscheinen Artikel, Menge,
Einheit, Gebinde und Liefertag samt Notiz. Pausentage und Vorbereitungstage
werden genauso behandelt wie Veranstaltungstage. Sobald Tage angelegt sind,
zeigt die zusätzliche Rhythmus-/Mindestbestandsliste nur **Verbrauchsartikel**.
Ohne Veranstaltungstage arbeitet sie weiterhin wie Version 1 für alle Artikel.
Es gibt keine automatische Bestellung und keine Erledigt-Markierung für den
Bestellplan; die Matrix stellt geplante Mengen dar. Erfasste Einkäufe verändern
sie nicht.

### Tabellenimport und verlustfreier Export

Unter **Daten** den Bestellplan als UTF-8-CSV mit Semikolon importieren bzw.
exportieren. Die Beispieldatei [tests/fixtures/bestellplan.csv](tests/fixtures/bestellplan.csv)
folgt der bereitgestellten Tabellenstruktur (Lieferantengruppen, 15 Spalten von
„Mehr Vorlauf“ über Pausen bis „Abbau“, Wetter, Einheitenzellen und Summen).
Die konkreten ISO-Daten sind für den Test ergänzt; Bäcker hat zur Gegenprobe
Vorlauf 0, alle übrigen Lieferanten 1. Die Quelle enthält außerdem einen zweiten
Vorjahresblock; die Fixture bildet den ersten vollständigen Mengenblock ab.

Kompakte Importstruktur:

```csv
Artikel;Gebinde;Vorlauf;Aufbau;1. Tag
Datum;;;2026-12-02;2026-12-04
Wetter;;;;Regen
Lieferant: Metro;;1;;
Lachs 10kg;10 kg;;40kg;100+100
Lieferant: Bäcker;;0;;
Knaxx Brötchen;Stück;;;170
```

„Datum“ liefert ISO-Daten (`JJJJ-MM-TT`) zu den Spaltenbezeichnungen. Alternativ
kann jede Tagesüberschrift `JJJJ-MM-TT | Bezeichnung` heißen. „Wetter“ wird als
Notiz übernommen. Vorlauf ist je Lieferantenzeile optional (Standard 1).
Eine Zahl mit angehängter Einheit wie `40kg` wird als 40 gelesen, ohne
Umrechnung. Unterstützte Zell-Einheiten: kg, g, Stück, Bund, Kiste(n), Packung(en),
Pck, Eimer. Die Einheit des Artikels entsprechend einstellen; ein kompakter
Import ohne Einheitsspalte verwendet bei neuen Artikeln zunächst „Einheiten“.

Der Export enthält zusätzlich IDs, Einheit, Kategorie, Rhythmus, N-Tage und
Mindestbestand sowie eine `Tag-ID`-Zeile. Artikelzeilen beginnen beim Export
mit `Artikel: `; das schützt auch Artikelnamen wie „Wetter“ vor Verwechslung.
Diese Metadaten erhalten Lieferantenzuordnung, Gebinde, Tage, Notizen,
Verbrauchsartikel-Einstellungen und alle Mengen beim Re-Import. Die Reihenfolge
der Artikel kann sich beim Gruppieren nach Lieferant ändern; ihre Identität und
Werte bleiben gleich. Auch leere Lieferantengruppen bleiben erhalten.

Ein Import ersetzt Lieferanten, Tage und Bestellmengen **nach Rückfrage**.
Artikel werden über vorhandene IDs, bei kompakten Tabellen über gleiche Namen
zugeordnet. Nicht erwähnte Artikel und alle Erfassungen bleiben erhalten;
Artikel ohne passende importierte Zuordnung landen unter „Nicht zugeordnet“.
Ein fehlerhafter Datensatz lehnt die ganze Datei ab. Vor einem Import immer
exportieren: **Bestellplan und Einkäufe**, zusätzlich den Artikelstamm als
Version-1-kompatible Sicherung. Die alte Artikelstamm-CSV enthält keine
Bestellplan-Zuordnungen; diese stehen in der Bestellplan-CSV.

### Daten aus Version 1 und Testgrenzen

Der bisherige Speicherschlüssel bleibt unverändert. Artikel und Erfassungen aus
Version 1 werden beim Laden übernommen; neue Lieferanten-/Planfelder werden
ergänzt. Gespeichert wird danach Version 2. Bestand und Kosten rechnen mit den
bisherigen IDs und Daten weiter. Eine beschädigte gespeicherte Planstruktur
wird mit Meldung verworfen; gültige Vorratsdaten bleiben erhalten.

Die bestehenden Node-Befehle / `npm test` prüfen jetzt zusätzlich die
Stichtagsbestellung für Vorlauf 0 und 1 gegen die Fixture, CSV-Rundlauf mit
Sonderzeichen, Datumsverschiebung, v1-Migration und Bestandserhalt, neue
Formulare und Handyansichten sowie Import-/Speicherfehler. Alle Tests nutzen
die Skripte aus `index.html`, ohne Netz oder Pakete. Die UI-Tests sind weiterhin
Browserattrappen; visuelles Layout und Bedienbarkeit auf einem echten Handy
sind damit nicht belegt.
