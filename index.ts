import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget/widgetTaskHandler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// It also ensures that whether the app is loaded in a native build or a dev
// client, the environment is set up appropriately.
registerRootComponent(App);

// Lets the OS repaint the home-screen widget headlessly, with the app closed.
registerWidgetTaskHandler(widgetTaskHandler);
