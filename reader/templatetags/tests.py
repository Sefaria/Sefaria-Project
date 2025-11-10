import hashlib
import os
import tempfile
from django.test import TestCase, override_settings
from django.template import Context, Template
from reader.templatetags.sefaria_tags import get_static_file_hash

class TestStaticFileTag(TestCase):
    def setUp(self):
        # Create a temporary directory for test static files
        self.test_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: os.rmdir(self.test_dir))
        
        # Create a test static file with known content
        self.test_content = b"Test static content"
        self.test_filename = "test.css"
        self.test_filepath = os.path.join(self.test_dir, self.test_filename)
        with open(self.test_filepath, 'wb') as f:
            f.write(self.test_content)
        self.addCleanup(lambda: os.remove(self.test_filepath))
        
        # Calculate expected hash
        self.expected_hash = hashlib.md5(self.test_content).hexdigest()[:8]

    @override_settings(STATICFILES_DIRS=[tempfile.gettempdir()])
    def test_get_static_file_hash(self):
        """Test that the hash is correctly generated for a static file"""
        hash_value = get_static_file_hash(self.test_filename)
        self.assertEqual(hash_value, self.expected_hash)

    def test_get_static_file_hash_nonexistent_file(self):
        """Test handling of non-existent files"""
        hash_value = get_static_file_hash('nonexistent.css')
        self.assertEqual(hash_value, "")

    @override_settings(STATICFILES_DIRS=[tempfile.gettempdir()])
    def test_static_template_tag(self):
        """Test the full template tag functionality"""
        # Test basic usage
        template = Template('{% load sefaria_tags %}{% static "test.css" %}')
        rendered = template.render(Context({}))
        self.assertIn(f'?v={self.expected_hash}', rendered)
        self.assertTrue(rendered.startswith('/static/'))
        self.assertTrue(rendered.endswith(self.expected_hash))

    @override_settings(STATICFILES_DIRS=[tempfile.gettempdir()])
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