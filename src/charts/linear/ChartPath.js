import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { LongPressGestureHandler } from 'react-native-gesture-handler';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Animated, {
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Path,
  Svg,
  Defs,
  Rect,
  Stop,
  LinearGradient
} from 'react-native-svg';

import ChartContext, {
  useGenerateValues as generateValues,
} from '../../helpers/ChartContext';
import { findYExtremes } from '../../helpers/extremesHelpers';
import { svgBezierPath } from '../../smoothing/smoothSVG';

function impactHeavy() {
  'worklet';
  (runOnJS
    ? runOnJS(ReactNativeHapticFeedback.trigger)
    : ReactNativeHapticFeedback.trigger)('impactHeavy');
}

function selection() {
  'worklet';
  (runOnJS
    ? runOnJS(ReactNativeHapticFeedback.trigger)
    : ReactNativeHapticFeedback.trigger)('selection');
}

export const InternalContext = createContext(null);

const android = Platform.OS === 'android';

const springDefaultConfig = {
  damping: 15,
  mass: 1,
  stiffness: 600,
};

const timingFeedbackDefaultConfig = {
  duration: 80,
};

const timingAnimationDefaultConfig = {
  duration: 300,
};

function combineConfigs(a, b) {
  'worklet';
  const r = {};
  const keysA = Object.keys(a);
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    r[key] = a[key];
  }
  const keysB = Object.keys(b);
  for (let i = 0; i < keysB.length; i++) {
    const key = keysB[i];
    r[key] = b[key];
  }
  return r;
}

const parse = (data, yRange) => {
  const { greatestY, smallestY } = findYExtremes(data);
  const minY = yRange ? yRange[0] : smallestY.y;
  const maxY = yRange ? yRange[1] : greatestY.y;
  const smallestX = data[0];
  const greatestX = data[data.length - 1];
  return [
    data.map(({ x, y }) => ({
      originalX: x,
      originalY: y,
      x: (x - smallestX.x) / (greatestX.x - smallestX.x),
      y: 1 - (y - minY) / (maxY - minY),
    })),
    {
      greatestX,
      greatestY,
      smallestX,
      smallestY,
    },
  ];
};

function setoriginalXYAccordingToNearestPoint(
  originalX,
  originalY,
  nearestPoint,
) {
  'worklet';
  originalX.value = nearestPoint.originalX.toString();
  originalY.value = nearestPoint.originalY
    ? nearestPoint.originalY.toString()
    : 'undefined';
}

function findNearestPoint(
  position,
  data
) {
  'worklet';
  let idx = 0;
  for (let i = 0; i < data.value.length; i++) {
    if (data.value[i].x >= position) {
      if (data.value[i - 1] && (data.value[i - 1].x - data.value[i].x) / 2 < position - data.value[i].x) {
        idx = i;
      } else {
        idx = Math.max(0, i - 1);
      }
      break;
    }
    if (i === data.value.length - 1) {
      idx = data.value.length - 1;
    }
  }
  if (!data.value[idx]) {
    // prevent the following error on android:
    // java.lang.RuntimeException: undefined is not an object (evaluating 'data.value[idx].originalX')
    // why data.value = [] sometimes onActive?
    // eslint-disable-next-line no-console
    console.warn('No data available for chart', data.value.length, idx);
    return;
  }
  // hack for step-charts
  return data.value[idx + 1] && data.value[idx + 1].x === data.value[idx].x ? data.value[idx + 1] : data.value[idx];
}

function positionXWithMargin(x, margin, width) {
  'worklet';
  if (x < margin) {
    return Math.max(3 * x - 2 * margin, 0);
  } else if (width - x < margin) {
    return Math.min(margin + x * 2 - width, width);
  } else {
    return x;
  }
}

