"""
Tests for ALLOWED_HOSTS in sefaria/local_settings_coolify.py.

The Coolify settings used to hard-code ALLOWED_HOSTS = ['*']. The list now comes from the
ALLOWED_HOSTS environment variable (comma-separated). When it is unset, startup must fail unless Django's effective DEBUG
setting is on and ALLOWED_HOSTS_ALLOW_ALL is set explicitly. The DEBUG decision is made on
the effective setting (passed in by settings.py), never on a DEBUG environment variable.
"""
import os
import subprocess
import sys
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from sefaria.local_settings_coolify import resolve_allowed_hosts

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _resolve(debug, hosts=None, env_debug=None, allow_all=None):
    env = {'ALLOWED_HOSTS': hosts} if hosts is not None else {}
    if allow_all is not None:
        env['ALLOWED_HOSTS_ALLOW_ALL'] = allow_all
    if env_debug is not None:
        env['DEBUG'] = env_debug
    with mock.patch.dict(os.environ, env, clear=False):
        if hosts is None:
            os.environ.pop('ALLOWED_HOSTS', None)
        if env_debug is None:
            os.environ.pop('DEBUG', None)
        if allow_all is None:
            os.environ.pop('ALLOWED_HOSTS_ALLOW_ALL', None)
        return resolve_allowed_hosts(debug)


class CoolifyAllowedHostsTest(SimpleTestCase):

    def test_reads_comma_separated_hosts_from_env(self):
        self.assertEqual(_resolve(False, 'www.sefaria.org, .sefaria.org.il'), ['www.sefaria.org', '.sefaria.org.il'])

    def test_drops_empty_entries(self):
        self.assertEqual(_resolve(False, 'www.sefaria.org,,  ,voices.sefaria.org,'),
                         ['www.sefaria.org', 'voices.sefaria.org'])

    def test_unset_without_debug_fails_startup(self):
        with self.assertRaises(ImproperlyConfigured):
            _resolve(False)

    def test_blank_without_debug_fails_startup(self):
        with self.assertRaises(ImproperlyConfigured):
            _resolve(False, ' , ')

    def test_unset_in_debug_without_opt_in_fails_startup(self):
        with self.assertRaises(ImproperlyConfigured):
            _resolve(True)

    def test_unset_in_debug_with_opt_in_keeps_dev_wildcard(self):
        self.assertEqual(_resolve(True, allow_all='true'), ['*'])

    def test_opt_in_without_debug_does_not_grant_wildcard(self):
        with self.assertRaises(ImproperlyConfigured):
            _resolve(False, allow_all='true')

    def test_env_value_wins_in_debug(self):
        self.assertEqual(_resolve(True, 'localhost'), ['localhost'])

    def test_debug_env_var_does_not_grant_wildcard_when_effective_debug_is_off(self):
        with self.assertRaises(ImproperlyConfigured):
            _resolve(False, env_debug='true')

    def test_debug_env_var_off_does_not_block_effective_debug(self):
        self.assertEqual(_resolve(True, env_debug='false', allow_all='1'), ['*'])


class CoolifySettingsWiringTest(SimpleTestCase):
    """sefaria.settings must hand the effective DEBUG (from local_settings) to the Coolify overlay."""

    def _settings_allowed_hosts(self, env):
        full_env = {k: v for k, v in os.environ.items() if k not in ('ALLOWED_HOSTS', 'ALLOWED_HOSTS_ALLOW_ALL', 'DEBUG', 'CI_RUN')}
        full_env.update({'COOLIFY': '1', 'DJANGO_SETTINGS_MODULE': 'sefaria.settings'}, **env)
        return subprocess.run(
            [sys.executable, '-c', 'from sefaria import settings; print(repr(settings.ALLOWED_HOSTS))'],
            cwd=REPO_ROOT, env=full_env, capture_output=True, text=True)

    def test_explicit_hosts_are_used(self):
        result = self._settings_allowed_hosts({'ALLOWED_HOSTS': 'www.sefaria.org'})
        self.assertEqual(result.returncode, 0, result.stderr[-500:])
        self.assertEqual(result.stdout.strip().splitlines()[-1], "['www.sefaria.org']")

    def test_inherited_example_debug_alone_does_not_grant_wildcard(self):
        # With no local_settings.py the example file sets DEBUG = True; that must not open the wildcard.
        result = self._settings_allowed_hosts({})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)

    def test_explicit_opt_in_with_effective_debug_gives_wildcard(self):
        # A DEBUG=false environment must not override the effective DEBUG from local settings.
        result = self._settings_allowed_hosts({'DEBUG': 'false', 'ALLOWED_HOSTS_ALLOW_ALL': 'true'})
        self.assertEqual(result.returncode, 0, result.stderr[-500:])
        self.assertEqual(result.stdout.strip().splitlines()[-1], "['*']")
