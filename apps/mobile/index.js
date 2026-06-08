import 'expo-router/entry';
import { AppRegistry } from 'react-native';
import { shareAnalyzeTask } from './lib/share-analyze-task';

// Headless JS task entry for Android background share processing.
AppRegistry.registerHeadlessTask('ShareAnalyzeTask', () => shareAnalyzeTask);

