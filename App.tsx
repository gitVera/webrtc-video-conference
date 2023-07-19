import React from 'react';

import {
  SafeAreaView,
  View,
  StatusBar,
  StyleSheet
} from 'react-native';
import Container from './Container';

function App(): JSX.Element {
  return (
    <SafeAreaView>
      <StatusBar />
      <View style={styles.container}>
        <Container />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    // backgroundColor: 'red',
    padding: 20,
  },
});

export default App;
