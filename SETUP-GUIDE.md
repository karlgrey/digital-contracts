# Setup-Anleitung für Live-Server

Diese Anleitung führt dich durch die Installation auf deinem Live-Server.

## Schritt 1: Node.js installieren (falls noch nicht vorhanden)

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Überprüfen
node --version
npm --version
```

## Schritt 2: Projekt auf den Server hochladen

Option A: Mit Git
```bash
cd /var/www/
git clone <dein-repo-url> stellplatz-booking
cd stellplatz-booking
```

Option B: Mit SFTP/FTP
1. Alle Dateien in einen Ordner uploaden (z.B. `/var/www/stellplatz-booking`)

## Schritt 3: Dependencies installieren

```bash
cd /var/www/stellplatz-booking
npm install
```

## Schritt 4: Datenbank initialisieren

```bash
npm run init-db
```

Das erstellt die SQLite Datei `stellplatz.db` mit allen Tabellen.

## Schritt 5: Admin-Token setzen

Erstelle eine `.env` Datei:
```bash
cp .env.example .env
nano .env
```

Ändere den `ADMIN_TOKEN` zu etwas Sicherem:
```
ADMIN_TOKEN=dein_sehr_sicheres_token_12345
```

## Schritt 6: Mit PM2 als Service starten

```bash
# PM2 global installieren
sudo npm install -g pm2

# App starten
pm2 start server.js --name "stellplatz" --env .env

# Beim Boot starten
pm2 startup
pm2 save
```

## Schritt 7: Mit Nginx / Apache als Reverse Proxy

### Nginx Konfiguration
```nginx
server {
    listen 80;
    server_name stellplatz.deine-domain.de;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Dann aktivieren:
```bash
sudo ln -s /etc/nginx/sites-available/stellplatz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Apache Konfiguration
```apache
<VirtualHost *:80>
    ServerName stellplatz.deine-domain.de
    
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

## Schritt 8: SSL/HTTPS (Let's Encrypt)

```bash
sudo apt-get install certbot
sudo certbot certonly --standalone -d stellplatz.deine-domain.de
# oder mit Nginx
sudo certbot --nginx -d stellplatz.deine-domain.de
```

## Schritt 9: Datenbank initialisieren (Locations + Preise)

Nach dem ersten Start kannst du in der SQLite die Locations eintragen:

```bash
cd /var/www/stellplatz-booking
sqlite3 stellplatz.db

# Im SQLite-Prompt:
INSERT INTO locations (name, company, city) VALUES ('Location Potsdam', 'Firma A GmbH', 'Potsdam');
INSERT INTO locations (name, company, city) VALUES ('Location Brandenburg', 'Firma A GmbH', 'Brandenburg');
INSERT INTO locations (name, company, city) VALUES ('Location Frankfurt/Oder', 'Firma B GmbH', 'Frankfurt/Oder');

# Überprüfen
SELECT * FROM locations;

# Exit
.quit
```

## Schritt 10: Test

1. Browser öffnen: `https://stellplatz.deine-domain.de/booking.html`
2. Admin-Panel: `https://stellplatz.deine-domain.de/admin.html`
   - Dein ADMIN_TOKEN eingeben

## Logs anschauen

```bash
# Live logs
pm2 logs stellplatz

# Oder alle logs
pm2 logs

# Spezifische Nachricht suchen
pm2 logs stellplatz | grep "error"
```

## Backups

```bash
# Datenbank regelmäßig backup'en
cp /var/www/stellplatz-booking/stellplatz.db /backup/stellplatz_$(date +%Y%m%d).db
```

## Häufige Probleme

### Port 3000 bereits in Verwendung
```bash
# Prozess finden
lsof -i :3000

# Kill und neustarten
kill <PID>
pm2 restart stellplatz
```

### Keine Berechtigung auf Datenbank
```bash
chmod 755 /var/www/stellplatz-booking
chmod 644 /var/www/stellplatz-booking/stellplatz.db
```

### E-Mails senden
Für automatische E-Mail-Versand später: Nodemailer integrieren
```bash
npm install nodemailer
```

---

Du bist jetzt bereit! 🚀
