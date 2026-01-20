"""
GLiNER PII Detection Service
FastAPI REST API voor PII detectie in CV's

CPU-optimized voor production deployment
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import logging
import time
from contextlib import asynccontextmanager

from pii_detector import PIIDetector, anonymize_text

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global model instance (loaded once at startup)
pii_detector: Optional[PIIDetector] = None


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifespan
    Load model at startup, cleanup at shutdown
    """
    global pii_detector

    # Startup
    logger.info("🚀 Starting GLiNER PII Detection Service...")
    logger.info("📊 Configuration:")
    logger.info("  - Device: CPU only")
    logger.info("  - Model: GLiNER Small v2.1")
    logger.info("  - Max sequence length: 512 tokens")

    try:
        pii_detector = PIIDetector()
        logger.info("✅ Model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
        raise

    yield

    # Shutdown
    logger.info("👋 Shutting down service...")


# Initialize FastAPI app
app = FastAPI(
    title="GLiNER PII Detection Service",
    description="Privacy-first PII detection for CV processing",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class DetectRequest(BaseModel):
    text: str = Field(..., description="Text to analyze for PII")
    threshold: float = Field(0.3, description="Confidence threshold (0.0-1.0)")
    max_length: int = Field(512, description="Maximum sequence length")
    categorize: bool = Field(True, description="Return categorized PII")


class PIIEntity(BaseModel):
    label: str
    text: str
    start: int
    end: int
    score: float
    source: Optional[str] = "gliner"


class DetectResponse(BaseModel):
    entities: List[PIIEntity]
    categorized: Optional[Dict[str, List[str]]] = None
    processing_time_ms: float
    entity_count: int


class AnonymizeRequest(BaseModel):
    text: str = Field(..., description="Text to anonymize")
    threshold: float = Field(0.3, description="Detection threshold")
    max_length: int = Field(512, description="Maximum sequence length")


class AnonymizeResponse(BaseModel):
    anonymized_text: str
    pii_detected: Dict[str, List[str]]
    entity_count: int
    processing_time_ms: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    version: str


# API Endpoints

@app.get("/", response_model=Dict[str, str])
async def root():
    """API root endpoint"""
    return {
        "service": "GLiNER PII Detection",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint

    Returns:
        Service health status
    """
    return HealthResponse(
        status="healthy" if pii_detector else "unhealthy",
        model_loaded=pii_detector is not None,
        device="cpu",
        version="1.0.0"
    )


@app.post("/detect", response_model=DetectResponse)
async def detect_pii(request: DetectRequest):
    """
    Detect PII entities in text

    Args:
        request: Detection request with text and parameters

    Returns:
        Detected PII entities and metadata
    """
    if not pii_detector:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        start_time = time.time()

        # Detect PII
        entities = pii_detector.detect_pii(
            text=request.text,
            threshold=request.threshold,
            max_length=request.max_length
        )

        # Categorize if requested
        categorized = None
        if request.categorize:
            categorized = pii_detector.categorize_pii(entities)

        processing_time = (time.time() - start_time) * 1000  # ms

        logger.info(f"✓ Detected {len(entities)} PII entities in {processing_time:.1f}ms")

        return DetectResponse(
            entities=[PIIEntity(**e) for e in entities],
            categorized=categorized,
            processing_time_ms=round(processing_time, 2),
            entity_count=len(entities)
        )

    except Exception as e:
        logger.error(f"Error in PII detection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anonymize", response_model=AnonymizeResponse)
async def anonymize(request: AnonymizeRequest):
    """
    Detect and anonymize PII in text

    Args:
        request: Anonymization request

    Returns:
        Anonymized text and detected PII metadata
    """
    if not pii_detector:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        start_time = time.time()

        # Detect PII
        entities = pii_detector.detect_pii(
            text=request.text,
            threshold=request.threshold,
            max_length=request.max_length
        )

        # Anonymize
        anonymized_text, replacements = anonymize_text(request.text, entities)

        # Categorize detected PII
        categorized = pii_detector.categorize_pii(entities)

        processing_time = (time.time() - start_time) * 1000  # ms

        logger.info(
            f"✓ Anonymized text ({len(entities)} PII items) in {processing_time:.1f}ms"
        )

        return AnonymizeResponse(
            anonymized_text=anonymized_text,
            pii_detected=categorized,
            entity_count=len(entities),
            processing_time_ms=round(processing_time, 2)
        )

    except Exception as e:
        logger.error(f"Error in anonymization: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Startup message
if __name__ == "__main__":
    import uvicorn

    print("""
    ╔═══════════════════════════════════════════════════════╗
    ║  GLiNER PII Detection Service                         ║
    ║  CPU-Optimized for Production                         ║
    ╠═══════════════════════════════════════════════════════╣
    ║  Starting server...                                   ║
    ║  URL: http://localhost:8001                           ║
    ║  Docs: http://localhost:8001/docs                     ║
    ╚═══════════════════════════════════════════════════════╝
    """)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info",
        access_log=True
    )
