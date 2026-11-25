import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const REFERENCE_WIDTH = 360;
const REFERENCE_HEIGHT = 800;

export default function CroppedReferenceImage({ source, crop, size, radius = size / 2 }) {
  const scale = size / crop.width;
  return <View accessible={false} style={[styles.frame, { width: size, height: size, borderRadius: radius }]}>
    <Image
      source={source}
      resizeMode="stretch"
      style={[styles.image, {
        width: REFERENCE_WIDTH * scale,
        height: REFERENCE_HEIGHT * scale,
        left: -crop.x * scale,
        top: -crop.y * scale,
      }]}
    />
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  image: { position: 'absolute' },
});
