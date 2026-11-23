export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function buildRecordHtml(content) {
  const paragraphs = String(content ?? '').split(/\r?\n/)
    .map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tóm tắt hồ sơ demo</title>
    <style>
      @page { margin: 24mm 18mm; }
      body { color: #26314f; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; }
      h1 { color: #245cff; font-size: 18pt; }
      .notice { color: #52617b; font-size: 10pt; margin: 0 0 18pt; }
      p { margin: 0 0 8pt; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <h1>Tóm tắt hồ sơ tham khảo</h1>
    <p class="notice">BẢN DEMO · Không phải hồ sơ bệnh án hoặc tư vấn y tế.</p>
    <section>${paragraphs}</section>
  </body>
</html>`;
}

function exportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function createAndShareMedicalRecord(content, { printToFileAsync, isSharingAvailable, shareAsync }) {
  let shareAvailable = false;
  try {
    shareAvailable = await isSharingAvailable();
  } catch {
    throw exportError('SHARING_UNAVAILABLE', 'Chia sẻ tệp chưa khả dụng trên thiết bị này.');
  }
  if (!shareAvailable) {
    throw exportError('SHARING_UNAVAILABLE', 'Chia sẻ tệp chưa khả dụng trên thiết bị này.');
  }

  let file;
  try {
    file = await printToFileAsync({ html: buildRecordHtml(content) });
  } catch {
    throw exportError('PDF_GENERATION_FAILED', 'Không tạo được PDF cục bộ. Hãy thử lại.');
  }
  if (typeof file?.uri !== 'string' || !file.uri.startsWith('file://')) {
    throw exportError('PDF_GENERATION_FAILED', 'Không tạo được tệp PDF cục bộ. Hãy thử lại.');
  }

  try {
    await shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: '.pdf',
      dialogTitle: 'Chia sẻ hồ sơ demo',
    });
  } catch {
    throw exportError('SHARING_FAILED', 'PDF đã được tạo cục bộ nhưng không mở được bảng chia sẻ. Bạn có thể thử lại.');
  }
}
