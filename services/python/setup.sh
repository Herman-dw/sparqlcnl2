#!/bin/bash

# GLiNER PII Detection Service - Setup Script
# Voor CPU-only deployment

set -e

echo "🔧 Setting up GLiNER PII Detection Service (CPU-optimized)..."

# Check Python version
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python version: $python_version"

if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 9) else 1)"; then
    echo "❌ Python 3.9+ is required"
    exit 1
fi

# Create virtual environment
echo "📦 Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate venv
source venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip setuptools wheel

# Install dependencies
echo "📦 Installing dependencies (this may take 5-10 minutes)..."
pip install -r requirements.txt

# Download GLiNER model (will be cached)
echo "📥 Downloading GLiNER model..."
python3 -c "from gliner import GLiNER; GLiNER.from_pretrained('urchade/gliner_small_v2.1')"

echo "✅ Setup complete!"
echo ""
echo "To start the service:"
echo "  source venv/bin/activate"
echo "  python3 gliner_service.py"
echo ""
echo "Service will run on: http://localhost:8001"
