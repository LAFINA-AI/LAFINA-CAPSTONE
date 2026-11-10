"""Prepare an isolated, pinned conversation-backend snapshot using read-only Git.

No checkout, reset, worktree operation or source write touches the memory repo.
Only runtime/test source is exported; no history, .env, database or venv is copied.
"""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

VOICE_COMMIT = 'a3d1671ff6ac6d4c3df1cf7e36a7ec795e7233f8'
EXPORT_PATHS = ('app', 'scripts', 'tests', 'alembic', 'alembic.ini',
                'requirements.txt', 'pyproject.toml', 'README.md')


def _git(reference: Path, *args: str) -> bytes:
    result = subprocess.run(
        ['git', '-C', str(reference), *args], check=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'},
    )
    return result.stdout


def memory_state(reference: Path) -> dict:
    return {
        'branch': _git(reference, 'branch', '--show-current').decode().strip(),
        'head': _git(reference, 'rev-parse', 'HEAD').decode().strip(),
        'status': _git(reference, 'status', '--porcelain=v1').decode(),
    }


def prepare_voice_backend(root: Path) -> Path:
    root = root.resolve()
    reference = root / '.local' / 'elevenlabs-backend-work'
    target = root / '.local' / 'voice-conversation-backend' / VOICE_COMMIT[:7]
    if not target.resolve().is_relative_to(root):
        raise RuntimeError('Conversation snapshot must stay inside the capstone checkout.')
    before = memory_state(reference)
    commit = _git(reference, 'rev-parse', f'{VOICE_COMMIT}^{{commit}}').decode().strip()
    if commit != VOICE_COMMIT:
        raise RuntimeError('The pinned conversation commit is unavailable.')
    marker = target / 'local-snapshot.json'
    if target.exists():
        if not marker.is_file():
            raise RuntimeError('Existing snapshot folder has no manifest; it was left untouched.')
        manifest = json.loads(marker.read_text(encoding='utf-8'))
        if manifest.get('commit') != VOICE_COMMIT:
            raise RuntimeError('Existing snapshot commit differs; it was left untouched.')
        for name, digest in manifest['files'].items():
            path = target / name
            if not path.resolve().is_relative_to(target.resolve()):
                raise RuntimeError('Invalid snapshot path.')
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise RuntimeError(f'Conversation snapshot changed: {name}')
    else:
        data = _git(reference, 'archive', '--format=tar', VOICE_COMMIT, *EXPORT_PATHS)
        hashes = {}
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            members = archive.getmembers()
            for member in members:
                name = PurePosixPath(member.name)
                if name.is_absolute() or '..' in name.parts or member.issym() or member.islnk():
                    raise RuntimeError('Unsafe archive path; no snapshot was extracted.')
                if not (target / member.name).resolve().is_relative_to(target.resolve()):
                    raise RuntimeError('Archive path left the snapshot folder.')
            for member in members:
                path = target / member.name
                if member.isdir():
                    path.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    content = archive.extractfile(member).read()
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(content)
                    hashes[member.name] = hashlib.sha256(content).hexdigest()
        manifest = {'commit': VOICE_COMMIT, 'files': hashes, 'memory_before': before}
        marker.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    after = memory_state(reference)
    if before != after:
        raise RuntimeError('Memory checkout state changed while preparing the snapshot.')
    if not (target / 'app' / 'api' / 'v1' / 'voice.py').is_file():
        raise RuntimeError('Conversation snapshot has no voice routes.')
    return target


if __name__ == '__main__':
    path = prepare_voice_backend(Path(__file__).resolve().parents[1])
    print(f'Conversation backend ready: {path}; memory checkout unchanged.')
