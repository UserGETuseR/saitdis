/* =========================================================
   «Мне можно» — интерактив 2026 (v3 · MAX)
   · Меняющийся крупный заголовок при скролле (морфинг слов)
   · Hero-видео скролл-скраб: листаешь -> идёт, стоп -> замерло
   · Поочерёдный текст, шторки, горизонтальные ленты, tilt, счётчики
   ========================================================= */
(function () {
  'use strict';

  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = hasGSAP && typeof window.ScrollTrigger !== 'undefined';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isDesktop = window.matchMedia('(min-width: 961px)').matches;
  if (hasST) gsap.registerPlugin(ScrollTrigger);

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  /* ---------- 1. Посимвольный текст ---------- */
  function splitText(el) {
    if (el.dataset.split === 'done') return;
    var text = el.textContent.trim();
    el.textContent = '';
    text.split(/\s+/).forEach(function (word, wi, arr) {
      var wSpan = document.createElement('span'); wSpan.className = 'word';
      word.split('').forEach(function (ch) {
        var c = document.createElement('span'); c.className = 'char'; c.textContent = ch; wSpan.appendChild(c);
      });
      el.appendChild(wSpan);
      if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.dataset.split = 'done';
  }
  var splitEls = $$('.split-text'); splitEls.forEach(splitText);
  var arrivalLines = $$('[data-arrival-line]'); arrivalLines.forEach(splitText);

  function revealChars(el) {
    if (el.dataset.revealed === '1') return; el.dataset.revealed = '1';
    var words = $$('.word', el);
    if (hasGSAP && !reduce) gsap.to(words, { opacity: 1, y: 0, duration: .42, ease: 'power2.out', stagger: .08 });
    else words.forEach(function (word) { word.style.opacity = 1; word.style.transform = 'none'; });
  }

  /* ---------- 2. Поочерёдное появление (.rise) + шторки ---------- */
  var riseSelectors = ['.lead', '.story-lead', '.story-body p', '.value', '.service-card',
    '.price-row', '.stat', '.hairline', '.link-underline', '.badges', '.section-head',
    '.review-card', '.contact-list li', '.stats-note', '.visit-step', '.faq-item', '.closing-content'];
  riseSelectors.forEach(function (sel) {
    $$(sel).forEach(function (el) { if (!el.closest('#hero')) el.classList.add('rise'); });
  });

  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var t = e.target;
      if (t.classList.contains('split-text')) revealChars(t);
      if (t.classList.contains('reveal-media')) t.classList.add('revealed');
      if (t.classList.contains('rise')) {
        var sibs = t.parentElement ? Array.prototype.slice.call(t.parentElement.children).filter(function (x) { return x.classList.contains('rise'); }) : [t];
        t.style.transitionDelay = Math.max(0, sibs.indexOf(t)) * 90 + 'ms';
        t.classList.add('in');
      }
      io.unobserve(t);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }) : null;

  if (io) {
    splitEls.forEach(function (el) { if (!el.closest('#hero')) io.observe(el); });
    $$('.reveal-media').forEach(function (el) { io.observe(el); });
    $$('.rise').forEach(function (el) { io.observe(el); });
  } else {
    splitEls.forEach(revealChars);
    $$('.reveal-media').forEach(function (el) { el.classList.add('revealed'); });
    $$('.rise').forEach(function (el) { el.classList.add('in'); });
  }

  /* Лёгкий монтаж между разделами: срабатывает только при входе в новую сцену. */
  var sceneSections = $$('.scene-section');
  if ('IntersectionObserver' in window) {
    var sceneIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { entry.target.classList.toggle('in-scene', entry.isIntersecting); });
    }, { threshold: .14, rootMargin: '0px 0px -8% 0px' });
    sceneSections.forEach(function (section) { sceneIO.observe(section); });
  } else { sceneSections.forEach(function (section) { section.classList.add('in-scene'); }); }

   /* ---------- 3. HERO: морфинг заголовка + видео-скраб ---------- */
  var arrivalScene = $('#arrivalScene');
  var arrivalWords = arrivalScene ? $$('.word', arrivalScene) : [];
  var arrivalNote = $('#arrivalNote');
  function setArrivalWords(count) {
    arrivalWords.forEach(function (word, index) { word.classList.toggle('is-arrived', index < count); });
    if (arrivalNote) arrivalNote.classList.toggle('is-arrived', count >= arrivalWords.length);
  }
  if (arrivalScene && hasST && !reduce) {
    ScrollTrigger.create({
      trigger: arrivalScene, start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) { setArrivalWords(Math.max(1, Math.ceil(self.progress * arrivalWords.length))); }
    });
  } else if (arrivalScene) { setArrivalWords(arrivalWords.length); }

   var hero = $('[data-hero]');
   var video = $('#heroVideo');
   var heroStage = $('#heroStage');
   var heroScene = $('#heroSceneInner');
   var heroCards = $$('[data-hero-card]');
   var heroScrim = $('.hero-scrim');
   var scrollHint = $('#scrollHint');
   var heroCounter = $('#heroCounter');
   var morphWords = $$('.morph-word');
   var heroTypeWords = [];
   var videoRateTimer = null;

   if (video) {
     var markNoVideo = function () { if (hero) hero.classList.add('no-video'); };
     var startHeroVideo = function () { var attempt = video.play(); if (attempt && attempt.catch) attempt.catch(function () {}); };
     video.addEventListener('error', markNoVideo);
     var srcOk = false; $$('source', video).forEach(function (s) { if (s.getAttribute('src')) srcOk = true; });
     if (!srcOk) markNoVideo();
     video.loop = true;
     video.playbackRate = 1;
     video.addEventListener('canplay', startHeroVideo, { once: true });
     if (video.readyState >= 2) startHeroVideo();
   }

   /* Печать фраз в hero: текст создаётся по мере прокрутки, а не по таймеру. */
   function prepareHeroType() {
     morphWords.forEach(function (word) {
       var text = word.textContent;
       word.textContent = '';
       text.split(/(\s+)/).forEach(function (part) {
         if (!part) return;
         if (/^\s+$/.test(part)) { word.appendChild(document.createTextNode(part)); return; }
         var group = document.createElement('span'); group.className = 'type-word';
         group.textContent = part;
         word.appendChild(group);
       });
       heroTypeWords.push($$('.type-word', word));
     });
   }
   prepareHeroType();

   function setHeroWordCount(index, count) {
     var words = heroTypeWords[index] || [];
     words.forEach(function (word, position) { word.classList.toggle('is-revealed', position < count); });
   }

   function updateHeroType(progress, activeIndex) {
     var ranges = [[0, .2], [.2, .42], [.42, .68], [.68, 1]];
     heroTypeWords.forEach(function (words, index) {
       if (index < activeIndex || (index === 0 && activeIndex === 0)) { setHeroWordCount(index, words.length); return; }
       if (index > activeIndex) { setHeroWordCount(index, 0); return; }
       var range = ranges[index];
       var localProgress = clamp((progress - range[0]) / (range[1] - range[0]), 0, 1);
       setHeroWordCount(index, Math.ceil(localProgress * words.length));
     });
   }

   // Смена активного слова заголовка по индексу
  function setMorph(activeIdx) {
    morphWords.forEach(function (w, i) {
      w.classList.remove('is-active', 'is-prev');
      if (i === activeIdx) w.classList.add('is-active');
      else if (i < activeIdx) w.classList.add('is-prev');
    });
   }
   setMorph(0);
   setHeroWordCount(0, (heroTypeWords[0] || []).length);

   function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
   function easeOut(value) { return 1 - Math.pow(1 - clamp(value, 0, 1), 3); }
   var heroFramePending = false, requestedHeroProgress = 0, lastMorphIndex = -1;
   function updateHeroScene(progress) {
     if (!heroStage) return;
     var enter = easeOut((progress - .08) / .28);
     var exit = easeOut((progress - .72) / .28);
     var compact = !isDesktop;
     var bases = compact ? [
       { x: -12, y: 12, z: 24, rx: 7, ry: -13, rz: -10 },
       { x: -10, y: -8, z: 55, rx: -6, ry: 14, rz: 9 },
       { x: 8, y: 12, z: -20, rx: 10, ry: -7, rz: -5 }
     ] : [
       { x: 20, y: 72, z: 40, rx: 8, ry: -18, rz: -11 },
       { x: -20, y: -42, z: 110, rx: -7, ry: 20, rz: 10 },
       { x: 32, y: 36, z: -40, rx: 12, ry: -9, rz: -5 }
     ];
     heroCards.forEach(function (card, index) {
       var base = bases[index] || bases[0];
       var direction = index === 1 ? 1 : -1;
       var x = (1 - enter) * direction * (compact ? 130 : 260) + base.x + exit * direction * (compact ? 58 : 110);
       var y = (1 - enter) * (index === 2 ? (compact ? 110 : 190) : (compact ? -70 : -120)) + base.y - exit * (compact ? 48 : 90);
       var z = (compact ? -360 : -600) * (1 - enter) + base.z + exit * (compact ? 190 : 350);
       var scale = (compact ? .76 : .72) + enter * (compact ? .24 : .28) + exit * (compact ? .08 : .15);
       var opacity = clamp(enter * 1.25, 0, 1) * (1 - exit * .92);
       var rx = base.rx + progress * (index === 0 ? (compact ? -9 : -14) : (compact ? 8 : 12));
       var ry = base.ry + progress * (index === 1 ? (compact ? -18 : -28) : (compact ? 16 : 25));
       var rz = base.rz + progress * (index === 2 ? (compact ? 11 : 16) : (compact ? -7 : -10));
       card.style.opacity = opacity.toFixed(3);
       card.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateX(' + rx.toFixed(1) + 'deg) rotateY(' + ry.toFixed(1) + 'deg) rotateZ(' + rz.toFixed(1) + 'deg) scale(' + scale.toFixed(3) + ')';
     });
     if (heroScrim) heroScrim.style.opacity = (1 - Math.sin(progress * Math.PI) * .2).toFixed(3);
     if (scrollHint) scrollHint.style.opacity = (1 - clamp(progress * 5, 0, 1)).toFixed(3);
     if (heroCounter) {
       var line = $('i', heroCounter);
       if (line) line.style.transform = 'scaleX(' + clamp(progress * 1.15, .08, 1).toFixed(3) + ')';
     }
   }

   function renderHeroFrame() {
     heroFramePending = false;
     var progress = requestedHeroProgress;
     var index = progress < .2 ? 0 : progress < .42 ? 1 : progress < .68 ? 2 : 3;
     if (index !== lastMorphIndex) { setMorph(index); lastMorphIndex = index; }
     updateHeroType(progress, index);
     updateHeroScene(progress);
     /* Не декодируем один и тот же кадр десятки раз: достаточно ~24 кадров/с. */
   }

   // На широком экране hero закреплён и скролл управляет полным роликом.
   // На телефоне блок короче: видео остаётся обычным бесшовным фоном.
   if (hasST && !reduce && hero) {
     if (video) {
       video.loop = true;
       var initialPlay = video.play(); if (initialPlay && initialPlay.catch) initialPlay.catch(function () {});
     }
     ScrollTrigger.create({
       trigger: hero, start: 'top top', end: 'bottom bottom',
       onUpdate: function (self) {
         requestedHeroProgress = self.progress;
         if (!heroFramePending) { heroFramePending = true; requestAnimationFrame(renderHeroFrame); }
         if (video) {
           var boostedRate = clamp(1 + Math.abs(self.getVelocity()) / 1050, 1, 2.35);
           video.playbackRate = boostedRate;
           if (videoRateTimer) clearTimeout(videoRateTimer);
           videoRateTimer = setTimeout(function () { if (video) video.playbackRate = 1; }, 120);
         }
       }
     });
     if (heroStage && heroScene) {
       var pointerFrame = false, pointerX = 0, pointerY = 0;
       heroStage.addEventListener('pointermove', function (event) {
         var rect = heroStage.getBoundingClientRect();
         pointerX = (event.clientX - rect.left) / rect.width - .5;
         pointerY = (event.clientY - rect.top) / rect.height - .5;
         if (pointerFrame) return;
         pointerFrame = true;
         requestAnimationFrame(function () {
           pointerFrame = false;
           heroScene.style.transform = 'rotateX(' + (-pointerY * 2.6).toFixed(2) + 'deg) rotateY(' + (pointerX * 3.6).toFixed(2) + 'deg)';
         });
       });
       heroStage.addEventListener('pointerleave', function () { heroScene.style.transform = ''; });
     }
   } else {
     // Fallback без GSAP: остаётся первый заголовок.
     setMorph(0);
     setHeroWordCount(0, (heroTypeWords[0] || []).length);
   }

  /* fallback реакции видео на листание, если скраб недоступен (file://) */
  if (video && hero) {
    window.addEventListener('scroll', function () {
      var r = hero.getBoundingClientRect();
      if (!(r.bottom > 0 && r.top < window.innerHeight)) return;
      if (video.paused) { var q = video.play(); if (q && q.catch) q.catch(function () {}); }
    }, { passive: true });
  }

  /* ---------- 4. Горизонтальный скролл ([data-horizontal]) ---------- */
  if (hasST && !reduce && isDesktop) {
    document.documentElement.classList.add('js-horizontal');
    $$('[data-horizontal]').forEach(function (section) {
      var track = $('[data-h-track]', section); if (!track) return;
      var getScroll = function () { return Math.max(0, track.scrollWidth - track.parentElement.clientWidth); };
      gsap.to(track, {
        x: function () { return -getScroll(); }, ease: 'none',
        scrollTrigger: { trigger: section, start: 'top top', end: function () { return '+=' + getScroll(); },
          pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 }
      });
    });
  } else {
    $$('[data-horizontal] [data-h-viewport]').forEach(function (vp) { vp.style.overflowX = 'auto'; vp.style.webkitOverflowScrolling = 'touch'; });
  }

  /* ---------- 5. Параллакс фото ---------- */
  if (hasST && !reduce && isDesktop) {
    $$('.reveal-media').forEach(function (m) {
      if (m.closest('[data-horizontal]')) return;
      var img = $('img', m); if (!img) return;
      gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: m, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ---------- 6. 3D tilt ---------- */
  if (window.matchMedia('(hover:hover)').matches && !reduce) {
    $$('[data-tilt]').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        card.style.transform = 'perspective(820px) rotateY(' + (px * 9) + 'deg) rotateX(' + (-py * 9) + 'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', function () { card.style.transform = ''; });
    });
  }

  /* ---------- 7. Лайтбокс ---------- */
  var lb = $('#lightbox'), lbImg = $('#lightboxImg'), lbClose = $('#lightboxClose');
  function openLB(src) { if (!lb || !lbImg) return; lbImg.src = src; lb.hidden = false; requestAnimationFrame(function () { lb.classList.add('show'); }); }
  function closeLB() { if (!lb) return; lb.classList.remove('show'); setTimeout(function () { lb.hidden = true; lbImg.src = ''; }, 350); }
  $$('.gallery-card[data-full]').forEach(function (btn) { btn.addEventListener('click', function () { openLB(btn.getAttribute('data-full')); }); });
  if (lbClose) lbClose.addEventListener('click', closeLB);
  if (lb) lb.addEventListener('click', function (e) { if (e.target === lb) closeLB(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLB(); });

  /* ---------- 8. Счётчики ---------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var dur = 1700, start = null;
    function step(ts) {
      if (!start) start = ts;
      var pr = Math.min((ts - start) / dur, 1), eased = 1 - Math.pow(1 - pr, 3), val = target * eased;
      el.textContent = dec ? val.toFixed(dec).replace('.', ',') : Math.round(val).toString();
      if (pr < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counted = false, statsSection = $('#stats');
  if (statsSection && 'IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting && !counted) { counted = true; $$('[data-count]').forEach(animateCount); sio.disconnect(); } });
    }, { threshold: 0.4 });
    sio.observe(statsSection);
  } else { $$('[data-count]').forEach(animateCount); }

  /* ---------- 9. Навигация + прогресс-бар ---------- */
  var navbar = $('#navbar'), burger = $('#burger'), navLinks = $('#navLinks');
  if (burger && navLinks) {
    burger.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open'); burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('a', navLinks).forEach(function (a) { a.addEventListener('click', function () { navLinks.classList.remove('open'); burger.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }); });
  }
  var navAnchors = $$('.nav-links a[href^="#"]');
  function updateNavigationScene() {
    if (!navAnchors.length) return;
    var focusY = window.innerHeight * .42, currentId = '';
    sceneSections.forEach(function (section) {
      var rect = section.getBoundingClientRect();
      if (rect.top <= focusY && rect.bottom >= focusY && navAnchors.some(function (anchor) { return anchor.getAttribute('href') === '#' + section.id; })) currentId = section.id;
    });
    if (currentId) navAnchors.forEach(function (anchor) { anchor.classList.toggle('is-current', anchor.getAttribute('href') === '#' + currentId); });
  }
  var vbar = $('#vprogressBar');
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (navbar) navbar.classList.toggle('scrolled', y > 40);
    if (vbar) { var h = document.documentElement.scrollHeight - window.innerHeight; vbar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%'; }
    updateNavigationScene();
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- 10. Курсор-свечение ---------- */
  var glow = $('#cursorGlow');
  if (glow && window.matchMedia('(hover:hover)').matches) {
    var gx = 0, gy = 0, cx = 0, cy = 0;
    document.addEventListener('mousemove', function (e) { gx = e.clientX; gy = e.clientY; });
    (function loop() { cx += (gx - cx) * .12; cy += (gy - cy) * .12; glow.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)'; requestAnimationFrame(loop); })();
  }

  if (hasST) window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
