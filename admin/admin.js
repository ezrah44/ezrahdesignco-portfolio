/**
 * Custom CMS admin app for Ezrah Design Co.
 *
 * Replaces Decap CMS's generic editor with a single-column form styled
 * like the real site. Edits are held in memory (a "draft") and only
 * written anywhere when the Publish button is clicked.
 *
 * Local testing (http://localhost): no login required, and Publish
 * writes straight to disk via a tiny local save server (see
 * admin/local-save-server.js).
 *
 * Production (the real domain): gated behind Netlify Identity login, and
 * Publish commits straight to GitHub through Netlify's Git Gateway REST
 * proxy — the same mechanism Decap CMS itself uses.
 */
(function () {
  var IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var LOCAL_SAVE_URL = 'http://localhost:8935';
  var GIT_GATEWAY_BASE = '/.netlify/git/github';
  var BRANCH = 'main';

  var state = {
    site: null,
    projects: {}, // slug -> draft object
    dirtyRoots: new Set(), // 'site' or a slug
    pendingImages: {} // key -> { file, previewUrl, root, path }
  };

  // ---------- tiny path helpers ----------
  function getIn(obj, path) {
    return path.reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setIn(obj, path, value) {
    var target = obj;
    for (var i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = value;
  }
  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'className') node.className = props[k];
      else if (k === 'text') node.textContent = props[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  // ---------- toast / status ----------
  var toastEl;
  function toast(msg, isError) {
    if (!toastEl) {
      toastEl = el('div', { className: 'admin-toast' });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'admin-toast is-visible' + (isError ? ' is-error' : '');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.className = 'admin-toast'; }, 3000);
  }

  var statusEl, publishBtn;
  function markDirty(root) {
    state.dirtyRoots.add(root);
    updateStatus();
  }
  function updateStatus(mode, text) {
    if (!statusEl) return;
    if (mode === 'saving') { statusEl.className = 'admin-topbar__status is-saving'; statusEl.textContent = text || 'Publishing…'; return; }
    if (mode === 'saved') { statusEl.className = 'admin-topbar__status is-saved'; statusEl.textContent = text || 'Published'; return; }
    if (mode === 'error') { statusEl.className = 'admin-topbar__status is-error'; statusEl.textContent = text || 'Failed to publish — try again'; return; }
    if (state.dirtyRoots.size > 0) {
      statusEl.className = 'admin-topbar__status is-dirty';
      statusEl.textContent = 'Unpublished changes';
      publishBtn.disabled = false;
    } else {
      statusEl.className = 'admin-topbar__status';
      statusEl.textContent = 'Up to date';
      publishBtn.disabled = true;
    }
  }

  // ---------- generic field builders ----------
  function field(labelText, inputNode, hint) {
    var wrap = el('div', { className: 'admin-field' }, [
      el('label', { className: 'admin-field__label', text: labelText }),
      inputNode
    ]);
    if (hint) wrap.appendChild(el('div', { className: 'admin-field__hint', text: hint }));
    return wrap;
  }

  function textInput(getVal, setVal, root) {
    var input = el('input', { className: 'admin-input', type: 'text', value: getVal() });
    input.addEventListener('input', function () { setVal(input.value); markDirty(root); });
    return input;
  }

  function textareaInput(getVal, setVal, root) {
    var ta = el('textarea', { className: 'admin-textarea' });
    ta.value = getVal();
    ta.addEventListener('input', function () { setVal(ta.value); markDirty(root); });
    return ta;
  }

  function checkboxRow(labelText, getVal, setVal, root) {
    var input = el('input', { type: 'checkbox' });
    input.checked = !!getVal();
    input.addEventListener('change', function () { setVal(input.checked); markDirty(root); });
    return el('label', { className: 'admin-checkbox-row' }, [input, document.createTextNode(labelText)]);
  }

  function selectInput(getVal, setVal, options, root) {
    var sel = el('select', { className: 'admin-input' });
    options.forEach(function (opt) {
      var o = el('option', { value: opt.value, text: opt.label });
      if (opt.value === getVal()) o.setAttribute('selected', 'selected');
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { setVal(sel.value); markDirty(root); });
    return sel;
  }

  function imageField(getVal, setVal, root, path, getAlt, setAlt) {
    var thumb = el('div', { className: 'admin-image-field__thumb' });
    var img = el('img', {});
    var pendingKey = root + ':' + path.join('.');

    function renderThumb() {
      var pending = state.pendingImages[pendingKey];
      if (pending) {
        img.src = pending.previewUrl;
      } else if (getVal()) {
        img.src = resolveAssetUrl(getVal());
      } else {
        img.removeAttribute('src');
      }
    }
    renderThumb();
    thumb.appendChild(img);

    var fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) return;
      var previewUrl = URL.createObjectURL(file);
      state.pendingImages[pendingKey] = { file: file, previewUrl: previewUrl, root: root, path: path };
      renderThumb();
      filenameEl.textContent = file.name + ' (pending upload)';
      filenameEl.className = 'admin-image-field__filename admin-image-field__pending';
      markDirty(root);
    });
    thumb.addEventListener('click', function () { fileInput.click(); });

    var filenameEl = el('div', {
      className: 'admin-image-field__filename',
      text: getVal() ? getVal().split('/').pop() : 'No image set'
    });

    var metaChildren = [filenameEl, el('button', { className: 'btn btn--ghost btn--small', type: 'button', text: 'Choose Image', onClick: function () { fileInput.click(); } })];
    if (getAlt) {
      var altInput = el('input', { className: 'admin-input', type: 'text', placeholder: 'Alt text (for accessibility)', value: getAlt() });
      altInput.style.marginTop = '8px';
      altInput.addEventListener('input', function () { setAlt(altInput.value); markDirty(root); });
      metaChildren.push(altInput);
    }

    var meta = el('div', { className: 'admin-image-field__meta' }, metaChildren);
    return el('div', { className: 'admin-image-field' }, [thumb, fileInput, meta]);
  }

  function resolveAssetUrl(path) {
    if (!path) return '';
    if (/^(https?:)?\/\//.test(path)) return path;
    return '../' + path;
  }

  function card(titleText, bodyChildren, collapsible) {
    var body = el('div', { className: 'admin-card__body' }, bodyChildren);
    var titleEl = el('div', { className: 'admin-card__title' + (collapsible ? ' is-collapsible' : ''), text: titleText });
    var cardEl = el('div', { className: 'admin-card' }, [titleEl, body]);
    if (collapsible) {
      titleEl.appendChild(el('span', { className: 'chev', text: '▾' }));
      titleEl.addEventListener('click', function () { cardEl.classList.toggle('is-collapsed'); });
    }
    return cardEl;
  }

  // ---------- Homepage form ----------
  function renderSiteForm(container) {
    var site = state.site;
    container.appendChild(card('Hero Section', [
      field('Headline', textareaInput(
        function () { return site.hero.headline; },
        function (v) { site.hero.headline = v; },
        'site'
      ), 'HTML allowed, e.g. <br class="break-medium">')
    ]));

    container.appendChild(card('Intro Section', [
      imageField(
        function () { return site.intro.image; }, function (v) { site.intro.image = v; },
        'site', ['intro', 'image'],
        function () { return site.intro.imageAlt; }, function (v) { site.intro.imageAlt = v; }
      ),
      field('Heading', textInput(function () { return site.intro.heading; }, function (v) { site.intro.heading = v; }, 'site')),
      field('Body', textareaInput(function () { return site.intro.body; }, function (v) { site.intro.body = v; }, 'site')),
      field('Button Label', textInput(function () { return site.intro.ctaLabel; }, function (v) { site.intro.ctaLabel = v; }, 'site'))
    ]));

    var carouselList = el('div', {});
    function renderCarousel() {
      carouselList.innerHTML = '';
      site.about.carousel.forEach(function (photo, i) {
        var item = el('div', { className: 'admin-list-item' }, [
          el('div', { className: 'admin-list-item__header' }, [
            el('span', { className: 'admin-list-item__label', text: 'Photo ' + (i + 1) }),
            el('button', { className: 'admin-list-item__remove', type: 'button', text: 'Remove', onClick: function () {
              site.about.carousel.splice(i, 1); markDirty('site'); renderCarousel();
            } })
          ]),
          imageField(
            function () { return photo.src; }, function (v) { photo.src = v; },
            'site', ['about', 'carousel', i, 'src'],
            function () { return photo.alt; }, function (v) { photo.alt = v; }
          ),
          checkboxRow('Zoom this image slightly', function () { return photo.zoom; }, function (v) { photo.zoom = v; }, 'site')
        ]);
        carouselList.appendChild(item);
      });
    }
    renderCarousel();

    container.appendChild(card('About Section', [
      field('Heading', textInput(function () { return site.about.heading; }, function (v) { site.about.heading = v; }, 'site')),
      field('Typing Animation Text', textInput(function () { return site.about.typingText; }, function (v) { site.about.typingText = v; }, 'site')),
      field('Paragraph 1', textareaInput(function () { return site.about.paragraph1; }, function (v) { site.about.paragraph1 = v; }, 'site')),
      field('Paragraph 2', textareaInput(function () { return site.about.paragraph2; }, function (v) { site.about.paragraph2 = v; }, 'site')),
      imageField(
        function () { return site.about.photo; }, function (v) { site.about.photo = v; },
        'site', ['about', 'photo'],
        function () { return site.about.photoAlt; }, function (v) { site.about.photoAlt = v; }
      ),
      field('Photo Carousel', el('div', {}, [
        carouselList,
        el('button', { className: 'admin-add-btn', type: 'button', text: '+ Add Photo', onClick: function () {
          site.about.carousel.push({ src: '', alt: '' }); markDirty('site'); renderCarousel();
        } })
      ])),
      field('Caption', textareaInput(function () { return site.about.caption; }, function (v) { site.about.caption = v; }, 'site'), 'HTML allowed, e.g. <br class="break-tablet">')
    ]));

    container.appendChild(card('Contact Section', [
      field('Heading', textareaInput(function () { return site.contact.heading; }, function (v) { site.contact.heading = v; }, 'site'), 'HTML allowed, e.g. <br>'),
      imageField(
        function () { return site.contact.avatar; }, function (v) { site.contact.avatar = v; },
        'site', ['contact', 'avatar'],
        function () { return site.contact.avatarAlt; }, function (v) { site.contact.avatarAlt = v; }
      ),
      el('div', { className: 'admin-two-col' }, [
        field('Name', textInput(function () { return site.contact.name; }, function (v) { site.contact.name = v; }, 'site')),
        field('Role', textInput(function () { return site.contact.role; }, function (v) { site.contact.role = v; }, 'site'))
      ]),
      field('Email', textInput(function () { return site.contact.email; }, function (v) { site.contact.email = v; }, 'site')),
      field('Instagram URL', textInput(function () { return site.contact.instagram; }, function (v) { site.contact.instagram = v; }, 'site')),
      field('LinkedIn URL', textInput(function () { return site.contact.linkedin; }, function (v) { site.contact.linkedin = v; }, 'site'))
    ]));

    function projectCardFields(list, label) {
      var body = list.map(function (p) {
        return el('div', { className: 'admin-list-item' }, [
          el('div', { className: 'admin-list-item__header' }, [
            el('span', { className: 'admin-list-item__label', text: p.slug })
          ]),
          field('Title', textInput(function () { return p.title; }, function (v) { p.title = v; }, 'site')),
          field('Category Label', textInput(function () { return p.category; }, function (v) { p.category = v; }, 'site')),
          checkboxRow('Show this card on the homepage', function () { return p.visible !== false; }, function (v) { p.visible = v; }, 'site')
        ]);
      });
      return card(label, body);
    }
    container.appendChild(projectCardFields(site.featuredProjects, 'Featured Project Cards (top row)'));
    container.appendChild(projectCardFields(site.simpleProjects, 'Simple Project Cards (bottom row)'));
  }

  // ---------- Case study list + detail ----------
  function allProjectRefs() {
    return state.site.featuredProjects.concat(state.site.simpleProjects);
  }

  function renderCaseStudies(container) {
    container.innerHTML = '';
    var list = el('div', { className: 'admin-case-list' });
    allProjectRefs().forEach(function (ref) {
      var project = state.projects[ref.slug];
      if (!project) return;
      var thumb = el('div', { className: 'admin-case-row__thumb' });
      if (project.hero && project.hero.src) thumb.style.backgroundImage = 'url(' + resolveAssetUrl(project.hero.src) + ')';
      var row = el('button', { className: 'admin-case-row', type: 'button' }, [
        thumb,
        el('span', { className: 'admin-case-row__title', text: project.title }),
        el('span', { className: 'admin-case-row__category', text: project.category }),
        el('span', { className: 'admin-case-row__arrow', text: '›' })
      ]);
      row.addEventListener('click', function () { renderCaseStudyDetail(container, ref.slug); });
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  var GALLERY_LAYOUT_OPTIONS = [
    { value: 'squares', label: 'Two square images side by side' },
    { value: 'full', label: 'One full-width image' },
    { value: 'full-fit', label: 'One full-width image (fits its own aspect ratio)' },
    { value: 'tall-pair', label: 'Two tall images side by side' },
    { value: 'triple', label: 'Three images in a row' },
    { value: 'quad', label: 'Four images in a grid' }
  ];

  function renderCaseStudyDetail(container, slug) {
    container.innerHTML = '';
    var project = state.projects[slug];

    container.appendChild(el('button', {
      className: 'admin-back-link', type: 'button', onClick: function () { renderCaseStudies(container); }
    }, [document.createTextNode('← Back to Case Studies')]));

    container.appendChild(card('Basics', [
      field('Title', textInput(function () { return project.title; }, function (v) { project.title = v; }, slug)),
      field('Category Label', textInput(function () { return project.category; }, function (v) { project.category = v; }, slug)),
      field('Meta Description', textareaInput(function () { return project.metaDescription; }, function (v) { project.metaDescription = v; }, slug), 'Used for SEO and social sharing previews.')
    ]));

    container.appendChild(card('Hero Image', [
      imageField(
        function () { return project.hero.src; }, function (v) { project.hero.src = v; },
        slug, ['hero', 'src'],
        function () { return project.hero.alt; }, function (v) { project.hero.alt = v; }
      )
    ]));

    container.appendChild(card('Overview', [
      field('Overview Text', textareaInput(function () { return project.overview; }, function (v) { project.overview = v; }, slug)),
      field('Overview Note', textInput(function () { return project.overviewNote; }, function (v) { project.overviewNote = v; }, slug), 'e.g. "*Passion project*" — leave blank to hide.')
    ]));

    container.appendChild(card('Project Details', [
      el('div', { className: 'admin-two-col' }, [
        field('Client', textInput(function () { return project.client; }, function (v) { project.client = v; }, slug)),
        field('Tools Used', textInput(function () { return project.tools; }, function (v) { project.tools = v; }, slug))
      ]),
      el('div', { className: 'admin-two-col' }, [
        field('Industry', textInput(function () { return project.industry; }, function (v) { project.industry = v; }, slug)),
        field('Timeframe', textInput(function () { return project.timeframe; }, function (v) { project.timeframe = v; }, slug))
      ])
    ]));

    var galleryBody = el('div', {});
    function renderGallery() {
      galleryBody.innerHTML = '';
      project.gallery.forEach(function (block, blockIndex) {
        var imagesList = el('div', {});
        function renderImages() {
          imagesList.innerHTML = '';
          (block.images || []).forEach(function (photo, photoIndex) {
            imagesList.appendChild(el('div', { className: 'admin-list-item' }, [
              el('div', { className: 'admin-list-item__header' }, [
                el('span', { className: 'admin-list-item__label', text: 'Image ' + (photoIndex + 1) }),
                el('button', { className: 'admin-list-item__remove', type: 'button', text: 'Remove', onClick: function () {
                  block.images.splice(photoIndex, 1); markDirty(slug); renderImages();
                } })
              ]),
              imageField(
                function () { return photo.src; }, function (v) { photo.src = v; },
                slug, ['gallery', blockIndex, 'images', photoIndex, 'src'],
                function () { return photo.alt; }, function (v) { photo.alt = v; }
              )
            ]));
          });
        }
        renderImages();

        galleryBody.appendChild(el('div', { className: 'admin-list-item' }, [
          el('div', { className: 'admin-list-item__header' }, [
            el('span', { className: 'admin-list-item__label', text: 'Gallery Block ' + (blockIndex + 1) }),
            el('button', { className: 'admin-list-item__remove', type: 'button', text: 'Remove Block', onClick: function () {
              project.gallery.splice(blockIndex, 1); markDirty(slug); renderGallery();
            } })
          ]),
          field('Layout', selectInput(function () { return block.type; }, function (v) { block.type = v; }, GALLERY_LAYOUT_OPTIONS, slug)),
          field('Images', el('div', {}, [
            imagesList,
            el('button', { className: 'admin-add-btn', type: 'button', text: '+ Add Image', onClick: function () {
              if (!block.images) block.images = [];
              block.images.push({ src: '', alt: '' }); markDirty(slug); renderImages();
            } })
          ]))
        ]));
      });
    }
    renderGallery();

    container.appendChild(card('Gallery Blocks', [
      galleryBody,
      el('button', { className: 'admin-add-btn', type: 'button', text: '+ Add Gallery Block', onClick: function () {
        project.gallery.push({ type: 'full', images: [] }); markDirty(slug); renderGallery();
      } })
    ]));
  }

  // ---------- Save / publish ----------
  function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
      return String.fromCharCode('0x' + p1);
    }));
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function localSave(path, base64OrText, isBinary) {
    return fetch(LOCAL_SAVE_URL + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path, content: base64OrText, encoding: isBinary ? 'base64' : 'utf8' })
    }).then(function (res) {
      if (!res.ok) throw new Error('Local save server error for ' + path);
    });
  }

  function getIdentityToken() {
    var user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
    if (!user) return Promise.reject(new Error('Not logged in'));
    return user.jwt();
  }

  function gitGatewaySave(path, base64Content) {
    return getIdentityToken().then(function (token) {
      return fetch(GIT_GATEWAY_BASE + '/contents/' + path + '?ref=' + BRANCH, {
        headers: { Authorization: 'Bearer ' + token }
      }).then(function (res) { return res.ok ? res.json() : null; }).then(function (existing) {
        var body = { message: 'Update ' + path + ' via CMS', content: base64Content, branch: BRANCH };
        if (existing && existing.sha) body.sha = existing.sha;
        return fetch(GIT_GATEWAY_BASE + '/contents/' + path, {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          if (!res.ok) throw new Error('Publish failed for ' + path);
        });
      });
    });
  }

  function saveFile(path, content, isBinary) {
    if (IS_LOCAL) return localSave(path, isBinary ? content : content, isBinary);
    var base64 = isBinary ? content : b64EncodeUnicode(content);
    return gitGatewaySave(path, base64);
  }

  function slugifyFilename(name) {
    return Date.now() + '-' + name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
  }

  function publishAll() {
    if (state.dirtyRoots.size === 0) return;
    publishBtn.disabled = true;
    updateStatus('saving');

    var uploadPromises = Object.keys(state.pendingImages).map(function (key) {
      var pending = state.pendingImages[key];
      var newPath = 'assets/uploads/' + slugifyFilename(pending.file.name);
      return fileToBase64(pending.file).then(function (base64) {
        return saveFile(newPath, base64, true).then(function () {
          setIn(pending.root === 'site' ? state.site : state.projects[pending.root], pending.path, newPath);
          delete state.pendingImages[key];
        });
      });
    });

    Promise.all(uploadPromises).then(function () {
      var dirty = Array.from(state.dirtyRoots);
      var savePromises = dirty.map(function (root) {
        if (root === 'site') return saveFile('content/site.json', JSON.stringify(state.site, null, 2) + '\n', false);
        return saveFile('content/work/' + root + '.json', JSON.stringify(state.projects[root], null, 2) + '\n', false);
      });
      return Promise.all(savePromises);
    }).then(function () {
      state.dirtyRoots.clear();
      updateStatus('saved');
      toast('Published! Your live site will update shortly.');
      setTimeout(function () { updateStatus(); }, 2500);
    }).catch(function (err) {
      console.error(err);
      updateStatus('error');
      toast('Publish failed — see console for details.', true);
      publishBtn.disabled = false;
    });
  }

  // ---------- Load content ----------
  function loadContent() {
    return fetch('../content/site.json?_=' + Date.now()).then(function (r) { return r.json(); }).then(function (site) {
      state.site = site;
      var slugs = site.featuredProjects.concat(site.simpleProjects).map(function (p) { return p.slug; });
      return Promise.all(slugs.map(function (slug) {
        return fetch('../content/work/' + slug + '.json?_=' + Date.now()).then(function (r) { return r.json(); }).then(function (data) {
          state.projects[slug] = data;
        });
      }));
    });
  }

  // ---------- App shell ----------
  function buildApp() {
    document.body.innerHTML = '';

    var topbar = el('div', { className: 'admin-topbar' }, [
      el('div', { className: 'admin-topbar__brand' }, [
        el('img', { src: '../assets/hero/nav-logo.png', alt: '' }),
        document.createTextNode('Content Editor')
      ])
    ]);
    statusEl = el('div', { className: 'admin-topbar__status', text: 'Up to date' });
    topbar.appendChild(statusEl);
    var actions = el('div', { className: 'admin-topbar__actions' });
    publishBtn = el('button', { className: 'btn btn--fill', type: 'button', text: 'Publish', disabled: 'disabled' });
    publishBtn.disabled = true;
    publishBtn.addEventListener('click', publishAll);
    actions.appendChild(publishBtn);
    if (!IS_LOCAL) {
      var logoutBtn = el('button', { className: 'btn btn--ghost btn--small', type: 'button', text: 'Log Out', onClick: function () {
        window.netlifyIdentity.logout();
      } });
      actions.appendChild(logoutBtn);
    }
    topbar.appendChild(actions);
    document.body.appendChild(topbar);

    var shell = el('div', { className: 'admin-shell' });
    var tabs = el('div', { className: 'admin-tabs' });
    var panelHome = el('div', { className: 'admin-panel is-active' });
    var panelWork = el('div', { className: 'admin-panel' });

    var tabHome = el('button', { className: 'admin-tab is-active', type: 'button', text: 'Homepage' });
    var tabWork = el('button', { className: 'admin-tab', type: 'button', text: 'Case Studies' });
    tabHome.addEventListener('click', function () {
      tabHome.classList.add('is-active'); tabWork.classList.remove('is-active');
      panelHome.classList.add('is-active'); panelWork.classList.remove('is-active');
    });
    tabWork.addEventListener('click', function () {
      tabWork.classList.add('is-active'); tabHome.classList.remove('is-active');
      panelWork.classList.add('is-active'); panelHome.classList.remove('is-active');
    });
    tabs.appendChild(tabHome);
    tabs.appendChild(tabWork);

    shell.appendChild(tabs);
    shell.appendChild(panelHome);
    shell.appendChild(panelWork);
    document.body.appendChild(shell);

    renderSiteForm(panelHome);
    renderCaseStudies(panelWork);
  }

  function showLoading() {
    document.body.innerHTML = '';
    document.body.appendChild(el('div', { className: 'admin-loading', text: 'Loading content…' }));
  }

  function startApp() {
    showLoading();
    loadContent().then(buildApp).catch(function (err) {
      console.error(err);
      document.body.innerHTML = '';
      document.body.appendChild(el('div', { className: 'admin-loading', text: 'Failed to load content. Check the console for details.' }));
    });
  }

  // ---------- Auth gate ----------
  function showGate() {
    document.body.innerHTML = '';
    document.body.appendChild(el('div', { className: 'admin-gate' }, [
      el('img', { className: 'admin-gate__logo', src: '../assets/hero/nav-logo.png', alt: 'Ezrah Design Co.' }),
      el('h1', { className: 'admin-gate__title', text: 'Content Editor' }),
      el('p', { className: 'admin-gate__sub', text: 'Log in to edit your site’s copy and images.' }),
      el('button', { className: 'btn btn--fill', type: 'button', text: 'Log In', onClick: function () {
        window.netlifyIdentity.open('login');
      } })
    ]));
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (IS_LOCAL) {
      startApp();
      return;
    }
    if (!window.netlifyIdentity) {
      document.body.appendChild(el('div', { className: 'admin-loading', text: 'Netlify Identity failed to load.' }));
      return;
    }
    window.netlifyIdentity.on('init', function (user) {
      if (user) startApp(); else showGate();
    });
    window.netlifyIdentity.on('login', function () {
      window.netlifyIdentity.close();
      startApp();
    });
    window.netlifyIdentity.on('logout', showGate);
    window.netlifyIdentity.init();
  });
})();
