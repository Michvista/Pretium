import { SymbolView } from 'expo-symbols';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export interface PickedImage {
  uri: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

interface ImagePickerInputProps {
  onImage: (image: PickedImage) => void;
  onError?: (message: string) => void;
}

async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

async function requestLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

function toPickedImage(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  if (!asset.base64) return null;
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
    width: asset.width,
    height: asset.height,
  };
}

export function ImagePickerInput({ onImage, onError }: ImagePickerInputProps) {
  const reportError = (message: string) => {
    if (onError) onError(message);
    else Alert.alert('Oops', message);
  };

  const handleCamera = async () => {
    const granted = await requestCameraPermission();
    if (!granted) {
      reportError('Camera permission is required to take a product photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    const image = toPickedImage(result);
    if (image) onImage(image);
  };

  const handleLibrary = async () => {
    const granted = await requestLibraryPermission();
    if (!granted) {
      reportError('Photo library permission is required to pick a product image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    const image = toPickedImage(result);
    if (image) onImage(image);
  };

  return (
    <ThemedView style={styles.row}>
      <Pressable
        onPress={handleCamera}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
          tintColor="#fff"
          size={24}
        />
        <ThemedText type="smallBold" style={{ color: '#fff' }}>
          Take photo
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={handleLibrary}
        style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }}
          tintColor="#0A0F2C"
          size={24}
        />
        <ThemedText type="smallBold">From gallery</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#0A0F2C',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#0A0F2C',
  },
  pressed: {
    opacity: 0.7,
  },
});