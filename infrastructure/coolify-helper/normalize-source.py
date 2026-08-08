#!/usr/bin/env python3
"""Normalize high-confidence legacy source text inside a disposable build checkout."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

import chardet

ELIGIBLE_EXTENSIONS = {
	'.c', '.cc', '.conf', '.cpp', '.cs', '.css', '.csv', '.env', '.go', '.h',
	'.hpp', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.kt', '.kts',
	'.less', '.lua', '.md', '.mjs', '.php', '.properties', '.py', '.rb', '.rs',
	'.sass', '.scss', '.sh', '.sql', '.svelte', '.toml', '.ts', '.tsx', '.txt',
	'.vue', '.xml', '.yaml', '.yml',
}
ELIGIBLE_NAMES = {'Dockerfile', 'Procfile', 'Makefile', 'Gemfile', 'Rakefile'}
IGNORED_DIRECTORIES = {
	'.git', '.ghostdeploy', '.next', '.nuxt', '.output', 'build', 'coverage',
	'dist', 'node_modules', 'storage', 'vendor',
}
MAXIMUM_FILE_SIZE = 2 * 1024 * 1024
SUPPORTED_ENCODINGS = {
	'ascii': 'ascii',
	'big5': 'big5',
	'euc-jp': 'euc_jp',
	'gb2312': 'gb18030',
	'gbk': 'gb18030',
	'iso-8859-1': 'latin1',
	'iso-8859-2': 'iso8859_2',
	'shift_jis': 'shift_jis',
	'utf-16': 'utf-16',
	'utf-16be': 'utf-16-be',
	'utf-16le': 'utf-16-le',
	'utf-32': 'utf-32',
	'utf-32be': 'utf-32-be',
	'utf-32le': 'utf-32-le',
	'windows-1250': 'cp1250',
	'windows-1251': 'cp1251',
	'windows-1252': 'cp1252',
}
CP1252_DEFINED_CONTROLS = {
	0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x8B,
	0x8C, 0x8E, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99,
	0x9A, 0x9B, 0x9C, 0x9E, 0x9F,
}


def digest(value: bytes) -> str:
	"""Return a stable checksum without logging file contents."""
	return hashlib.sha256(value).hexdigest()


def printable_ratio(value: str) -> float:
	"""Estimate whether decoded content remains plausible source text."""
	if not value:
		return 1.0
	printable = sum(character.isprintable() or character in '\r\n\t' for character in value)
	return printable / len(value)


def detected_encoding(value: bytes) -> tuple[str, float] | None:
	"""Choose an encoding only when evidence is sufficiently strong."""
	try:
		value.decode('utf-8', errors='strict')
		return None
	except UnicodeDecodeError:
		pass
	if b'\x00' in value:
		for bom, encoding in (
			(b'\xff\xfe\x00\x00', 'utf-32'),
			(b'\x00\x00\xfe\xff', 'utf-32'),
			(b'\xff\xfe', 'utf-16'),
			(b'\xfe\xff', 'utf-16'),
		):
			if value.startswith(bom):
				return encoding, 1.0
		return None
	controls = {byte for byte in value if 0x80 <= byte <= 0x9F}
	if controls and controls.issubset(CP1252_DEFINED_CONTROLS):
		return 'cp1252', 0.95
	detection = chardet.detect(value)
	label = str(detection.get('encoding') or '').lower()
	confidence = float(detection.get('confidence') or 0)
	encoding = SUPPORTED_ENCODINGS.get(label)
	return (encoding, confidence) if encoding and confidence >= 0.8 else None


def candidate_files(root: Path):
	"""Yield bounded source-like files while excluding dependencies and artifacts."""
	for path in root.rglob('*'):
		if not path.is_file() or any(part in IGNORED_DIRECTORIES for part in path.parts):
			continue
		if path.name not in ELIGIBLE_NAMES and path.suffix.lower() not in ELIGIBLE_EXTENSIONS:
			continue
		if path.stat().st_size <= MAXIMUM_FILE_SIZE:
			yield path


def normalize(root: Path) -> list[dict[str, object]]:
	"""Convert safe files in place and preserve originals outside the build context."""
	backup_root = root.parent / f'{root.name}-charset-backup'
	manifest: list[dict[str, object]] = []
	for path in candidate_files(root):
		original = path.read_bytes()
		detection = detected_encoding(original)
		if not detection:
			continue
		encoding, confidence = detection
		try:
			decoded = original.decode(encoding, errors='strict')
		except (LookupError, UnicodeDecodeError) as error:
			raise RuntimeError(f'Unable to safely decode {path.relative_to(root)} as {encoding}.') from error
		if printable_ratio(decoded) < 0.9 or decoded.encode(encoding, errors='strict') != original:
			raise RuntimeError(f'Encoding for {path.relative_to(root)} is ambiguous; no conversion was applied.')
		converted = decoded.encode('utf-8')
		relative = path.relative_to(root)
		backup = backup_root / relative
		backup.parent.mkdir(parents=True, exist_ok=True)
		shutil.copyfile(path, backup)
		path.write_bytes(converted)
		entry = {
			'path': relative.as_posix(),
			'from': encoding,
			'to': 'utf-8',
			'confidence': round(confidence, 3),
			'originalSha256': digest(original),
			'convertedSha256': digest(converted),
		}
		manifest.append(entry)
		print(f'GHOSTDEPLOY_CHARSET_FIX {json.dumps(entry, separators=(",", ":"))}', flush=True)
	if manifest:
		manifest_path = root / '.ghostdeploy' / 'charset-manifest.json'
		manifest_path.parent.mkdir(parents=True, exist_ok=True)
		manifest_path.write_text(json.dumps({'version': 1, 'files': manifest}, indent=2), encoding='utf-8')
		(backup_root / 'manifest.json').write_text(json.dumps({'version': 1, 'files': manifest}, indent=2), encoding='utf-8')
		print(f'GHOSTDEPLOY_CHARSET_SUMMARY converted={len(manifest)} repository_modified=false', flush=True)
	return manifest


def main() -> int:
	"""Validate the source root and run one deterministic normalization pass."""
	if len(sys.argv) != 2:
		print('GhostDeploy charset normalizer requires one source directory.', file=sys.stderr)
		return 2
	root = Path(sys.argv[1]).resolve()
	if not root.is_dir() or root.parent != Path('/artifacts'):
		print('GhostDeploy charset normalizer rejected an unsafe source directory.', file=sys.stderr)
		return 2
	try:
		normalize(root)
	except RuntimeError as error:
		print(f'GHOSTDEPLOY_CHARSET_ERROR {error}', file=sys.stderr)
		return 2
	return 0


if __name__ == '__main__':
	raise SystemExit(main())
