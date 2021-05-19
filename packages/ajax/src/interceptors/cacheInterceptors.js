/* eslint-disable no-param-reassign */
import '../typedef.js';
import { validateCacheOptions, stringifySearchParams, getCache } from '../cache.js';

/**
 * Request interceptor to return relevant cached requests
 * @param {function(): string} getCacheIdentifier used to invalidate cache if identifier is changed
 * @param {CacheOptions} globalCacheOptions
 * @returns {RequestInterceptor}
 */
const createCacheRequestInterceptor = (getCacheIdentifier, globalCacheOptions) => {
  const validatedInitialCacheOptions = validateCacheOptions(globalCacheOptions);

  return /** @param {CacheRequest} cacheRequest */ async cacheRequest => {
    const cacheOptions = validateCacheOptions({
      ...validatedInitialCacheOptions,
      ...cacheRequest.cacheOptions,
    });

    cacheRequest.cacheOptions = cacheOptions;

    // don't use cache if 'useCache' === false
    if (!cacheOptions.useCache) {
      return cacheRequest;
    }

    const requestId = cacheOptions.requestIdentificationFn(cacheRequest, stringifySearchParams);
    // cacheIdentifier is used to bind the cache to the current session
    const cacheIdentifier = getCacheIdentifier();
    const cache = getCache(cacheIdentifier);
    const { method } = cacheRequest;

    // don't use cache if the request method is not part of the configs methods
    if (!cacheOptions.methods.includes(method.toLowerCase())) {
      // NOTE: I don't understand the point of this section. Why suddenly start deleting (existing) caches
      //       when someone tries to cache a request with another method? I think this can be removed.
      //
      // // If it's NOT one of the config.methods, invalidate caches
      // cache.delete(requestId);
      // // also invalidate caches matching to cacheOptions
      // if (cacheOptions.invalidateUrls) {
      //   cacheOptions.invalidateUrls.forEach(
      //     /** @type {string} */ invalidateUrl => {
      //       cache.delete(invalidateUrl);
      //     },
      //   );
      // }
      // // also invalidate caches matching to invalidateUrlsRegex
      // if (cacheOptions.invalidateUrlsRegex) {
      //   cache.deleteMatched(cacheOptions.invalidateUrlsRegex);
      // }

      return cacheRequest;
    }

    const pendingRequest = cache.getPendingRequest(requestId);
    if (pendingRequest) {
      // there is another concurrent request, wait for it to finish
      await pendingRequest;
    }

    const cacheResponse = cache.get(requestId, cacheOptions.timeToLive);
    if (cacheResponse) {
      cacheRequest.cacheOptions = cacheRequest.cacheOptions ?? { useCache: false };
      /** @type {CacheResponse} */
      const response = cacheResponse.clone();
      response.request = cacheRequest;
      response.fromCache = true;
      return response;
    }

    // We want to cache this request, and it's not already cached
    // Mark this as a pending request, so that concurrent requests can use the response from this request
    cache.setPendingRequest(requestId);

    cacheRequest.requestCache = cache;

    return cacheRequest;
  };
};

/**
 * Response interceptor to cache relevant requests
 * @param {CacheOptions} globalCacheOptions
 * @returns {ResponseInterceptor}
 */
const createCacheResponseInterceptor = globalCacheOptions => {
  const validatedInitialCacheOptions = validateCacheOptions(globalCacheOptions);

  /**
   * Axios response https://github.com/axios/axios#response-schema
   */
  return /** @param {CacheResponse} cacheResponse */ async cacheResponse => {
    if (!cacheResponse.request) {
      throw new Error('Missing request in response');
    }
    const cache = cacheResponse.request.requestCache;
    if (!cache) {
      return cacheResponse;
    }

    const cacheOptions = validateCacheOptions({
      ...validatedInitialCacheOptions,
      ...cacheResponse.request?.cacheOptions,
    });

    // string that identifies cache entry
    const requestId = cacheOptions.requestIdentificationFn(
      cacheResponse.request,
      stringifySearchParams,
    );
    const isAlreadyFromCache = !!cacheResponse.fromCache;
    // caching all responses with not default `timeToLive`
    const isCacheActive = cacheOptions.timeToLive > 0;
    const isMethodSupported = cacheOptions.methods.includes(
      cacheResponse.request.method.toLowerCase(),
    );
    // if the request is one of the options.methods; store response in cache
    if (!isAlreadyFromCache && isCacheActive && isMethodSupported) {
      // store the response data in the cache and mark request as resolved
      cache.set(requestId, cacheResponse.clone());
      cache.resolvePendingRequest(requestId);
    }

    return cacheResponse;
  };
};

/**
 * Response interceptor to cache relevant requests
 * @param {function(): string} getCacheIdentifier used to invalidate cache if identifier is changed
 * @param {CacheOptions} globalCacheOptions
 * @returns [{RequestInterceptor}, {ResponseInterceptor}]
 */
export const createCacheInterceptors = (getCacheIdentifier, globalCacheOptions) => {
  const requestInterceptor = createCacheRequestInterceptor(getCacheIdentifier, globalCacheOptions);
  const responseInterceptor = createCacheResponseInterceptor(globalCacheOptions);
  return [requestInterceptor, responseInterceptor];
};
