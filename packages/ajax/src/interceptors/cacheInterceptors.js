/* eslint-disable no-param-reassign */
import '../typedef.js';
import { getCacheById, sanitiseCacheOptions, validateCacheOptions } from '../cacheManager.js';

/**
 * Request interceptor to return relevant cached requests
 * @param {function(): string} getCacheId used to invalidate cache if identifier is changed
 * @param {CacheOptions} globalCacheOptions
 * @returns {RequestInterceptor}
 */
const createCacheRequestInterceptor = (
  getCacheId,
  globalCacheOptions,
) => /** @param {CacheRequest} cacheRequest */ async cacheRequest => {
  const cacheOptions = sanitiseCacheOptions({
    ...globalCacheOptions,
    ...cacheRequest.cacheOptions,
  });
  validateCacheOptions(cacheOptions);

  cacheRequest.cacheOptions = cacheOptions;

  if (!cacheOptions.useCache) {
    return cacheRequest; // bypass cache
  }

  const requestId = cacheOptions.requestIdFunction(cacheRequest);
  const cacheId = getCacheId(); // cacheId is used to bind the cache to the current session
  const cache = getCacheById(cacheId);
  const { method } = cacheRequest;
  const isMethodSupported = cacheOptions.methods.includes(method.toLowerCase());

  const invalidateMatchingCache = () => {
    // There are two kinds of invalidate rules:
    // invalidateUrls (array of URL like strings)
    // invalidateUrlsRegex (RegExp)
    // If a non-GET method is fired, by default it only invalidates its own endpoint.
    // Invalidating /api/users cache by doing a PATCH, will not invalidate /api/accounts cache.
    // However, in the case of users and accounts, they may be very interconnected,
    // so perhaps you do want to invalidate /api/accounts when invalidating /api/users.

    // If it's NOT one of the config.methods, invalidate caches
    cache.deleteMatched(requestId);
    // also invalidate caches matching to cacheOptions
    if (cacheOptions.invalidateUrls) {
      cacheOptions.invalidateUrls.forEach(
        /** @type {string} */ invalidateUrl => {
          cache.deleteMatched(invalidateUrl);
        },
      );
    }
    // also invalidate caches matching to invalidateUrlsRegex
    if (cacheOptions.invalidateUrlsRegex) {
      cache.deleteMatched(cacheOptions.invalidateUrlsRegex);
    }
  };

  // don't use cache if the request method is not part of the configs methods
  if (!isMethodSupported) {
    invalidateMatchingCache();
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

/**
 * Response interceptor to cache relevant requests
 * @param {CacheOptions} globalCacheOptions
 * @returns {ResponseInterceptor}
 */
const createCacheResponseInterceptor = globalCacheOptions => /** @param {CacheResponse} cacheResponse */ async cacheResponse => {
  if (!cacheResponse.request) {
    throw new Error('Missing request in response');
  }
  const cache = cacheResponse.request.requestCache;
  if (!cache) {
    return cacheResponse;
  }

  const cacheOptions = sanitiseCacheOptions({
    ...globalCacheOptions,
    ...cacheResponse.request?.cacheOptions,
  });
  validateCacheOptions(cacheOptions);

  // string that identifies cache entry
  const requestId = cacheOptions.requestIdFunction(cacheResponse.request);
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

/**
 * Response interceptor to cache relevant requests
 * @param {function(): string} getCacheId used to invalidate cache if identifier is changed
 * @param {CacheOptions} globalCacheOptions
 * @returns [{RequestInterceptor}, {ResponseInterceptor}]
 */
export const createCacheInterceptors = (getCacheId, globalCacheOptions) => {
  validateCacheOptions(globalCacheOptions);
  const requestInterceptor = createCacheRequestInterceptor(getCacheId, globalCacheOptions);
  const responseInterceptor = createCacheResponseInterceptor(globalCacheOptions);
  return [requestInterceptor, responseInterceptor];
};
