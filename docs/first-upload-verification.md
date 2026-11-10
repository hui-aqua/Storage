# 第一阶段：5 MiB 文件上传验证

## 范围

此阶段验证 multipart 上传、Bearer API Key、元数据校验、10 MiB 大小上限、本地落盘与 SHA-256 响应。采用确定性 5 MiB 测试文件，不含真实海上平台数据。

## 运行

按照仓库 README 的“本地上传验证”步骤启动 API 并运行 `scripts/verify_local_upload.ps1`。应得到 5,242,880 字节和 SHA-256 `2e7cab6314e9614b6f2da12630661c3038e5592025f6534ba5823c3b340a1cb6`。随后检查响应 `path` 指向的文件存在。

## 后续接入 GitHub

本验证服务有意使用本地存储。实际 GitHub 写入需要已创建的目标仓库与针对二进制数据选定的存储机制；GitHub Contents API 不作为此 5 MiB 文件的上传路径。配置 GitHub 目标后再进行远端往返上传与下载校验。
