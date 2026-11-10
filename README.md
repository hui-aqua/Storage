# M5Stack Marine Data Logger

本仓库从第一阶段验证起步：CoreS3 测量数据以 multipart/form-data 上传至 FastAPI，先在本地目录落盘，并核对 5 MiB BIN 文件大小及 SHA-256。GitHub 远程数据存储尚未接入。

## GitHub Pages 仪表盘

仪表盘源码位于 `dashboard/`，会由 GitHub Actions 部署到 [https://hui-aqua.github.io/Storage/](https://hui-aqua.github.io/Storage/)。它从 `data/index.json` 读取公开测量索引，并展示测量列表、三轴波形、原始文件下载和上传记录。初始索引为空，等上传服务写入文件与元数据后会自动展示。

仓库 Settings → Pages 的 Build and deployment Source 需要设为 **GitHub Actions**。工作流在每次仪表盘或索引更新时自动构建部署。

## 本地上传验证

需要 Python 3.10+。在仓库根目录运行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python scripts/make_test_file.py
$env:DEVICE_API_KEY = 'dev-test-key'
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

另开一个 PowerShell 窗口，运行：

```powershell
.\scripts\verify_local_upload.ps1
```

预期响应：`status=success`、`size_bytes=5242880`、SHA-256 与生成脚本输出一致。重复发送相同文件具有幂等性；同名不同内容返回 HTTP 409。测试数据位于 `data/samples/` 并被 Git 忽略；接收文件位于 `data/uploads/` 并被 Git 忽略。

开发默认 API Key 仅用于本机测试。正式部署必须设置 `DEVICE_API_KEY`，并启用 HTTPS。`storage=local-test` 明确表示当前未写入 GitHub。

仪表盘索引和支持的原始波形格式见 [docs/dashboard-data-format.md](docs/dashboard-data-format.md)。CoreS3 的实际二进制编码尚未确定；接入真机数据前需让固件、API 元数据与仪表盘解码格式一致。
