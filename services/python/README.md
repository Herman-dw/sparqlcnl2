# GLiNER PII Detection Service

Privacy-first PII-detectie service op basis van **GLiNER**, geoptimaliseerd voor **CPU-only** gebruik.
Ontworpen voor lokale verwerking van CV's en tekst zonder externe API-calls (behalve eenmalige model download).

---

## Belangrijk (lees dit eerst)

- Vereist **Python 3.11 (64-bit)**
- Vereist een **Hugging Face access token** (Read-only is voldoende)
- Getest op **Windows 11 + PowerShell**
- Gebruikt model: **vicgalle/gliner-small-pii**

---

## Features

- GLiNER-based PII detectie
- CPU-only (geen GPU / CUDA nodig)
- FastAPI met Swagger UI
- Lokale verwerking (privacy-first)
- Anonimiseren en detecteren in één service

---

## Gedetecteerde PII

- Personen
- Emailadressen
- Telefoonnummers
- Adressen
- Geboortedata
- Organisaties

---

## Quick Start (Windows)

### 1. Vereisten

- Python **3.11.x (64-bit)**
- PowerShell
- Internet (eenmalig voor model download)

Controleer:
```powershell
python --version
```

### 2. Virtual environment aanmaken

```powershell
cd services/python
py -3.11 -m venv venv311
.\venv311\Scripts\Activate
```

### 3. Dependencies installeren

```powershell
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
python -m pip install gliner onnxruntime huggingface_hub
```

### 4. Hugging Face token instellen

Maak een token aan op: https://huggingface.co/settings/tokens

(Rechten: Read)

Zet het token in PowerShell:

```powershell
$env:HF_TOKEN="hf_JOUW_TOKEN_HIER"
$env:HUGGINGFACE_HUB_TOKEN=$env:HF_TOKEN
```

### 5. Model download testen (eenmalig)

```powershell
python -c "from huggingface_hub import snapshot_download; snapshot_download('vicgalle/gliner-small-pii'); print('download ok')"
```

### 6. Service starten

```powershell
python gliner_service.py
```

Service draait op:
- http://localhost:8001
- http://localhost:8001/docs

---

## Quick Start (Linux)

Zie `setup.sh` voor Linux-specifieke setup. Let op:

```bash
cd services/python
chmod +x setup.sh
./setup.sh
```

Vergeet niet eerst je Hugging Face token te exporteren:

```bash
export HF_TOKEN="hf_JOUW_TOKEN_HIER"
export HUGGINGFACE_HUB_TOKEN=$HF_TOKEN
```

---

## API Endpoints

### GET /health

Health check.

### POST /detect

Detecteer PII in tekst.

**Request:**
```json
{
  "text": "Jan Jansen, jan@example.nl, 06-12345678",
  "threshold": 0.3,
  "categorize": true
}
```

**Response:**
```json
{
  "entities": [
    {
      "label": "person",
      "text": "Jan Jansen",
      "start": 0,
      "end": 10,
      "score": 0.95,
      "source": "gliner"
    }
  ],
  "categorized": {
    "names": ["Jan Jansen"],
    "emails": ["jan@example.nl"],
    "phones": ["06-12345678"]
  },
  "processing_time_ms": 145.23,
  "entity_count": 3
}
```

### POST /anonymize

Detecteer en anonimiseer PII in één call.

**Request:**
```json
{
  "text": "Jan Jansen, email: jan@example.nl"
}
```

**Response:**
```json
{
  "anonymized_text": "[NAAM], email: [EMAIL]",
  "pii_detected": {
    "names": ["Jan Jansen"],
    "emails": ["jan@example.nl"]
  },
  "entity_count": 2,
  "processing_time_ms": 156.78
}
```

---

## Model configuratie

Standaard model: `vicgalle/gliner-small-pii`

(kan later via env var configureerbaar gemaakt worden)

---

## Troubleshooting

### 401 / 403 van Hugging Face

- Token niet gezet
- Verkeerde PowerShell sessie
- Token geen read-rechten

### Model laadt niet

Controleer:
```powershell
echo $env:HF_TOKEN
```

### Out of Memory

Verlaag `max_length` in requests of split grote CVs in kleinere chunks.

---

## Integration met Node.js Backend

### TypeScript Client

```typescript
// services/piiDetectionClient.ts

import axios from 'axios';

const GLINER_URL = process.env.GLINER_SERVICE_URL || 'http://localhost:8001';

export async function detectPII(text: string): Promise<PIIDetectionResult> {
  const response = await axios.post(`${GLINER_URL}/detect`, {
    text,
    threshold: 0.3,
    categorize: true
  });

  return response.data;
}

export async function anonymizeText(text: string): Promise<AnonymizedResult> {
  const response = await axios.post(`${GLINER_URL}/anonymize`, {
    text,
    threshold: 0.3
  });

  return response.data;
}
```

---

## Licenties

- **GLiNER**: Apache 2.0
- **PyTorch**: BSD
- **FastAPI**: MIT

---

## Support

**Issues:** https://github.com/Herman-dw/sparqlcnl2/issues
