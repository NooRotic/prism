// The first thing both prism-cast pages run, as a plain script in <head>, before anything else loads: is this a Cast device?
//   data-page="help" (the help page, /): a Cast device goes on to the TV page at /tv/ (a device whose receiver address still
//                    names / is moved along), everyone else stays.
//   data-page="tv"   (the TV page, /tv/): on a Cast device, or with ?tv for testing in a browser, Google's receiver script is
//                    added and window.prismCastReady says whether it loaded; anywhere else nothing is loaded and it says false.
// A Cast device names itself CrKey in its user agent. Served as is (never renamed by the build), so .htaccess keeps it fresh.
;(function () {
  var RECEIVER = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js'

  function isDevice(userAgent) {
    return /CrKey/.test(userAgent || '')
  }

  function wantsTv(search) {
    return /(?:^\?|&)tv(?:=|&|$)/.test(search || '')
  }

  function start(page, w) {
    if (page === 'help') {
      if (!isDevice(w.navigator.userAgent)) return 'help'
      w.location.replace('/tv/' + w.location.search)
      return 'forwarded'
    }
    if (isDevice(w.navigator.userAgent) || wantsTv(w.location.search)) {
      w.prismCastReady = new Promise(function (resolve) {
        var script = w.document.createElement('script')
        script.src = RECEIVER
        script.onload = function () {
          resolve(true)
        }
        script.onerror = function () {
          resolve(false)
        }
        w.document.head.appendChild(script)
      })
      return 'tv'
    }
    w.prismCastReady = Promise.resolve(false)
    return 'browser'
  }

  var api = { isDevice: isDevice, start: start, RECEIVER: RECEIVER }
  if (typeof module !== 'undefined') module.exports = api
  if (typeof window !== 'undefined' && document.currentScript) {
    var page = document.currentScript.getAttribute('data-page')
    if (page) start(page, window)
  }
})()
