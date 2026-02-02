# Development Workflow

Dit document beschrijft de development workflow voor dit project.

## Git Workflow

### Feature Branch Workflow

1. **Maak een nieuwe feature branch** (of werk op een bestaande Claude branch)
   ```powershell
   git checkout -b mijn-feature-branch
   ```

2. **Werk aan je feature en commit changes**
   ```powershell
   git add .
   git commit -m "Beschrijving van wijzigingen"
   git push origin mijn-feature-branch
   ```

3. **Merge naar main met het merge script**
   ```powershell
   .\merge-to-main.ps1
   ```

   Of met automatisch verwijderen van de branch:
   ```powershell
   .\merge-to-main.ps1 -DeleteBranch
   ```

### Het merge-to-main.ps1 Script

Het `merge-to-main.ps1` script automatiseert het volledige merge proces:

**Wat het doet:**
- ✅ Pull laatste wijzigingen van je feature branch
- ✅ Switch naar main en pull
- ✅ Merge feature branch naar main (no-fast-forward)
- ✅ Push naar origin/main
- ✅ Optioneel: verwijder de feature branch (lokaal + remote)
- ✅ Toon laatste commits op main

**Gebruik:**

```powershell
# Basis gebruik (branch blijft bestaan)
.\merge-to-main.ps1

# Met branch verwijderen
.\merge-to-main.ps1 -DeleteBranch
```

**Veiligheid:**
- Het script vraagt altijd om bevestiging voordat het merget
- Bij fouten stopt het script en geeft foutmeldingen
- Je kunt veilig op main zitten - het script controleert dit en geeft een error

### Alternatieve Workflow (Handmatig)

Als je het handmatig wilt doen zonder script:

```powershell
# Pull latest van feature branch
git pull origin mijn-feature-branch

# Switch naar main
git checkout main
git pull origin main

# Merge feature branch
git merge mijn-feature-branch --no-ff -m "Merge branch 'mijn-feature-branch'"

# Push naar main
git push origin main

# Optioneel: verwijder branch
git branch -d mijn-feature-branch
git push origin --delete mijn-feature-branch
```

## TypeScript / Node.js

Dit project gebruikt Node.js native TypeScript support (strip-only mode).

### Belangrijke Import Regels

1. **Interfaces en Types: gebruik `import type`**
   ```typescript
   // ✅ Correct
   import type { MyInterface, MyType } from './types.ts';

   // ❌ Fout (veroorzaakt runtime errors)
   import { MyInterface, MyType } from './types.ts';
   ```

2. **Classes en Runtime Code: gebruik normale imports**
   ```typescript
   // ✅ Correct
   import { MyClass, myFunction } from './utils.ts';
   ```

3. **CommonJS modules (Express, mysql2): gebruik default import**
   ```typescript
   // ✅ Correct
   import express from 'express';
   import type { Request, Response } from 'express';

   import mysql from 'mysql2/promise';
   type Pool = mysql.Pool;

   // ❌ Fout
   import { Router, Request, Response } from 'express';
   import { Pool } from 'mysql2/promise';
   ```

4. **Gebruik altijd .ts extensies in imports**
   ```typescript
   // ✅ Correct
   import { myFunction } from './utils/helper.ts';

   // ❌ Fout
   import { myFunction } from './utils/helper.js';
   import { myFunction } from './utils/helper';
   ```

### Backend Starten

```powershell
npm run start-backend
```

## Database Setup

Dit project gebruikt twee databases:
- `competentnl_rag` - Voor CV processing en RAG data
- `competentnl_prompts` - Voor prompts en logging

Zie `README.md` voor volledige database setup instructies.

## Common Issues

### Import Errors

**Error:** `The requested module does not provide an export named 'X'`
**Oplossing:** Check of je `import type` gebruikt voor interfaces/types

**Error:** `Named export 'X' not found`
**Oplossing:** Gebruik default import voor CommonJS modules (Express, mysql2)

### Git Branch Protection

De main branch heeft bescherming tegen directe pushes van Claude.
Alle wijzigingen moeten via feature branches met namen die beginnen met `claude/` en eindigen met een session ID.

**Voorbeeld geldige branch namen:**
- `claude/add-feature-abc123`
- `claude/fix-bug-xyz789`

### PowerShell Script Errors

Als `.\merge-to-main.ps1` niet werkt:
1. Check of je de laatste versie hebt: `git pull origin main`
2. Check PowerShell execution policy: `Get-ExecutionPolicy`
3. Als restricted, voer uit: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## Testing

### CV Upload Testing

Er is een test HTML pagina beschikbaar:
```
test-cv-upload.html
```

Open deze in een browser om CV upload functionaliteit te testen zonder backend afhankelijkheden.

## Meer Informatie

- **Setup Instructies:** Zie `README.md`
- **CV Processing Setup:** Zie `SETUP_CV_PROCESSING.md`
- **Database Schema:** Zie `database/` directory
