/**
 * Custom Decap CMS preview templates.
 *
 * By default Decap's preview pane just dumps field values as plain text —
 * not useful for judging how a change actually looks. These templates
 * reuse the site's real styles.css and real markup structure so the
 * preview pane is a genuine (if simplified) live rendering of the page.
 *
 * `createClass` and `h` are globals injected by the decap-cms.js bundle
 * loaded in admin/index.html — no separate React script tag needed.
 */

CMS.registerPreviewStyle('../styles.css');

function img(src, alt, extraProps) {
  var props = Object.assign({ src: src, alt: alt || '' }, extraProps || {});
  return h('img', props);
}

function html(tag, className, htmlContent, extraProps) {
  var props = Object.assign({ className: className, dangerouslySetInnerHTML: { __html: htmlContent || '' } }, extraProps || {});
  return h(tag, props);
}

// ---------- Homepage & Site Settings ----------

var SitePreview = createClass({
  render: function () {
    var data = this.props.entry.get('data');
    var getAsset = this.props.getAsset;

    function get(path, fallback) {
      var v = data.getIn(path);
      return v === undefined || v === null ? (fallback || '') : v;
    }

    // Our JSON stores full site-relative paths (e.g. "assets/about/desk.jpg"),
    // not bare filenames in the media_folder, so getAsset() isn't the right
    // tool here (it assumes the latter). The preview iframe is served from
    // /admin/, so a plain "../" prefix resolves these correctly — the same
    // trick cms-loader.js uses on the real project pages.
    function assetUrl(path) {
      var v = get(path, '');
      if (!v) return '';
      if (/^(https?:)?\/\//.test(v)) return v;
      return '../' + v;
    }

    function cards(path) {
      var list = data.getIn(path);
      return list ? list.toJS() : [];
    }

    return h('div', { className: 'cms-preview' }, [
      h('section', { className: 'hero container', key: 'hero' },
        html('h1', 'hero__headline', get(['hero', 'headline']))
      ),

      h('section', { className: 'gallery gallery--featured container', key: 'featured' },
        cards(['featuredProjects']).map(function (p, i) {
          if (p.visible === false) return null;
          return h('div', { className: 'project-card project-card--featured', key: 'f' + i, style: { background: '#ddd' } },
            h('div', { className: 'project-card-overlay' }, [
              h('h3', { className: 'project-card-title', key: 't' }, p.title),
              h('span', { className: 'project-card-category', key: 'c' }, p.category)
            ])
          );
        })
      ),

      h('section', { className: 'intro container', key: 'intro' }, [
        h('div', { className: 'intro__image', key: 'img' }, img(assetUrl(['intro', 'image']), get(['intro', 'imageAlt']))),
        h('div', { className: 'intro__content', key: 'content' }, [
          h('h2', { className: 'intro__heading', key: 'h' }, get(['intro', 'heading'])),
          h('p', { className: 'intro__body', key: 'b' }, get(['intro', 'body'])),
          h('a', { className: 'btn btn--fill', key: 'cta' }, get(['intro', 'ctaLabel']))
        ])
      ]),

      h('section', { className: 'gallery gallery--simple container', key: 'simple' },
        cards(['simpleProjects']).map(function (p, i) {
          if (p.visible === false) return null;
          return h('div', { className: 'project-card project-card--simple', key: 's' + i, style: { background: '#ddd' } },
            h('div', { className: 'project-card-overlay' }, [
              h('h3', { className: 'project-card-title', key: 't' }, p.title),
              h('span', { className: 'project-card-category', key: 'c' }, p.category)
            ])
          );
        })
      ),

      h('section', { className: 'about container', key: 'about' }, [
        h('h2', { className: 'section-heading', key: 'h' }, get(['about', 'heading'])),
        h('div', { className: 'about__body', key: 'body' }, [
          h('div', { className: 'about__main', key: 'main' }, [
            h('div', { className: 'about__paragraph-wrap', key: 'p' }, [
              h('p', { className: 'about__paragraph', key: 'p1' }, get(['about', 'paragraph1'])),
              h('p', { className: 'about__paragraph', key: 'p2' }, get(['about', 'paragraph2']))
            ]),
            h('div', { className: 'about__photo', key: 'photo' }, img(assetUrl(['about', 'photo']), get(['about', 'photoAlt']))),
            h('div', { className: 'about__carousel-clip', key: 'carousel', style: { display: 'flex', gap: '10px', overflowX: 'auto' } },
              cards(['about', 'carousel']).map(function (photo, i) {
                return h('div', { className: 'about__polaroid', key: 'ph' + i }, img(assetUrl(['about', 'carousel', i, 'src']) || photo.src, photo.alt));
              })
            )
          ]),
          html('p', 'about__caption', get(['about', 'caption']))
        ])
      ]),

      h('section', { className: 'contact', key: 'contact' }, [
        html('h2', 'section-heading contact__heading', get(['contact', 'heading'])),
        h('div', { className: 'contact__person', key: 'person' }, [
          h('div', { className: 'contact__avatar', key: 'avatar' }, img(assetUrl(['contact', 'avatar']), get(['contact', 'avatarAlt']))),
          h('div', { className: 'contact__meta', key: 'meta' }, [
            h('p', { className: 'contact__name', key: 'n' }, get(['contact', 'name'])),
            h('p', { className: 'contact__role', key: 'r' }, get(['contact', 'role']))
          ])
        ]),
        h('div', { className: 'contact__links', key: 'links' }, [
          h('a', { className: 'contact__link contact__link--email', key: 'email' }, 'Email Me'),
          h('a', { className: 'contact__link contact__link--instagram', key: 'ig' }, 'Instagram'),
          h('a', { className: 'contact__link contact__link--linkedin', key: 'li' }, 'LinkedIn')
        ])
      ])
    ]);
  }
});

CMS.registerPreviewTemplate('site', SitePreview);

// ---------- Case Studies ----------

var GALLERY_LAYOUTS = {
  squares: 'project-detail__media-squares',
  full: 'project-detail__media-full',
  'full-fit': 'project-detail__media-full project-detail__media-full--fit',
  'tall-pair': 'project-detail__media-tall-pair',
  triple: 'project-detail__media-triple',
  quad: 'project-detail__media-quad'
};

var WorkPreview = createClass({
  render: function () {
    var data = this.props.entry.get('data');
    var getAsset = this.props.getAsset;

    function get(path, fallback) {
      var v = data.getIn(path);
      return v === undefined || v === null ? (fallback || '') : v;
    }

    function assetUrl(raw) {
      if (!raw) return '';
      if (/^(https?:)?\/\//.test(raw)) return raw;
      return '../' + raw;
    }

    var gallery = data.getIn(['gallery']);
    gallery = gallery ? gallery.toJS() : [];

    return h('div', { className: 'cms-preview' },
      h('section', { className: 'project-detail container' }, [
        h('div', { className: 'project-detail__hero', key: 'hero' }, img(assetUrl(get(['hero', 'src'])), get(['hero', 'alt']))),

        h('div', { className: 'project-detail__title-row', key: 'title' }, [
          h('h1', { className: 'section-heading project-detail__title', key: 't' }, get(['title'])),
          h('span', { className: 'project-card-category', key: 'c' }, get(['category']))
        ]),

        h('div', { className: 'project-detail__section', key: 'overview' }, [
          h('p', { className: 'project-detail__overview-text', key: 'o' }, get(['overview'])),
          get(['overviewNote']) ? h('p', { className: 'project-detail__overview-note', key: 'n' }, get(['overviewNote'])) : null
        ]),

        h('div', { className: 'project-detail__section', key: 'fields' },
          h('div', { className: 'project-detail__grid' }, [
            ['Client', 'client'], ['Tools Used', 'tools'], ['Industry', 'industry'], ['Timeframe', 'timeframe']
          ].map(function (pair) {
            return h('div', { className: 'project-detail__field', key: pair[1] }, [
              h('p', { className: 'project-detail__field-label', key: 'l' }, pair[0]),
              h('p', { className: 'project-detail__field-value', key: 'v' }, get([pair[1]]))
            ]);
          }))
        ),

        h('div', { className: 'project-detail__media', key: 'gallery' },
          gallery.map(function (block, i) {
            var className = GALLERY_LAYOUTS[block.type] || 'project-detail__media-full';
            var images = block.images || [];
            return h('div', { className: className, key: 'g' + i },
              images.map(function (photo, j) {
                var extra = photo.aspect ? { style: { aspectRatio: photo.aspect } } : {};
                return img(assetUrl(photo.src), photo.alt, Object.assign({ key: 'i' + j }, extra));
              })
            );
          })
        )
      ])
    );
  }
});

CMS.registerPreviewTemplate('work', WorkPreview);
