"""Exercise FastAPI upload handler with temporary disk storage; no live service needed."""
import asyncio
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import zlib
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import main
from fastapi import HTTPException, UploadFile

def fixture(hz=1, count=5, version=2):
    header = bytearray(32 if version == 1 else 75)
    if version == 1:
        struct.pack_into('<8sHHHH16s', header, 0, b'CS3SUM01', 1, 32, 90, 0, b'CS3_03')
    else:
        struct.pack_into('<8sHHHH16s16s21sBBI', header, 0, b'CS3SUM01', version, 75, 90,
                         hz if version == 3 else 0, b'CS3_03', b'1.0.0',
                         b'2026-11-11T00:00:00Z', 1, 1 if version == 3 else 0, 0)
    records = bytearray(90 * count)
    for i in range(count):
        window = i + 1 if version == 3 else i
        struct.pack_into('<QQIH', records, i * 90, 1794355200000 + window * 1000 // hz,
                         window * 1000000 // hz, i, 100 // hz)
        struct.pack_into('<H', records, i * 90 + 88, 35 if version == 3 else 32)
    return bytes(header + records)

async def run():
    original = main.DATA_DIR
    with tempfile.TemporaryDirectory() as temp:
        main.DATA_DIR = Path(temp)
        async def send(content, hz=1, **changes):
            fields = dict(device_id='CS3_03', timestamp='2026-11-11T00:00:00Z',
                          sampling_frequency=hz, summary_hz=hz, measurement_type='motion_summary',
                          file_format=f'cs3_summary_v{struct.unpack_from("<H", content, 8)[0]}', date='2026-11-11',
                          crc32=f'{zlib.crc32(content):08x}', size_bytes=str(len(content)),
                          authorization=f'Bearer {main.DEVICE_API_KEY}')
            fields.update(changes)
            return await main.upload(file=UploadFile(filename='summary.bin', file=io.BytesIO(content)), **fields)
        first = await send(fixture())
        assert first['status'] == 'STORED'
        assert (await send(fixture()))['status'] == 'ALREADY_EXISTS'
        second = await send(fixture(count=8))
        assert second['status'] == 'STORED' and second['path'] != first['path']
        assert Path(first['path']).read_bytes() == fixture()
        assert json.loads(Path(first['path']).with_suffix('.metadata.json').read_text())['summary_hz'] == 1
        assert (await send(fixture(hz=10), hz=10))['summary_hz'] == 10
        assert (await send(fixture(count=0)))['record_count'] == 0
        assert (await send(fixture(version=1, hz=10), hz=10))['file_format'] == 'cs3_summary_v1'
        v3 = await send(fixture(version=3))
        assert v3['status'] == 'STORED' and v3['time_basis'] == 1 and v3['summary_hz'] == 1
        assert v3['timestamp_semantics'] == 'exclusive completed-window end'
        assert (await send(fixture(version=3)))['status'] == 'ALREADY_EXISTS'
        assert (await send(fixture(version=3, count=8)))['path'] != v3['path']
        for invalid in [fixture(version=3, count=0), fixture(version=3, hz=10)]:
            try:
                await send(invalid, hz=10 if struct.unpack_from('<H', invalid, 14)[0] == 10 else 1)
            except HTTPException as error:
                assert error.status_code == 422
            else:
                raise AssertionError('invalid v3 accepted')
        basis = bytearray(fixture(version=3))
        basis[70] = 0
        try:
            await send(bytes(basis))
        except HTTPException as error:
            assert error.status_code == 422
        else:
            raise AssertionError('invalid time_basis accepted')
        for changes in [dict(crc32='00000000'), dict(size_bytes='1'), dict(summary_hz=2), dict(device_id='CS3_02')]:
            try:
                await send(fixture(), **changes)
            except HTTPException as error:
                assert error.status_code == 422
            else:
                raise AssertionError(changes)
        assert first['sha256'] == hashlib.sha256(fixture()).hexdigest()
    main.DATA_DIR = original
    print('PASS: FastAPI v1/v2/v3, v3 header/metadata validation, CRC, sidecars, duplicates and coexisting partial snapshots')

if __name__ == '__main__':
    asyncio.run(run())
