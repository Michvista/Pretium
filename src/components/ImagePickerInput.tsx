import { SymbolView } from 'expo-symbols';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, Text, View } from 'react-native';

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
    <View className="flex-row gap-2">
      <Pressable
        onPress={handleCamera}
        className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-dark py-3 active:opacity-70">
        <SymbolView
          name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
          tintColor="#fff"
          size={24}
        />
        <Text className="font-bold text-white">Take photo</Text>
      </Pressable>
      <Pressable
        onPress={handleLibrary}
        className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 active:opacity-70">
        <SymbolView
          name={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }}
          tintColor="#151412"
          size={24}
        />
        <Text className="font-bold text-ink">From gallery</Text>
      </Pressable>
    </View>
  );
}