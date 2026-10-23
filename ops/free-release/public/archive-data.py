"""Trusted, standard-library ZIP data handling for the public signing job.

Never imports or executes a file from the supplied artifact/APK. All paths are
validated before extraction, and every extraction creates a new regular file.
"""
import hashlib
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path

MAX_OUTER_BYTES = 450_000_000
MAX_APK_UNPACKED_BYTES = 1_500_000_000
MAX_PAYLOAD_BYTES = 1_000_000_000
MAX_ENTRY_BYTES = 100_000_000
MAX_ENTRIES = 25_000
SHA256 = re.compile(r"^[a-f0-9]{64}$")
LIVE_UPDATE = b"Lio/capawesome/capacitorjs/plugins/liveupdate/LiveUpdatePlugin;"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_path(value, directory=False):
    require(isinstance(value, str) and 0 < len(value) <= 500, "압축 경로 형식이 올바르지 않습니다.")
    require(not any(ord(char) < 32 or ord(char) == 127 for char in value), "압축 경로에 제어 문자가 있습니다.")
    require("\\" not in value and ":" not in value and not value.startswith("/"), "절대 경로나 다른 운영체제 경로를 허용하지 않습니다.")
    if directory:
        value = value[:-1] if value.endswith("/") else value
    pieces = value.split("/")
    require(all(piece not in ("", ".", "..") for piece in pieces), "압축 경로 이탈을 허용하지 않습니다.")
    return value


def checked_entries(archive, maximum_total):
    entries = archive.infolist()
    require(len(entries) <= MAX_ENTRIES, "압축 파일 수가 허용 범위를 초과했습니다.")
    seen = set()
    total = 0
    for entry in entries:
        require(getattr(entry, "orig_filename", entry.filename) == entry.filename, "압축 원본 경로에 잘린 문자가 있습니다.")
        name = safe_path(entry.filename, entry.is_dir())
        normalized = name.casefold()
        require(normalized not in seen, "중복되거나 대소문자가 충돌하는 압축 경로입니다.")
        seen.add(normalized)
        mode = (entry.external_attr >> 16) & 0xFFFF
        kind = stat.S_IFMT(mode)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), "압축의 링크나 특수 파일을 허용하지 않습니다.")
        require(not (entry.flag_bits & 1), "암호화된 압축 자료를 허용하지 않습니다.")
        require(entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "지원하지 않는 압축 방식입니다.")
        require(0 <= entry.file_size <= MAX_ENTRY_BYTES or name == "unsigned.apk", "압축 항목 크기가 허용 범위를 초과했습니다.")
        total += entry.file_size
        require(total <= maximum_total, "압축 해제량이 허용 범위를 초과했습니다.")
        if entry.file_size > 1_000_000:
            require(entry.compress_size > 0 and entry.file_size <= entry.compress_size * 2000, "과도한 압축 비율을 허용하지 않습니다.")
    return entries


def copy_entry(archive, entry, destination, maximum, expected_size=None, expected_hash=None):
    require(entry.file_size <= maximum, "압축 항목의 크기 제한을 초과했습니다.")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    size = 0
    digest = hashlib.sha256()
    with os.fdopen(descriptor, "wb") as output, archive.open(entry, "r") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            require(size <= maximum, "실제 압축 해제량이 제한을 초과했습니다.")
            digest.update(chunk)
            output.write(chunk)
    require(size == entry.file_size, "압축 항목의 선언 크기와 실제 크기가 다릅니다.")
    if expected_size is not None:
        require(size == expected_size, "APK 파일 크기가 전달 목록과 다릅니다.")
    if expected_hash is not None:
        require(digest.hexdigest() == expected_hash, "APK 파일 SHA256이 전달 목록과 다릅니다.")


def read_small(archive, name, maximum):
    entry = archive.getinfo(name)
    require(not entry.is_dir() and entry.file_size <= maximum, "필수 APK 메타데이터가 없거나 너무 큽니다.")
    with archive.open(entry, "r") as source:
        value = source.read(maximum + 1)
    require(len(value) == entry.file_size and len(value) <= maximum, "필수 메타데이터의 실제 크기가 다릅니다.")
    return value


