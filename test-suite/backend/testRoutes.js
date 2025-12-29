/**
 * CompetentNL Test Routes - v2.0.0
 * =================================
 * 
 * Backend routes die alle test scenarios ondersteunen.
 * Voeg deze toe aan je server.js na de bestaande routes.
 * 
 * Test Scenarios:
 * 1. Disambiguatie: Architect → Moet meerdere matches vinden
 * 2. Domein-detectie: MBO kwalificaties → education domein
 * 3. Aantallen: >49 resultaten → COUNT query
 * 4. Vervolgvraag: Context behouden
 * 5. Concept Resolver: Loodgieter → officiële naam
 * 6. Opleiding: Skills & Knowledge → prescribes predicaat
 * 7. RIASEC Hollandcode → hasRIASEC predicaat
 */

// =====================================================
// TEST ENDPOINTS
// =====================================================

/**
 * Generate SPARQL for testing
 * Simuleert de Gemini AI response voor test doeleinden
 */
app.post('/test/generate-sparql', async (req, res) => {
  const { question, chatHistory, domain, resolvedConcepts } = req.body;

  try {
    const result = generateTestSparql(question, chatHistory, domain, resolvedConcepts);
    
    // Log voor debugging
    console.log(`[Test] Generate SPARQL for: "${question.substring(0, 50)}..."`);
    console.log(`[Test] Domain: ${result.domain}, Count: ${result.needsCount}`);
    
    res.json(result);
  } catch (error) {
    console.error('[Test] Generate SPARQL error:', error);
    res.status(500).json({ error: 'SPARQL generatie mislukt', details: error.message });
  }
});

/**
 * Run complete test scenario
 */
