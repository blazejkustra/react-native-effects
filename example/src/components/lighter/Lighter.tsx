import { StyleSheet, View } from 'react-native';
import type { ParamsSynchronizable } from 'react-native-effects';
import LeatherMaterial from '../materials/LeatherMaterial';
import LighterHardware from './LighterHardware';

/**
 * The lighter's bounding box, in points. The case sits in the bottom-left of
 * it; the hinge and wheel take the extra width on the right, and the
 * windscreen the extra height on top. The screen turns these into the
 * screen-space wick position the flame shader needs — keep the two in step,
 * they describe the same object.
 */
export const BOX_W = 255;
export const BOX_H = 412;
export const CASE_W = 220;
export const CASE_H = 268;
/** Where the flame is born, from the box's bottom-left corner. */
export const WICK_X = 107;
export const WICK_Y = 360;
/** Flame size, in points — turned into height-fractions for the shader. */
export const FLAME_H = 222;
export const FLAME_W = 36;

/**
 * LeatherMaterial sizes its grain to its own view, so the wrap is drawn on a
 * canvas larger than the case and cropped to it. Together with `expanded`
 * (which is that component's own "this is a big surface, tighten the grain"
 * switch) this lands the pebbling at a few points across — hide grain, not
 * boulders. The parent has `pointerEvents="none"`, so the tap-to-re-dye that
 * `expanded` also enables can never fire here.
 */
const LEATHER_SCALE = 2.2;

type Props = {
  paramsSynchronizable: ParamsSynchronizable;
  left: number;
  bottom: number;
};

/**
 * The physical lighter: a leather-wrapped case with the chromed hardware laid
 * over it. The flame is NOT here — it belongs to the full-screen pass behind,
 * which is what lets its glow spill across the whole room instead of stopping
 * at this view's edge.
 */
export default function Lighter({ paramsSynchronizable, left, bottom }: Props) {
  return (
    <View pointerEvents="none" style={[styles.box, { left, bottom }]}>
      <View style={styles.case}>
        <LeatherMaterial expanded style={styles.leather} />
      </View>
      <LighterHardware
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    width: BOX_W,
    height: BOX_H,
  },
  leather: {
    position: 'absolute',
    left: (CASE_W * (1 - LEATHER_SCALE)) / 2,
    top: (CASE_H * (1 - LEATHER_SCALE)) / 2,
    width: CASE_W * LEATHER_SCALE,
    height: CASE_H * LEATHER_SCALE,
  },
  case: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: CASE_W,
    height: CASE_H,
    borderRadius: 15,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1917',
    shadowColor: '#000',
    shadowOpacity: 0.75,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
});
