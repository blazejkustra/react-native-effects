import {
  useImperativeHandle,
  useRef,
  useState,
  type ComponentRef,
  type Ref,
  type RefObject,
} from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export type SquareCropperHandle = {
  crop: (uri: string) => Promise<string>;
};

type Job = {
  uri: string;
  resolve: (uri: string) => void;
  reject: (reason: unknown) => void;
};

/** Points; view-shot captures at screen scale, so about 720 px on a phone. */
const SIZE = 240;

async function captureSquare(
  view: RefObject<ComponentRef<typeof View> | null>
) {
  const raw = await captureRef(view, {
    format: 'jpg',
    quality: 0.9,
    result: 'tmpfile',
  });
  return raw.startsWith('file://') ? raw : `file://${raw}`;
}

/**
 * Turns a full-size photo into a small centred square, the crop of an instant
 * print and of the viewfinder. Eight full-size photos as GPU textures would
 * cost hundreds of MB. Mount it behind something opaque: the image has to be
 * on screen for view-shot to see it.
 */
export default function SquareCropper({
  ref,
}: {
  ref: Ref<SquareCropperHandle>;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const view = useRef<ComponentRef<typeof View>>(null);

  useImperativeHandle(
    ref,
    () => ({
      crop: (uri) =>
        new Promise((resolve, reject) => setJob({ uri, resolve, reject })),
    }),
    []
  );

  if (!job) {
    return null;
  }

  const finish = () => {
    requestAnimationFrame(() => {
      captureSquare(view)
        .then(job.resolve, job.reject)
        .finally(() => setJob(null));
    });
  };

  const fail = () => {
    job.reject(new Error('photo failed to load'));
    setJob(null);
  };

  return (
    <View ref={view} collapsable={false} style={styles.square}>
      <Image
        source={{ uri: job.uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={finish}
        onError={fail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  },
});
