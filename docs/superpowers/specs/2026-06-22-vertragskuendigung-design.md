# Design: Vertragskündigung (Stellplatzmietvertrag)

**Datum:** 2026-06-22
**Status:** Genehmigt (Design), bereit für Implementierungsplan

## Problem / Ziel

Stellplatzmietverträge haben aktuell ein **festes Mietende** (`end_date`, Pflichtfeld im
Buchungsformular) und §2 des Vertrags enthält **keine Kündigungsklausel**. Das DB-Feld
`notice_period_days` (Default 30) existiert, wird aber nirgends verwendet.

Gewünscht ist: Verträge laufen nach Ablauf einer **Mindestlaufzeit** unbefristet weiter und
können **zum Monatsende** gekündigt werden. Die Kündigung erfolgt online (Deeplink im Vertrag
bzw. Admin-Panel), wird digital unterschrieben und als eigenständiges Nachtrag-PDF an beide
Parteien versendet.

## Geltungsregeln

- Verträge laufen nach der **Mindestlaufzeit** (= bisheriges „Mietende", `end_date`) unbefristet
  weiter und sind **zum Monatsende** kündbar; Frist = `notice_period_days` (30 Tage).
- **Beide Seiten** können kündigen: Kunde via Deeplink, Vermieter via Admin-Panel.
- Die Kündigung ist eine **einseitige Erklärung**: Wer kündigt, unterschreibt — keine
  Gegenzeichnung der anderen Partei nötig. Mit der Unterschrift ist sie verbindlich; das
  (i.d.R. zukünftige) **Wirksamkeitsdatum** wird automatisch berechnet.
- Kündbar sind nur **vollständig unterschriebene** Verträge (Status `completed`).
- Pro Vertrag existiert genau **eine** aktive Kündigung.

## Vertragsänderungen

- **Buchungsformular** (`public/booking-v2.html` / `.js`): Label „Mietende" → „**Mindestlaufzeit
  bis**" inkl. erklärendem Hilfetext. Feld und Validierung (min. 1 Monat) bleiben unverändert.
- **§2 Template** (Default-Template in `database-v2.js`): neue Kündigungsklausel, sinngemäß:
  „Nach Ablauf der Mindestlaufzeit (bis {{end_date}}) verlängert sich der Vertrag auf
  unbestimmte Zeit und kann von beiden Parteien mit einer Frist von 30 Tagen zum Monatsende
  gekündigt werden." Finale juristische Formulierung gibt der Auftraggeber vor.
  Doku ergänzen, wie das Production-Template aktualisiert wird (Default greift nur bei neuer DB).
- **PDF-Hinweisbox**: Beim PDF-Bau injiziert (NICHT im Markdown-Template), damit auch
  Altverträge mit gepinnter Template-Version den Deeplink erhalten. Kurzer Absatz:
  „Kündigung online unter: {Deeplink}". Begründung: Das Vertrags-PDF rendert aus dem auf der
  Buchung gepinnten Template (`b.template_id`), nicht dem aktiven Template.

## Datenmodell

### Neue Tabelle `contract_cancellations`

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | INTEGER PK | |
| `booking_id` | INTEGER FK → bookings(id) | |
| `initiated_by` | TEXT | `'customer'` \| `'owner'` |
| `reason` | TEXT NULL | optionaler Kündigungsgrund |
| `notice_date` | DATE | Datum der Kündigungserklärung (heute) |
| `effective_date` | DATE | berechnetes Wirksamkeitsdatum (Vertragsende) |
| `signature_svg` | TEXT | |
| `signature_image` | TEXT | |
| `signature_date` | DATETIME | |
| `signer_ip` | TEXT | |
| `signer_user_agent` | TEXT | |
| `created_at` | DATETIME | |

### Änderungen an `bookings`

- Neue Spalte `cancellation_token` TEXT — langes Zufallstoken, bei Buchungserstellung gesetzt;
  Migration backfillt bestehende Buchungen.
- Neuer Status-Wert `terminated` (gesetzt beim Unterschreiben der Kündigung).
- `notice_period_days` wird ab jetzt aktiv genutzt.

## Flows

### Kunde (Deeplink)
1. `/kuendigung?token=…` öffnen.
2. **Bestätigung**: Eingabe von Nachname **oder** E-Mail (Abgleich mit Buchung) bevor die
   Maske erscheint — Schutz gegen versehentliche/fremde Kündigung.
3. **Maske**: zeigt automatisch berechnetes Wirksamkeitsdatum + optionales
   Kündigungsgrund-Feld.
4. **Unterschrift** (digital, SVG, wie bestehender Vertrags-Flow).
5. Abschluss: Nachtrag-PDF erzeugen, Status → `terminated`, E-Mail an Kunde + Vermieter.

### Vermieter (Admin)
1. Button „Kündigen" an einer Buchung im Admin-Panel.
2. Gleiche Maske + Unterschrift.
3. Identischer Abschluss (Status, PDF, E-Mail).

## Wirksamkeitsdatum (Auto-Berechnung)

`effective_date` = erstes **Monatsende**, das

- (a) ≥ `notice_period_days` (30) Tage ab heute **und**
- (b) ≥ Ende der Mindestlaufzeit (`end_date`)

ist. Reine Datenberechnung — **kein** Cron/Background-Job. Status `terminated` wird sofort
gesetzt; das Wirksamkeitsdatum ist ein Datenpunkt, kein geplanter Übergang.

## Nachtrag-PDF + E-Mail

- Eigenständiges PDF „**Nachtrag/Kündigung zum Stellplatzmietvertrag Nr. {id}**": Bezug auf den
  Vertrag, kündigende Partei, Kündigungsdatum (`notice_date`), Wirksamkeitsdatum
  (`effective_date`), optionaler Grund, Unterschrift. Wiederverwendung der bestehenden
  PDF-Bausteine (`generateContractPDFBuffer()`).
- Versand an Kunde **und** Vermieter über bestehende Resend-Anbindung (`email.js`).

## Code-Struktur (gezieltes Refactoring)

- **Neues Modul `cancellation.js`**: Token-Erzeugung, Datumsberechnung, Nachtrag-PDF, DB-Zugriff.
- Schlanke Routes in `server-v2.js` (delegieren an das Modul) — kein breites Umbauen, nur die
  für dieses Feature saubere Grenze.
- Frontend: eigenständige `public/cancellation.html` + `public/cancellation.js`.
- Begründung: `server-v2.js` ist bereits 1672 Zeilen; das Feature wird isoliert gehalten statt
  weiter zentralisiert.

## Bewusst NICHT im Scope (YAGNI)

- Kein automatischer Status-Flip per Cron am Wirksamkeitsdatum.
- Keine Rücknahme/Widerruf einer Kündigung über die UI (bei Bedarf manuell in DB).
- Keine Teil-/Sonderkündigung, keine Mahn-/Erinnerungslogik.

## Offene Punkte für die finale Umsetzung

- Finale juristische §2-Formulierung durch Auftraggeber.
- Genaue Platzierung/Text der PDF-Hinweisbox.
