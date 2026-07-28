
"""
PDF 公告下载与文本提取工具
依赖: PyMuPDF (fitz)
安装: pip install PyMuPDF

接收一个 PDF URL，下载并提取纯文本输出到 stdout
供 collect.js 通过 child_process 调用

用法: python pdf_extract.py <url>
成功: 输出纯文本到 stdout, exit 0
失败: 输出错误到 stderr, exit 1
"""

import sys
import os
import tempfile
import urllib.request

def extract_pdf_text(url):
    """下载 PDF 并提取文本"""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        pdf_data = resp.read()

    if len(pdf_data) < 100:
        raise ValueError(f"PDF 文件过小 ({len(pdf_data)} bytes)，可能不是有效 PDF")

    # 写入临时文件
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
        f.write(pdf_data)
        temp_path = f.name

    try:
        import fitz  # PyMuPDF
        doc = fitz.open(temp_path)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        full_text = '\n'.join(text_parts).strip()

        if len(full_text) < 50:
            raise ValueError(f"提取文本过少 ({len(full_text)} 字符)，PDF 可能是扫描件")

        return full_text
    finally:
        os.unlink(temp_path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: pdf_extract.py <url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    try:
        text = extract_pdf_text(url)
        # 直接输出到 stdout，供 Node.js 捕获
        sys.stdout.buffer.write(text.encode('utf-8'))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
