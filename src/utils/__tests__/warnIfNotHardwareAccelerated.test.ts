// The function keeps a module-level "already warned" flag, so each test gets a
// fresh copy via jest.resetModules() + require.

type FakeInfo = Partial<{
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}>;

const makeAdapter = (info: FakeInfo | null, isFallbackAdapter?: boolean) =>
  ({ info, isFallbackAdapter }) as unknown as GPUAdapter;

describe('warnIfNotHardwareAccelerated', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const load = () =>
    jest.requireActual('../warnIfNotHardwareAccelerated')
      .warnIfNotHardwareAccelerated as (a: GPUAdapter) => void;

  it('warns on a SwiftShader adapter (Android emulator default)', () => {
    load()(
      makeAdapter({
        vendor: 'google',
        device: 'SwiftShader Device (LLVM 10.0.0)',
        description: 'Vulkan 1.1 SwiftShader',
      })
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/software \(CPU\) adapter/);
  });

  it('warns on a Mesa llvmpipe/lavapipe adapter', () => {
    load()(makeAdapter({ device: 'llvmpipe (LLVM 15.0.0, 256 bits)' }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warns when isFallbackAdapter is true, even with no info', () => {
    load()(makeAdapter(null, true));
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT warn on the iOS simulator Metal adapter (real GPU)', () => {
    load()(
      makeAdapter({
        device: 'Apple iOS simulator GPU',
        description: 'Metal driver on iOS Version 26.4 (Build 23E244)',
      })
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT warn on a discrete/integrated hardware GPU', () => {
    load()(
      makeAdapter({
        vendor: 'apple',
        architecture: 'common-3',
        device: 'Apple M1 Pro',
      })
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns at most once across repeated calls', () => {
    const warn = load();
    const sw = makeAdapter({ device: 'SwiftShader Device' });
    warn(sw);
    warn(sw);
    warn(sw);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op in production (__DEV__ false)', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    load()(makeAdapter({ device: 'SwiftShader Device' }));
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
