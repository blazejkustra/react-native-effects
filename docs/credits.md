# Effects credits and licenses

Effects uses the third-party photographs and open-source software listed here. Everything else in the app, including icons, chat wallpapers, weather symbols and the foam texture, is original and drawn in code or by `example/assets/tools/generate-assets.py`. Thank you to their authors.

The app's own code and the react-native-effects library are MIT licensed, Copyright (c) 2026 Blazej Kustra. See `LICENSE` in this repository.

## Photographs

All from Wikimedia Commons. Each is cropped, resized or otherwise adapted for the effect named. These credits imply no endorsement by the authors. Adapted versions of the ShareAlike photos are offered under the same licence as the original, and they are in `example/assets` in this repository.

| Effect | File | Work | Author | License |
| --- | --- | --- | --- | --- |
| Flashlight | `flashlight/corridor.jpg` | [Grungy corridor of abandoned school](https://commons.wikimedia.org/wiki/File:Grungy_corridor_of_abandoned_school.jpg) | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| Instant Camera | `camera/photo-beach.jpg` | [Black Rock beach](https://commons.wikimedia.org/wiki/File:Black_Rock_beach.jpg) | Carey Ciuro | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| Instant Camera | `camera/photo-lake.jpg` | [Evening on Kathleen Lake](https://commons.wikimedia.org/wiki/File:Evening_on_Kathleen_Lake.jpg) | Jakub Fryš | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Instant Camera | `camera/photo-mountains.jpg` | [Mountain lake, Mylgval mountain cirque before sunset, Caucasus Mountains](https://commons.wikimedia.org/wiki/File:Mountain_lake,_Mylgval_mountain_cirque_before_sunset,_Caucasus_Mountains.jpg) | Vyacheslav Argenberg | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Instant Camera, Bubble Wrap | `camera/table.jpg`, `bubblewrap/walnut.jpg` | [Oberfläche Wohnzimmertisch](https://commons.wikimedia.org/wiki/File:Oberfl%C3%A4che_Wohnzimmertisch.JPG) | Martin Lorenz | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Dandelion | `dandelion/dandelion-atlas.jpg` | [Taraxacum seedhead Paslieres 2013-05-09 n01](https://commons.wikimedia.org/wiki/File:Taraxacum_seedhead_Paslieres_2013-05-09_n01.jpg), extended and masked | Marie-Lan Nguyen | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/) |
| Hourglass | `hourglass/hourglass-atlas.jpg` | [Wooden hourglass 3](https://commons.wikimedia.org/wiki/File:Wooden_hourglass_3.jpg), sand painted out and masked | S Sepp | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Particle Dispersion | `dispersion/cat-atlas.png` | [Orange tabby cat sitting on fallen leaves](https://commons.wikimedia.org/wiki/File:Orange_tabby_cat_sitting_on_fallen_leaves-Hisashi-01.jpg), masked | Hisashi | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| Lava Lamp | `lavalamp/lava-lamp.jpg` | [Lava lamp (yellow)](https://commons.wikimedia.org/wiki/File:Lava_lamp_(yellow).jpg) | DMGualtieri | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Hinge Crack | `cracks/palms.jpg` | [Palm silhouettes](https://commons.wikimedia.org/wiki/File:Palm_silhouettes.jpg) | Prakash G (Prakash Srivaths) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Cracked Screen, Wave Reveal | `cracks/swing.jpg`, cropped for `wave/dusk.jpg` | [Seaside swing at dusk](https://commons.wikimedia.org/wiki/File:Seaside_swing_at_dusk_(Unsplash).jpg) | Georg Nietsch | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Ferrofluid | `ferrofluid/marble.jpg` | [Marble Kymi Euboea Greece](https://commons.wikimedia.org/wiki/File:Marble_Kymi_Euboea_Greece.jpg) | Jebulon | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Birthday Candle | `candle/cake.jpg` | [3rd birthday cake](https://commons.wikimedia.org/wiki/File:3rd_birthday_cake_(Unsplash_10b8Lvvc-4g).jpg), background extended and flame painted out | Annie Spratt | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Voice Delete | `chat/photo-post.jpg` | [Forest path at sunset](https://commons.wikimedia.org/wiki/File:Forest_path_at_sunset_(Unsplash).jpg) | Sergei Akulich | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Voice Delete, Glow Orb, Wave Reveal | `chat/photo-reel.jpg`, `scenes/misty-path.jpg` and `wave/scene-atlas.jpg` | [Misty path](https://commons.wikimedia.org/wiki/File:Misty_path_(Unsplash).jpg) | Alessio Lin | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Native software

| Component | Used through | License |
| --- | --- | --- |
| Dawn (WebGPU) | react-native-webgpu | BSD-3-Clause |
| miniaudio | react-native-audio-api | MIT-0 or public domain |
| PFFFT | react-native-audio-api | BSD-style |
| Signalsmith Stretch | react-native-audio-api | MIT |
| Hermes, Yoga, React Native | react-native | MIT |
| Folly | react-native | Apache-2.0 |
| Boost | react-native | BSL-1.0 |
| glog | react-native | BSD-3-Clause |
| double-conversion | react-native | BSD-3-Clause |
| fmt | react-native | MIT |
| Expo modules | expo | MIT |

## JavaScript packages in the app bundle

Taken from the production bundle's source map. MIT and ISC packages are distributed under their own license text, in each package's `LICENSE` file. The MIT License permission notice is reproduced below.

| Package | Version | License | Copyright |
| --- | --- | --- | --- |
| @babel/runtime | 7.29.7 | MIT | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| @expo/cli | 58.1.17 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| @expo/log-box-utils | 58.0.2 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| @expo/metro | 58.0.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| @react-native/asset-utils | 0.88.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| @react-native/js-polyfills | 0.88.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates |
| @react-native/normalize-colors | 0.88.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates |
| @react-native/virtualized-lists | 0.88.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates |
| @react-navigation/core | 7.17.5 | MIT | Copyright (c) 2017 React Navigation Contributors |
| @react-navigation/elements | 2.9.19 | MIT | Copyright (c) 2017 React Navigation Contributors |
| @react-navigation/native | 7.2.5 | MIT | Copyright (c) 2017 React Navigation Contributors |
| @react-navigation/native-stack | 7.16.0 | MIT | Copyright (c) 2017 React Navigation Contributors |
| @react-navigation/routers | 7.5.5 | MIT | Copyright (c) 2017 React Navigation Contributors |
| @ungap/structured-clone | 1.3.0 | ISC | Copyright (c) 2021, Andrea Giammarchi, @WebReflection |
| ansi-styles | 4.3.0 | MIT | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) |
| base64-js | 1.5.1 | MIT | Copyright (c) 2014 Jameson Little |
| color | 4.2.3 | MIT | Copyright (c) 2012 Heather Arthur |
| color-convert | 2.0.1 | MIT | Copyright (c) 2011-2016 Heather Arthur <fayearthur@gmail.com> |
| color-name | 1.1.4 | MIT | Copyright (c) 2015 Dmitry Ivanov |
| color-string | 1.9.1 | MIT | Copyright (c) 2011 Heather Arthur <fayearthur@gmail.com> |
| decode-uri-component | 0.2.2 | MIT | Copyright (c) 2017, Sam Verschueren <sam.verschueren@gmail.com> (github.com/SamVerschueren) |
| escape-string-regexp | 4.0.0 | MIT | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) |
| expo | 58.0.21 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-asset | 58.0.19 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-blur | 58.0.5 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-camera | 58.0.14 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-constants | 58.0.14 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-glass-effect | 58.0.5 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-modules-core | 58.0.28 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-sensors | 58.0.4 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| expo-symbols | 58.0.4 | MIT | Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) |
| fast-deep-equal | 3.1.3 | MIT | Copyright (c) 2017 Evgeny Poberezkin |
| filter-obj | 1.1.0 | MIT | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| flow-enums-runtime | 0.0.6 | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| invariant | 2.2.4 | MIT | Copyright (c) 2013-present, Facebook, Inc. |
| is-arrayish | 0.3.4 | MIT | Copyright (c) 2015 JD Ballard |
| memoize-one | 5.2.1 | MIT | Copyright (c) 2019 Alexander Reardon |
| metro-runtime | 0.87.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| nanoid | 3.3.12 | MIT | Copyright 2017 Andrey Sitnik <andrey@sitnik.ru> |
| nullthrows | 1.1.1 | MIT | Copyright (c) 2016 Andres Suarez |
| pretty-format | 29.7.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| promise | 8.3.0 | MIT | Copyright (c) 2014 Forbes Lindesay |
| query-string | 7.1.3 | MIT | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (http://sindresorhus.com) |
| react | 19.3.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| react-freeze | 1.0.4 | MIT | Copyright (c) 2021 Software Mansion |
| react-is | 18.3.1 | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| react-native | 0.88.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| react-native-audio-api | 0.13.6 | MIT | Copyright (c) Software Mansion |
| react-native-gesture-handler | 3.3.0 | MIT | Copyright (c) 2016 Software Mansion <swmansion.com> |
| react-native-is-edge-to-edge | 1.3.1 | MIT | Copyright (c) 2024 Mathieu Acthernoene |
| react-native-reanimated | 4.7.1 | MIT | Copyright (c) 2016 Software Mansion <swmansion.com> |
| react-native-safe-area-context | 5.10.1 | MIT | Copyright (c) 2019 Th3rd Wave |
| react-native-screens | 4.30.0 | MIT | Copyright (c) 2018 Software Mansion <swmansion.com> |
| react-native-view-shot | 6.1.1 | MIT | Copyright (c) 2016 Gaëtan Renaudeau |
| react-native-webgpu | 0.17.0 | MIT | Copyright (c) 2024 William Candillon |
| react-native-worklets | 0.13.0 | MIT | Copyright (c) 2024 nobody |
| regenerator-runtime | 0.13.11 | MIT | Copyright (c) 2014-present, Facebook, Inc. |
| scheduler | 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| semver | 7.8.2 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors |
| simple-swizzle | 0.2.4 | MIT | Copyright (c) 2015 Josh Junon |
| split-on-first | 1.1.0 | MIT | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| stacktrace-parser | 0.1.11 | MIT | Copyright (c) 2014-2019 Georg Tavonius |
| strict-uri-encode | 2.0.0 | MIT | Copyright (c) Kevin Martensson <kevinmartensson@gmail.com> (github.com/kevva) |
| use-latest-callback | 0.2.6 | MIT | Copyright (c) 2023 Satyajit Sahoo |
| use-sync-external-store | 1.6.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| warn-once | 0.1.1 | MIT | Copyright (c) 2022 Satyajit Sahoo |
| whatwg-fetch | 3.6.20 | MIT | Copyright (c) 2014-2023 GitHub, Inc. |
| whatwg-url-minimum | 0.2.0 | MIT | Copyright (c) Phil Pluckthun, |

## MIT License text

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