app.post('/test/run-scenario', async (req, res) => {
  const { scenarioId, question, previousContext } = req.body;

  try {
    const result = {
      scenarioId,
      timestamp: new Date().toISOString(),
      steps: []
    };

    // Step 1: Classification
    const classification = await classifyQuestionForTest(question);
    result.classification = classification;
    result.steps.push({
      step: 'classify',
      success: true,
      data: classification
    });

    // Step 2: Concept resolution
    const conceptResult = await resolveConceptsForTest(question);
    result.conceptResult = conceptResult;
    result.steps.push({
      step: 'concept_resolve',
      success: true,
      data: conceptResult
    });

    // Step 3: SPARQL generation
    const sparqlResult = generateTestSparql(
      question,
      previousContext ? [{ role: 'user', content: previousContext }] : [],
      classification?.primary?.domainKey,
      conceptResult?.resolvedConcepts || {}
    );
    result.sparqlResult = sparqlResult;
    result.steps.push({
      step: 'generate_sparql',
      success: true,
      data: sparqlResult
    });

    res.json(result);
  } catch (error) {
    console.error('[Test] Run scenario error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Validate SPARQL syntax
 */
app.post('/test/validate-sparql', async (req, res) => {
  const { sparql } = req.body;

  try {
    const validation = validateSparqlSyntax(sparql);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ error: 'Validatie mislukt' });
  }
});

/**
 * Health check with detailed status
 */
app.get('/test/health', async (req, res) => {
  const status = {
    server: 'ok',
    timestamp: new Date().toISOString(),
    databases: {
      rag: 'unknown',
      prompts: 'unknown'
    },
    services: {
      orchestrator: 'unknown',
      conceptResolver: 'unknown',
      testEndpoints: 'ok'
    },
    testScenarios: {
      disambiguation: 'ready',
      domainDetection: 'ready',
      countHandling: 'ready',
      followUp: 'ready',
      conceptResolution: 'ready',
      educationSkills: 'ready',
      riasec: 'ready'
    }
  };

  // Check RAG database
  try {
    if (ragPool) {
      await ragPool.execute('SELECT 1');
      status.databases.rag = 'ok';
      status.services.conceptResolver = 'ok';
    }
  } catch (error) {
    status.databases.rag = 'error: ' + error.message;
  }

  // Check Prompts database
  try {
    if (promptsPool) {
      await promptsPool.execute('SELECT 1');
      status.databases.prompts = 'ok';
      status.services.orchestrator = 'ok';
    }
  } catch (error) {
    status.databases.prompts = 'error: ' + error.message;
  }

  res.json(status);
});

/**
 * Get test statistics
 */
app.get('/test/stats', async (req, res) => {
  try {
    const stats = {
      database: {
        occupations: 0,
        skills: 0,
        educations: 0,
        mboKwalificaties: 447,  // Bekend uit schema
        mboKeuzedelen: 1292,
        riasecMappings: 6
      },
      orchestrator: {
        domains: 0,
        keywords: 0,
        examples: 0
      },
      lastUpdated: new Date().toISOString()
    };

    // Get concept counts from RAG database
    if (ragPool) {
      try {
        const [occRows] = await ragPool.execute(
          'SELECT COUNT(DISTINCT occupation_uri) as count FROM occupation_labels'
        );
        stats.database.occupations = occRows[0]?.count || 0;
      } catch (e) { /* ignore */ }
    }

    // Get orchestrator stats
    if (promptsPool) {
      try {
        const [domRows] = await promptsPool.execute(
          'SELECT COUNT(*) as count FROM prompt_domains WHERE is_active = TRUE'
        );
        stats.orchestrator.domains = domRows[0]?.count || 0;

        const [kwRows] = await promptsPool.execute(
          'SELECT COUNT(*) as count FROM classification_keywords'
        );
        stats.orchestrator.keywords = kwRows[0]?.count || 0;
      } catch (e) { /* ignore */ }
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Stats ophalen mislukt' });
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate test SPARQL based on question analysis
 */
function generateTestSparql(question, chatHistory = [], domain, resolvedConcepts = {}) {
  const q = question.toLowerCase();
  let sparql = '';
  let response = '';
  let needsCount = false;
  let needsList = false;
  let listSparql = null;
  let detectedDomain = domain;

  // SCENARIO 1 & 1a: Disambiguatie (architect)
  // Dit wordt afgehandeld door /concept/resolve, niet hier

  // SCENARIO 2 & 2a: MBO Kwalificaties (education domein + count)
  if (q.includes('mbo') && (q.includes('kwalificatie') || q.includes('toon alle'))) {
    detectedDomain = 'education';
    needsCount = true;
    listSparql = `PREFIX ksmo: <https://linkeddata.competentnl.nl/sbb/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?kwalificatie ?label WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
  ?kwalificatie skos:prefLabel ?label .
}
ORDER BY ?label
LIMIT 50`;
    needsList = true;
    sparql = `PREFIX ksmo: <https://linkeddata.competentnl.nl/sbb/def/>

SELECT (COUNT(DISTINCT ?kwalificatie) as ?aantal) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`;
    response = 'Er zijn 447 MBO kwalificaties gevonden. Wil je de eerste 50 zien?';
  }

  // SCENARIO 3: Vervolgvraag "Hoeveel zijn er?"
  else if (q.includes('hoeveel') && (q.includes('zijn er') || q.includes('er'))) {
    // Check chat history voor context
    const lastQuestion = chatHistory?.[chatHistory.length - 1]?.content?.toLowerCase() || '';
    
    if (lastQuestion.includes('mbo') || lastQuestion.includes('kwalificatie')) {
      detectedDomain = 'education';
      sparql = `PREFIX ksmo: <https://linkeddata.competentnl.nl/sbb/def/>

SELECT (COUNT(?kwalificatie) as ?count) WHERE {
  ?kwalificatie a ksmo:MboKwalificatie .
}`;
      response = 'Er zijn 447 MBO kwalificaties in de database.';
    } else {
      sparql = `SELECT (COUNT(?item) as ?count) WHERE {
  ?item a ?type .
}`;
      response = 'Gebaseerd op de context: er zijn [aantal] items gevonden.';
    }
  }

  // SCENARIO 4: Concept resolution (vaardigheden van loodgieter)
  else if ((q.includes('vaardigheid') || q.includes('skill')) && 
           (q.includes('van') || q.includes('heeft') || q.includes('nodig'))) {
    detectedDomain = 'skill';
    const occupation = Object.values(resolvedConcepts)[0] || 
                       extractOccupationFromQuestion(question) ||
                       'Onbekend beroep';
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?occupation skos:prefLabel "${occupation}"@nl .
  ?occupation cnlo:requiresHATEssential ?skill .
  ?skill skos:prefLabel ?skillLabel .
}
ORDER BY ?skillLabel`;
    response = `De essentiële vaardigheden voor ${occupation} zijn:`;
  }

  // SCENARIO 5: Opleiding vaardigheden en kennisgebieden
  else if ((q.includes('opleiding') || q.includes('leer')) && 
           (q.includes('vaardig') || q.includes('kennis') || q.includes('wat'))) {
    detectedDomain = 'education';
    const eduName = extractEducationName(question);
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?edu ?eduLabel ?skill ?skillLabel ?knowledge ?knowledgeLabel WHERE {
  ?edu a cnlo:EducationalNorm .
  ?edu skos:prefLabel ?eduLabel .
  FILTER(CONTAINS(LCASE(?eduLabel), "${eduName.toLowerCase()}"))
  
  OPTIONAL {
    ?edu cnlo:prescribesHATEssential ?skill .
    ?skill skos:prefLabel ?skillLabel .
  }
  OPTIONAL {
    ?edu cnlo:prescribesKnowledgeEssential ?knowledge .
    ?knowledge skos:prefLabel ?knowledgeLabel .
  }
}
LIMIT 100`;
    response = `Bij de opleiding "${eduName}" leer je de volgende vaardigheden en kennisgebieden:`;
  }

  // SCENARIO 6: RIASEC / Hollandcode
  else if (q.includes('riasec') || q.includes('hollandcode') || 
           (q.includes('holland') && q.includes('code'))) {
    detectedDomain = 'taxonomy';
    // Extract the letter (R, I, A, S, E, C)
    const letterMatch = q.match(/\b([riasec])\b/i) || 
                        q.match(/letter\s+['"]?([riasec])['"]?/i) ||
                        q.match(/(['"]?)([riasec])\1/i);
    const letter = letterMatch ? letterMatch[1].toUpperCase() || letterMatch[2]?.toUpperCase() : 'R';
    
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?skill ?skillLabel WHERE {
  ?skill cnlo:hasRIASEC "${letter}" .
  ?skill skos:prefLabel ?skillLabel .
  ?skill a cnlo:HumanCapability .
}
ORDER BY ?skillLabel`;
    
    const riasecNames = {
      'R': 'Realistic (Praktisch)',
      'I': 'Investigative (Onderzoekend)',
      'A': 'Artistic (Artistiek)',
      'S': 'Social (Sociaal)',
      'E': 'Enterprising (Ondernemend)',
      'C': 'Conventional (Conventioneel)'
    };
    response = `Vaardigheden met RIASEC code "${letter}" - ${riasecNames[letter] || letter}:`;
  }

  // SCENARIO 7: Relatie aantallen (aggregatie)
  else if ((q.includes('relatie') || q.includes('type')) && 
           (q.includes('aantal') || q.includes('hoeveel'))) {
    detectedDomain = 'comparison';
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>

SELECT ?relationType (COUNT(DISTINCT ?skill) as ?count) WHERE {
  VALUES ?relationType { 
    cnlo:requiresHATEssential 
    cnlo:requiresHATImportant 
    cnlo:requiresHATOptional 
  }
  ?occupation ?relationType ?skill .
}
GROUP BY ?relationType
ORDER BY DESC(?count)`;
    response = 'Aantallen vaardigheden per relatietype:';
  }

  // DEFAULT: Beroepen query
  else {
    detectedDomain = detectedDomain || 'occupation';
    sparql = `PREFIX cnlo: <https://linkeddata.competentnl.nl/def/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?occupation ?label WHERE {
  ?occupation a cnlo:Occupation .
  ?occupation skos:prefLabel ?label .
}
LIMIT 20`;
    response = 'Hier zijn enkele beroepen uit de database:';
  }

  return {
    sparql,
    response,
    needsCount,
    needsList,
    listSparql,
    domain: detectedDomain,
    contextUsed: chatHistory && chatHistory.length > 0
  };
}

/**
 * Extract occupation name from question
 */
function extractOccupationFromQuestion(question) {
  const patterns = [
    /(?:van\s+(?:een\s+)?|heeft\s+(?:een\s+)?|voor\s+(?:een\s+)?|bij\s+(?:een\s+)?)([a-zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+heeft|\s+vereist|\?|$)/i,
    /(?:beroep|als)\s+([a-zéëïöüáàâäèêîôûç\-]+)/i
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      const term = match[1].trim().toLowerCase();
      // Filter stop words
      if (!['een', 'het', 'de', 'alle', 'welke', 'wat'].includes(term)) {
        return term;
      }
    }
  }
  return null;
}

/**
 * Extract education name from question
 */
function extractEducationName(question) {
  const patterns = [
    /opleiding\s+(.+?)(?:\?|$)/i,
    /bij\s+de\s+opleiding\s+(.+?)(?:\?|$)/i,
    /kwalificatie\s+(.+?)(?:\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'onbekend';
}

/**
 * Classify question for testing
 */
async function classifyQuestionForTest(question) {
  const q = question.toLowerCase();
  
  // Quick keyword-based classification
  const domainKeywords = {
    education: ['opleiding', 'mbo', 'hbo', 'kwalificatie', 'diploma', 'studie', 'leer'],
    skill: ['vaardigheid', 'skill', 'competentie', 'kunnen', 'nodig'],
    knowledge: ['kennis', 'kennisgebied', 'weten'],
    task: ['taak', 'taken', 'werkzaamheid'],
    comparison: ['vergelijk', 'verschil', 'overeenkomst'],
    taxonomy: ['riasec', 'hollandcode', 'taxonomie', 'classificatie']
  };

  let bestMatch = { domainKey: 'occupation', confidence: 0.3, keywords: [] };
  
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    const matches = keywords.filter(kw => q.includes(kw));
    if (matches.length > 0) {
      const confidence = Math.min(matches.length * 0.4, 1.0);
      if (confidence > bestMatch.confidence) {
        bestMatch = { domainKey: domain, confidence, keywords: matches };
      }
    }
  }

  // Try database classification if available
  if (promptsPool) {
    try {
      const [keywords] = await promptsPool.execute(`
        SELECT ck.keyword_normalized, ck.weight, ck.is_exclusive,
               pd.domain_key, pd.domain_name
        FROM classification_keywords ck
        JOIN prompt_domains pd ON ck.domain_id = pd.id
        WHERE pd.is_active = TRUE
      `);

      const scores = new Map();
      
      for (const kw of keywords) {
        if (q.includes(kw.keyword_normalized)) {
          const current = scores.get(kw.domain_key) || { 
            score: 0, name: kw.domain_name, keywords: [] 
          };
          current.score += parseFloat(kw.weight);
          current.keywords.push(kw.keyword_normalized);
          scores.set(kw.domain_key, current);
        }
      }

      const sorted = Array.from(scores.entries())
        .sort((a, b) => b[1].score - a[1].score);

      if (sorted.length > 0 && sorted[0][1].score > bestMatch.confidence) {
        bestMatch = {
          domainKey: sorted[0][0],
          domainName: sorted[0][1].name,
          confidence: Math.min(sorted[0][1].score / 2, 1.0),
          keywords: sorted[0][1].keywords
        };
      }
    } catch (e) {
      // Use fallback
    }
  }

  console.log(`[Orchestrator] Domein: ${bestMatch.domainKey} (${Math.round(bestMatch.confidence * 100)}%)`);
  
  return {
    primary: bestMatch,
    secondary: null
  };
}

/**
 * Resolve concepts for testing
 */
async function resolveConceptsForTest(question) {
  const q = question.toLowerCase();
  
  // Known test cases for disambiguation
  const disambiguationCases = {
    'architect': [
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_BOUW', prefLabel: 'Architect (bouwkunde)', matchedLabel: 'architect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_SW', prefLabel: 'Software architect', matchedLabel: 'software architect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_INT', prefLabel: 'Interieurarchitect', matchedLabel: 'interieurarchitect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_LAND', prefLabel: 'Landschapsarchitect', matchedLabel: 'landschapsarchitect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_INFO', prefLabel: 'Informatiearchitect', matchedLabel: 'informatiearchitect' },
      { uri: 'https://linkeddata.competentnl.nl/uwv/id/occupation/ARCH_ENT', prefLabel: 'Enterprise architect', matchedLabel: 'enterprise architect' }
    ]
  };

  // Known resolutions (no disambiguation needed)
  const knownResolutions = {
    'loodgieter': 'Installatiemonteur sanitair',
    'huisarts': 'Huisarts',
    'kapper': 'Kapper',
    'programmeur': 'Softwareontwikkelaar',
    'dokter': 'Arts'
  };

  // Extract occupation term
  const occupationMatch = q.match(
    /(?:van\s+(?:een\s+)?|heeft\s+(?:een\s+)?|voor\s+(?:een\s+)?|bij\s+(?:een\s+)?)([a-zéëïöüáàâäèêîôûç\-]+?)(?:\s+nodig|\s+heeft|\s+vereist|\?|$)/i
  );

  if (!occupationMatch) {
    return { found: false, resolvedConcepts: {} };
  }

  const searchTerm = occupationMatch[1].trim().toLowerCase();
  console.log(`[Concept] Resolving occupation: "${searchTerm}"`);

  // Check for disambiguation case
  if (disambiguationCases[searchTerm]) {
    const matches = disambiguationCases[searchTerm];
    const disambiguationQuestion = `Ik vond meerdere beroepen die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n` +
      matches.map((m, i) => `${i + 1}. **${m.prefLabel}**`).join('\n') +
      '\n\nTyp het nummer of de naam van je keuze.';
    
    return {
      found: true,
      needsDisambiguation: true,
      searchTerm,
      matches,
      disambiguationQuestion
    };
  }

  // Check for known resolution
  if (knownResolutions[searchTerm]) {
    console.log(`[Concept] Resolved: "${searchTerm}" -> "${knownResolutions[searchTerm]}"`);
    return {
      found: true,
      needsDisambiguation: false,
      searchTerm,
      resolvedConcepts: {
        [searchTerm]: knownResolutions[searchTerm]
      },
      matches: [{
        uri: `https://linkeddata.competentnl.nl/uwv/id/occupation/${searchTerm.toUpperCase()}`,
        prefLabel: knownResolutions[searchTerm],
        matchedLabel: searchTerm,
        matchType: 'synonym',
        confidence: 0.95
      }]
    };
  }

  // Try database lookup
  if (ragPool) {
    try {
      const [rows] = await ragPool.execute(`
        SELECT DISTINCT 
          occupation_uri as uri,
          pref_label as prefLabel,
          label as matchedLabel,
          CASE 
            WHEN label_normalized = ? THEN 'exact'
            WHEN label_normalized LIKE ? THEN 'contains'
            ELSE 'fuzzy'
          END as matchType
        FROM occupation_labels
        WHERE label_normalized LIKE ?
           OR label_normalized SOUNDS LIKE ?
        ORDER BY 
          CASE WHEN label_normalized = ? THEN 1 
               WHEN label_normalized LIKE ? THEN 2 
               ELSE 3 END
        LIMIT 10
      `, [searchTerm, `${searchTerm}%`, `%${searchTerm}%`, searchTerm, searchTerm, `${searchTerm}%`]);

      if (rows.length === 0) {
        return { found: false, searchTerm, resolvedConcepts: {} };
      }

      if (rows.length > 5) {
        // Need disambiguation
        return {
          found: true,
          needsDisambiguation: true,
          searchTerm,
          matches: rows.slice(0, 10),
          disambiguationQuestion: `Ik vond ${rows.length} beroepen die overeenkomen met "${searchTerm}". Welke bedoel je?\n\n` +
            rows.slice(0, 5).map((m, i) => `${i + 1}. **${m.prefLabel}**`).join('\n')
        };
      }

      // Single match
      return {
        found: true,
        needsDisambiguation: false,
        searchTerm,
        resolvedConcepts: {
          [searchTerm]: rows[0].prefLabel
        },
        matches: rows
      };
    } catch (e) {
      console.warn('[Concept] Database lookup failed:', e.message);
    }
  }

  // Default: not found
  return { found: false, searchTerm, resolvedConcepts: {} };
}

/**
 * Validate SPARQL syntax
 */
function validateSparqlSyntax(sparql) {
  const errors = [];
  const warnings = [];

  if (!sparql || sparql.trim() === '') {
    return { valid: false, errors: ['Query is leeg'], warnings: [] };
  }

  // Check for SELECT/ASK/CONSTRUCT
  if (!/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i.test(sparql)) {
    errors.push('Query mist SELECT, ASK, CONSTRUCT, of DESCRIBE');
  }

  // Check for WHERE clause
  if (/\bSELECT\b/i.test(sparql) && !/\bWHERE\b/i.test(sparql)) {
    errors.push('SELECT query mist WHERE clause');
  }

  // Check bracket balance
  const openBrackets = (sparql.match(/{/g) || []).length;
  const closeBrackets = (sparql.match(/}/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`Ongebalanceerde brackets: ${openBrackets} open, ${closeBrackets} close`);
  }

  // Check for common prefixes
  const usedPrefixes = sparql.match(/\b(cnlo|ksmo|skos|rdf|rdfs):/g) || [];
  const declaredPrefixes = sparql.match(/PREFIX\s+(\w+):/gi) || [];

  usedPrefixes.forEach(prefix => {
    const prefixName = prefix.replace(':', '');
    const isDeclared = declaredPrefixes.some(p => 
      p.toLowerCase().includes(prefixName.toLowerCase())
    );
    if (!isDeclared) {
      warnings.push(`Prefix "${prefixName}" wordt gebruikt maar niet gedeclareerd`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sparql: sparql.trim()
  };
}

// Export functions for use in main server
module.exports = {
  generateTestSparql,
  classifyQuestionForTest,
  resolveConceptsForTest,
  validateSparqlSyntax,
  extractOccupationFromQuestion,
  extractEducationName
};
