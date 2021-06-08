/* eslint-disable no-param-reassign */
import '../typedef.js';
import {
  getCacheById,
  extendCacheOptions,
  validateCacheOptions,
  invalidateMatchingCache,
  pendingRequestStore,
} from '../cacheManager.js';

/**
 * Request interceptor to return relevant cached requests
 * @param {function(): string} getCacheId used to invalidate cache if identifier is changed
 * @param {CacheOptions} globalCacheOptions
 * @returns {RequestInterceptor}
 */
const createCacheRequestInterceptor = (
  getCacheId,
  globalCacheOptions,
) => /** @param {CacheRequest} request */ async request => {
  validateCacheOptions(request.cacheOptions);

  const cacheOptions = extendCacheOptions({
    ...globalCacheOptions,
    ...request.cacheOptions,
  });

  request.cacheOptions = cacheOptions;

  if (!cacheOptions.useCache) {
    return request;
  }

  const requestId = cacheOptions.requestIdFunction(request);
  const cacheId = getCacheId(); // cacheId is used to bind the cache to the current session
  const cache = getCacheById(cacheId);
  const { method } = request;
  const isMethodSupported = cacheOptions.methods.includes(method.toLowerCase());

  // don't use cache if the request method is not part of the configs methods
  if (!isMethodSupported) {
    const { invalidateUrls, invalidateUrlsRegex } = cacheOptions;
    invalidateMatchingCache({ requestId, invalidateUrls, invalidateUrlsRegex });
    return request;
  }

  const pendingRequest = pendingRequestStore.get(requestId);
  if (pendingRequest) {
    // there is another concurrent request, wait for it to finish
    await pendingRequest;
  }

  const cacheResponse = cache.get(requestId, cacheOptions.timeToLive);
  if (cacheResponse) {
    request.cacheOptions = request.cacheOptions ?? { useCache: false };
    /** @type {CacheResponse} */
    const response = cacheResponse.clone();
    response.request = request;
    response.fromCache = true;
    return response;
  }

  // We want to cache this request, and it's not already cached
  // Mark this as a pending request, so that concurrent requests can use the response from this request
  pendingRequestStore.set(requestId);

  request.requestCache = cache;

  return request;
};

/**
 * Response interceptor to cache relevant requests
 * @param {CacheOptions} globalCacheOptions
 * @returns {ResponseInterceptor}
 */
const createCacheResponseInterceptor = globalCacheOptions => /** @param {CacheResponse} response */ async response => {
  if (!response.request) {
    throw new Error('Missing request in response');
  }
  const cache = response.request.requestCache;
  if (!cache) {
    return response;
  }

  const cacheOptions = extendCacheOptions({
    ...globalCacheOptions,
    ...response.request?.cacheOptions,
  });

  // string that identifies cache entry
  const requestId = cacheOptions.requestIdFunction(response.request);
  const isAlreadyFromCache = !!response.fromCache;
  // caching all responses with not default `timeToLive`
  const isCacheActive = cacheOptions.timeToLive > 0;
  const isMethodSupported = cacheOptions.methods.includes(response.request.method.toLowerCase());

  // if the request is one of the options.methods; store response in cache
  if (!isAlreadyFromCache && isCacheActive && isMethodSupported) {
    // store the response data in the cache and mark request as resolved
    cache.set(requestId, response.clone());
    pendingRequestStore.resolve(requestId);
  }

  return response;
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
