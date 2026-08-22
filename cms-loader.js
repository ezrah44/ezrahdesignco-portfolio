/**
 * cms-loader.js
 *
 * Loads content from the /content JSON files (edited via the Decap CMS at
 * /admin) and overlays it onto the page at runtime. The HTML already
 * contains real copy/images as a fallback — if this script fails to load
 * or a JSON file is missing/malformed, the page still looks right.
 *
 * Two modes, auto-detected:
 *  - Homepage (index.html): reads content/site.json
 *  - Project detail page (work/<slug>/index.html): reads content/work/<slug>.json
 */
(function () {
  function basePath() {
    // Homepage lives at /, project pages live at /work/<slug>/
    return document.body.classList.contains('is-project-detail') ? '../../' : '';
  }

  function fetchJson(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('Failed to load ' + path);
      return res.json();
    });
  }

  function setText(id, value) {
    if (value === undefined || value === null) return;
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHtml(id, value) {
    if (value === undefined || value === null) return;
    var el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  function setImg(id, src, alt) {
    var el = document.getElementById(id);
    if (!el) return;
    if (src) el.setAttribute('src', basePath() + src);
    if (alt !== undefined) el.setAttribute('alt', alt);
  }

  function setHref(id, href) {
    var el = document.getElementById(id);
    if (el && href) el.setAttribute('href', href);
  }

  function setMeta(name, content, attr) {
    attr = attr || 'name';
    if (!content) return;
    var el = document.querySelector('meta[' + attr + '="' + name + '"]');
    if (el) el.setAttribute('content', content);
  }

  // ---------- Homepage ----------
  function applyHomepage(data) {
    if (data.hero) setHtml('cms-hero-headline', data.hero.headline);

    if (data.intro) {
      setImg('cms-intro-image', data.intro.image, data.intro.imageAlt);
      setText('cms-intro-heading', data.intro.heading);
      setText('cms-intro-body', data.intro.body);
      setText('cms-intro-cta', data.intro.ctaLabel);
    }

    if (data.about) {
      setText('cms-about-heading', data.about.heading);
      var typingEl = document.getElementById('typing-text');
      if (typingEl && data.about.typingText) {
        typingEl.setAttribute('data-text', data.about.typingText);
      }
      setText('cms-about-p1', data.about.paragraph1);
      setText('cms-about-p2', data.about.paragraph2);
      setImg('cms-about-photo', data.about.photo, data.about.photoAlt);
      setHtml('cms-about-caption', data.about.caption);
      if (Array.isArray(data.about.carousel)) {
        renderCarousel(data.about.carousel);
      }
    }

    if (data.contact) {
      setHtml('cms-contact-heading', data.contact.heading);
      setImg('cms-contact-avatar', data.contact.avatar, data.contact.avatarAlt);
      setText('cms-contact-name', data.contact.name);
      setText('cms-contact-role', data.contact.role);
      var emailEl = document.getElementById('cms-contact-email');
      if (emailEl && data.contact.email) emailEl.setAttribute('href', 'mailto:' + data.contact.email);
      setHref('cms-contact-instagram', data.contact.instagram);
      setHref('cms-contact-linkedin', data.contact.linkedin);
    }

    applyProjectCards(data.featuredProjects);
    applyProjectCards(data.simpleProjects);
  }

  function applyProjectCards(projects) {
    if (!Array.isArray(projects)) return;
    projects.forEach(function (project) {
      var card = document.getElementById('cms-card-' + project.slug);
      if (!card) return;
      card.style.display = project.visible === false ? 'none' : '';
      var titleEl = card.querySelector('.project-card-title');
      var categoryEl = card.querySelector('.project-card-category');
      if (titleEl && project.title) titleEl.textContent = project.title;
      if (categoryEl && project.category) categoryEl.textContent = project.category;
    });
  }

  function renderCarousel(photos) {
    var track = document.getElementById('cms-carousel-track');
    if (!track) return;
    var string = track.querySelector('.about__carousel-string');

    function polaroid(photo, hidden) {
      var wrap = document.createElement('div');
      wrap.className = 'about__polaroid';
      if (hidden) wrap.setAttribute('aria-hidden', 'true');
      var img = document.createElement('img');
      img.src = basePath() + photo.src;
      img.alt = photo.alt || '';
      if (photo.zoom) img.className = 'about__carousel-img--zoom';
      wrap.appendChild(img);
      return wrap;
    }

    track.querySelectorAll('.about__polaroid').forEach(function (el) { el.remove(); });
    // Real set, then a duplicated set (aria-hidden) so the CSS marquee loops seamlessly.
    photos.forEach(function (photo) { track.appendChild(polaroid(photo, false)); });
    photos.forEach(function (photo) { track.appendChild(polaroid(photo, true)); });

    if (string) track.insertBefore(string, track.firstChild);
  }

  // ---------- Project detail page ----------
  var GALLERY_LAYOUTS = {
    squares: { className: 'project-detail__media-squares', count: 2 },
    full: { className: 'project-detail__media-full', count: 1 },
    'full-fit': { className: 'project-detail__media-full project-detail__media-full--fit', count: 1 },
    'tall-pair': { className: 'project-detail__media-tall-pair', count: 2 },
    triple: { className: 'project-detail__media-triple', count: 3 },
    quad: { className: 'project-detail__media-quad', count: 4 }
  };

  function renderGallery(items) {
    var container = document.getElementById('cms-gallery');
    if (!container || !Array.isArray(items)) return;
    container.innerHTML = '';
    items.forEach(function (item) {
      var layout = GALLERY_LAYOUTS[item.type];
      if (!layout) return;
      var block = document.createElement('div');
      block.className = layout.className;
      var images = item.images || [];
      images.slice(0, layout.count).forEach(function (photo) {
        var img = document.createElement('img');
        img.src = basePath() + photo.src;
        img.alt = photo.alt || '';
        if (photo.aspect) img.style.aspectRatio = photo.aspect;
        block.appendChild(img);
      });
      container.appendChild(block);
    });
  }

  function applyProjectDetail(data) {
    if (data.title) document.title = data.title + ' | Ezrah Design Co.';
    setMeta('description', data.metaDescription);
    setMeta('og:title', data.title, 'property');
    setMeta('og:description', data.metaDescription, 'property');
    setMeta('twitter:title', data.title);
    setMeta('twitter:description', data.metaDescription);

    setText('cms-title', data.title);
    setText('cms-category', data.category);
    if (data.hero) setImg('cms-hero-img', data.hero.src, data.hero.alt);
    setText('cms-overview', data.overview);

    var noteEl = document.getElementById('cms-overview-note');
    if (noteEl) {
      if (data.overviewNote) {
        noteEl.textContent = data.overviewNote;
        noteEl.style.display = '';
      } else {
        noteEl.style.display = 'none';
      }
    }

    setText('cms-field-client', data.client);
    setText('cms-field-tools', data.tools);
    setText('cms-field-industry', data.industry);
    setText('cms-field-timeframe', data.timeframe);

    renderGallery(data.gallery);
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', function () {
    var isProjectDetail = document.body.classList.contains('is-project-detail');
    if (isProjectDetail) {
      var slug = document.body.getAttribute('data-project-slug');
      if (!slug) return;
      fetchJson('../../content/work/' + slug + '.json').then(applyProjectDetail).catch(function (err) {
        console.warn('CMS content not loaded, showing fallback content:', err);
      });
    } else {
      fetchJson('content/site.json').then(applyHomepage).catch(function (err) {
        console.warn('CMS content not loaded, showing fallback content:', err);
      });
    }
  });
})();
