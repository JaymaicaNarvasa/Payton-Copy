// components/GradientBackground.tsx
// Dependency-free gradient (uses react-native-svg, already in the project). Fill a parent with it:
//   <View style={{ ...absolute fill }}><GradientBackground /></View>
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { theme } from '../constants/theme';

type Props = { gradient?: typeof theme.gradient.hero; id?: string };

export function GradientBackground({ gradient = theme.gradient.hero, id = 'payton-gradient' }: Props) {
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