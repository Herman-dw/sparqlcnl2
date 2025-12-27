# CompetentNL Knowledge Graph - Verkenningsqueries

Deze queries kun je lokaal uitvoeren tegen het CompetentNL SPARQL endpoint om de volledige structuur van de knowledge graph te ontdekken.

## Prefixes (gebruik bij alle queries)

```sparql
PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dct: <http://purl.org/dc/terms/>
```

---

## DEEL 1: STRUCTUUR ONTDEKKING

### 1.1 Alle Named Graphs
```sparql
SELECT DISTINCT ?graph (COUNT(*) as ?tripleCount)
WHERE { 
  GRAPH ?graph { ?s ?p ?o } 
}
GROUP BY ?graph
ORDER BY DESC(?tripleCount)
```

### 1.2 Alle Classes (rdf:type) per graph
```sparql
SELECT ?graph ?class (COUNT(?s) as ?instances)
WHERE { 
  GRAPH ?graph {
    ?s rdf:type ?class .
  }
}
GROUP BY ?graph ?class
ORDER BY ?graph DESC(?instances)
```

### 1.3 Alle Predicaten in CompetentNL namespace
```sparql
SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
WHERE { 
  ?s ?predicate ?o .
  FILTER(STRSTARTS(STR(?predicate), "https://linkeddata.competentnl.nl/def/competentnl"))
}
GROUP BY ?predicate
ORDER BY DESC(?usage)
```

### 1.4 Alle Predicaten in UWV namespace
```sparql
SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
WHERE { 
  ?s ?predicate ?o .
  FILTER(STRSTARTS(STR(?predicate), "https://linkeddata.competentnl.nl/def/uwv-ontology"))
}
GROUP BY ?predicate
ORDER BY DESC(?usage)
```

### 1.5 Alle gebruikte SKOS predicaten
```sparql
SELECT DISTINCT ?predicate (COUNT(*) as ?usage)
WHERE { 
  ?s ?predicate ?o .
  FILTER(STRSTARTS(STR(?predicate), "http://www.w3.org/2004/02/skos/core"))
}
GROUP BY ?predicate
ORDER BY DESC(?usage)
```

---

## DEEL 2: BEROEPEN (OCCUPATIONS)

### 2.1 Aantal beroepen per type/status
```sparql
SELECT ?contentStatus (COUNT(?occupation) as ?count)
WHERE { 
  ?occupation a cnlo:Occupation .
  OPTIONAL { ?occupation cnluwvo:hasContentStatus ?contentStatus }
}
GROUP BY ?contentStatus
ORDER BY DESC(?count)
```

### 2.2 Sample beroepen met alle eigenschappen
```sparql
SELECT ?occupation ?predicate ?object
WHERE { 
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  ?occupation ?predicate ?object .
  FILTER(LANG(?label) = "nl")
}
LIMIT 200
```

### 2.3 Eén specifiek beroep volledig uitgewerkt
```sparql
SELECT ?predicate ?object
WHERE { 
  ?occ a cnlo:Occupation ;
       skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(?label), "loodgieter"))
  ?occ ?predicate ?object .
}
```

### 2.4 Beroepen hiërarchie (kernberoepen, referentieberoepen, verbijzonderingen)
```sparql
SELECT ?occupation ?label ?type ?broader ?broaderLabel
WHERE { 
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?label .
  OPTIONAL { ?occupation skos:broader ?broader . ?broader skos:prefLabel ?broaderLabel }
  OPTIONAL { ?occupation rdf:type ?type . FILTER(?type != cnlo:Occupation) }
  FILTER(LANG(?label) = "nl")
}
LIMIT 100
```

### 2.5 Beroepen met synoniemen (altLabel)
```sparql
SELECT ?occupation ?prefLabel ?altLabel
WHERE { 
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?prefLabel ;
              skos:altLabel ?altLabel .
  FILTER(LANG(?prefLabel) = "nl")
}
LIMIT 50
```

---

## DEEL 3: VAARDIGHEDEN (HUMANCAPABILITIES/SKILLS)

### 3.1 Telling vaardigheden per niveau
```sparql
SELECT ?level (COUNT(?skill) as ?count)
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:notation ?notation .
  BIND(STRLEN(?notation) - STRLEN(REPLACE(?notation, ".", "")) + 1 AS ?level)
}
GROUP BY ?level
ORDER BY ?level
```

