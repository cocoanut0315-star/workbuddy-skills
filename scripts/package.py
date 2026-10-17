#!/usr/bin/env python3
"""Build the public skill ZIP from an explicit file allowlist."""
import argparse
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

FILES = ('SKILL.md', 'references/tools.md', 'scripts/workspace.mjs', 'LICENSE')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / 'skills' / 'branch-official-import'
    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / 'branch-official-import.zip'
    with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
        for relative in FILES:
            info = ZipInfo('branch-official-import/' + relative, (2026, 10, 17, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            file = source.parents[1] / 'LICENSE' if relative == 'LICENSE' else source / relative
            archive.writestr(info, file.read_bytes())
    with ZipFile(target) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {'branch-official-import/' + f for f in FILES}
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (args.output / 'SHA256SUMS').write_text(f'{digest}  {target.name}\n', encoding='utf-8')
    print(f'{digest}  {target.name}')

if __name__ == '__main__':
    main()
