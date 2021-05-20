import './typedef.js';
import Cache from './Cache.js';

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
 * Returns the active `Cache` instance for the current session.
 * There can be only 1 active session at all times.
 * @param {string} cacheId The cache id that is tied to the current session
 * @returns {Cache} The cache corresponding to given cache id
 */
export const getCacheById = cacheId => {
  const shouldResetCache = !cacheId || cacheId !== currentCacheId;
  if (shouldResetCache) {
    currentCacheId = cacheId;
    currentCache = new Cache();
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
export const sanitiseCacheOptions = ({
  useCache = false,
  methods = ['get'],
  timeToLive = DEFAULT_TIME_TO_LIVE,
  getRequestId = DEFAULT_GET_REQUEST_ID,
  invalidateUrls,
  invalidateUrlsRegex,
}) => ({
  useCache,
  methods,
  timeToLive,
  getRequestId,
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
  getRequestId,
  invalidateUrls,
  invalidateUrlsRegex,
}) => {
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
  if (getRequestId !== undefined && typeof getRequestId !== 'function') {
    throw new Error('Property `getRequestId` must be a `function`');
  }
};
