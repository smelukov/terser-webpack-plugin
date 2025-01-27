import RequestShortener from 'webpack/lib/RequestShortener';
import MainTemplate from 'webpack/lib/MainTemplate';
import ChunkTemplate from 'webpack/lib/ChunkTemplate';

import TerserPlugin from '../src/index';

import {
  cleanErrorStack,
  compile,
  countPlugins,
  createCompiler,
  getAssets,
  removeCache,
} from './helpers';

describe('TerserPlugin', () => {
  const rawSourceMap = {
    version: 3,
    file: 'test.js',
    names: ['bar', 'baz', 'n'],
    sources: ['one.js', 'two.js'],
    sourceRoot: 'http://example.com/www/js/',
    mappings:
      'CAAC,IAAI,IAAM,SAAUA,GAClB,OAAOC,IAAID;CCDb,IAAI,IAAM,SAAUE,GAClB,OAAOA',
  };
  const emptyRawSourceMap = {
    version: 3,
    sources: [],
    mappings: '',
  };

  beforeEach(() => Promise.all([removeCache()]));

  afterEach(() => Promise.all([removeCache()]));

  it('should work (without options)', async () => {
    const compiler = createCompiler();

    new TerserPlugin().apply(compiler);

    const stats = await compile(compiler);

    const errors = stats.compilation.errors.map(cleanErrorStack);
    const warnings = stats.compilation.warnings.map(cleanErrorStack);

    expect(errors).toMatchSnapshot('errors');
    expect(warnings).toMatchSnapshot('warnings');
    expect(getAssets(stats, compiler)).toMatchSnapshot('assets');
  });

  it('should work in multi compiler mode', async () => {
    const multiCompiler = createCompiler([
      {
        mode: 'production',
        bail: true,
        cache: false,
        entry: `${__dirname}/fixtures/entry.js`,
        output: {
          path: `${__dirname}/dist`,
          filename: '[name]-1.js',
          chunkFilename: '[id]-1.[name].js',
        },
        optimization: {
          minimize: false,
        },
      },
      {
        mode: 'production',
        bail: true,
        cache: false,
        entry: `${__dirname}/fixtures/entry.js`,
        output: {
          path: `${__dirname}/dist`,
          filename: '[name]-2.js',
          chunkFilename: '[id]-2.[name].js',
        },
        optimization: {
          minimize: false,
        },
        plugins: [new TerserPlugin()],
      },
      {
        mode: 'production',
        bail: true,
        cache: false,
        entry: `${__dirname}/fixtures/import-export/entry.js`,
        output: {
          path: `${__dirname}/dist-MultiCompiler`,
          filename: '[name]-3.js',
          chunkFilename: '[id]-3.[name].js',
        },
        optimization: {
          minimize: false,
        },
        plugins: [new TerserPlugin()],
      },
    ]);

    const emptyPluginCount = countPlugins(multiCompiler.compilers[0]);
    const expectedPluginCount = countPlugins(multiCompiler.compilers[1]);

    expect(emptyPluginCount).not.toEqual(expectedPluginCount);

    multiCompiler.compilers.slice(2).forEach((compiler) => {
      const pluginCount = countPlugins(compiler);

      expect(pluginCount).not.toEqual(emptyPluginCount);
      expect(pluginCount).toEqual(expectedPluginCount);
      expect(pluginCount).toMatchSnapshot('compiler plugin count');
    });

    const multiStats = await compile(multiCompiler);

    multiStats.stats.forEach((stats, index) => {
      const errors = stats.compilation.errors.map(cleanErrorStack);
      const warnings = stats.compilation.warnings.map(cleanErrorStack);

      expect(errors).toMatchSnapshot('errors');
      expect(warnings).toMatchSnapshot('warnings');
      expect(getAssets(stats, multiCompiler.compilers[index])).toMatchSnapshot(
        'assets'
      );
    });
  });

  it('should work as a plugin', async () => {
    const compiler = createCompiler({
      plugins: [new TerserPlugin()],
    });

    const stats = await compile(compiler);

    const errors = stats.compilation.errors.map(cleanErrorStack);
    const warnings = stats.compilation.warnings.map(cleanErrorStack);

    expect(errors).toMatchSnapshot('errors');
    expect(warnings).toMatchSnapshot('warnings');
    expect(getAssets(stats, compiler)).toMatchSnapshot('assets');
  });

  it('should work as a minimizer', async () => {
    const compiler = createCompiler({
      optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
      },
    });

    const stats = await compile(compiler);

    const errors = stats.compilation.errors.map(cleanErrorStack);
    const warnings = stats.compilation.warnings.map(cleanErrorStack);

    expect(errors).toMatchSnapshot('errors');
    expect(warnings).toMatchSnapshot('warnings');
    expect(getAssets(stats, compiler)).toMatchSnapshot('assets');
  });

  it('should work and respect "terser" errors (the "parallel" option is "true")', async () => {
    const compiler = createCompiler();

    new TerserPlugin({
      parallel: true,
      minify(input) {
        // eslint-disable-next-line global-require
        return require('terser').minify(`${input}1()2()3()`);
      },
    }).apply(compiler);

    const stats = await compile(compiler);

    const errors = stats.compilation.errors.map(cleanErrorStack);
    const warnings = stats.compilation.warnings.map(cleanErrorStack);

    expect(errors).toMatchSnapshot('errors');
    expect(warnings).toMatchSnapshot('warnings');
    expect(/node_modules(\/|\\)terser/.test(stats.compilation.errors[0])).toBe(
      true
    );
  });

  it('should work and respect "terser" errors (the "parallel" option is "false")', async () => {
    const compiler = createCompiler();

    new TerserPlugin({
      parallel: false,
      minify(input) {
        // eslint-disable-next-line global-require
        return require('terser').minify(`${input}1()2()3()`);
      },
    }).apply(compiler);

    const stats = await compile(compiler);

    const errors = stats.compilation.errors.map(cleanErrorStack);
    const warnings = stats.compilation.warnings.map(cleanErrorStack);

    expect(errors).toMatchSnapshot('errors');
    expect(warnings).toMatchSnapshot('warnings');
    expect(/node_modules(\/|\\)terser/.test(stats.compilation.errors[0])).toBe(
      true
    );
  });

  it('should regenerate hash', async () => {
    const originalMainTemplateUpdateHashForChunk =
      MainTemplate.prototype.updateHashForChunk;
    const originalChunkTemplateUpdateHashForChunk =
      ChunkTemplate.prototype.updateHashForChunk;
    const mockMainTemplateUpdateHashForChunk = jest.fn();
    const mockChunkTemplateUpdateHashFocChunk = jest.fn();

    MainTemplate.prototype.updateHashForChunk = mockMainTemplateUpdateHashForChunk;
    ChunkTemplate.prototype.updateHashForChunk = mockChunkTemplateUpdateHashFocChunk;

    const compiler = createCompiler({
      entry: {
        js: `${__dirname}/fixtures/entry.js`,
        mjs: `${__dirname}/fixtures/entry.mjs`,
        importExport: `${__dirname}/fixtures/import-export/entry.js`,
        AsyncImportExport: `${__dirname}/fixtures/async-import-export/entry.js`,
      },
      output: {
        path: `${__dirname}/dist`,
        filename: '[name].[contenthash].js',
        chunkFilename: '[id].[name].[contenthash].js',
      },
    });

    new TerserPlugin().apply(compiler);

    const stats = await compile(compiler);

    const errors = stats.compilation.errors.map(cleanErrorStack);
    const warnings = stats.compilation.warnings.map(cleanErrorStack);

    expect(errors).toMatchSnapshot('errors');
    expect(warnings).toMatchSnapshot('warnings');

    // On each chunk we have 2 calls (we have 1 async chunk and 4 initial).
    // First call do `webpack`.
    // Second call do `TerserPlugin`.

    // We have 1 async chunk (1 * 2 = 2 calls for ChunkTemplate)
    expect(mockMainTemplateUpdateHashForChunk).toHaveBeenCalledTimes(8);
    // We have 4 initial chunks (4 * 2 = 8 calls for MainTemplate)
    expect(mockChunkTemplateUpdateHashFocChunk).toHaveBeenCalledTimes(2);

    expect(getAssets(stats, compiler)).toMatchSnapshot('assets');

    MainTemplate.prototype.updateHashForChunk = originalMainTemplateUpdateHashForChunk;
    ChunkTemplate.prototype.updateHashForChunk = originalChunkTemplateUpdateHashForChunk;
  });

  it('isSourceMap method', () => {
    expect(TerserPlugin.isSourceMap(null)).toBe(false);
    expect(TerserPlugin.isSourceMap()).toBe(false);
    expect(TerserPlugin.isSourceMap({})).toBe(false);
    expect(TerserPlugin.isSourceMap([])).toBe(false);
    expect(TerserPlugin.isSourceMap('foo')).toBe(false);
    expect(TerserPlugin.isSourceMap({ version: 3 })).toBe(false);
    expect(TerserPlugin.isSourceMap({ sources: '' })).toBe(false);
    expect(TerserPlugin.isSourceMap({ mappings: [] })).toBe(false);
    expect(TerserPlugin.isSourceMap({ version: 3, sources: '' })).toBe(false);
    expect(TerserPlugin.isSourceMap({ version: 3, mappings: [] })).toBe(false);
    expect(TerserPlugin.isSourceMap({ sources: '', mappings: [] })).toBe(false);
    expect(
      TerserPlugin.isSourceMap({ version: 3, sources: '', mappings: [] })
    ).toBe(false);
    expect(TerserPlugin.isSourceMap(rawSourceMap)).toBe(true);
    expect(TerserPlugin.isSourceMap(emptyRawSourceMap)).toBe(true);
  });

  it('buildSourceMap method', () => {
    expect(TerserPlugin.buildSourceMap()).toBe(null);
    expect(TerserPlugin.buildSourceMap('invalid')).toBe(null);
    expect(TerserPlugin.buildSourceMap({})).toBe(null);
    expect(TerserPlugin.buildSourceMap(rawSourceMap)).toMatchSnapshot();
  });

  it('buildError method', () => {
    const error = new Error('Message');

    error.stack = null;

    expect(TerserPlugin.buildError(error, 'test.js')).toMatchSnapshot();

    const errorWithLineAndCol = new Error('Message');

    errorWithLineAndCol.stack = null;
    errorWithLineAndCol.line = 1;
    errorWithLineAndCol.col = 1;

    expect(
      TerserPlugin.buildError(
        errorWithLineAndCol,
        'test.js',
        TerserPlugin.buildSourceMap(rawSourceMap)
      )
    ).toMatchSnapshot();

    const otherErrorWithLineAndCol = new Error('Message');

    otherErrorWithLineAndCol.stack = null;
    otherErrorWithLineAndCol.line = 1;
    otherErrorWithLineAndCol.col = 1;

    expect(
      TerserPlugin.buildError(
        otherErrorWithLineAndCol,
        'test.js',
        TerserPlugin.buildSourceMap(rawSourceMap),
        new RequestShortener('http://example.com/www/js/')
      )
    ).toMatchSnapshot();

    const errorWithStack = new Error('Message');

    errorWithStack.stack = 'Stack';

    expect(
      TerserPlugin.buildError(errorWithStack, 'test.js')
    ).toMatchSnapshot();
  });

  it('buildWarning method', () => {
    expect(
      TerserPlugin.buildWarning('Warning [test.js:1,1]')
    ).toMatchSnapshot();
    expect(
      TerserPlugin.buildWarning('Warning [test.js:1,1]', 'test.js')
    ).toMatchSnapshot();
    expect(
      TerserPlugin.buildWarning(
        'Warning [test.js:1,1]',
        'test.js',
        TerserPlugin.buildSourceMap(rawSourceMap)
      )
    ).toMatchSnapshot();
    expect(
      TerserPlugin.buildWarning(
        'Warning [test.js:1,1]',
        'test.js',
        TerserPlugin.buildSourceMap(rawSourceMap),
        new RequestShortener('http://example.com/www/js/')
      )
    ).toMatchSnapshot();
    expect(
      TerserPlugin.buildWarning(
        'Warning [test.js:1,1]',
        'test.js',
        TerserPlugin.buildSourceMap(rawSourceMap),
        new RequestShortener('http://example.com/www/js/'),
        () => true
      )
    ).toMatchSnapshot();
    expect(
      TerserPlugin.buildWarning(
        'Warning [test.js:1,1]',
        'test.js',
        TerserPlugin.buildSourceMap(rawSourceMap),
        new RequestShortener('http://example.com/www/js/'),
        () => false
      )
    ).toMatchSnapshot();
  });
});
