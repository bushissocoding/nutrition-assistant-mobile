import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

test('renders a native component with the Expo Jest preset', () => {
  const { getByText } = render(<Text>test harness ready</Text>);
  expect(getByText('test harness ready')).toBeTruthy();
});
