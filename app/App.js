import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppShell from './src/app/AppShell';

function App() {
  return <SafeAreaProvider><AppShell /></SafeAreaProvider>;
}

registerRootComponent(App);
