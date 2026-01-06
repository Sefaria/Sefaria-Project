import hashlib
import os
import shutil
import tempfile
from django.test import SimpleTestCase, override_settings
from django.template import Context, Template
from reader.templatetags.sefaria_tags import get_static_file_hash

class TestStaticFileTag(SimpleTestCase):
    databases = set()  # Tell pytest-django no DB is needed.
    def setUp(self):
        # Create a temporary directory for test static files
        self.test_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.test_dir, ignore_errors=True))

        # Point STATICFILES_DIRS to the temporary directory for all tests
        static_override = override_settings(STATICFILES_DIRS=[self.test_dir])
        static_override.enable()
        self.addCleanup(static_override.disable)
        
        # Create a test static file with known content
        self.test_content = b"Test static content"
        self.test_filename = "test.css"
        self.test_filepath = os.path.join(self.test_dir, self.test_filename)
        with open(self.test_filepath, 'wb') as f:
            f.write(self.test_content)
        
        # Calculate expected hash
        self.expected_hash = hashlib.md5(self.test_content).hexdigest()[:8]

    def test_get_static_file_hash(self):
        """Test that the hash is correctly generated for a static file"""
        hash_value = get_static_file_hash(self.test_filename)
        self.assertEqual(hash_value, self.expected_hash)

    def test_get_static_file_hash_nonexistent_file(self):
        """Test handling of non-existent files"""
        hash_value = get_static_file_hash('nonexistent.css')
        self.assertEqual(hash_value, "")

    def test_static_template_tag(self):
        """Test the full template tag functionality"""
        # Test basic usage
        template = Template('{% load sefaria_tags %}{% static "test.css" %}')
        rendered = template.render(Context({}))
        self.assertIn(f'?v={self.expected_hash}', rendered)
        self.assertTrue(rendered.startswith('/static/'))
        self.assertTrue(rendered.endswith(self.expected_hash))

    def test_static_template_tag_nonexistent_file(self):
        """Test template tag with non-existent file"""
        template = Template('{% load sefaria_tags %}{% static "nonexistent.css" %}')
        rendered = template.render(Context({}))
        self.assertNotIn('?v=', rendered)  # Should not add hash for non-existent files
        self.assertEqual(rendered, '/static/nonexistent.css')

    def test_static_template_tag_empty_path(self):
        """Test template tag with empty path"""
        template = Template('{% load sefaria_tags %}{% static "" %}')
        rendered = template.render(Context({}))
        self.assertEqual(rendered, '/static/')

    def test_static_template_tag_altered_file(self):
        """Test that changing file content changes the hash"""
        # Modify the test file
        new_content = b"Modified static content"
        with open(self.test_filepath, 'wb') as f:
            f.write(new_content)
        
        # Calculate new expected hash
        new_expected_hash = hashlib.md5(new_content).hexdigest()[:8]
        
        # Test template rendering again
        template = Template('{% load sefaria_tags %}{% static "test.css" %}')
        rendered = template.render(Context({}))
        self.assertIn(f'?v={new_expected_hash}', rendered)
        self.assertNotIn(f'?v={self.expected_hash}', rendered)
