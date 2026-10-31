import { forwardRef, type ComponentRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SERIF } from '../../catalog/theme';

/** Drawn from `cracks/swing.jpg` by assets/tools/generate-assets.py. */
const DUSK = require('../../../assets/wave/dusk.jpg');

export type PosterHandle = ComponentRef<typeof View>;

type DuskPosterProps = {
  width: number;
  height: number;
  onImageLoad?: () => void;
};

/** The full-screen dusk scene the wave reveals. */
const DuskPoster = forwardRef<PosterHandle, DuskPosterProps>(
  function DuskPoster({ width, height, onImageLoad }, ref) {
    return (
      <View ref={ref} collapsable={false} style={{ width, height }}>
        <Image
          source={DUSK}
          style={{ width, height }}
          resizeMode="cover"
          onLoad={onImageLoad}
        />
        <View style={[styles.caption, { top: height * 0.14 }]}>
          <Text style={styles.title}>Dusk</Text>
          <Text style={styles.hint}>Tap to replay the wave</Text>
        </View>
      </View>
    );
  }
);

export default DuskPoster;

const styles = StyleSheet.create({
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontFamily: SERIF,
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '600',
  },
  hint: {
    marginTop: 8,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