function getValue(data, i, smoothingStrategy) {
  'worklet';
  if (smoothingStrategy.value === 'bezier') {
    if (i === 0) {
      return data.value[i];
    }

    const p0 = data.value[i - 2] || data.value[i - 1] || data.value[i];

    const x0 = p0.x;
    const y0 = p0.y;
    const p1 = data.value[i - 1] || data.value[i];
    const x1 = p1.x;
    const y1 = p1.y;
    const p = data.value[i];
    const x = p.x;
    const y = p.y;
    const cp3x = (x0 + 4 * x1 + x) / 6;
    const cp3y = (y0 + 4 * y1 + y) / 6;
    return { x: cp3x, y: cp3y };
  }
  return data.value[i];
}

function calculateRectYAndUpdateProperty(x, d, ss, layoutSize, xLabelProperty) {
  'worklet'
  let idx = 0;
  if (!d?.value?.length) {
    return {
      y: 0,
    }
  }
  for (let i = 0; i < d.value.length; i++) {
    if (getValue(d, i, ss).x > x / layoutSize.value.width) {
      idx = i;
      break;
    }
    if (i === d.value.length - 1) {
      idx = d.value.length - 1;
    }
  }

  if (xLabelProperty) {
    const nearestPoint = findNearestPoint(x / layoutSize.value.width, d);
    xLabelProperty.value = nearestPoint.originalX;
  }

  const y = (getValue(d, idx - 1, ss).y +
          (getValue(d, idx, ss).y -
            getValue(d, idx - 1, ss).y) *
            ((x / layoutSize.value.width -
              getValue(d, idx - 1, ss).x) /
              (getValue(d, idx, ss).x -
                getValue(d, idx - 1, ss).x))) *
                  layoutSize.value.height;
  const props = {
    y,
  };
  return props;
}

