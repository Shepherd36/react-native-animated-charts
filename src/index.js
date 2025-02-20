import Animated from 'react-native-reanimated';
Animated.addWhitelistedNativeProps({ text: true });

export { default as ChartPathProvider } from './charts/linear/ChartPathProvider';
export { default as ChartDot } from './charts/linear/ChartDot';
export {
  CurrentPositionVerticalLine,
  OpeningPositionHorizontalLine,
} from './charts/linear/ChartLines';
export { ChartYLabel, ChartXLabel } from './charts/linear/ChartLabels';
export { default as ChartPath } from './charts/linear/ChartPath';
export { default as useChartData } from './helpers/useChartData';
export { default as simplifyData } from './simplification/simplifyData';
export { default as monotoneCubicInterpolation } from './interpolations/monotoneCubicInterpolation';
export { default as bSplineInterpolation } from './interpolations/bSplineInterpolation';
export { default as stepInterpolation } from './interpolations/stepInterpolation';
