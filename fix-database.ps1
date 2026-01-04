# ============================================================
# CompetentNL: Fix Voorbeeldvragen Database
# ============================================================
# Dit script:
# 1. Voegt de 'domain' kolom toe (indien nodig)
# 2. Leegt bestaande voorbeelden
# 3. Voegt 10 werkende voorbeeldvragen toe
#
# Gebruik: Rechtsklik -> "Uitvoeren met PowerShell"
#          Of in PowerShell: .\fix-database.ps1
# ============================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CompetentNL Database Fix Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Configuratie - PAS DIT AAN INDIEN NODIG
$mysqlPath = "C:\Program Files\MariaDB 11.8\bin\mysql.exe"  # Pad naar mysql.exe
$dbHost = "localhost"
$dbUser = "root"
$dbPassword = ""  # Leeg bij standaard XAMPP
$dbName = "competentnl_rag"

# Controleer of mysql.exe bestaat
if (-not (Test-Path $mysqlPath)) {
    Write-Host "FOUT: mysql.exe niet gevonden op: $mysqlPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Probeer een van deze locaties:" -ForegroundColor Yellow
    Write-Host "  - C:\xampp\mysql\bin\mysql.exe (XAMPP)"
    Write-Host "  - C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe (WAMP)"
    Write-Host "  - C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
    Write-Host ""
    Write-Host "Pas de `$mysqlPath variabele aan in dit script." -ForegroundColor Yellow
    Read-Host "Druk op Enter om af te sluiten"
    exit 1
}

Write-Host "[OK] MySQL gevonden: $mysqlPath" -ForegroundColor Green

# SQL commando's
$sqlCommands = @"
USE competentnl_rag;

-- Voeg 'domain' kolom toe als die niet bestaat
SET @dbname = 'competentnl_rag';
SET @tablename = 'question_embeddings';
SET @columnname = 'domain';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE question_embeddings ADD COLUMN domain VARCHAR(50) DEFAULT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Leeg bestaande voorbeelden
DELETE FROM question_embeddings;

-- Voeg werkende voorbeeldvragen toe
INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Welke vaardigheden heeft een loodgieter?', 
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?skillLabel ?importance WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = \"nl\")
  FILTER(CONTAINS(LCASE(?occLabel), \"loodgieter\") || CONTAINS(LCASE(?occLabel), \"installatiemonteur\"))
  
  {
    ?occupation cnlo:requiresHATEssential ?skill .
    BIND(\"essentieel\" AS ?importance)
  } UNION {
    ?occupation cnlo:requiresHATImportant ?skill .
    BIND(\"belangrijk\" AS ?importance)
  }
  
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = \"nl\")
}
ORDER BY ?importance ?skillLabel
LIMIT 50', 
'skill', 
'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Hoeveel beroepen zijn er in de database?', 
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT (COUNT(DISTINCT ?occupation) AS ?aantalBeroepen) WHERE {
  ?occupation a cnlo:Occupation .
}
LIMIT 1',
'count',
'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 20 beroepen die met software beginnen',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?occupation ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = \"nl\")
  FILTER(STRSTARTS(LCASE(?label), \"software\"))
}
ORDER BY ?label
LIMIT 20',
'occupation',
'occupation');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 30 MBO kwalificaties',
'PREFIX ksmo: <https://data.s-bb.nl/ksm/ont/ksmo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?naam WHERE {
  ?kwalificatie a ksmo:MboKwalificatie ;
                skos:prefLabel ?naam .
  FILTER(LANG(?naam) = \"nl\")
}
ORDER BY ?naam
LIMIT 30',
'education',
'education');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Welke vaardigheden hebben RIASEC code R?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC \"R\" ;
         skos:prefLabel ?skillLabel .
  FILTER(LANG(?skillLabel) = \"nl\")
}
ORDER BY ?skillLabel
LIMIT 50',
'skill',
'skill');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Hoeveel vaardigheden zijn er per RIASEC letter?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>

SELECT ?riasec (COUNT(?skill) AS ?aantal) WHERE {
  ?skill a cnlo:HumanCapability ;
         cnlo:hasRIASEC ?riasec .
}
GROUP BY ?riasec
ORDER BY ?riasec
LIMIT 10',
'count',
'skill');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon alle 137 vaardigheden in de taxonomie',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?label WHERE {
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  FILTER(LANG(?label) = \"nl\")
}
ORDER BY ?label
LIMIT 150',
'skill',
'skill');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Toon 30 kennisgebieden',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?area ?label WHERE {
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  FILTER(LANG(?label) = \"nl\")
}
ORDER BY ?label
LIMIT 30',
'knowledge',
'knowledge');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Welke taken heeft een timmerman?',
'PREFIX cnluwvo: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taskLabel WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  FILTER(LANG(?occLabel) = \"nl\")
  FILTER(CONTAINS(LCASE(?occLabel), \"timmerman\"))
  
  ?occupation cnluwvo:isCharacterizedByOccupationTask_Essential ?task .
  ?task skos:prefLabel ?taskLabel .
  FILTER(LANG(?taskLabel) = \"nl\")
}
ORDER BY ?taskLabel
LIMIT 30',
'task',
'task');

INSERT INTO question_embeddings (question, sparql_query, category, domain) VALUES
('Wat zijn de meest voorkomende beroepen?',
'PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label WHERE {
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  FILTER(LANG(?label) = \"nl\")
}
ORDER BY ?label
LIMIT 25',
'occupation',
'occupation');

-- Toon resultaat
SELECT COUNT(*) as totaal FROM question_embeddings;
"@

# Schrijf SQL naar tijdelijk bestand
$tempFile = "$env:TEMP\competentnl_fix.sql"
$sqlCommands | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "[..] Database wordt bijgewerkt..." -ForegroundColor Yellow

try {
    # Voer SQL uit
    if ($dbPassword -eq "") {
        $result = & $mysqlPath -h $dbHost -u $dbUser $dbName -e "source $tempFile" 2>&1
    } else {
        $result = & $mysqlPath -h $dbHost -u $dbUser -p"$dbPassword" $dbName -e "source $tempFile" 2>&1
    }
    
    # Controleer op fouten
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FOUT bij uitvoeren SQL:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Remove-Item $tempFile -ErrorAction SilentlyContinue
        Read-Host "Druk op Enter om af te sluiten"
        exit 1
    }
    
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  DATABASE SUCCESVOL BIJGEWERKT!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Er zijn nu 10 voorbeeldvragen toegevoegd." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Test het door deze URL te openen in je browser:" -ForegroundColor Yellow
    Write-Host "  http://localhost:3001/api/example-questions" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "FOUT: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Controleer of:" -ForegroundColor Yellow
    Write-Host "  1. MySQL/MariaDB draait (XAMPP Control Panel)"
    Write-Host "  2. De database 'competentnl_rag' bestaat"
    Write-Host "  3. Het pad naar mysql.exe correct is"
}

# Ruim tijdelijk bestand op
Remove-Item $tempFile -ErrorAction SilentlyContinue

Write-Host ""
Read-Host "Druk op Enter om af te sluiten"
