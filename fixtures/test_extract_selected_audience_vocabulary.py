# SPDX-FileCopyrightText: 2026 Knitli Inc.
#
# SPDX-License-Identifier: AGPL-3.0-only

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path


extractor = runpy.run_path(str(Path(__file__).with_name('extract-selected-audience-vocabulary.py')))
extract = extractor['extract']
render = extractor['render']


class VocabularyExtractionTest(unittest.TestCase):
    def test_extension_is_part_of_the_generated_register_and_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'values.rs'
            source.write_text('pub static TRIGRAPHS: &[&str] = &[\n "AAA",\n "CUSTOM_ORG",\n];\n')
            codes = extract(source)
        self.assertEqual(codes, ['AAA', 'CUSTOM_ORG'])
        output = render(codes, 'a' * 40, 'b' * 64, 'c' * 64)
        self.assertIn("  'CUSTOM_ORG',", output)
        self.assertIn(hashlib.sha256(b'AAA\nCUSTOM_ORG\n').hexdigest(), output)
        self.assertIn('c' * 64, output)

    def test_duplicate_or_malformed_register_is_rejected(self):
        for body in ('"AAA", "AAA",', '"BBB", "AAA",', '"bad-code",', '"AAA", arbitrary(),'):
            with self.subTest(body=body), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'values.rs'
                source.write_text(f'pub static TRIGRAPHS: &[&str] = &[{body}];')
                with self.assertRaises(ValueError):
                    extract(source)


if __name__ == '__main__':
    unittest.main()
