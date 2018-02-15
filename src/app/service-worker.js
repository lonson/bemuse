/* global caches */

import version from 'bemuse/utils/version'

function log (...args) {
  console.log(
    '%c serviceworker %c',
    'background:yellow;color:black',
    '',
    ...args
  )
}

const APP_CACHE_KEY = 'app'
const SITE_CACHE_KEY = 'site-v' + version
const RES_CACHE_KEY = 'site-v' + version
const SKIN_CACHE_KEY = 'skin-v' + version
const SONG_CACHE_KEY = 'songs'

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    // [::1] is the IPv6 localhost address.
    window.location.hostname === '[::1]' ||
    // 127.0.0.1/8 is considered localhost for IPv4.
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
)

export function register (config) {
  log('I am a service worker! ' + version)

  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${location.href}/build/service-worker.js`

      if (isLocalhost) {
        // This is running on localhost. Lets check if a service worker still exists or not.
        checkValidServiceWorker(swUrl, config)

        // Add some additional logging to localhost, pointing developers to the
        // service worker/PWA documentation.
        navigator.serviceWorker.ready.then(() => {
          log('Service worker ready! We\'ll load from cache in the future. https://goo.gl/SC7cgQ')
        })
      } else {
        registerValidSW(swUrl, config)
      }
    })

    window.addEventListener('install', function (event) {
      event.waitUntil(
        caches
          .open(SITE_CACHE_KEY)
          .then(cache => cache.addAll(['/']))
          .then(() => window.skipWaiting())
      )
    })

    window.addEventListener('activate', function () {
      log('Service worker activated! Claiming clients now!')
      return window.clients.claim()
    })

    window.addEventListener('fetch', function (event) {
      if (event.request.headers.get('range')) {
        // https://bugs.chromium.org/p/chromium/issues/detail?id=575357
        log('Bailing out for ranged request.', event.request.url)
        return
      }

      const build = location.origin + '/build/'
      const skin = location.origin + '/skins/'
      const res = location.origin + '/res/'
      const site = location.origin
      const request = event.request

      if (request.url.startsWith(build)) {
        if (request.url !== build + 'boot.js') {
          return cacheForever(event, APP_CACHE_KEY)
        }
      }
      if (request.url.match(/assets\/[^/]+\.bemuse$/)) {
        return cacheForever(event, SONG_CACHE_KEY)
      }
      if (request.url.match(/\.(bms|bme|bml)$/)) {
        return fetchThenCache(event, SONG_CACHE_KEY)
      }
      if (request.url.match(/\/index\.json$/)) {
        return fetchThenCache(event, SONG_CACHE_KEY)
      }
      if (request.url.match(/\/assets\/metadata\.json$/)) {
        return fetchThenCache(event, SONG_CACHE_KEY)
      }
      if (request.url.startsWith(skin)) {
        return staleWhileRevalidate(event, SKIN_CACHE_KEY)
      }
      if (request.url.startsWith(res)) {
        return staleWhileRevalidate(event, RES_CACHE_KEY)
      }
      if (request.url.startsWith(site)) {
        return fetchThenCache(event, SITE_CACHE_KEY)
      }
      if (request.url.startsWith('https://fonts.googleapis.com/')) {
        return staleWhileRevalidate(event, SKIN_CACHE_KEY)
      }
    })
  } else {
    log(
      'Either your browser doesn\'t support Service Workers, or you\'re running Bemuse in development mode. Skipping registration.'
    )
  }
}

/** Unregisters a service worker. */
export function unregister () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.unregister()
    })
  }
}

function registerValidSW (swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then(registration => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              log('New content is available; please refresh.')

              // Execute callback
              if (config.onUpdate) {
                config.onUpdate(registration)
              }
            } else {
              log('Content is cached for offline use.')

              // Execute callback
              if (config.onSuccess) {
                config.onSuccess(registration)
              }
            }
          }
        }
      }
    })
    .catch(error => {
      console.error('Error during service worker registration:', error)
    })
}

function checkValidServiceWorker (swUrl, config) {
  // Check if the service worker can be found. If it can't reload the page.
  fetch(swUrl)
    .then(response => {
      // Ensure service worker exists, and that we really are getting a JS file.
      if (
        response.status === 404 ||
        response.headers.get('content-type').indexOf('javascript') === -1
      ) {
        // No service worker found. Probably a different app. Reload the page.
        navigator.serviceWorker.ready.then(registration => {
          registration.unregister().then(() => {
            window.location.reload()
          })
        })
      } else {
        // Service worker found. Proceed as normal.
        registerValidSW(swUrl, config)
      }
    })
    .catch(() => {
      log('No internet connection found. App is running in offline mode.')
    })
}

function cacheForever (event, cacheName) {
  event.respondWith(
    caches.open(cacheName).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        return (
          cached ||
          fetch(event.request).then(function (response) {
            log('Cache forever:', event.request.url)
            cache.put(event.request, response.clone())
            return response
          })
        )
      })
    })
  )
}

function fetchThenCache (event, cacheName) {
  event.respondWith(
    caches.open(cacheName).then(function (cache) {
      return fetch(event.request)
        .then(function (response) {
          if (response && response.ok) {
            log('Fetch OK:', event.request.url)
            cache.put(event.request, response.clone())
            return response
          } else {
            return cache.match(event.request)
          }
        })
        .catch(function () {
          return cache.match(event.request)
        })
    })
  )
}

function staleWhileRevalidate (event, cacheName) {
  event.respondWith(
    caches.open(cacheName).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        var promise = fetch(event.request).then(function (response) {
          if (response && response.ok) {
            log('Updated:', event.request.url)
            cache.put(event.request, response.clone())
          }
          return response
        })
        return cached || promise
      })
    })
  )
}
