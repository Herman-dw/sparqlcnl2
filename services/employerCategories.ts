/**
 * Employer Categories en Generalisatie Mappings
 * Voor privacy-preserving werkgever classificatie
 */

export interface EmployerCategory {
  pattern: RegExp;
  category: string;
  sector: string;
  isIdentifying: boolean;
  tier: 'exact' | 'sector' | 'generic';
}

/**
 * Employer categorisatie database
 * Geordend van meest specifiek naar meest generiek
 */
export const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  // Tech Giants (Tier 1: Highly identifying)
  {
    pattern: /^(Google|Alphabet)$/i,
    category: 'Groot internationaal tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Microsoft|MS)$/i,
    category: 'Groot internationaal tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Apple|Apple Inc)$/i,
    category: 'Groot internationaal tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Meta|Facebook|Instagram|WhatsApp)$/i,
    category: 'Groot internationaal tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Amazon|AWS|Amazon Web Services)$/i,
    category: 'Groot internationaal tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Netflix)$/i,
    category: 'Groot internationaal tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },

  // AI/ML Companies (Highly identifying)
  {
    pattern: /^(OpenAI)$/i,
    category: 'AI/ML startup',
    sector: 'Kunstmatige Intelligentie',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Anthropic)$/i,
    category: 'AI/ML startup',
    sector: 'Kunstmatige Intelligentie',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(DeepMind)$/i,
    category: 'AI/ML onderzoekslab',
    sector: 'Kunstmatige Intelligentie',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Hugging Face|HuggingFace)$/i,
    category: 'AI/ML startup',
    sector: 'Kunstmatige Intelligentie',
    isIdentifying: true,
    tier: 'exact'
  },

  // Nederlandse Tech (Moderately identifying)
  {
    pattern: /^(Booking\.com|Booking)$/i,
    category: 'Nederlands tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Adyen)$/i,
    category: 'Nederlands fintech bedrijf',
    sector: 'Financiële technologie',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Mollie)$/i,
    category: 'Nederlands fintech bedrijf',
    sector: 'Financiële technologie',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Coolblue)$/i,
    category: 'Nederlands e-commerce bedrijf',
    sector: 'E-commerce',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Bol\.com|Bol)$/i,
    category: 'Nederlands e-commerce bedrijf',
    sector: 'E-commerce',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Picnic)$/i,
    category: 'Nederlands tech bedrijf',
    sector: 'ICT',
    isIdentifying: true,
    tier: 'exact'
  },

  // Consulting - Big 4 (Identifying)
  {
    pattern: /^(Deloitte)$/i,
    category: 'Big 4 consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(PwC|PricewaterhouseCoopers)$/i,
    category: 'Big 4 consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(EY|Ernst & Young|Ernst and Young)$/i,
    category: 'Big 4 consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(KPMG)$/i,
    category: 'Big 4 consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },

  // Andere Consulting
  {
    pattern: /^(McKinsey|McKinsey & Company)$/i,
    category: 'Management consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(BCG|Boston Consulting Group)$/i,
    category: 'Management consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },
  {
    pattern: /^(Bain & Company|Bain)$/i,
    category: 'Management consultancy',
    sector: 'Zakelijke dienstverlening',
    isIdentifying: true,
    tier: 'exact'
  },

  // Banken - Nederlandse
  {
    pattern: /^(ING|ING Bank)$/i,
    category: 'Nederlandse bank',
    sector: 'Financiële dienstverlening',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /^(ABN AMRO|ABN)$/i,
    category: 'Nederlandse bank',
    sector: 'Financiële dienstverlening',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /^(Rabobank)$/i,
    category: 'Nederlandse bank',
    sector: 'Financiële dienstverlening',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /^(SNS Bank|SNS)$/i,
    category: 'Nederlandse bank',
    sector: 'Financiële dienstverlening',
    isIdentifying: false,
    tier: 'sector'
  },

  // Zorg
  {
    pattern: /(UMC|Universitair Medisch Centrum)/i,
    category: 'Universitair medisch centrum',
    sector: 'Gezondheidszorg',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /(ziekenhuis|hospital)/i,
    category: 'Ziekenhuis',
    sector: 'Gezondheidszorg',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /(GGZ|GGD|thuiszorg)/i,
    category: 'Zorginstelling',
    sector: 'Gezondheidszorg',
    isIdentifying: false,
    tier: 'sector'
  },

  // Overheid
  {
    pattern: /^(Ministerie|Ministerie van)/i,
    category: 'Ministerie',
    sector: 'Overheid',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /^(Gemeente|Gemeente van)/i,
    category: 'Gemeente',
    sector: 'Overheid',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /^(Provincie)/i,
    category: 'Provincie',
    sector: 'Overheid',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /(Belastingdienst|Rijksoverheid)/i,
    category: 'Overheidsinstelling',
    sector: 'Overheid',
    isIdentifying: false,
    tier: 'sector'
  },

  // Onderwijs
  {
    pattern: /(Universiteit|University)/i,
    category: 'Universiteit',
    sector: 'Onderwijs',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /(Hogeschool|HBO)/i,
    category: 'Hogeschool',
    sector: 'Onderwijs',
    isIdentifying: false,
    tier: 'sector'
  },
  {
    pattern: /(ROC|MBO)/i,
    category: 'ROC',
    sector: 'Onderwijs',
    isIdentifying: false,
    tier: 'sector'
  },

  // Tech sector patterns (fallback)
  {
    pattern: /(Software|IT|ICT|Tech|Digital)/i,
    category: 'Tech bedrijf',
    sector: 'ICT',
    isIdentifying: false,
    tier: 'sector'
  },

  // Startup patterns
  {
    pattern: /(Startup|Scale-up|Scaleup)/i,
    category: 'Startup',
    sector: 'Diverse',
    isIdentifying: false,
    tier: 'sector'
  },

  // Generic fallback (laatste)
  {
    pattern: /.*/,
    category: 'Bedrijf',
    sector: 'Diverse',
    isIdentifying: false,
    tier: 'generic'
  }
];

/**
 * Sector inference based on job title
 * Gebruikt wanneer werkgever onbekend is
 */
export const JOB_TITLE_TO_SECTOR: Array<{pattern: RegExp; sector: string}> = [
  // ICT/Software
  { pattern: /(software|developer|engineer|programmer|IT|ICT|DevOps|SRE)/i, sector: 'ICT' },
  { pattern: /(data scientist|machine learning|AI|data engineer)/i, sector: 'ICT' },
  { pattern: /(webdesigner|UX|UI|frontend|backend|fullstack)/i, sector: 'ICT' },

  // Zorg
  { pattern: /(verpleegkundige|arts|dokter|zorg|medisch|fysiotherapeut)/i, sector: 'Gezondheidszorg' },

  // Onderwijs
  { pattern: /(docent|leraar|teacher|professor|onderzoeker)/i, sector: 'Onderwijs' },

  // Finance
  { pattern: /(accountant|controller|financieel|boekhouder)/i, sector: 'Financiële dienstverlening' },

  // Consulting
  { pattern: /(consultant|adviseur|analist)/i, sector: 'Zakelijke dienstverlening' },

  // Marketing/Sales
  { pattern: /(marketing|sales|verkoop|commercieel)/i, sector: 'Marketing & Sales' },

  // HR
  { pattern: /(HR|human resources|recruiter|personeelszaken)/i, sector: 'Human Resources' },

  // Logistiek
  { pattern: /(logistiek|supply chain|magazijn|transport)/i, sector: 'Logistiek' },

  // Bouw
  { pattern: /(bouw|architect|aannemer|timmerman|elektricien)/i, sector: 'Bouw' },

  // Default
  { pattern: /.*/, sector: 'Diverse' }
];
