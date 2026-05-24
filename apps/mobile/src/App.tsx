import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-1 items-center justify-center">
        <Text className="text-foreground text-xl font-bold">XiabaoAI</Text>
        <Text className="text-muted-foreground mt-2 text-sm">Mobile · M8</Text>
      </View>
    </SafeAreaView>
  );
}
