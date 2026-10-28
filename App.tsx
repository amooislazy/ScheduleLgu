import React from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NARRATION_FONT } from './src/content/narrations';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppStoreProvider, useAppStore } from './src/state/AppStore';
import { AttendanceStoreProvider } from './src/state/AttendanceStore';
import { ClassroomStoreProvider } from './src/state/ClassroomStore';
import { ThemeProvider } from './src/theme/ThemeProvider';

function ThemedApp() {
  const { settings } = useAppStore();

  return (
    <ThemeProvider preference={settings.theme}>
      <StatusBar style="auto" />
      <AppNavigator />
    </ThemeProvider>
  );
}

export default function App() {
  // The Home header narrations are Urdu and need a Nastaliq face. The font is a
  // bundled asset loaded here so it is ready before the header first paints; if
  // it ever fails to load the header simply falls back to the system font.
  useFonts({
    [NARRATION_FONT]: require('./assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
  });

  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <AttendanceStoreProvider>
          <ClassroomStoreProvider>
            <ThemedApp />
          </ClassroomStoreProvider>
        </AttendanceStoreProvider>
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
