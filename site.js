/*
  Shared site-wide motion, included on every page the same way
  styles.css is — one file, no duplication. Two independent pieces:

  1. Page transition: a plain fade + slight lift on the whole page —
     the standard SaaS-marketing-site pattern, nothing fancier. It's
     faded/lowered by default from first paint — site.js just brings
     it in (.is-loaded) once the page is up, and fades it back out
     before navigating to another internal link (a project card, the
     back button, a cross-page nav link), timed to match the CSS
     transition so it doesn't cut off mid-fade.

  2. Scroll-reveal: a curated set of elements fade + lift in the
     first time they enter the viewport (including ones already
     on-screen at load), via IntersectionObserver. Siblings under
     the same parent are staggered slightly using an inline
     transition-delay, so a row of cards or a details grid animates
     in left-to-right/top-to-bottom instead of all at once.

  Both respect prefers-reduced-motion.
*/
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var html = document.documentElement;
  var FADE_MS = 150; // must match the html.page-fade body transition duration in styles.css

  /* ---------- Page transition ---------- */
  html.classList.add('page-fade');

  if (reduceMotion) {
    html.classList.add('is-loaded');
  } else {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        html.classList.add('is-loaded');
      });
    });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    var link = e.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    if (link.target === '_blank') return;
    if (link.hostname && link.hostname !== window.location.hostname) return;

    if (reduceMotion) return; // let it navigate normally, no fade to wait on

    e.preventDefault();
    html.classList.remove('is-loaded');
    setTimeout(function () {
      window.location.href = href;
    }, FADE_MS);
  });

  /*
    The browser's own back/forward buttons often restore a page from
    bfcache instead of doing a fresh load — the exact DOM state (with
    .is-loaded already stripped off by the click handler above,
    mid-fade-out) gets frozen and handed back as-is, and none of this
    script re-runs to fix it. That would leave the page stuck faded
    out. pageshow with event.persisted true is how you detect that
    specific case; just bring it back in.
  */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      html.classList.add('is-loaded');
    }
  });

  /* ---------- Scroll-reveal ---------- */
  /*
    This script tag runs synchronously in <head> (on purpose, so
    .page-fade/.is-loaded above land before first paint and there's
    no flash of the page at full opacity) — which means the <body>
    hasn't been parsed yet when this file first runs. Everything
    below needs actual DOM to query against, so it waits for
    DOMContentLoaded instead of running inline.
  */
  function initReveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    var selector = [
      '.hero__headline',
      '.gallery .project-card',
      '.intro__image',
      '.intro__heading',
      '.intro__body',
      '.intro .btn',
      '.section-heading',
      '.about__cards .about__card',
      '.about__paragraph',
      '.about__photo',
      '.about__carousel',
      '.about__caption',
      '.contact__heading',
      '.contact__person',
      '.contact__links',
      '.project-detail__back',
      '.project-detail__hero',
      '.project-detail__overview-text',
      '.project-detail__overview-note',
      '.project-detail__grid .project-detail__field',
      '.project-detail__media > *'
    ].join(', ');

    var els = Array.prototype.slice.call(document.querySelectorAll(selector));
    if (!els.length) return;

    var siblingCounts = new Map();
    els.forEach(function (el) {
      el.classList.add('reveal');
      var parent = el.parentElement;
      var n = siblingCounts.get(parent) || 0;
      el.style.transitionDelay = (Math.min(n, 5) * 0.06) + 's';
      siblingCounts.set(parent, n + 1);
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    els.forEach(function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }
})();
