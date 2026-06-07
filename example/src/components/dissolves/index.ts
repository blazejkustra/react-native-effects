import type { ComponentType } from 'react';
import type { DissolveProps } from './common';
import EmberDissolve from './EmberDissolve';
import ShardsDissolve from './ShardsDissolve';
import PixelDissolve from './PixelDissolve';

export type { DissolveProps } from './common';

export type DissolveVariant = {
  key: string;
  label: string;
  Component: ComponentType<DissolveProps>;
};

/** The pickable disintegration styles, in selector order. */
export const DISSOLVES: DissolveVariant[] = [
  { key: 'ember', label: 'Ember', Component: EmberDissolve },
  { key: 'shards', label: 'Shards', Component: ShardsDissolve },
  { key: 'pixel', label: 'Pixel', Component: PixelDissolve },
];
