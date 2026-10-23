"""Extract one encrypted checkpoint as data, using the standard library only.

No supplied file is imported, interpreted, or executed. The caller has already
bound the artifact's repository/run identity and SHA256 before invoking this
helper. Neither checkpoint bytes nor exceptions are printed.
"""

import json
import os
import stat
import struct
import sys
import zipfile


MAXIMUM_BYTES = 24 * 1024 * 1024
MAXIMUM_INPUT_BYTES = 16 * 1024
ENTRY_NAME = "checkpoint.json"
ENTRY_BYTES = b"checkpoint.json"
LOCAL_HEADER = struct.Struct("<4s5H3I2H")


def require(condition):
    if not condition:
        raise ValueError("checkpoint archive rejected")


def unique_object(pairs):
    result = {}
    for name, value in pairs:
        require(name not in result)
        result[name] = value
    return result


def safe_parent(value):
    """Open every absolute parent component without following a symlink."""
    require(isinstance(value, str) and 1 < len(value) <= 4096)
    require(value.startswith("/") and "\\" not in value)
    require(not any(ord(char) < 32 or ord(char) == 127 for char in value))
    components = value[1:].split("/")
    require(all(component not in ("", ".", "..") for component in components))
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    descriptor = os.open("/", flags)
    try:
        for component in components[:-1]:
            next_descriptor = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor, components[-1]
    except BaseException:
        os.close(descriptor)
        raise


def checked_entry(archive, archive_size, archive_bytes):
    entries = archive.infolist()
    # This also rejects directories, duplicate entries, and case collisions.
    require(len(entries) == 1)
    entry = entries[0]
    require(entry.filename == ENTRY_NAME)
    require(getattr(entry, "orig_filename", None) == ENTRY_NAME)
    require(not entry.is_dir() and not (entry.external_attr & 0x10))
    mode = (entry.external_attr >> 16) & 0xFFFF
    require(stat.S_IFMT(mode) in (0, stat.S_IFREG))
    require(not (entry.flag_bits & (0x0001 | 0x0040 | 0x2000)))
    require(entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED))
    require(0 < entry.file_size <= MAXIMUM_BYTES)
    require(0 < entry.compress_size <= archive_size)
    require(entry.file_size <= entry.compress_size * 100)
    require(entry.header_offset == 0)
    require(0 < archive.start_dir < archive_size)

    # Check the original local filename before zipfile reads the member. This
    # rejects NUL-truncated names and local/central path disagreement explicitly.
    archive_bytes.seek(entry.header_offset)
    raw_header = archive_bytes.read(LOCAL_HEADER.size)
    require(len(raw_header) == LOCAL_HEADER.size)
    fields = LOCAL_HEADER.unpack(raw_header)
    require(fields[0] == b"PK\x03\x04")
    require(fields[2] == entry.flag_bits and fields[3] == entry.compress_type)
    require(fields[9] == len(ENTRY_BYTES))
    require(archive_bytes.read(fields[9]) == ENTRY_BYTES)
    require(LOCAL_HEADER.size + fields[9] + fields[10]
            + entry.compress_size <= archive.start_dir)
    return entry


def extract(options):
    require(type(options) is dict and set(options) == {"archive", "destination"})
    archive_parent = destination_parent = archive_descriptor = None
    created = False
    destination_name = None
    try:
        archive_parent, archive_name = safe_parent(options["archive"])
        archive_descriptor = os.open(
            archive_name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
            dir_fd=archive_parent,
        )
        information = os.fstat(archive_descriptor)
        require(stat.S_ISREG(information.st_mode)
                and 0 < information.st_size <= MAXIMUM_BYTES)
        destination_parent, destination_name = safe_parent(options["destination"])
        with os.fdopen(archive_descriptor, "rb") as archive_bytes:
            archive_descriptor = None
            with zipfile.ZipFile(archive_bytes, "r") as archive:
                entry = checked_entry(archive, information.st_size, archive_bytes)
                output_descriptor = os.open(
                    destination_name,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                    0o600, dir_fd=destination_parent,
                )
                created = True
                size = 0
                with os.fdopen(output_descriptor, "wb") as output:
                    with archive.open(entry, "r") as source:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            size += len(chunk)
                            require(size <= MAXIMUM_BYTES and size <= entry.file_size)
                            output.write(chunk)
                    require(size == entry.file_size)
                    output.flush()
                    os.fsync(output.fileno())
        return {"schemaVersion": 1, "size": size}
    except BaseException:
        if created:
            try:
                os.unlink(destination_name, dir_fd=destination_parent)
            except OSError:
                pass
        raise
    finally:
        for descriptor in (archive_descriptor, archive_parent, destination_parent):
            if descriptor is not None:
                os.close(descriptor)


def main():
    require(len(sys.argv) == 1)
    raw = sys.stdin.buffer.read(MAXIMUM_INPUT_BYTES + 1)
    require(0 < len(raw) <= MAXIMUM_INPUT_BYTES)
    options = json.loads(raw, object_pairs_hook=unique_object)
    result = extract(options)
    sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        sys.stderr.write("체크포인트 압축 자료를 안전하게 읽을 수 없습니다.\n")
        sys.exit(1)
