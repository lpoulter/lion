import './typedef.js';
import Cache from './Cache.js';
import PendingRequestStore from './PendingRequestStore.js';

/**
 * The current cache
 * @type {Cache}
 */
let currentCache;

/**
 * The id for the current cache
 * @type {string | undefined}
 */
let currentCacheId;

/**
 * The pending request store
 * @type {PendingRequestStore}
 */
export const pendingRequestStore = new PendingRequestStore();

/**
 * Returns the active `Cache` instance for the current session.
 * There can be only 1 active session at all times.
 * @param {string} cacheId The cache id that is tied to the current session
 * @returns {Cache} The cache corresponding to given cache id
 */
export const getCacheById = cacheId => {
  if (!cacheId) {
    throw new Error('Invalid cache identifier');
  }
  if (cacheId !== currentCacheId) {
    currentCacheId = cacheId;
    currentCache = new Cache();
    pendingRequestStore.clear();
  }
  return currentCache;
};

/**
 * Stringify URL search params
 * @param {Params} params query string parameters object
 * @returns {string} of querystring parameters WITHOUT `?` or empty string ''
 */
const stringifySearchParams = (params = {}) =>
  typeof params === 'object' && params !== null ? new URLSearchParams(params).toString() : '';

/**
 * Returns request key string, which uniquely identifies a Request
 * @param {Partial<CacheRequest>} request Request object
 * @param {function} serializeSearchParams Function to serialize URL search params
 * @returns {string} requestId to uniquely identify a request
 */
const DEFAULT_GET_REQUEST_ID = (
  { url = '', params },
  serializeSearchParams = stringifySearchParams,
) => {
  const serializedParams = serializeSearchParams(params);
  return serializedParams ? `${url}?${serializedParams}` : url;
};

/**
 * Defaults to 1 hour
 */
const DEFAULT_TIME_TO_LIVE = 1000 * 60 * 60;

/**
 * @param {CacheOptions} options Cache options
 * @returns {ValidatedCacheOptions}
 */
export const extendCacheOptions = ({
  useCache = false,
  methods = ['get'],
  timeToLive = DEFAULT_TIME_TO_LIVE,
  requestIdFunction = DEFAULT_GET_REQUEST_ID,
  invalidateUrls,
  invalidateUrlsRegex,
}) => ({
  useCache,
  methods,
  timeToLive,
  requestIdFunction,
  invalidateUrls,
  invalidateUrlsRegex,
});

/**
 * @param {CacheOptions} options Cache options
 */
export const validateCacheOptions = ({
  useCache,
  methods,
  timeToLive,
  requestIdFunction,
  invalidateUrls,
  invalidateUrlsRegex,
} = {}) => {
  if (useCache !== undefined && typeof useCache !== 'boolean') {
    throw new Error('Property `useCache` must be a `boolean`');
  }
  if (methods !== undefined && JSON.stringify(methods) !== JSON.stringify(['get'])) {
    throw new Error('Cache can only be utilized with `GET` method');
  }
  if (timeToLive !== undefined && !Number.isFinite(timeToLive)) {
    throw new Error('Property `timeToLive` must be a finite `number`');
  }
  if (invalidateUrls !== undefined && !Array.isArray(invalidateUrls)) {
    throw new Error('Property `invalidateUrls` must be an `Array` or `falsy`');
  }
  if (invalidateUrlsRegex !== undefined && !(invalidateUrlsRegex instanceof RegExp)) {
    throw new Error('Property `invalidateUrlsRegex` must be a `RegExp` or `falsy`');
  }
  if (requestIdFunction !== undefined && typeof requestIdFunction !== 'function') {
    throw new Error('Property `getRequestId` must be a `function`');
  }
};

export const invalidateMatchingCache = ({ requestId, invalidateUrls, invalidateUrlsRegex }) => {
  // There are two kinds of invalidate rules:
  // invalidateUrls (array of URL like strings)
  // invalidateUrlsRegex (RegExp)
  // If a non-GET method is fired, by default it only invalidates its own endpoint.
  // Invalidating /api/users cache by doing a PATCH, will not invalidate /api/accounts cache.
  // However, in the case of users and accounts, they may be very interconnected,
  // so perhaps you do want to invalidate /api/accounts when invalidating /api/users.
  // If it's NOT one of the config.methods, invalidate caches

  /**
   * Invalidates matching in the cache and pendingRequestStore
   * @param {RegExp | string } regex an regular expression to match
   */
  const invalidateMatching = regex => {
    currentCache.delete(regex);
    pendingRequestStore.resolve(regex);
  };

  // invalidate this request
  invalidateMatching(requestId);

  // also invalidate caches matching to invalidateUrls
  if (Array.isArray(invalidateUrls)) {
    invalidateUrls.forEach(url => {
      invalidateMatching(url);
    });
  }
  // also invalidate caches matching to invalidateUrlsRegex
  if (invalidateUrlsRegex) {
    invalidateMatching(invalidateUrlsRegex);
  }
};
