
import { GoogleGenAI, Type } from "@google/genai";
import { EXAMPLES, PREFIXES, WHITELIST_PREDICATES, GRAPH_OPTIONS } from "../constants";

// De API sleutel wordt door de omgeving geïnjecteerd in process.env.API_KEY
// We initialiseren de client direct binnen de functies om altijd de actuele sleutel te hebben
const MODEL_NAME = 'gemini-3-pro-preview';
const SUMMARY_MODEL = 'gemini-3-flash-preview';

export const generateSparql = async (userQuery: string, filters: { graphs: string[], type: string, status: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Je bent een wereldklasse SPARQL expert gespecialiseerd in CompetentNL en ESCO data.
    
    DOEL:
    Vertaal de vraag van de gebruiker naar een geldige SPARQL SELECT of ASK query.
    
    CONTEXT:
    Prefixes: ${PREFIXES}
    Beschikbare Graphs: ${filters.graphs.map(g => `<${g}>`).join(', ')}
    Toegestane Predicates: ${WHITELIST_PREDICATES.join(', ')}
    
    STRIKTE REGELS:
    1. Retourneer de SPARQL query ZONDER markdown blocks of extra tekst.
    2. Gebruik ALTIJD de juiste FROM <graph> clauses gebaseerd op de filters.
    3. Voeg ALTIJD een LIMIT 50 toe aan SELECT queries (tenzij expliciet anders gevraagd).
    4. Gebruik alleen de prefixes die nodig zijn.
    5. Houd de query performant en specifiek.

    VOORBEELDEN:
    ${EXAMPLES.map(ex => `Vraag: ${ex.vraag}\nQuery: ${ex.query}`).join('\n\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: userQuery,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1,
      },
    });

    let sparql = response.text || '';
    // Opschonen van eventuele markdown code blocks
    sparql = sparql.replace(/```sparql/g, '').replace(/```/g, '').trim();
    
    return sparql;
  } catch (error: any) {
    console.error("Gemini SPARQL Generation Error:", error);
    throw new Error(`AI kon geen SPARQL genereren: ${error.message}`);
  }
};

export const summarizeResults = async (question: string, results: any[]) => {
  if (!results || results.length === 0) {
    return "Ik heb de database bevraagd, maar er zijn geen resultaten gevonden die voldoen aan je criteria.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const dataSnippet = JSON.stringify(results.slice(0, 5));
  
  const prompt = `
    Vraag van gebruiker: "${question}"
    Aantal resultaten gevonden: ${results.length}
    Data voorbeeld (eerste 5 rijen): ${dataSnippet}
    
    Geef een vriendelijke, professionele samenvatting in het Nederlands van wat er gevonden is. 
    Verwijs naar specifieke labels of namen uit de data. 
    Als er veel resultaten zijn, meld dan dat de volledige lijst in de tabel hieronder staat en geëxporteerd kan worden naar Excel.
  `;

  try {
    const response = await ai.models.generateContent({
      model: SUMMARY_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    return response.text || "Hier zijn de resultaten van je zoekopdracht.";
  } catch (error) {
    return `Gevonden resultaten: ${results.length} rijen. Zie de tabel hieronder voor details.`;
  }
};
