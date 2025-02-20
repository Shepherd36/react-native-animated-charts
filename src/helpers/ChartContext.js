import { createContext } from 'react';
import { useSharedValue } from 'react-native-reanimated';
export default createContext(null);

export function useGenerateValues() {
  const prevSmoothing = useSharedValue(0, 'prevSmoothing');
  const currSmoothing = useSharedValue(0, 'currSmoothing');
  const progress = useSharedValue(1, 'progress');
  const dotScale = useSharedValue(0, 'dotScale');
  const originalX = useSharedValue('', 'originalX');
  const originalY = useSharedValue('', 'originalY');
  const pathOpacity = useSharedValue(1, 'pathOpacity');
  const layoutSize = useSharedValue(0, 'size');
  const state = useSharedValue(0, 'state');
  const positionX = useSharedValue(0, 'positionX');
  const positionY = useSharedValue(0, 'positionY');
  const rect1XLabel = useSharedValue(0, 'rect1XLabel');
  const rect3XLabel = useSharedValue(0, 'rect3XLabel');

  return {
    currSmoothing,
    dotScale,
    layoutSize,
    originalX,
    originalY,
    rect1XLabel,
    rect3XLabel,
    pathOpacity,
    positionX,
    positionY,
    prevSmoothing,
    progress,
    state,
  };
}

