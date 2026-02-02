#!/bin/bash

# GLiNER PII Detection Service - Setup Script (Linux, CPU-only)
# Voor Windows: zie README.md voor PowerShell instructies

set -e

echo "GLiNER PII Detection Service setup (Linux, CPU-only)"

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')

if [[ "$PYTHON_VERSION" != "3.11" ]]; then
  echo "Python 3.11 is required (found $PYTHON_VERSION)"
  exit 1
fi

echo "Python version: $PYTHON_VERSION"

# Check HF_TOKEN
if [[ -z "${HF_TOKEN}" ]]; then
  echo ""
  echo "WAARSCHUWING: HF_TOKEN is niet gezet!"
  echo "Stel je Hugging Face token in voor model download:"
  echo "  export HF_TOKEN=hf_xxx"
  echo "  export HUGGINGFACE_HUB_TOKEN=\$HF_TOKEN"
  echo ""
fi

# Create virtual environment
echo "Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created"
else
    echo "Virtual environment already exists"
fi

# Activate venv
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install fastapi uvicorn
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install gliner onnxruntime huggingface_hub

# Download GLiNER model
echo "Downloading GLiNER model (vicgalle/gliner-small-pii)..."
python -c "from huggingface_hub import snapshot_download; snapshot_download('vicgalle/gliner-small-pii'); print('Model download ok')"

echo ""
echo "Setup complete!"
echo ""
echo "To start the service:"
echo "  source venv/bin/activate"
echo "  python gliner_service.py"
echo ""
echo "Service will run on: http://localhost:8001"
