/* ImagePlayer — "Ambient Frame"
 *
 * Loops photos as ambience for a room. The guiding rule is that this is
 * background, not foreground: nobody watches it, people glance up mid-
 * conversation. So it must never demand attention, never stutter, and never
 * look broken — a missing file is skipped in silence rather than showing a
 * broken-image icon on a TV in front of the family.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Configuration — the "warm & nostalgic" preset.
   * Other presets are documented in README.md.
   * ------------------------------------------------------------------ */
  var CONFIG = {
    holdMs: 10000,        // how long a photo owns the screen
    photoFadeMs: 1500,    // cross-dissolve between photos
    backdropFadeMs: 2500, // slower, so the room's colour lags a beat behind

    driftScale: 0.04,     // ~4% zoom across a photo's life
    driftPanPct: 0.8,     // ~0.8% pan, in units of the photo's own size
    backdropDrift: 0.06,  // the ambience creeps slightly faster, for depth

    photoMax: 0.78,       // photo never exceeds this much of the screen
    maxUpscale: 1.8,      // ...but a small scan is enlarged only this far,
                          // past which it would just look soft

    preloadAhead: 2,      // photos decoded in advance, so a big file never
                          // stutters mid-fade
    cacheMax: 8
  };

  /* ------------------------------------------------------------------ *
   * Elements
   * ------------------------------------------------------------------ */
  var backdrops = [
    document.querySelector('.backdrop[data-slot="0"]'),
    document.querySelector('.backdrop[data-slot="1"]')
  ];
  var layers = [
    document.querySelector('.photo-layer[data-slot="0"]'),
    document.querySelector('.photo-layer[data-slot="1"]')
  ];
  var imgs = [
    layers[0].querySelector('img'),
    layers[1].querySelector('img')
  ];

  var root = document.documentElement;
  root.style.setProperty('--photo-fade', CONFIG.photoFadeMs + 'ms');
  root.style.setProperty('--backdrop-fade', CONFIG.backdropFadeMs + 'ms');
  root.style.setProperty('--photo-max', (CONFIG.photoMax * 100) + '%');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ *
   * Playlist
   *
   * Shuffle the whole set, play it through once, then reshuffle. A fixed
   * order becomes recognisable after forty minutes ("oh, the beach one's
   * next"); this way nothing repeats until everything has been seen, and
   * the second pass feels different from the first.
   * ------------------------------------------------------------------ */
  var pool = (window.IMAGEPLAYER_PHOTOS || []).slice();
  var queue = [];
  var history = [];
  var lastPlayed = null;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function refillQueue() {
    queue = shuffle(pool.slice());
    // Don't let the last photo of one pass repeat as the first of the next.
    if (queue.length > 1 && queue[0] === lastPlayed) {
      var t = queue[0]; queue[0] = queue[1]; queue[1] = t;
    }
  }

  function takeNext() {
    if (!pool.length) return null;
    if (!queue.length) refillQueue();
    return queue.shift();
  }

  function dropFromPool(src) {
    var i = pool.indexOf(src);
    if (i !== -1) pool.splice(i, 1);
    queue = queue.filter(function (s) { return s !== src; });
  }

  /* ------------------------------------------------------------------ *
   * Preloading
   * ------------------------------------------------------------------ */
  var cache = new Map();

  function preload(src) {
    if (cache.has(src)) return cache.get(src);
    var p = new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('unreadable: ' + src)); };
      im.src = src;
    });
    cache.set(src, p);
    // Bound the cache; the browser's own HTTP cache covers re-loads.
    if (cache.size > CONFIG.cacheMax) {
      cache.delete(cache.keys().next().value);
    }
    return p;
  }

  function preloadAhead() {
    if (!pool.length) return;
    if (!queue.length) refillQueue();
    for (var i = 0; i < CONFIG.preloadAhead && i < queue.length; i++) {
      preload(queue[i])['catch'](function () { /* handled when it comes up */ });
    }
  }

  /* ------------------------------------------------------------------ *
   * Sizing
   *
   * `max-width` alone would leave a small photo — an old scan, a phone
   * screenshot — sitting as a little island while everything around it
   * fills 78% of the screen. That inconsistency breaks the rhythm more
   * than softness does, so small images are enlarged to match. Only up to
   * a point: past ~1.8x they stop looking like photographs.
   * ------------------------------------------------------------------ */
  function fit(imgEl, loaded) {
    // Prefer the preloaded image's dimensions: naturalWidth on the on-screen
    // element is not reliably populated in the same tick as setting `src`,
    // even when the file is already cached.
    var nw = (loaded && loaded.naturalWidth) || imgEl.naturalWidth;
    var nh = (loaded && loaded.naturalHeight) || imgEl.naturalHeight;
    if (!nw || !nh) return;

    var box = CONFIG.photoMax;
    var toFit = Math.min(
      window.innerWidth * box / nw,
      window.innerHeight * box / nh
    );
    // Shrink as far as needed; enlarge only within the upscale cap.
    var scale = Math.min(toFit, CONFIG.maxUpscale);

    imgEl.style.width = Math.round(nw * scale) + 'px';
    imgEl.style.height = Math.round(nh * scale) + 'px';
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      imgs.forEach(function (el) { fit(el); });
    }, 150);
  });

  /* ------------------------------------------------------------------ *
   * Drift
   *
   * The rule: you should not be able to see it moving, only notice
   * afterwards that it has. Direction alternates so consecutive photos
   * never push the same way.
   * ------------------------------------------------------------------ */
  var PANS = [[-1, -0.6], [1, 0.5], [-0.8, 0.7], [0.9, -0.7]];
  var driftIndex = 0;

  function applyDrift(imgEl, backdropEl) {
    var lifeMs = CONFIG.holdMs + CONFIG.photoFadeMs;

    if (imgEl._drift) imgEl._drift.cancel();
    if (backdropEl._drift) backdropEl._drift.cancel();

    if (reduceMotion || typeof imgEl.animate !== 'function') {
      imgEl.style.transform = 'none';
      backdropEl.style.transform = 'none';
      return;
    }

    var zoomIn = driftIndex % 2 === 0;
    var pan = PANS[driftIndex % PANS.length];
    driftIndex++;

    var s0 = zoomIn ? 1 : 1 + CONFIG.driftScale;
    var s1 = zoomIn ? 1 + CONFIG.driftScale : 1;
    var px = pan[0] * CONFIG.driftPanPct;
    var py = pan[1] * CONFIG.driftPanPct;

    imgEl._drift = imgEl.animate([
      { transform: 'scale(' + s0 + ') translate(' + px + '%, ' + py + '%)' },
      { transform: 'scale(' + s1 + ') translate(' + (-px) + '%, ' + (-py) + '%)' }
    ], { duration: lifeMs, easing: 'linear', fill: 'both' });

    // The ambience creeps a little faster than the photo — reads as depth.
    backdropEl._drift = backdropEl.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(' + (1 + CONFIG.backdropDrift) + ')' }
    ], { duration: lifeMs + CONFIG.backdropFadeMs, easing: 'linear', fill: 'both' });
  }

  /* ------------------------------------------------------------------ *
   * Playback
   * ------------------------------------------------------------------ */
  var slot = 1;          // the slot currently on screen; first render flips to 0
  var timer = null;
  var paused = false;
  var started = false;

  function render(src, loaded) {
    slot = 1 - slot;
    imgs[slot].src = src;
    backdrops[slot].style.backgroundImage = 'url("' + src + '")';
    fit(imgs[slot], loaded);

    applyDrift(imgs[slot], backdrops[slot]);

    layers[slot].classList.add('visible');
    layers[1 - slot].classList.remove('visible');
    backdrops[slot].classList.add('visible');
    backdrops[1 - slot].classList.remove('visible');

    lastPlayed = src;
  }

  function schedule() {
    clearTimeout(timer);
    if (paused) return;
    timer = setTimeout(function () { advance(); }, CONFIG.holdMs);
  }

  var advancing = false;

  function advance(explicitSrc) {
    if (advancing) return;
    advancing = true;
    clearTimeout(timer);

    // Walk forward until something actually loads. A corrupt or missing file
    // is dropped from the playlist and never tried again.
    var attempts = 0;
    var limit = pool.length + 1;

    function attempt() {
      if (explicitSrc && attempts === 0) {
        attempts++;
        return preload(explicitSrc).then(onLoaded(explicitSrc), onFailed(explicitSrc));
      }
      if (attempts++ >= limit || !pool.length) {
        advancing = false;
        showSetupHint();
        return null;
      }
      var src = takeNext();
      if (!src) { advancing = false; showSetupHint(); return null; }
      return preload(src).then(onLoaded(src), onFailed(src));
    }

    function onLoaded(src) {
      return function (loaded) {
        if (history[history.length - 1] !== src) history.push(src);
        if (history.length > 200) history.shift();
        render(src, loaded);
        advancing = false;
        schedule();
        preloadAhead();
      };
    }

    function onFailed(src) {
      return function (err) {
        if (window.console) console.warn('[ImagePlayer] skipping', err && err.message);
        cache['delete'](src);
        dropFromPool(src);
        explicitSrc = null;
        return attempt();
      };
    }

    attempt();
  }

  function previous() {
    // Current photo is the tail of history; step back past it.
    if (history.length < 2) return;
    history.pop();
    var src = history[history.length - 1];
    advance(src);
  }

  /* ------------------------------------------------------------------ *
   * Keeping the screen alive
   * ------------------------------------------------------------------ */
  var wakeLock = null;

  function keepAwake() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    })['catch'](function () { /* not permitted yet; retried on interaction */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (!wakeLock) keepAwake();
      if (!paused) schedule();
    } else {
      clearTimeout(timer);
    }
  });

  /* ------------------------------------------------------------------ *
   * Hidden controls — nothing is ever drawn on screen for these.
   * ------------------------------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        paused = !paused;
        if (paused) clearTimeout(timer); else schedule();
        break;
      case 'ArrowRight': e.preventDefault(); advance(); break;
      case 'ArrowLeft':  e.preventDefault(); previous(); break;
      case 'f': case 'F': toggleFullscreen(); break;
    }
    if (!wakeLock) keepAwake();
  });

  document.addEventListener('dblclick', toggleFullscreen);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen()['catch'](function () {});
    }
  }

  // Hide the pointer during playback; bring it back briefly on movement.
  var cursorTimer = null;
  document.addEventListener('mousemove', function () {
    document.body.classList.add('show-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () {
      document.body.classList.remove('show-cursor');
    }, 2000);
  });

  /* ------------------------------------------------------------------ *
   * Setup-time failure state
   *
   * The design says no text on screen — but that applies during the event.
   * An empty photos folder is a setup mistake, and a silent black screen
   * would be no help at all in diagnosing it.
   * ------------------------------------------------------------------ */
  function showSetupHint() {
    if (document.getElementById('setup-hint')) return;
    var el = document.createElement('div');
    el.id = 'setup-hint';
    el.setAttribute('style', [
      'position:fixed', 'inset:0', 'display:flex', 'align-items:center',
      'justify-content:center', 'text-align:center', 'padding:2rem',
      'font:400 15px/1.7 ui-sans-serif,system-ui,sans-serif',
      'color:rgba(255,238,220,.5)', 'letter-spacing:.02em'
    ].join(';'));
    el.textContent =
      'No photos found. Put images in the photos/ folder, ' +
      'then run: node tools/build-manifest.mjs';
    document.body.appendChild(el);
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  function start() {
    if (started) return;
    started = true;
    if (!pool.length) { showSetupHint(); return; }
    refillQueue();
    keepAwake();
    advance();
  }

  start();
})();
