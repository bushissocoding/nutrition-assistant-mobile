import { recognizeLabImage } from './health-record-ocr.web';

test('web OCR explains that image recognition is unavailable and manual entry is supported', async () => {
  await expect(recognizeLabImage('blob:synthetic-image')).rejects.toMatchObject({ code: 'OCR_UNAVAILABLE' });
});