def read_index(file_name):
    raw = Path(file_name).read_bytes()
    require(len(raw) <= 4 * 1024 * 1024, "웹 파일 목록이 너무 큽니다.")
    data = json.loads(raw)
    require(isinstance(data, dict) and data.get("schemaVersion") == 1 and isinstance(data.get("files"), list), "웹 파일 목록 형식이 다릅니다.")
    files = data["files"]
    require(0 < len(files) <= MAX_ENTRIES, "웹 파일 목록 수가 허용 범위를 초과했습니다.")
    previous = None
    seen = set()
    total = 0
    for item in files:
        require(isinstance(item, dict), "웹 파일 항목이 올바르지 않습니다.")
        name = safe_path(item.get("path"))
        require(previous is None or previous < name, "웹 파일 목록은 중복 없이 정렬되어야 합니다.")
        previous = name
        require(name.casefold() not in seen, "웹 파일 경로가 충돌합니다.")
        seen.add(name.casefold())
        require(type(item.get("size")) is int and 0 <= item["size"] <= MAX_ENTRY_BYTES, "웹 파일 크기 형식이 다릅니다.")
        require(isinstance(item.get("sha256"), str) and SHA256.fullmatch(item["sha256"]), "웹 파일 SHA256 형식이 다릅니다.")
        require(not re.search(r"\.(pem|keystore|jks|p12|pfx)$", name, re.I), "서명 자료를 웹 배포에 포함할 수 없습니다.")
        total += item["size"]
        require(total <= MAX_PAYLOAD_BYTES, "웹 파일 총량이 허용 범위를 초과했습니다.")
    return files


def outer(options):
    target = Path(options["destination"])
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    with zipfile.ZipFile(options["archive"], "r") as archive:
        entries = checked_entries(archive, MAX_OUTER_BYTES + 5 * 1024 * 1024)
        require(len(entries) == 3 and {entry.filename for entry in entries} == {"unsigned.apk", "release.json", "payload-index.json"}, "전달 artifact에는 APK와 지정 JSON 두 개만 있어야 합니다.")
        limits = {"unsigned.apk": MAX_OUTER_BYTES, "release.json": 32 * 1024, "payload-index.json": 4 * 1024 * 1024}
        for entry in entries:
            require(not entry.is_dir(), "전달 artifact의 디렉터리를 허용하지 않습니다.")
            copy_entry(archive, entry, target / entry.filename, limits[entry.filename])
    return {"files": 3}


def payload(options):
    expected = read_index(options["index"])
    destination = Path(options["destination"]) if options.get("destination") else None
    if destination:
        destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    with zipfile.ZipFile(options["apk"], "r") as archive:
        entries = checked_entries(archive, MAX_APK_UNPACKED_BYTES)
        if options.get("requireUnsigned") is True:
            require(not any(re.fullmatch(r"META-INF/[^/]+\.(RSA|DSA|EC|SF)", entry.filename, re.I) for entry in entries), "전달 APK에 기존 서명 항목이 있습니다.")
            with Path(options["apk"]).open("rb") as apk_bytes:
                require(archive.start_dir >= 16, "APK 중앙 디렉터리 위치가 다릅니다.")
                apk_bytes.seek(archive.start_dir - 16)
                require(apk_bytes.read(16) != b"APK Sig Block 42", "전달 APK에 기존 APK 서명 블록이 있습니다.")
        actual = {entry.filename[len("assets/public/"):]: entry for entry in entries if entry.filename.startswith("assets/public/") and not entry.is_dir()}
        require(set(actual) == {item["path"] for item in expected}, "APK 웹 파일 전체 목록이 전달 목록과 다릅니다.")
        for item in expected:
            entry = actual[item["path"]]
            if destination:
                copy_entry(archive, entry, destination / item["path"], MAX_ENTRY_BYTES, item["size"], item["sha256"])
            else:
                digest = hashlib.sha256()
                size = 0
                with archive.open(entry, "r") as source:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        require(size <= MAX_ENTRY_BYTES, "APK 웹 파일 실제 크기 제한을 초과했습니다.")
                        digest.update(chunk)
                require(size == item["size"] and digest.hexdigest() == item["sha256"], "서명 뒤 APK 웹 파일이 변경됐습니다.")
        capacitor = json.loads(read_small(archive, "assets/capacitor.config.json", 128 * 1024))
        plugins = read_small(archive, "assets/capacitor.plugins.json", 256 * 1024).decode("utf-8")
        build_info = json.loads(read_small(archive, "assets/public/ota-build.json", 32 * 1024))
        has_live_update = "LiveUpdatePlugin" in plugins
        if not has_live_update:
            for entry in entries:
                if re.fullmatch(r"classes[0-9]*\.dex", entry.filename):
                    require(entry.file_size <= MAX_ENTRY_BYTES, "DEX 파일 크기 제한을 초과했습니다.")
                    tail = b""
                    with archive.open(entry, "r") as source:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            combined = tail + chunk
                            if LIVE_UPDATE in combined:
                                has_live_update = True
                                break
                            tail = combined[-len(LIVE_UPDATE):]
                if has_live_update:
                    break
        require(has_live_update, "APK에 LiveUpdate 네이티브 플러그인이 없습니다.")
    return {"capacitorConfig": capacitor, "webBuildInfo": build_info, "payloadFileCount": len(expected), "hasLiveUpdatePlugin": has_live_update}


