// components/GradientBackground.tsx
// ONE file for the gradient: the definition (gradients.*) and the renderer live together.
// (StyleSheet cannot draw gradients, so this is drawn with react-native-svg, already in the project.)
// Figma: linear, 0% #75C093 100% -> 100% #013237 at 80% opacity. Rotate it by changing start/end.
// Usage: <View style={styles.headerGradientClip}><GradientBackground /></View>
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { theme } from '../constants/theme';

export const gradients = {
  hero: {
    stops: [
      { offset: 0, color: theme.colors.gradientStart, opacity: 1 },
      { offset: 1, color: theme.colors.gradientEnd, opacity: 0.8 },
    ],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
} as const;

type Props = { gradient?: typeof gradients.hero; id?: string };

export function GradientBackground({ gradient = gradients.hero, id = 'payton-gradient' }: Props) {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1={gradient.start.x} y1={gradient.start.y} x2={gradient.end.x} y2={gradient.end.y}>
          {gradient.stops.map((st) => (
            <Stop key={st.offset} offset={st.offset} stopColor={st.color} stopOpacity={st.opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export default GradientBackground;