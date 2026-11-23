import { buildRecordHtml, createAndShareMedicalRecord } from './medical-record-export';

test('escapes profile text before building a standalone PDF document', () => {
  const html = buildRecordHtml('Demo <profile> & "record"\nIt\'s local.');

  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('lang="vi"');
  expect(html).toContain('&lt;profile&gt; &amp; &quot;record&quot;');
  expect(html).toContain('It&#39;s local.');
  expect(html).toContain('Không phải hồ sơ bệnh án');
  expect(html).not.toContain('<profile>');
});

test('generates a local PDF and opens the share sheet with PDF metadata', async () => {
  const printToFileAsync = jest.fn().mockResolvedValue({ uri: 'file:///cache/record.pdf' });
  const isSharingAvailable = jest.fn().mockResolvedValue(true);
  const shareAsync = jest.fn().mockResolvedValue(undefined);

  await createAndShareMedicalRecord('Demo profile', { printToFileAsync, isSharingAvailable, shareAsync });

  expect(printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('Demo profile') }));
  expect(shareAsync).toHaveBeenCalledWith('file:///cache/record.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
});

test('does not create a file when the device cannot share files', async () => {
  const printToFileAsync = jest.fn();
  const isSharingAvailable = jest.fn().mockResolvedValue(false);
  const shareAsync = jest.fn();

  await expect(createAndShareMedicalRecord('Demo profile', { printToFileAsync, isSharingAvailable, shareAsync }))
    .rejects.toMatchObject({ code: 'SHARING_UNAVAILABLE' });

  expect(printToFileAsync).not.toHaveBeenCalled();
  expect(shareAsync).not.toHaveBeenCalled();
});

test('reports PDF generation and share failures without logging profile content', async () => {
  const isSharingAvailable = jest.fn().mockResolvedValue(true);
  const shareAsync = jest.fn();
  await expect(createAndShareMedicalRecord('Sensitive demo value', {
    printToFileAsync: jest.fn().mockResolvedValue({ uri: '' }), isSharingAvailable, shareAsync,
  })).rejects.toMatchObject({ code: 'PDF_GENERATION_FAILED' });
  expect(shareAsync).not.toHaveBeenCalled();

  await expect(createAndShareMedicalRecord('Sensitive demo value', {
    printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/record.pdf' }),
    isSharingAvailable,
    shareAsync: jest.fn().mockRejectedValue(new Error('native failure')),
  })).rejects.toMatchObject({ code: 'SHARING_FAILED' });
});
