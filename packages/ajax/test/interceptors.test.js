import { expect } from '@open-wc/testing';
import { spy, stub, useFakeTimers } from 'sinon';
import '../src/typedef.js';
import { acceptLanguageRequestInterceptor } from '../src/interceptors/acceptLanguageHeader.js';
import { createXsrfRequestInterceptor, getCookie } from '../src/interceptors/xsrfHeader.js';
import { createCacheInterceptors } from '../src/interceptors/cacheInterceptors.js';
import { Ajax } from '../index.js';
import { extendCacheOptions } from '../src/cacheManager.js';

/** @type {Ajax} */
let ajax;

describe('interceptors', () => {
  beforeEach(() => {
    ajax = new Ajax();
  });

  describe('getCookie()', () => {
    it('returns the cookie value', () => {
      expect(getCookie('foo', { cookie: 'foo=bar' })).to.equal('bar');
    });

    it('returns the cookie value when there are multiple cookies', () => {
      expect(getCookie('foo', { cookie: 'foo=bar; bar=foo;lorem=ipsum' })).to.equal('bar');
    });

    it('returns null when the cookie cannot be found', () => {
      expect(getCookie('foo', { cookie: 'bar=foo;lorem=ipsum' })).to.equal(null);
    });

    it('decodes the cookie vaue', () => {
      expect(getCookie('foo', { cookie: `foo=${decodeURIComponent('/foo/ bar "')}` })).to.equal(
        '/foo/ bar "',
      );
    });
  });

  describe('acceptLanguageRequestInterceptor()', () => {
    it('adds the locale as accept-language header', () => {
      const request = new Request('/foo/');
      acceptLanguageRequestInterceptor(request);
      expect(request.headers.get('accept-language')).to.equal('en');
    });

    it('does not change an existing accept-language header', () => {
      const request = new Request('/foo/', { headers: { 'accept-language': 'my-accept' } });
      acceptLanguageRequestInterceptor(request);
      expect(request.headers.get('accept-language')).to.equal('my-accept');
    });
  });

  describe('createXsrfRequestInterceptor()', () => {
    it('adds the xsrf token header to the request', () => {
      const interceptor = createXsrfRequestInterceptor('XSRF-TOKEN', 'X-XSRF-TOKEN', {
        cookie: 'XSRF-TOKEN=foo',
      });
      const request = new Request('/foo/');
      interceptor(request);
      expect(request.headers.get('X-XSRF-TOKEN')).to.equal('foo');
    });

    it('does not set anything if the cookie is not there', () => {
      const interceptor = createXsrfRequestInterceptor('XSRF-TOKEN', 'X-XSRF-TOKEN', {
        cookie: 'XXSRF-TOKEN=foo',
      });
      const request = new Request('/foo/');
      interceptor(request);
      expect(request.headers.get('X-XSRF-TOKEN')).to.equal(null);
    });
  });

  describe('cache interceptors', () => {
    /** @type {number | undefined} */
    let cacheId;
    /** @type {import('sinon').SinonStub} */
    let fetchStub;
    const getCacheIdentifier = () => String(cacheId);
    /** @type {import('sinon').SinonSpy} */
    let ajaxRequestSpy;

    const newCacheId = () => {
      if (!cacheId) {
        cacheId = 1;
      } else {
        cacheId += 1;
      }
      return cacheId;
    };

    /**
     * @param {Ajax} ajaxInstance
     * @param {CacheOptions} options
     */
    const addCacheInterceptors = (ajaxInstance, options) => {
      const { cacheRequestInterceptor, cacheResponseInterceptor } = createCacheInterceptors(
        getCacheIdentifier,
        options,
      );

      ajaxInstance._requestInterceptors.push(cacheRequestInterceptor);
      ajaxInstance._responseInterceptors.push(cacheResponseInterceptor);
    };

    beforeEach(() => {
      fetchStub = stub(window, 'fetch');
      fetchStub.returns(Promise.resolve(new Response('mock response')));
      ajaxRequestSpy = spy(ajax, 'fetch');
    });

    afterEach(() => {
      ajaxRequestSpy.restore();
      fetchStub.restore();
    });

    describe('Original ajax instance', () => {
      it('allows direct ajax calls without cache interceptors configured', async () => {
        await ajax.fetch('/test');
        expect(fetchStub.callCount).to.equal(1);
        await ajax.fetch('/test');
        expect(fetchStub.callCount).to.equal(2);
      });
    });

    describe('Cache config validation', () => {
      it('validates `useCache`', () => {
        newCacheId();
        const test = () => {
          addCacheInterceptors(ajax, {
            // @ts-ignore needed for test
            useCache: 'fakeUseCacheType',
          });
        };
        expect(test).to.throw();
      });

      it('validates property `maxAge` throws if not type `number`', () => {
        newCacheId();
        expect(() => {
          addCacheInterceptors(ajax, {
            useCache: true,
            // @ts-ignore needed for test
            maxAge: '',
          });
        }).to.throw();
      });

      it('validates cache identifier function', async () => {
        const cacheSessionId = cacheId;
        // @ts-ignore needed for test
        cacheId = '';

        addCacheInterceptors(ajax, { useCache: true });
        await ajax
          .fetch('/test')
          .catch(
            /** @param {Error} err */ err => {
              expect(err.message).to.equal('Invalid cache identifier');
            },
          )
          .finally(() => {});
        cacheId = cacheSessionId;
      });

      it("throws when using methods other than `['get']`", () => {
        newCacheId();

        expect(() => {
          addCacheInterceptors(ajax, {
            useCache: true,
            methods: ['get', 'post'],
          });
        }).to.throw(/Cache can only be utilized with `GET` method/);
      });

      it('throws error when requestIdFunction is not a function', () => {
        newCacheId();

        expect(() => {
          addCacheInterceptors(ajax, {
            useCache: true,
            // @ts-ignore needed for test
            requestIdFunction: 'not a function',
          });
        }).to.throw(/Property `requestIdFunction` must be a `function`/);
      });
    });

    describe('Cached responses', () => {
      it('returns the cached object on second call with `useCache: true`', async () => {
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 100,
        });

        await ajax.fetch('/test');
        expect(ajaxRequestSpy.calledOnce).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test')).to.be.true;
        await ajax.fetch('/test');
        expect(fetchStub.callCount).to.equal(1);
      });

      // TODO: Check if this is the behaviour we want
      it('all calls with non-default `maxAge` are cached proactively', async () => {
        // Given
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: false,
          maxAge: 100,
        });

        // When
        await ajax.fetch('/test');

        // Then
        expect(ajaxRequestSpy.calledOnce).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test')).to.be.true;
        expect(fetchStub.callCount).to.equal(1);

        // When
        await ajax.fetch('/test', {
          cacheOptions: {
            useCache: true,
          },
        });

        // Then
        expect(fetchStub.callCount).to.equal(2);

        // When
        await ajax.fetch('/test', {
          cacheOptions: {
            useCache: true,
          },
        });

        // Then
        expect(fetchStub.callCount).to.equal(2);
      });

      it('returns the cached object on second call with `useCache: true`, with querystring parameters', async () => {
        // Given
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 100,
        });

        // When
        await ajax.fetch('/test', {
          params: {
            q: 'test',
            page: 1,
          },
        });

        // Then
        expect(ajaxRequestSpy.calledOnce).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test')).to.be.true;
        expect(fetchStub.callCount).to.equal(1);

        // When
        await ajax.fetch('/test', {
          params: {
            q: 'test',
            page: 1,
          },
        });

        // Then
        expect(fetchStub.callCount).to.equal(1);

        // a request with different param should not be cached

        // When
        await ajax.fetch('/test', {
          params: {
            q: 'test',
            page: 2,
          },
        });

        // Then
        expect(fetchStub.callCount).to.equal(2);
      });

      it('uses cache when inside `maxAge: 5000` window', async () => {
        newCacheId();
        const clock = useFakeTimers({
          shouldAdvanceTime: true,
        });

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 5000,
        });

        await ajax.fetch('/test');
        expect(ajaxRequestSpy.calledOnce).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test')).to.be.true;
        expect(fetchStub.callCount).to.equal(1);
        clock.tick(4900);
        await ajax.fetch('/test');
        expect(fetchStub.callCount).to.equal(1);
        clock.tick(5100);
        await ajax.fetch('/test');
        expect(fetchStub.callCount).to.equal(2);
        clock.restore();
      });

      it('uses custom requestIdFunction when passed', async () => {
        newCacheId();

        const customRequestIdFn = /** @type {RequestIdFunction} */ (request, serializer) => {
          let serializedRequestParams = '';
          if (request.params) {
            // @ts-ignore assume serializer is defined
            serializedRequestParams = `?${serializer(request.params)}`;
          }
          return `${new URL(/** @type {string} */ (request.url)).pathname}-${request.headers?.get(
            'x-id',
          )}${serializedRequestParams}`;
        };
        const reqIdSpy = spy(customRequestIdFn);
        addCacheInterceptors(ajax, {
          useCache: true,
          requestIdFunction: reqIdSpy,
        });

        await ajax.fetch('/test', { headers: { 'x-id': '1' } });
        expect(reqIdSpy.calledOnce);
        expect(reqIdSpy.returnValues[0]).to.equal(`/test-1`);
      });
    });

    describe('Cache invalidation', () => {
      it('previously cached data has to be invalidated when regex invalidation rule triggered', async () => {
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 1000,
          invalidateUrlsRegex: /foo/gi,
        });

        await ajax.fetch('/test'); // new url
        expect(fetchStub.callCount).to.equal(1);
        await ajax.fetch('/test'); // cached
        expect(fetchStub.callCount).to.equal(1);

        await ajax.fetch('/foo-request-1'); // new url
        expect(fetchStub.callCount).to.equal(2);
        await ajax.fetch('/foo-request-1'); // cached
        expect(fetchStub.callCount).to.equal(2);

        await ajax.fetch('/foo-request-3'); // new url
        expect(fetchStub.callCount).to.equal(3);

        await ajax.fetch('/test', { method: 'POST' }); // clear cache
        expect(fetchStub.callCount).to.equal(4);
        await ajax.fetch('/foo-request-1'); // not cached anymore
        expect(fetchStub.callCount).to.equal(5);
        await ajax.fetch('/foo-request-2'); // not cached anymore
        expect(fetchStub.callCount).to.equal(6);
      });

      it('previously cached data has to be invalidated when regex invalidation rule triggered and urls are nested', async () => {
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 1000,
          invalidateUrlsRegex: /posts/gi,
        });

        await ajax.fetch('/test');
        await ajax.fetch('/test'); // cached
        expect(fetchStub.callCount).to.equal(1);
        await ajax.fetch('/posts');
        expect(fetchStub.callCount).to.equal(2);
        await ajax.fetch('/posts'); // cached
        expect(fetchStub.callCount).to.equal(2);
        await ajax.fetch('/posts/1');
        expect(fetchStub.callCount).to.equal(3);
        await ajax.fetch('/posts/1'); // cached
        expect(fetchStub.callCount).to.equal(3);
        // cleans cache for defined urls
        await ajax.fetch('/test', { method: 'POST' });
        expect(fetchStub.callCount).to.equal(4);
        await ajax.fetch('/posts'); // no longer cached => new request
        expect(fetchStub.callCount).to.equal(5);
        await ajax.fetch('/posts/1'); // no longer cached => new request
        expect(fetchStub.callCount).to.equal(6);
      });

      it('deletes cache after one hour', async () => {
        newCacheId();
        const clock = useFakeTimers({
          shouldAdvanceTime: true,
        });

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 1000 * 60 * 60,
        });

        await ajax.fetch('/test-hour');
        expect(ajaxRequestSpy.calledOnce).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test-hour')).to.be.true;
        expect(fetchStub.callCount).to.equal(1);
        clock.tick(1000 * 60 * 59); // 0:59 hour
        await ajax.fetch('/test-hour');
        expect(fetchStub.callCount).to.equal(1);
        clock.tick(1000 * 60 * 2); // +2 minutes => 1:01 hour
        await ajax.fetch('/test-hour');
        expect(fetchStub.callCount).to.equal(2);
        clock.restore();
      });

      it('invalidates invalidateUrls endpoints', async () => {
        const { requestIdFunction } = extendCacheOptions({});

        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 500,
        });

        const cacheOptions = {
          invalidateUrls: [
            requestIdFunction({
              url: new URL('/test-invalid-url', window.location.href).toString(),
              params: { foo: 1, bar: 2 },
            }),
          ],
        };

        await ajax.fetch('/test-valid-url', { cacheOptions });
        expect(fetchStub.callCount).to.equal(1);

        await ajax.fetch('/test-invalid-url?foo=1&bar=2');
        expect(fetchStub.callCount).to.equal(2);

        await ajax.fetch('/test-invalid-url?foo=1&bar=2');
        expect(fetchStub.callCount).to.equal(2);

        // 'post' will invalidate 'own' cache and the one mentioned in config
        await ajax.fetch('/test-valid-url', { cacheOptions, method: 'POST' });
        expect(fetchStub.callCount).to.equal(3);

        await ajax.fetch('/test-invalid-url?foo=1&bar=2');
        // indicates that 'test-invalid-url' cache was removed
        // because the server registered new request
        expect(fetchStub.callCount).to.equal(4);
      });

      it('invalidates cache on a post', async () => {
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 100,
        });

        await ajax.fetch('/test-post');
        expect(ajaxRequestSpy.calledOnce).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test-post')).to.be.true;
        expect(fetchStub.callCount).to.equal(1);
        await ajax.fetch('/test-post', { method: 'POST', body: 'data-post' });
        expect(ajaxRequestSpy.calledTwice).to.be.true;
        expect(ajaxRequestSpy.calledWith('/test-post')).to.be.true;
        expect(fetchStub.callCount).to.equal(2);
        await ajax.fetch('/test-post');
        expect(fetchStub.callCount).to.equal(3);
      });

      it('caches response but does not return it when expiration time is 0', async () => {
        newCacheId();

        addCacheInterceptors(ajax, {
          useCache: true,
          maxAge: 0,
        });

        const clock = useFakeTimers();

        await ajax.fetch('/test');

        expect(ajaxRequestSpy.calledOnce).to.be.true;

        expect(ajaxRequestSpy.calledWith('/test')).to.be.true;

        clock.tick(1);

        await ajax.fetch('/test');

        clock.restore();

        expect(fetchStub.callCount).to.equal(2);
      });
      //
      // it('does not use cache when `useCache: false` in the action', async () => {
      //   // @ts-ignore
      //   cacheId = 'cacheIdentifier2';
      //
      //   const ajaxAlwaysRequestSpy = spy(ajax, 'fetch');
      //   addCacheInterceptors(ajax, { useCache: true });
      //
      //   await ajax.fetch('/test');
      //   expect(ajaxAlwaysRequestSpy.calledOnce, 'calledOnce').to.be.true;
      //   expect(ajaxAlwaysRequestSpy.calledWith('/test'));
      //   await ajax.fetch('/test', { cacheOptions: { useCache: false } });
      //   expect(fetchStub.callCount).to.equal(2);
      //   ajaxAlwaysRequestSpy.restore();
      //
      // });
      //
      // it('caches concurrent requests', async () => {
      //   newCacheId();
      //
      //   let i = 0;
      //   fetchStub.returns(
      //     new Promise(resolve => {
      //       i += 1;
      //       setTimeout(() => {
      //         resolve(new Response(`mock response ${i}`));
      //       }, 5);
      //     }),
      //   );
      //
      //   addCacheInterceptors(ajax, {
      //     useCache: true,
      //     maxAge: 100,
      //   });
      //
      //   const request1 = ajax.fetch('/test');
      //   const request2 = ajax.fetch('/test');
      //   await aTimeout(1);
      //   const request3 = ajax.fetch('/test');
      //   await aTimeout(3);
      //   const request4 = ajax.fetch('/test');
      //   const responses = await Promise.all([request1, request2, request3, request4]);
      //   expect(fetchStub.callCount).to.equal(1);
      //   const responseTexts = await Promise.all(responses.map(r => r.text()));
      //   expect(responseTexts).to.eql([
      //     'mock response 1',
      //     'mock response 1',
      //     'mock response 1',
      //     'mock response 1',
      //   ]);
      //
      //
      // });
      //
      // it('preserves status and headers when returning cached response', async () => {
      //   newCacheId();
      //   fetchStub.returns(
      //     Promise.resolve(
      //       new Response('mock response', { status: 206, headers: { 'x-foo': 'x-bar' } }),
      //     ),
      //   );
      //
      //   addCacheInterceptors(ajax, {
      //     useCache: true,
      //     maxAge: 100,
      //   });
      //
      //   const response1 = await ajax.fetch('/test');
      //   const response2 = await ajax.fetch('/test');
      //   expect(fetchStub.callCount).to.equal(1);
      //   expect(response1.status).to.equal(206);
      //   expect(response1.headers.get('x-foo')).to.equal('x-bar');
      //   expect(response2.status).to.equal(206);
      //   expect(response2.headers.get('x-foo')).to.equal('x-bar');
      //
      //
      // });
    });
  });
});
