import * as Env from './env'

import Gauge from 'gauge'
import LoadProgressPlugin from '../src/hacks/webpack-progress'
import { flowRight } from 'lodash'
import path from './path'
import webpack from 'webpack'
import webpackResolve from './webpackResolve'
import { version } from './buildConfig'
import SWPrecacheWebpackPlugin from 'sw-precache-webpack-plugin'

function generateBaseConfig () {
  let config = {
    mode: Env.production() ? 'production' : 'development',
    context: path('src'),
    resolve: webpackResolve,
    resolveLoader: {
      alias: {
        bemuse: path('src')
      }
    },
    devServer: {
      contentBase: false,
      publicPath: '/build/',
      stats: { colors: true, chunkModules: false }
    },
    module: {
      rules: generateLoadersConfig(),
      noParse: [/sinon\.js/]
    },
    plugins: [
      new CompileProgressPlugin(),
      new LoadProgressPlugin(),
      new webpack.ProvidePlugin({
        BemuseLogger: 'bemuse/logger'
      }),
      // Workaround A for `file-loader` (TODO: remove this when possible):
      // https://github.com/webpack/webpack/issues/6064
      new webpack.LoaderOptionsPlugin({
        options: {
          context: process.cwd()
        }
      })
    ]
  }

  if (Env.sourceMapsEnabled() && Env.development()) {
    config.devtool = 'eval-source-map'
  } else if (Env.sourceMapsEnabled() || Env.production()) {
    config.devtool = 'source-map'
  } else if (Env.development()) {
    config.devtool = 'eval'
  }

  return config
}

function generateLoadersConfig () {
  return [
    {
      test: /\.jsx?$/,
      include: [path('src'), path('spec')],
      use: {
        loader: 'babel-loader',
        options: {
          cacheDirectory: true
        }
      }
    },
    {
      test: /\.js$/,
      type: 'javascript/auto',
      include: [path('node_modules', 'pixi.js')],
      use: {
        loader: 'transform-loader/cacheable',
        options: {
          brfs: true
        }
      }
    },
    {
      test: /\.worker\.js$/,
      use: { loader: 'worker-loader' }
    },
    {
      test: /\.json$/,
      type: 'javascript/auto',
      loader: 'json-loader'
    },
    {
      test: /\.pegjs$/,
      loader: 'pegjs-loader'
    },
    {
      test: /\.scss$/,
      use: [
        'style-loader',
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1
          }
        },
        {
          loader: 'postcss-loader',
          options: {
            ident: 'postcss',
            plugins: () => [
              require('postcss-flexbugs-fixes'),
              require('autoprefixer')({
                browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1'],
                flexbox: 'no-2009'
              })
            ]
          }
        },
        {
          loader: 'sass-loader',
          options: {
            outputStyle: 'expanded'
          }
        }
      ]
    },
    {
      test: /\.css$/,
      use: [
        'style-loader',
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1
          }
        },
        {
          loader: 'postcss-loader',
          options: {
            ident: 'postcss',
            plugins: () => [
              require('postcss-flexbugs-fixes'),
              require('autoprefixer')({
                browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1'],
                flexbox: 'no-2009'
              })
            ]
          }
        }
      ]
    },
    {
      test: /\.jade$/,
      loader: 'jade-loader'
    },
    {
      test: /\.png$/,
      loader: 'url-loader',
      options: {
        limit: 100000,
        mimetype: 'image/png'
      }
    },
    {
      test: /\.jpg$/,
      loader: 'file-loader'
    },
    {
      test: /\.(?:mp3|mp4|ogg|m4a)$/,
      loader: 'file-loader'
    },
    {
      test: /\.(otf|eot|svg|ttf|woff|woff2)(?:$|\?)/,
      loader: 'url-loader',
      options: {
        limit: 8192
      }
    }
  ]
}

function applyWebConfig (config) {
  Object.assign(config, {
    entry: {
      boot: ['./boot']
    },
    output: {
      path: path('dist', 'build'),
      publicPath: 'build/',
      filename: '[name].js',
      chunkFilename: '[name]-[chunkhash].js',
      devtoolModuleFilenameTemplate: 'file://[absolute-resource-path]',
      devtoolFallbackModuleFilenameTemplate:
        'file://[absolute-resource-path]?[hash]'
    }
  })

  if (Env.hotModeEnabled()) {
    config.devServer.hot = true
    config.plugins.push(
      new webpack.HotModuleReplacementPlugin()
    )
    config.entry.boot.unshift(
      'react-hot-loader/patch',
      'webpack-dev-server/client?http://' +
        Env.serverHost() +
        ':' +
        Env.serverPort(),
      'webpack/hot/only-dev-server'
    )
  }

  if (Env.production()) {
    config.plugins.push(
      new SWPrecacheWebpackPlugin(
        {
          cacheId: `bemuse-v${version}`,
          dontCacheBustUrlsMatching: /\.\w{8}\./,
          filepath: path('dist', 'service-worker.js'),
          minify: true,
          staticFileGlobsIgnorePatterns: [/\.map$/, /asset-manifest\.json$/]
        }
      )
    )
  }

  return config
}

function applyKarmaConfig (config) {
  config.devtool = 'cheap-inline-source-map'
  return config
}

function applyTestBedConfig (config) {
  config.entry = './test/testBed.entry.js'
  config.testBed = {
    configureExpressApp: (app, express) => {
      app.use('/src', express.static(path('src')))
    }
  }
  return config
}

export const generateWebConfig = flowRight(applyWebConfig, generateBaseConfig)

export const generateKarmaConfig = flowRight(
  applyKarmaConfig,
  generateBaseConfig
)

export const generateTestBedConfig = flowRight(
  applyTestBedConfig,
  generateBaseConfig
)

export default generateWebConfig()

function CompileProgressPlugin () {
  const gauge = new Gauge()
  return new webpack.ProgressPlugin(function (percentage, message) {
    if (percentage === 1) gauge.hide()
    else gauge.show(message, percentage)
  })
}
