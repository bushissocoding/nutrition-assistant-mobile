jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));
jest.mock('./src/app/AppShell', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const { registerRootComponent } = require('expo');
const AppShell = require('./src/app/AppShell').default;
require('./App');

test('registers the custom Expo entry component with the native app registry', () => {
  expect(registerRootComponent).toHaveBeenCalledTimes(1);
  expect(registerRootComponent).toHaveBeenCalledWith(expect.any(Function));
});
