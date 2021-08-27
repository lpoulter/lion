/* eslint-disable no-param-reassign */
import '../typedef.js';
import {
  ajaxCache,
  resetCacheSession,
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
  resetCacheSession(getCacheId()); // cacheId is used to bind the cache to the current session

  const cacheOptions = extendCacheOptions({
    ...globalCacheOptions,
    ...request.cacheOptions,
  });

  // store cacheOptions in the request, to use it in the response interceptor.
  request.cacheOptions = cacheOptions;

  if (!cacheOptions.useCache) {
    return request;
  }

  const requestId = cacheOptions.requestIdFunction(request);
  const isMethodSupported = cacheOptions.methods.includes(request.method.toLowerCase());

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

  const cachedResponse = ajaxCache.get(requestId, cacheOptions.timeToLive);
  if (cachedResponse) {
    // Return the response from cache
    request.cacheOptions = request.cacheOptions ?? { useCache: false };
    /** @type {CacheResponse} */
    const response = cachedResponse.clone();
    response.request = request;
    response.fromCache = true;
    return response;
  }

  // Mark this as a pending request, so that concurrent requests can use the response from this request
  pendingRequestStore.set(requestId);
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
  const cacheOptions = extendCacheOptions({
    ...globalCacheOptions,
    ...response.request?.cacheOptions,
  });

  const requestId = cacheOptions.requestIdFunction(response.request);
  const isAlreadyFromCache = !!response.fromCache;
  const isCacheActive = cacheOptions.timeToLive > 0;
  const isMethodSupported = cacheOptions.methods.includes(response.request?.method.toLowerCase());

  if (!isAlreadyFromCache && isCacheActive && isMethodSupported) {
    // Cache the response and mark the pending request as resolved
    ajaxCache.set(requestId, response.clone());
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
