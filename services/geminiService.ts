
import { GoogleGenAI } from "@google/genai";
import { EXAMPLES, PREFIXES, WHITELIST_PREDICATES, GRAPH_OPTIONS } from "../constants";

// We initialiseren de client binnen de functies of zorgen dat process.env.API_KEY beschikbaar is
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const retrieveRelevantContext = (userQuery: string) => {
  const keywords = userQuery.toLowerCase().split(/\s+/).filter(k => k.length > 3);
  const relevantExamples = EXAMPLES.filter(ex => 
    keywords.some(kw => ex.vraag.toLowerCase().includes(kw))
  );
  const examplesToUse = relevantExamples.length > 0 ? relevantExamples : EXAMPLES;

  return {
    examples: examplesToUse.slice(0, 20),
    prefixes: PREFIXES,
    predicates: WHITELIST_PREDICATES,
    graphs: GRAPH_OPTIONS.map(g => `<${g.uri}>`)
  };
};

export const generateSparql = async (userQuery: string, filters: { graphs: string[], type: string, status: string }) => {
  const context = retrieveRelevantContext(userQuery);
  const ai = getAiClient();
  
  const systemPrompt = `
    Je bent een SPARQL expert voor CompetentNL.
    Genereer UITSLUITEND de SPARQL SELECT query.
    
    RICHTLIJNEN:
    1. Gebruik prefixes: ${context.prefixes}
    2. Gebruik FROM clauses voor: ${filters.graphs.map(g => `<${g}>`).join(', ')}
    3. Forceer LIMIT 50.
    4. Alleen SELECT queries.
    
    VOORBEELDEN:
    ${context.examples.map(ex => `Vraag: ${ex.vraag}\nQuery: ${ex.query}`).join('\n\n')}

    ANTWOORD MET ALLEEN DE QUERY.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: userQuery,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0,
    },
  });

  let rawQuery = response.text?.trim() || '';
  rawQuery = rawQuery.replace(/```sparql/g, '').replace(/```/g, '').trim();
  return rawQuery;
};

export const summarizeResults = async (question: string, results: any[]) => {
  if (results.length === 0) return "Ik kon geen resultaten vinden voor deze vraag in de geselecteerde graphs.";
  
  const ai = getAiClient();
  const resultsSample = JSON.stringify(results.slice(0, 3));
  const prompt = `Vraag: ${question}\nData: ${resultsSample}\nTotaal: ${results.length}\nSamenvatting in NL:`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "Vat de SPARQL resultaten kort samen voor de gebruiker.",
      temperature: 0.5,
    },
  });
  return response.text;
};