### 3.2 Vaardigheden taxonomie structuur
```sparql
SELECT ?skill ?label ?notation ?broader ?broaderLabel ?broaderNotation
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label ;
         skos:notation ?notation .
  OPTIONAL { 
    ?skill skos:broader ?broader . 
    ?broader skos:prefLabel ?broaderLabel ;
             skos:notation ?broaderNotation .
    FILTER(LANG(?broaderLabel) = "nl")
  }
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 150
```

### 3.3 Vaardigheid met alle eigenschappen
```sparql
SELECT ?predicate ?object
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel "Samenwerken"@nl .
  ?skill ?predicate ?object .
}
```

### 3.4 RIASEC mapping
```sparql
SELECT ?skill ?label ?riasec
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label ;
         cnlo:hasRIASEC ?riasec .
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?riasec
LIMIT 150
```

### 3.5 ESCO mappings
```sparql
SELECT ?skill ?label ?matchType ?escoUri
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  VALUES ?matchType { cnlo:closeMatchESCO cnlo:broadMatchESCO cnlo:exactMatchESCO cnlo:narrowMatchESCO }
  ?skill ?matchType ?escoUri .
  FILTER(LANG(?label) = "nl")
}
LIMIT 100
```

### 3.6 O*NET mappings
```sparql
SELECT ?skill ?label ?onetCode
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label ;
         cnlo:closeMatchONET ?onetCode .
  FILTER(LANG(?label) = "nl")
}
LIMIT 100
```

---

## DEEL 4: KENNISGEBIEDEN (KNOWLEDGE AREAS)

### 4.1 Kennisgebieden structuur
```sparql
SELECT ?area ?label ?notation ?broader ?broaderLabel
WHERE { 
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
  OPTIONAL { 
    ?area skos:broader ?broader . 
    ?broader skos:prefLabel ?broaderLabel .
    FILTER(LANG(?broaderLabel) = "nl")
  }
  FILTER(LANG(?label) = "nl")
}
ORDER BY ?notation
LIMIT 400
```

### 4.2 Kennisgebied met ISCED-F mapping
```sparql
SELECT ?area ?label ?notation ?isced
WHERE { 
  ?area a cnlo:KnowledgeArea ;
        skos:prefLabel ?label .
  OPTIONAL { ?area skos:notation ?notation }
  OPTIONAL { ?area skos:broadMatch ?isced . FILTER(CONTAINS(STR(?isced), "isced")) }
  FILTER(LANG(?label) = "nl")
}
LIMIT 400
```

---

## DEEL 5: BEROEP-SKILL RELATIES

### 5.1 Alle requires-predicaten
```sparql
SELECT ?occupation ?occLabel ?requiresType ?skill ?skillLabel
WHERE { 
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  VALUES ?requiresType { 
    cnlo:requiresHATEssential 
    cnlo:requiresHATImportant 
    cnlo:requiresHATSomewhat 
  }
  ?occupation ?requiresType ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?occLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 200
```

### 5.2 Skills per beroep met importance
```sparql
SELECT ?occLabel 
       (COUNT(DISTINCT ?essential) as ?essentialCount)
       (COUNT(DISTINCT ?important) as ?importantCount)
       (COUNT(DISTINCT ?somewhat) as ?somewhatCount)
WHERE { 
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  OPTIONAL { ?occupation cnlo:requiresHATEssential ?essential }
  OPTIONAL { ?occupation cnlo:requiresHATImportant ?important }
  OPTIONAL { ?occupation cnlo:requiresHATSomewhat ?somewhat }
  FILTER(LANG(?occLabel) = "nl")
}
GROUP BY ?occLabel
HAVING (COUNT(DISTINCT ?essential) > 0 || COUNT(DISTINCT ?important) > 0)
LIMIT 50
```

---

## DEEL 6: TAKEN

### 6.1 Zoek naar taken (probeer verschillende class names)
```sparql
SELECT DISTINCT ?type (COUNT(?task) as ?count)
WHERE { 
  ?task ?p ?o .
  ?task rdf:type ?type .
  FILTER(CONTAINS(LCASE(STR(?type)), "task") || CONTAINS(LCASE(STR(?type)), "taak"))
}
GROUP BY ?type
```

