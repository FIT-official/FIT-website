"""Verify a teacher-downloaded FIT backup, then optionally save a dated E: copy.

No network access or credentials. Never changes server records or the download.
Usage: python scripts/verify-workshop-backup.py downloaded.zip --save
"""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
import xml.etree.ElementTree as ET
import zipfile

SGT = timezone(timedelta(hours=8))
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
FORBIDDEN_KEYS = {'password', 'passwordHash', 'sessionToken', 'token', 'cookie', 'studentLogin', 'loginDetails', 'classLink', 'payloadHash', 'requestId', 'credentials'}
KINDS = ('feedback', 'refinement', 'trash', 'audit', 'draft', 'draftSnapshots', 'assignment')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def hash_stream(stream):
    digest, size = hashlib.sha256(), 0
    while True:
        block = stream.read(1024 * 1024)
        if not block:
            return digest.hexdigest(), size
        digest.update(block)
        size += len(block)


def hash_file(path):
    with path.open('rb') as stream:
        return hash_stream(stream)[0]


def safe_names(archive):
    names = archive.namelist()
    require(len(names) == len(set(names)), 'Duplicate ZIP names')
    for name in names:
        parts = PurePosixPath(name)
        require(not parts.is_absolute() and '..' not in parts.parts and '\\' not in name and ':' not in name, 'Unsafe ZIP path')
        require(not name.endswith('/'), 'Unexpected directory entry')
    return names


def inspect_fields(value):
    if isinstance(value, dict):
        require(not (FORBIDDEN_KEYS & value.keys()), 'Unexpected credential field in backup')
        for nested in value.values():
            inspect_fields(nested)
    elif isinstance(value, list):
        for nested in value:
            inspect_fields(nested)


def verify_workbook(outer, file, temp_root):
    # A disk-backed temporary file permits ZIP seeking without loading a large
    # workbook into RAM. Temporary files stay on the specified E: workspace.
    with tempfile.TemporaryFile(dir=temp_root) as temp:
        with outer.open(file['name']) as source:
            shutil.copyfileobj(source, temp, 1024 * 1024)
        temp.seek(0)
        with zipfile.ZipFile(temp) as book:
            safe_names(book)
            relationships = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
            targets = {row.attrib['Id']: row.attrib['Target'] for row in relationships}
            sheets = ET.fromstring(book.read('xl/workbook.xml')).find(NS + 'sheets')
            counts = {}
            for sheet in sheets:
                name = sheet.attrib['name']
                target = targets[sheet.attrib[REL]]
                path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
                rows, frozen, filtered = 0, False, False
                with book.open(path) as stream:
                    for _, element in ET.iterparse(stream, events=('end',)):
                        require(element.tag != NS + 'f', 'Unexpected Excel formula')
                        if element.tag == NS + 'pane':
                            frozen = element.attrib.get('state') == 'frozen'
                        if element.tag == NS + 'autoFilter':
                            filtered = True
                        if element.tag == NS + 'row':
                            rows += 1
                        element.clear()
                require(frozen, 'Missing frozen header: ' + name)
                if name != 'Overview':
                    require(filtered, 'Missing worksheet filter: ' + name)
                    counts[name] = max(0, rows - 1)
            require(counts == file['sheetRows'], 'Workbook row count mismatch')
            require(sum(counts.values()) == file['dataRows'], 'Workbook total row count mismatch')
            return counts


