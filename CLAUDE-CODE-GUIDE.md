# 🤖 Guide: Building & Deploying with Claude Code

## What is Claude Code?

Claude Code is a command-line tool that allows you to instruct Claude directly from your terminal to write, debug, and manage code for you.

**Official Docs:** https://docs.claude.com/en/docs/claude-code

---

## 📥 Step 1: Install Claude Code

```bash
# Install the Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Check installation
claude-code --version
```

If you don't have Node.js yet:
```bash
# Mac
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 🚀 Step 2: Start Your Project

```bash
# New directory for your project
mkdir stellplatz-booking && cd stellplatz-booking

# Initialize Claude Code
claude-code init
```

This creates a `.claude-code` configuration file.

---

## 📋 Step 3: Use the Specification

You received the file `CLAUDE-CODE-SPEC.md`. This contains the **complete specification** for your system.

Copy the spec into your project directory:
```bash
cp CLAUDE-CODE-SPEC.md ./SPEC.md
```

---

## 💬 Step 4: Give Claude Code Instructions

Start Claude Code in the project directory:

```bash
claude-code
```

Then give Claude a precise instruction. Here's a template:

### Prompt Template
```
I want to build a parking space booking system. Read the complete specification in SPEC.md and implement everything according to this specification.

The system should have the following components:
1. Backend (Node.js + Express)
2. SQLite database
3. Customer form (booking.html)
4. Admin panel (admin.html)
5. PDF contract generation

Exact requirements: see SPEC.md

Start with the backend (server.js + database.js).
```

---

## 🔄 Step 5: Working with Claude Code

### After the first build is complete:

```bash
# In a new terminal
npm install
npm run init-db
npm start
```

### Then test:
- Browser: http://localhost:3000/booking.html
- Admin: http://localhost:3000/admin.html (Token: admin123)

### If something doesn't work:
```bash
# In Claude Code terminal:
claude-code "The server won't start. Error: [ERROR HERE]. Fix this in server.js"
```

---

## 🎯 Optimal Workflow

### Phase 1: Backend Creation
```bash
claude-code
# Prompt: Read SPEC.md and build server.js, database.js and config.js
```

### Phase 2: Frontend Creation
```bash
claude-code
# Prompt: Create booking.html according to SPEC.md with all features
```

### Phase 3: Admin Panel
```bash
claude-code
# Prompt: Create admin.html with login, dashboard and signature modal
```

### Phase 4: Testing & Fixes
```bash
npm install && npm start
# Test locally, report errors to Claude Code
```

---

## 🚢 Step 6: Before Deployment

### 1. Security
```bash
claude-code "Change ADMIN_TOKEN in .env.example to a secure value"
```

### 2. Documentation
```bash
claude-code "Create DEPLOYMENT.md with step-by-step instructions for Linux + PM2"
```

### 3. Final Checks
```bash
# All files present?
ls -la

# Test locally?
npm start

# Password changed?
cat .env.example | grep ADMIN_TOKEN
```

---

## 🌐 Step 7: Deploy to Server

### Option A: With Git (recommended)

Locally:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo>
git push -u origin main
```

On server:
```bash
ssh user@your-server.com
cd /var/www
git clone <your-repo> stellplatz
cd stellplatz
npm install
npm run init-db
```

### Option B: With SFTP
```bash
# Upload all files with FileZilla or:
scp -r stellplatz-booking/* user@server.com:/var/www/stellplatz/

# Then on server:
ssh user@server.com
cd /var/www/stellplatz
npm install && npm run init-db
```

### With PM2 as Service
```bash
# On the server:
npm install -g pm2
pm2 start server.js --name "stellplatz"
pm2 startup
pm2 save
```

---

## 💡 Tips for Successful Claude Code Sessions

1. **Be precise:** "Build XYZ according to SPEC.md" is better than "Make me a website"

2. **Reference the spec:** "According to SPEC.md, section 'API Specification', endpoint GET /api/locations..."

3. **Give context:** "I have this error: [ERROR]. Code looks like: [CODE]"

4. **One Thing at a Time:** Better 5 small prompts than 1 huge prompt

5. **Test after each step:** `npm start` and check in browser

6. **Document problems:** So Claude can help you better

---

## 🆘 SOS - When Something Goes Wrong

### Server won't start
```bash
claude-code "The server gives this error: [ERROR].
server.js looks like: [CODE-SNIPPET].
Fix the problem."
```

### Frontend doesn't work
```bash
claude-code "booking.html doesn't load correctly.
Error in browser console: [ERROR].
Check and fix the file."
```

### Database problem
```bash
claude-code "I'm getting SQLite error: [ERROR].
Check database.js and fix the problem.
Delete stellplatz.db so it can be recreated."
```

---

## ✅ Checklist

- [ ] Node.js installed
- [ ] Claude Code installed (`npm install -g @anthropic-ai/claude-code`)
- [ ] Project directory created
- [ ] CLAUDE-CODE-SPEC.md copied
- [ ] Claude Code built backend
- [ ] Claude Code built frontend
- [ ] Tested locally
- [ ] Admin token changed
- [ ] Deployed to server
- [ ] Customer links prepared

---

## 🎉 After That

Once everything is running on the server:

1. **Add locations** (via SQLite or admin panel)
2. **Open admin panel:** `https://domain.com/admin.html`
3. **Generate booking links:**
   - In admin panel → "Manage Locations"
   - Click "🔗 Copy Link" for desired location
   - Link is automatically copied to clipboard
4. **Send links to customers** (via email, WhatsApp, etc.)
5. **Sign contracts & profit!**

### 🔗 Location-Locked Booking Links

The system supports location-specific booking links:

**Format:** `https://domain.com/booking.html?location=1`

**Benefits:**
- Location is preselected and locked
- Customer cannot change location
- Prevents confusion
- Simpler booking process

**Workflow:**
1. Admin copies link for location X
2. Admin sends link to customer
3. Customer opens link → location is already selected
4. Customer only fills in personal data
5. Customer signs → booking goes directly to admin

---

**Happy Building! 🚀**

Questions? Ask Claude Code!