### 6.2 Taken structuur in UWV graph
```sparql
SELECT ?task ?label ?occupation ?occLabel
FROM <https://linkeddata.competentnl.nl/graph/cnluwv4cnl>
WHERE { 
  ?task a cnluwvo:Task ;
        skos:prefLabel ?label .
  OPTIONAL { 
    ?occupation cnluwvo:hasTask ?task ;
                skos:prefLabel ?occLabel .
  }
  FILTER(LANG(?label) = "nl")
}
LIMIT 50
```

---

## DEEL 7: OPLEIDINGSNORMEN

### 7.1 Opleidingsnormen overzicht
```sparql
SELECT ?norm ?label ?notation
WHERE { 
  ?norm a cnlo:EducationalNorm ;
        skos:prefLabel ?label .
  OPTIONAL { ?norm skos:notation ?notation }
  FILTER(LANG(?label) = "nl")
}
LIMIT 100
```

### 7.2 Opleidingsnorm met voorgeschreven skills
```sparql
SELECT ?norm ?normLabel ?prescribesType ?skill ?skillLabel
WHERE { 
  ?norm a cnlo:EducationalNorm ;
        skos:prefLabel ?normLabel .
  VALUES ?prescribesType { 
    cnlo:prescribesHATEssential 
    cnlo:prescribesHATImportant 
    cnlo:prescribesHATSomewhat 
  }
  ?norm ?prescribesType ?skill .
  ?skill skos:prefLabel ?skillLabel .
  FILTER(LANG(?normLabel) = "nl")
  FILTER(LANG(?skillLabel) = "nl")
}
LIMIT 100
```

---

## DEEL 8: WERKOMSTANDIGHEDEN

### 8.1 Zoek werkomstandigheden
```sparql
SELECT DISTINCT ?type (COUNT(*) as ?count)
WHERE { 
  ?s rdf:type ?type .
  FILTER(
    CONTAINS(LCASE(STR(?type)), "werk") || 
    CONTAINS(LCASE(STR(?type)), "condition") ||
    CONTAINS(LCASE(STR(?type)), "omstand")
  )
}
GROUP BY ?type
```

### 8.2 Werkomstandigheden per beroep
```sparql
SELECT ?occupation ?occLabel ?condition ?conditionLabel
WHERE { 
  ?occupation a cnlo:Occupation ;
              skos:prefLabel ?occLabel .
  ?occupation cnluwvo:hasWorkCondition ?condition .
  ?condition skos:prefLabel ?conditionLabel .
  FILTER(LANG(?occLabel) = "nl")
}
LIMIT 50
```

---

## DEEL 9: URI PATRONEN ONTDEKKEN

### 9.1 URI patronen per class
```sparql
SELECT ?class (SAMPLE(?uri) as ?exampleUri)
WHERE { 
  ?uri rdf:type ?class .
}
GROUP BY ?class
LIMIT 30
```

### 9.2 ID structuur analyse
```sparql
SELECT ?type ?uriPattern (COUNT(*) as ?count)
WHERE { 
  ?s rdf:type ?type .
  BIND(REPLACE(STR(?s), "/[^/]+$", "/...") AS ?uriPattern)
}
GROUP BY ?type ?uriPattern
ORDER BY ?type
LIMIT 50
```

---

## DEEL 10: DATAKWALITEIT CHECKS

### 10.1 Concepten zonder label
```sparql
SELECT ?concept ?type
WHERE { 
  ?concept rdf:type ?type .
  FILTER NOT EXISTS { ?concept skos:prefLabel ?label }
  FILTER(STRSTARTS(STR(?concept), "https://linkeddata.competentnl.nl"))
}
LIMIT 20
```

### 10.2 Orphan skills (niet gekoppeld aan beroep of opleiding)
```sparql
SELECT ?skill ?label
WHERE { 
  ?skill a cnlo:HumanCapability ;
         skos:prefLabel ?label .
  FILTER NOT EXISTS { 
    ?x cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?skill 
  }
  FILTER NOT EXISTS { 
    ?y cnlo:prescribesHATEssential|cnlo:prescribesHATImportant|cnlo:prescribesHATSomewhat ?skill 
  }
  FILTER(LANG(?label) = "nl")
}
LIMIT 50
```

---

## Hoe te gebruiken

1. Start je lokale backend: `node server.js`
2. Kopieer een query naar je SPARQL interface
3. Voeg de prefixes toe aan elke query
4. Noteer de resultaten

Stuur mij de resultaten van deze queries en ik kan een volledig schema maken voor je AI agent!