def verify(download, temp_root):
    counts = dict.fromkeys(KINDS, 0)
    with zipfile.ZipFile(download) as archive:
        names = safe_names(archive)
        require('manifest.json' in names, 'Incomplete download: no manifest')
        manifest = json.loads(archive.read('manifest.json'))
        require(manifest.get('format') == 'fit-workshop-backup-v1' and manifest.get('complete') is True, 'Unsupported or incomplete backup')
        require(manifest.get('credentialsIncluded') is False and manifest.get('fullTextArchive') is True, 'Unexpected backup privacy contract')
        files = manifest['files']
        require(len(files) == len({file['name'] for file in files}), 'Duplicate manifest entries')
        require(set(names) == {'manifest.json'} | {file['name'] for file in files}, 'File list mismatch')
        workbook_parts, archive_parts, workbook_rows = 0, 0, {}
        for file in files:
            with archive.open(file['name']) as stream:
                digest, size = hash_stream(stream)
            require(digest == file['sha256'] and size == file['bytes'], 'File hash or length mismatch: ' + file['name'])
            if file['name'].endswith('.xlsx'):
                workbook_parts += 1
                for name, total in verify_workbook(archive, file, temp_root).items():
                    workbook_rows[name] = workbook_rows.get(name, 0) + total
            elif file['name'].endswith('.jsonl'):
                archive_parts += 1
                number = 0
                with archive.open(file['name']) as raw:
                    for line in io.TextIOWrapper(raw, encoding='utf-8', errors='strict'):
                        require(line.endswith('\n'), 'Incomplete archive record')
                        record = json.loads(line)
                        inspect_fields(record)
                        kind = 'trash' if record.get('status') == 'deleted' else record['type']
                        require(kind in counts and kind != 'draftSnapshots', 'Unknown record kind')
                        counts[kind] += 1
                        if kind == 'draft':
                            counts['draftSnapshots'] += len(record['snapshots'])
                        number += 1
                require(number == file['records'], 'Archive record count mismatch')
            else:
                require(file['name'] == 'README.txt', 'Unexpected backup file')
        require(counts == manifest['actual'], 'Complete-record counts differ from archive')
        require(all(counts.get(key) == value for key, value in manifest['expected'].items()), 'Snapshot counts differ from archive')
        require(workbook_parts == manifest['workbookParts'] and archive_parts == manifest['archiveParts'], 'Part counts mismatch')
        require(workbook_rows.get('Feedback') == counts['feedback'] and workbook_rows.get('Drafts') == counts['draft'] and workbook_rows.get('Draft history') == counts['draftSnapshots'] and workbook_rows.get('Tinkercad mapping') == counts['assignment'], 'Readable sheet counts differ from archive')
    return {'verified': True, 'verifiedAt': datetime.now(timezone.utc).isoformat(), 'capturedAt': manifest['capturedAt'], 'session': manifest['session'], 'counts': counts, 'workbookRows': workbook_rows, 'workbookParts': workbook_parts, 'archiveParts': archive_parts, 'zipSha256': hash_file(download), 'filesVerified': len(files), 'formulasFound': 0, 'serverRecordsChanged': False, 'futureResponsesIncluded': False}


def private_directory(path):
    path.mkdir(parents=True, exist_ok=False)
    if os.name == 'nt':
        identity = subprocess.check_output(['whoami', '/user', '/fo', 'csv', '/nh'], text=True)
        sid = next(csv.reader(io.StringIO(identity.strip())))[1]
        subprocess.run(['icacls', str(path), '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], check=True, capture_output=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('download', type=Path)
    parser.add_argument('--save', action='store_true', help='Save a verified dated copy and extracted workbooks')
    parser.add_argument('--destination', type=Path, default=Path('E:/FIT Workshop/Backups'))
    parser.add_argument('--temp-root', type=Path, default=Path('E:/Codex-FIT-backup-tests-20261009/temp'))
    args = parser.parse_args()
    args.temp_root.mkdir(parents=True, exist_ok=True)
    require(args.download.is_file(), 'Download not found')
    receipt = verify(args.download, args.temp_root)
    if args.save:
        date = datetime.now(SGT).strftime('%Y-%m-%d_%H%M%S_%f_SGT')
        target = args.destination.resolve() / date
        require(target.parent == args.destination.resolve(), 'Invalid destination')
        private_directory(target)
        copy = target / args.download.name
        with args.download.open('rb') as source, copy.open('xb') as output:
            shutil.copyfileobj(source, output, 1024 * 1024)
        require(hash_file(copy) == receipt['zipSha256'], 'Saved ZIP failed verification')
        with zipfile.ZipFile(copy) as archive:
            for name in safe_names(archive):
                item = target.joinpath(*PurePosixPath(name).parts)
                require(item.resolve().is_relative_to(target.resolve()), 'Invalid extraction target')
                item.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(name) as source, item.open('xb') as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
        receipt.update(savedTo=str(target), savedZip=str(copy), originalDownloadPreserved=True)
        (target / 'VERIFIED.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
