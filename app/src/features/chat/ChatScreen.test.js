import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatScreen from './ChatScreen';

test('answers navigation questions and keeps medical advice outside the demo assistant', () => {
  const screen = render(<ChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Tin nhắn'), 'Tôi bị đau ngực');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));

  expect(screen.getByText(/không thể đánh giá triệu chứng hoặc đưa ra chẩn đoán/i)).toBeTruthy();
});

test('labels the provider conversation as a preview and never claims that a doctor received a message', () => {
  const contact = { name: 'Bác sĩ mẫu', avatar: 'BM' };
  const screen = render(<ChatScreen contact={contact} />);
  fireEvent.changeText(screen.getByLabelText('Tin nhắn'), 'Xin chào');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));

  expect(screen.getByText(/không có bác sĩ hoặc nhân viên y tế phản hồi/i)).toBeTruthy();
  expect(screen.getByText(/Không có bác sĩ thật trong cuộc trò chuyện này/i)).toBeTruthy();
});