export default function ChartPathProvider({
  data: rawData,
  hitSlop = 0,
  hapticsEnabled = false,
  springConfig = {},
  timingFeedbackConfig = {},
  timingAnimationConfig = {},
  children,
  ...rest
}) {
  const valuesStore = useRef(null);
  if (valuesStore.current == null) {
    valuesStore.current = {
      currData: [],
      curroriginalData: [],
      dataQueue: [],
      prevData: [],
    };
  }

  const {
    currSmoothing,
    dotScale,
    originalX,
    originalY,
    pathOpacity,
    positionX,
    positionY,
    rect1XLabel,
    rect3XLabel,
    prevSmoothing,
    progress,
    layoutSize,
    state,
    setContextValue = () => {},
    providedData = rawData,
    proceededData,
  } = useContext(ChartContext) || generateValues();

  const prevData = useSharedValue(valuesStore.current.prevData, 'prevData');
  const currData = useSharedValue(valuesStore.current.currData, 'currData');
  const curroriginalData = useSharedValue(
    valuesStore.current.curroriginalData,
    'curroriginalData'
  );
  const hitSlopValue = useSharedValue(hitSlop);
  const hapticsEnabledValue = useSharedValue(hapticsEnabled);
  const [extremes, setExtremes] = useState({});

  const [data, setData] = useState(providedData);
  useEffect(() => {
    // hack for correct latest point position
    const fixedData = providedData?.points?.length ? { points: [...providedData.points, providedData.points[providedData.points.length - 1], providedData.points[providedData.points.length - 1]] } : providedData;
    setData(fixedData);
  }, [providedData]);

  const smoothingStrategy = useSharedValue(data.smoothingStrategy);

  useEffect(() => {
    if (!data || !data.points || data.points.length === 0) {
      return;
    }
    const [parsedData] = parse(data.points, data.yRange);
    proceededData.value = parsedData;
    const [parsedoriginalData, newExtremes] = parse(
      data.nativePoints || data.points
    );
    setContextValue(prev => ({ ...prev, ...newExtremes, data }));
    setExtremes(newExtremes);
    if (prevData.value.length !== 0) {
      valuesStore.current.prevData = currData.value;
      prevData.value = currData.value;
      prevSmoothing.value = currSmoothing.value;
      progress.value = 0;
      valuesStore.current.currData = parsedData;
      currData.value = parsedData;
      valuesStore.current.curroriginalData = parsedoriginalData;
      curroriginalData.value = parsedoriginalData;
      currSmoothing.value = data.smoothingFactor || 0;
      progress.value = 1;
    } else {
      prevSmoothing.value = data.smoothing || 0;
      currSmoothing.value = data.smoothing || 0;
      valuesStore.current.currData = parsedData;
      valuesStore.current.curroriginalData = parsedData;
      prevData.value = parsedData;
      currData.value = parsedData;
      curroriginalData.value = parsedoriginalData;
    }
  }, [data]);

  const isStarted = useSharedValue(false, 'isStarted');

  useAnimatedReaction(() => {
    return originalX.value;
  }, (current, prev) => {
    if (current !== prev) {
      hapticsEnabledValue.value && selection();
    }
  }, []);

  const onLongPressGestureEvent = useAnimatedGestureHandler({
    onActive: event => {
      state.value = event.state;
      if (!currData.value || currData.value.length === 0) {
        return;
      }
      if (!isStarted.value) {
        dotScale.value = withSpring(
          1,
          combineConfigs(springDefaultConfig, springConfig)
        );
        pathOpacity.value = withTiming(
          0,
          combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
        );
      }

      if (hapticsEnabledValue.value && !isStarted.value) {
        impactHeavy();
      }
      isStarted.value = true;

      const eventX = positionXWithMargin(
        event.x,
        hitSlopValue.value,
        layoutSize.value.width
      );

      let idx = 0;
      const ss = smoothingStrategy;
      for (let i = 0; i < currData.value.length; i++) {
        if (getValue(currData, i, ss).x > eventX / layoutSize.value.width) {
          idx = i;
          break;
        }
        if (i === currData.value.length - 1) {
          idx = currData.value.length - 1;
        }
      }

      const nearestPoint = findNearestPoint(eventX / layoutSize.value.width, curroriginalData);

      if (
        ss.value === 'bezier' &&
        currData.value.length > 30 &&
        eventX / layoutSize.value.width >=
          currData.value[currData.value.length - 2].x
      ) {
        const prevLastY = currData.value[currData.value.length - 2].y;
        const prevLastX = currData.value[currData.value.length - 2].x;
        const lastY = currData.value[currData.value.length - 1].y;
        const lastX = currData.value[currData.value.length - 1].x;
        const progress =
          (eventX / layoutSize.value.width - prevLastX) / (lastX - prevLastX);
        positionY.value =
          (prevLastY + progress * (lastY - prevLastY)) *
          layoutSize.value.height;
      } else if (idx === 0) {
        positionY.value =
          getValue(currData, idx, ss).y * layoutSize.value.height;
      } else {
        positionY.value = nearestPoint.y * layoutSize.value.height;
      }

      setoriginalXYAccordingToNearestPoint(
        originalX,
        originalY,
        nearestPoint,
      );
      positionX.value = nearestPoint.x * layoutSize.value.width;
    },
    onCancel: event => {
      isStarted.value = false;
      state.value = event.state;
      originalX.value = '';
      originalY.value = '';
      dotScale.value = withTiming(
        0,
        combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
      );
      if (android) {
        pathOpacity.value = 1;
      } else {
        pathOpacity.value = withTiming(
          1,
          combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
        );
      }
    },
    onEnd: event => {
      isStarted.value = false;
      state.value = event.state;
      originalX.value = '';
      originalY.value = '';
      dotScale.value = withTiming(
        0,
        combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
      );
      if (android) {
        pathOpacity.value = 1;
      } else {
        pathOpacity.value = withTiming(
          1,
          combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
        );
      }

      if (hapticsEnabledValue.value) {
        impactHeavy();
      }
    },
    onFail: event => {
      isStarted.value = false;
      state.value = event.state;
      originalX.value = '';
      originalY.value = '';
      dotScale.value = withTiming(
        0,
        combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
      );
      if (android) {
        pathOpacity.value = 1;
      } else {
        pathOpacity.value = withTiming(
          1,
          combineConfigs(timingFeedbackDefaultConfig, timingFeedbackConfig)
        );
      }
    }
  });

  const dotStyle = useAnimatedStyle(
    () => ({
      opacity: dotScale.value,
      transform: [
        { translateX: positionX.value },
        { translateY: positionY.value + 10 }, // TODO temporary fix for clipped chart
        { scale: dotScale.value },
      ],
    }),
    []
  );

  return (
    <ChartPath
      {...{
        children,
        currData,
        currSmoothing,
        data,
        dotStyle,
        extremes,
        layoutSize,
        rect1XLabel,
        rect3XLabel,
        onLongPressGestureEvent,
        originalX,
        originalY,
        pathOpacity,
        prevData,
        prevSmoothing,
        progress,
        smoothingStrategy,
        state,
      }}
      {...rest}
    />
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedStop = Animated.createAnimatedComponent(Stop);

function ChartPath({
  smoothingWhileTransitioningEnabled,
  height,
  width,
  longPressGestureHandlerProps,
  selectedStrokeWidth = 1,
  strokeWidth = 1,
  gestureEnabled = true,
  selectedOpacity = 0.7,
  style,
  onLongPressGestureEvent,
  prevData,
  currData,
  rect1XLabel,
  rect3XLabel,
  smoothingStrategy,
  prevSmoothing,
  currSmoothing,
  pathOpacity,
  progress,
  layoutSize,
  __disableRendering,
  children,
  ...props
}) {
  const smoothingWhileTransitioningEnabledValue = useSharedValue(
    smoothingWhileTransitioningEnabled
  );
  const selectedStrokeWidthValue = useSharedValue(selectedStrokeWidth);
  const strokeWidthValue = useSharedValue(strokeWidth);

  useEffect(() => {
    layoutSize.value = { height, width };
  }, [height, layoutSize, width]);

  const path = useDerivedValue(() => {
    let fromValue = prevData.value;
    let toValue = currData.value;
    let res;
    let smoothing = 0;
    const strategy = smoothingStrategy.value;
    if (progress.value !== 1) {
      const numOfPoints = Math.round(
        fromValue.length +
          (toValue.length - fromValue.length) *
            Math.min(progress.value, 0.5) *
            2
      );
      if (fromValue.length !== numOfPoints) {
        const mappedFrom = [];
        const coef = (fromValue.length - 1) / (numOfPoints - 1);
        for (let i = 0; i < numOfPoints; i++) {
          mappedFrom.push(fromValue[Math.round(i * coef)]);
        }
        fromValue = mappedFrom;
      }

      if (toValue.length !== numOfPoints) {
        const mappedTo = [];
        const coef = (toValue.length - 1) / (numOfPoints - 1);

        for (let i = 0; i < numOfPoints; i++) {
          mappedTo.push(toValue[Math.round(i * coef)]);
        }
        toValue = mappedTo;
      }

      if (!smoothingWhileTransitioningEnabledValue.value) {
        if (prevSmoothing.value > currSmoothing.value) {
          smoothing =
            prevSmoothing.value +
            Math.min(progress.value * 5, 1) *
              (currSmoothing.value - prevSmoothing.value);
        } else {
          smoothing =
            prevSmoothing.value +
            Math.max(Math.min((progress.value - 0.7) * 4, 1), 0) *
              (currSmoothing.value - prevSmoothing.value);
        }
      }

      res = fromValue.map(({ x, y }, i) => {
        const { x: nX, y: nY } = toValue[i];
        const mX = (x + (nX - x) * progress.value) * layoutSize.value.width;
        const mY = (y + (nY - y) * progress.value) * layoutSize.value.height;
        return { x: mX, y: mY };
      });
    } else {
      smoothing = currSmoothing.value;
      res = toValue.map(({ x, y }) => {
        return {
          x: x * layoutSize.value.width,
          y: y * layoutSize.value.height,
        };
      });
    }

    // For som reason isNaN(y) does not work
    res = res.filter(({ y }) => y === Number(y));

    if (res.length !== 0) {
      const firstValue = res[0];
      const lastValue = res[res.length - 1];
      if (firstValue.x === 0 && strategy !== 'bezier') {
        // extrapolate the first points
        res = [
          { x: res[0].x, y: res[0].y },
          { x: -res[4].x, y: res[0].y },
        ].concat(res);
      }
      if (lastValue.x === layoutSize.value.width && strategy !== 'bezier') {
        // extrapolate the last points
        res[res.length - 1].x = lastValue.x + 20;
        if (res.length > 2) {
          res[res.length - 2].x = res[res.length - 2].x + 10;
        }
      }
    }

    if (
      (smoothing !== 0 && (strategy === 'complex' || strategy === 'simple')) ||
      (strategy === 'bezier' &&
        (!smoothingWhileTransitioningEnabledValue.value ||
          progress.value === 1))
    ) {
      return svgBezierPath(res, smoothing, strategy);
    }

    return res
      .map(({ x, y }) => {
        return `L ${x} ${y}`;
      })
      .join(' ')
      .replace('L', 'M');
  });

  const animatedProps = useAnimatedStyle(() => {
    const props = {
      d: path.value,
      strokeWidth:
        pathOpacity.value *
          (Number(strokeWidthValue.value) -
            Number(selectedStrokeWidthValue.value)) +
        Number(selectedStrokeWidthValue.value),
    };
    if (Platform.OS === 'ios') {
      props.style = {
        opacity: pathOpacity.value * (1 - selectedOpacity) + selectedOpacity,
      };
    }
    return props;
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: pathOpacity.value * (1 - selectedOpacity) + selectedOpacity,
    };
  }, undefined);

  const gradientAnimatedProps = useAnimatedStyle(() => {
    const pathValue = path.value.replace('M', 'L');
    const gradientD = pathValue.length > 0 ? `M 0,${height} C 0,0 0,0 0,0 ${pathValue} L ${width},${height}` : '';
    const props = {
      d: gradientD,

    };
    return props;
  }, []);

  const rect1AnimatedProps = useAnimatedProps(() => {
    return calculateRectYAndUpdateProperty(width * 0.0948, currData, smoothingStrategy, layoutSize, rect1XLabel);
  }, [currData]);

  const rect2AnimatedProps = useAnimatedProps(() => {
    return calculateRectYAndUpdateProperty(width * 0.2974, currData, smoothingStrategy, layoutSize);
  }, [currData]);

  const rect3AnimatedProps = useAnimatedProps(() => {
    return calculateRectYAndUpdateProperty(width * 0.5, currData, smoothingStrategy, layoutSize, rect3XLabel);
  }, [currData]);

  const rect4AnimatedProps = useAnimatedProps(() => {
    return calculateRectYAndUpdateProperty(width * 0.7025, currData, smoothingStrategy, layoutSize);
  }, [currData]);

  const rect5AnimatedProps = useAnimatedProps(() => {
    return calculateRectYAndUpdateProperty(width * 0.9051, currData, smoothingStrategy, layoutSize);
  }, [currData]);

  const progressGradientAnimatedProps = useAnimatedProps(() => {
    return {
      offset: "1",
    }
  }, [progress.value]);

  return (
    <InternalContext.Provider
      value={{
        animatedProps,
        gradientAnimatedProps,
        progressGradientAnimatedProps,
        rect1AnimatedProps,
        rect2AnimatedProps,
        rect3AnimatedProps,
        rect4AnimatedProps,
        rect5AnimatedProps,
        animatedStyle,
        gestureEnabled,
        height,
        longPressGestureHandlerProps,
        onLongPressGestureEvent,
        props,
        style,
        width,
      }}
    >
      {__disableRendering ? children : <SvgComponent />}
    </InternalContext.Provider>
  );
}

export function SvgComponent() {
  const {
    style,
    animatedStyle,
    height,
    width,
    animatedProps,
    gradientAnimatedProps,
    progressGradientAnimatedProps,
    rect1AnimatedProps,
    rect2AnimatedProps,
    rect3AnimatedProps,
    rect4AnimatedProps,
    rect5AnimatedProps,
    props,
    onLongPressGestureEvent,
    gestureEnabled,
    longPressGestureHandlerProps,
  } = useContext(InternalContext);

  return (
    <LongPressGestureHandler
      enabled={gestureEnabled}
      maxDist={100000}
      minDurationMs={0}
      shouldCancelWhenOutside={false}
      {...longPressGestureHandlerProps}
      {...{ onGestureEvent: onLongPressGestureEvent }}
    >
      <Animated.View>
        <Svg
          height={height + 20} // temporary fix for clipped chart
          viewBox={`0 0 ${width} ${height}`}
          width={width}
        >
          <AnimatedRect animatedProps={rect1AnimatedProps} opacity="0.08" height="100%" x="9.48%" width="1" rx="0.5" fill="url(#prefix__paint0_linear)"/>
          <AnimatedRect animatedProps={rect2AnimatedProps} opacity="0.08" x="29.74%" width="1" height="100%" rx="0.5" fill="url(#prefix__paint0_linear)"/>
          <AnimatedRect animatedProps={rect3AnimatedProps} opacity="0.08" x="50%" width="1" height="100%" rx="0.5" fill="url(#prefix__paint0_linear)"/>
          <AnimatedRect animatedProps={rect4AnimatedProps} opacity="0.08" x="70.25%" width="1" height="100%" rx="0.5" fill="url(#prefix__paint0_linear)"/>
          <AnimatedRect animatedProps={rect5AnimatedProps} opacity="0.08" x="90.51%" width="1" height="100%" rx="0.5" fill="url(#prefix__paint0_linear)"/>
          <AnimatedPath
             animatedProps={gradientAnimatedProps}
             fill="url(#prefix__paint0_linear)"
          />
          <AnimatedPath
            animatedProps={animatedProps}
            {...props}
            style={[style, animatedStyle]}
            fill="none"
          />
           {
             props.gradientEnabled &&
             <Defs>
               <LinearGradient id="prefix__paint0_linear" x1="100%" y1="0%" x2="100%" y2="100%" >
                  <Stop stopColor={props.stroke} stopOpacity="0.35" />
                  <Stop offset="0.0666667" stopColor={props.stroke} stopOpacity="0.33"/>
                  <Stop offset="0.133333" stopColor={props.stroke} stopOpacity="0.31"/>
                  <Stop offset="0.2" stopColor={props.stroke} stopOpacity="0.29"/>
                  <Stop offset="0.266667" stopColor={props.stroke} stopOpacity="0.26"/>
                  <Stop offset="0.333333" stopColor={props.stroke} stopOpacity="0.22"/>
                  <Stop offset="0.4" stopColor={props.stroke} stopOpacity="0.19"/>
                  <Stop offset="0.466667" stopColor={props.stroke} stopOpacity="0.17"/>
                  <Stop offset="0.533333" stopColor={props.stroke} stopOpacity="0.15"/>
                  <Stop offset="0.6" stopColor={props.stroke} stopOpacity="0.13"/>
                  <Stop offset="0.666667" stopColor={props.stroke} stopOpacity="0.11"/>
                  <Stop offset="0.733333" stopColor={props.stroke} stopOpacity="0.08"/>
                  <Stop offset="0.8" stopColor={props.stroke} stopOpacity="0.06"/>
                  <Stop offset="0.866667" stopColor={props.stroke} stopOpacity="0.03551"/>
                  <Stop offset="0.933333" stopColor={props.stroke} stopOpacity="0.01"/>
                  <Stop offset="1" stopColor={props.stroke} stopOpacity="0"/>
               </LinearGradient>
             </Defs>
           }
        </Svg>
      </Animated.View>
    </LongPressGestureHandler>
  );
}
