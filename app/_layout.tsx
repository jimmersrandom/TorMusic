import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Suppress known harmless expo-av streaming errors
if (typeof global !== 'undefined') {
  const handler = (event: any) => {
    const msg = event?.reason?.message || event?.message || String(event?.reason || '');
    if (msg.includes('Seeking interrupted')) {
      event?.preventDefault?.();
      return true;
    }
  };
  // @ts-ignore
  if (!global.__seekingHandlerAdded) {
    // @ts-ignore
    global.__seekingHandlerAdded = true;
    // React Native unhandled promise rejection
    const ErrorUtils = (global as any).ErrorUtils;
    if (ErrorUtils) {
      const originalHandler = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
        if (error?.message?.includes('Seeking interrupted')) return;
        originalHandler(error, isFatal);
      });
    }
  }
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
