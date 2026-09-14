"""Exercise deployment sequencing without touching Docker or a live checkout."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('deploy.sh').resolve()
SHA = 'a' * 40
MOCK = '''#!/usr/bin/env python3
import os, sys
from pathlib import Path
name = Path(sys.argv[0]).name
args = sys.argv[1:]
command = name + ' ' + ' '.join(args)
with open(os.environ['CALL_LOG'], 'a') as log:
    log.write(command + '\\n')
if command == 'git branch --show-current': print('main')
if command == 'git rev-parse HEAD': print(os.environ.get('LOCAL_SHA', os.environ['LATEST_SHA']))
if command == 'git rev-parse refs/remotes/origin/main': print(os.environ['LATEST_SHA'])
if command == 'docker compose images -q launchpad': print('old-image-id')
if command == 'docker compose config --images': print('launchpad-image')
if command.startswith('docker compose exec'): print('{"apps":[]}')
if command == 'docker compose build launchpad' and os.environ.get('FAIL_BUILD'): sys.exit(1)
if command.startswith('docker compose up') and os.environ.get('FAIL_HEALTH'):
    flag = Path(os.environ['CALL_LOG'] + '.failed')
    if not flag.exists():
        flag.touch()
        sys.exit(1)
'''


class DeploymentTest(unittest.TestCase):
    def run_deploy(self, command=None, **extra):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.git').mkdir()
            binaries = root / 'bin'
            binaries.mkdir()
            for name in ('git', 'docker', 'flock'):
                mock = binaries / name
                mock.write_text(MOCK)
                mock.chmod(0o700)
            log = root / 'calls'
            env = dict(os.environ, PATH=str(binaries) + os.pathsep + os.environ['PATH'],
                       DEPLOY_DIR=directory, SSH_ORIGINAL_COMMAND=command or 'deploy ' + SHA,
                       LATEST_SHA=SHA, CALL_LOG=str(log), **extra)
            result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True)
            calls = log.read_text() if log.exists() else ''
            marker = root / '.git/launchpad-deployed-revision'
            return result, calls, marker.read_text().strip() if marker.exists() else None

    def test_rejects_shell_commands(self):
        for command in ('bash', 'deploy ' + SHA + '; id', 'deploy main', 'deploy ' + SHA + '\nwhoami'):
            result, calls, marker = self.run_deploy(command)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(calls, '')
            self.assertIsNone(marker)

    def test_skips_superseded_revision(self):
        result, calls, marker = self.run_deploy('deploy ' + 'b' * 40)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn('docker', calls)
        self.assertIsNone(marker)

    def test_success_backs_up_before_building_and_records_revision(self):
        result, calls, marker = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(calls.index('docker compose exec'), calls.index('docker compose build'))
        self.assertIn('git merge --ff-only ' + SHA, calls)
        self.assertEqual(marker, SHA)

    def test_refuses_a_checkout_ahead_of_the_tested_commit(self):
        result, calls, marker = self.run_deploy(LOCAL_SHA='c' * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('docker compose build', calls)
        self.assertIsNone(marker)

    def test_failed_build_does_not_replace_running_container(self):
        result, calls, marker = self.run_deploy(FAIL_BUILD='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('docker compose up', calls)
        self.assertIsNone(marker)

    def test_failed_health_check_restores_previous_image(self):
        result, calls, marker = self.run_deploy(FAIL_HEALTH='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('docker image tag old-image-id launchpad-image', calls)
        self.assertEqual(calls.count('docker compose up'), 2)
        self.assertIsNone(marker)


if __name__ == '__main__':
    unittest.main()
