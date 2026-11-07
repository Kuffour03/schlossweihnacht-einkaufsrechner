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