def make_ota(options):
    expected = read_index(options["index"])
    source = Path(options["source"])
    with zipfile.ZipFile(options["output"], "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for item in expected:
            file_name = source / item["path"]
            require(file_name.is_file() and not file_name.is_symlink(), "OTA에 일반 웹 파일만 포함할 수 있습니다.")
            require(file_name.stat().st_size == item["size"], "OTA 원본 파일 크기가 다릅니다.")
            info = zipfile.ZipInfo(item["path"], date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            info.file_size = item["size"]
            digest = hashlib.sha256()
            size = 0
            with file_name.open("rb") as content, archive.open(info, "w") as output:
                while True:
                    chunk = content.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    require(size <= item["size"], "OTA 원본의 실제 크기가 다릅니다.")
                    digest.update(chunk)
                    output.write(chunk)
            require(size == item["size"] and digest.hexdigest() == item["sha256"], "OTA 원본의 SHA256이 다릅니다.")
    require(Path(options["output"]).stat().st_size <= 512 * 1024 * 1024, "OTA ZIP 크기 제한을 초과했습니다.")
    return {"files": len(expected)}


def check_ota(options):
    expected = read_index(options["index"])
    with zipfile.ZipFile(options["archive"], "r") as archive:
        entries = checked_entries(archive, MAX_PAYLOAD_BYTES)
        require(not any(entry.is_dir() for entry in entries), "OTA ZIP에는 정규 웹 파일만 있어야 합니다.")
        require({entry.filename for entry in entries} == {item["path"] for item in expected}, "OTA 웹 파일 전체 목록이 APK와 다릅니다.")
        actual = {entry.filename: entry for entry in entries}
        for item in expected:
            digest = hashlib.sha256()
            size = 0
            with archive.open(actual[item["path"]], "r") as content:
                while True:
                    chunk = content.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    require(size <= item["size"], "OTA 파일 크기 제한을 초과했습니다.")
                    digest.update(chunk)
            require(size == item["size"] and digest.hexdigest() == item["sha256"], "OTA 파일 SHA256이 APK와 다릅니다.")
    return {"files": len(expected)}


if __name__ == "__main__":
    try:
        require(len(sys.argv) == 2 and sys.argv[1] in ("outer", "payload", "ota", "ota-check"), "승인된 압축 처리 모드가 필요합니다.")
        raw = sys.stdin.buffer.read(32 * 1024 + 1)
        require(len(raw) <= 32 * 1024, "압축 처리 요청이 너무 큽니다.")
        options = json.loads(raw)
        result = {"outer": outer, "payload": payload, "ota": make_ota, "ota-check": check_ota}[sys.argv[1]](options)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        # ZIP entry strings, parser diagnostics and private input are never logs.
        print("압축 자료의 경로·형식·용량·파일 계약을 확인할 수 없습니다.", file=sys.stderr)
        sys.exit(1)
