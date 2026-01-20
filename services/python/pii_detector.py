"""
PII Detector using GLiNER
CPU-optimized for production use
"""

import torch
from gliner import GLiNER
from typing import List, Dict, Tuple
import re


class PIIDetector:
    """
    Detect Personally Identifiable Information in Dutch text using GLiNER

    Optimized for CPU inference with:
    - Batch processing
    - torch.no_grad() for inference
    - Limited sequence length
    - CPU-only PyTorch
    """

    # PII entity types we detect
    PII_LABELS = [
        "person",           # Namen
        "email",            # Email adressen
        "phone",            # Telefoonnummers
        "address",          # Adressen
        "date",             # Geboortedatums
        "organization",     # Bedrijfsnamen (voor werkgever tracking)
        "location"          # Locaties
    ]

    def __init__(self, model_name: str = "urchade/gliner_small_v2.1"):
        """
        Initialize GLiNER model

        Args:
            model_name: HuggingFace model identifier
        """
        print(f"Loading GLiNER model: {model_name}")

        # Load model (CPU only)
        self.model = GLiNER.from_pretrained(model_name)
        self.model.eval()  # Set to evaluation mode

        # Force CPU
        if torch.cuda.is_available():
            print("⚠️  GPU available but using CPU as configured")

        # Set to CPU
        self.model = self.model.to('cpu')

        print("✓ GLiNER model loaded (CPU mode)")

    def detect_pii(
        self,
        text: str,
        threshold: float = 0.3,
        max_length: int = 512
    ) -> List[Dict]:
        """
        Detect PII entities in text

        Args:
            text: Input text (CV content)
            threshold: Confidence threshold (0.0-1.0)
            max_length: Maximum sequence length (for memory optimization)

        Returns:
            List of detected entities with positions
        """

        if not text or len(text.strip()) == 0:
            return []

        # Split text into chunks if too long (CPU memory optimization)
        chunks = self._split_text(text, max_length)

        all_entities = []
        offset = 0

        # Process in chunks with no_grad for CPU efficiency
        with torch.no_grad():
            for chunk in chunks:
                # Predict entities
                entities = self.model.predict_entities(
                    chunk,
                    self.PII_LABELS,
                    threshold=threshold
                )

                # Adjust positions based on chunk offset
                for entity in entities:
                    entity['start'] += offset
                    entity['end'] += offset
                    all_entities.append(entity)

                offset += len(chunk)

        # Post-process: merge overlapping entities
        merged = self._merge_overlapping(all_entities)

        # Enhance with regex patterns (fallback for missed items)
        enhanced = self._enhance_with_regex(text, merged)

        return enhanced

    def _split_text(self, text: str, max_length: int) -> List[str]:
        """
        Split text into chunks for processing

        Args:
            text: Full text
            max_length: Maximum chunk size

        Returns:
            List of text chunks
        """
        if len(text) <= max_length:
            return [text]

        chunks = []
        current_pos = 0

        while current_pos < len(text):
            # Find a good split point (end of sentence if possible)
            end_pos = current_pos + max_length

            if end_pos < len(text):
                # Try to find sentence boundary
                sentence_end = text.rfind('.', current_pos, end_pos)
                if sentence_end > current_pos:
                    end_pos = sentence_end + 1

            chunks.append(text[current_pos:end_pos])
            current_pos = end_pos

        return chunks

    def _merge_overlapping(self, entities: List[Dict]) -> List[Dict]:
        """
        Merge overlapping entity detections

        Args:
            entities: List of detected entities

        Returns:
            Merged entities
        """
        if not entities:
            return []

        # Sort by start position
        sorted_entities = sorted(entities, key=lambda x: x['start'])

        merged = [sorted_entities[0]]

        for current in sorted_entities[1:]:
            last = merged[-1]

            # Check for overlap
            if current['start'] <= last['end']:
                # Merge: extend the last entity
                last['end'] = max(last['end'], current['end'])
                last['text'] = last['text'] + current['text'][last['end']-current['start']:]

                # Keep higher confidence score
                if current['score'] > last['score']:
                    last['score'] = current['score']
                    last['label'] = current['label']
            else:
                merged.append(current)

        return merged

    def _enhance_with_regex(self, text: str, entities: List[Dict]) -> List[Dict]:
        """
        Enhance GLiNER results with regex patterns (fallback)

        Args:
            text: Original text
            entities: GLiNER detected entities

        Returns:
            Enhanced entity list
        """

        # Regex patterns for Dutch PII
        patterns = {
            'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
            'phone': r'(\+31|0031|0)[1-9][0-9]{8}',
            'bsn': r'\b\d{9}\b',
            'postalcode': r'\b[1-9][0-9]{3}\s?[A-Z]{2}\b'
        }

        # Track positions already covered
        covered_ranges = [(e['start'], e['end']) for e in entities]

        def is_covered(start: int, end: int) -> bool:
            """Check if position is already covered by GLiNER"""
            for cstart, cend in covered_ranges:
                if start >= cstart and end <= cend:
                    return True
            return False

        # Find additional matches
        for label, pattern in patterns.items():
            for match in re.finditer(pattern, text):
                if not is_covered(match.start(), match.end()):
                    entities.append({
                        'label': label,
                        'text': match.group(),
                        'start': match.start(),
                        'end': match.end(),
                        'score': 1.0,  # Regex has 100% confidence
                        'source': 'regex'
                    })

        # Sort by position
        return sorted(entities, key=lambda x: x['start'])

    def categorize_pii(self, entities: List[Dict]) -> Dict[str, List[str]]:
        """
        Categorize detected PII by type

        Args:
            entities: Detected entities

        Returns:
            Dictionary with categorized PII
        """
        categorized = {
            'names': [],
            'emails': [],
            'phones': [],
            'addresses': [],
            'dates': [],
            'organizations': [],
            'other': []
        }

        for entity in entities:
            label = entity['label'].lower()
            text = entity['text']

            if label == 'person':
                categorized['names'].append(text)
            elif label == 'email' or '@' in text:
                categorized['emails'].append(text)
            elif label in ['phone', 'phone_number']:
                categorized['phones'].append(text)
            elif label in ['address', 'location']:
                categorized['addresses'].append(text)
            elif label == 'date':
                categorized['dates'].append(text)
            elif label == 'organization':
                categorized['organizations'].append(text)
            else:
                categorized['other'].append(text)

        # Remove duplicates
        for key in categorized:
            categorized[key] = list(set(categorized[key]))

        return categorized


def anonymize_text(text: str, entities: List[Dict]) -> Tuple[str, Dict]:
    """
    Anonymize text by replacing PII with placeholders

    Args:
        text: Original text
        entities: Detected PII entities

    Returns:
        (anonymized_text, replacement_map)
    """

    # Replacement placeholders
    placeholders = {
        'person': '[NAAM]',
        'email': '[EMAIL]',
        'phone': '[TELEFOON]',
        'address': '[ADRES]',
        'date': '[DATUM]',
        'bsn': '[BSN]',
        'postalcode': '[POSTCODE]'
    }

    # Sort entities by position (reverse to maintain indices)
    sorted_entities = sorted(entities, key=lambda x: x['start'], reverse=True)

    anonymized = text
    replacement_map = {}

    for entity in sorted_entities:
        label = entity['label'].lower()
        placeholder = placeholders.get(label, '[VERWIJDERD]')

        # Replace in text
        start = entity['start']
        end = entity['end']
        original_text = entity['text']

        anonymized = anonymized[:start] + placeholder + anonymized[end:]

        # Track replacement
        if label not in replacement_map:
            replacement_map[label] = []
        replacement_map[label].append({
            'original': original_text,
            'placeholder': placeholder,
            'position': (start, end)
        })

    return anonymized, replacement_map


# CLI testing
if __name__ == "__main__":
    import sys

    # Test
    detector = PIIDetector()

    test_text = """
    Jan Jansen
    Hoofdstraat 123, 1234 AB Amsterdam
    Email: jan.jansen@example.nl
    Tel: 06-12345678

    WERKERVARING
    Software Engineer bij Google (2020-2022)
    Senior Developer bij Microsoft (2022-2024)
    """

    print("\n" + "="*60)
    print("Testing PII Detection")
    print("="*60)
    print(f"\nInput text:\n{test_text}")

    # Detect
    entities = detector.detect_pii(test_text)

    print(f"\n✓ Found {len(entities)} PII entities:")
    for e in entities:
        print(f"  - {e['label']}: '{e['text']}' (confidence: {e['score']:.2f})")

    # Categorize
    categorized = detector.categorize_pii(entities)
    print(f"\nCategorized PII:")
    for category, items in categorized.items():
        if items:
            print(f"  {category}: {items}")

    # Anonymize
    anonymized, replacements = anonymize_text(test_text, entities)
    print(f"\nAnonymized text:\n{anonymized}")

    print("\n" + "="*60)
