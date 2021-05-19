/* eslint-disable no-param-reassign */
/* eslint-disable consistent-return */
import './typedef.js';

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DEFAULT_TIME_TO_LIVE = HOUR;

class Cache {
  constructor() {
    /**
     * @type {{ [url: string]: { createdAt: number, response: CacheResponse } }}
     * @private
     */
    this._cachedRequests = {};
    /**
     * @type {{ [url: string]: { promise: Promise<void>, resolve: (v?: any) => void } }}
     * @private
     */
    this._pendingRequests = {};
  }

  /**
   * Creates a promise for a pending request with given key
   * @param {string} requestKey
   */
  setPendingRequest(requestKey) {
    /** @type {(value: any) => void } */
    let resolve;
    if (!this._pendingRequests[requestKey]) {
      const promise = new Promise(_resolve => {
        resolve = _resolve;
      });
      // @ts-ignore
      this._pendingRequests[requestKey] = { promise, resolve };
    }
  }

  /**
   * Gets the promise for a pending request with given key
   * @param {string} requestKey
   * @returns {Promise<void> | undefined}
   */
  getPendingRequest(requestKey) {
    return this._pendingRequests[requestKey]?.promise;
  }

  /**
   * Resolves the promise for a pending request with given key
   * @param {string} requestKey
   */
  resolvePendingRequest(requestKey) {
    this._pendingRequests[requestKey]?.resolve();
    delete this._pendingRequests[requestKey];
  }

  /**
   * Store an item in the cache
   * @param {string} requestKey key by which the request is stored
   * @param {Response} response the cached response
   */
  set(requestKey, response) {
    this._cachedRequests[requestKey] = {
      createdAt: Date.now(),
      response,
    };
  }

  /**
   * Retrieve an item from the cache
   * @param {string} requestKey key by which the cache is stored
   * @param {number} maxAge maximum age of cached request to serve
   * @returns {CacheResponse | undefined}
   */
  get(requestKey, maxAge) {
    const cacheResult = this._cachedRequests[requestKey];
    if (!cacheResult) {
      return;
    }

    const cacheAge = Date.now() - cacheResult.createdAt;
    if (maxAge !== null && cacheAge > maxAge) {
      return;
    }

    return cacheResult.response;
  }

  /**
   * Delete all items from the cache with the given key
   * @param {string} requestKey key by which the request is stored
   */
  delete(requestKey) {
    Object.keys(this._cachedRequests).forEach(key => {
      if (key === requestKey) {
        delete this._cachedRequests[key];
        this.resolvePendingRequest(key);
      }
    });
  }

  /**
   * Delete all items from the cache that match given regex
   * @param {RegExp} regex an regular expression to match cache entries
   */
  deleteMatched(regex) {
    Object.keys(this._cachedRequests).forEach(requestKey => {
      if (new RegExp(regex).test(requestKey)) {
        delete this._cachedRequests[requestKey];
        this.resolvePendingRequest(requestKey);
      }
    });
  }
}
/**
 * The current cache
 * @type {Cache}
 */
let cache;

/**
 * The identifier for the current cache
 * @type {string | undefined}
 */
let currentCacheIdentifier;

/**
 * Serialize search parameters into url query string parameters.
 * If params === null, returns ''
 * @param {Params} params query string parameters object
 * @returns {string} of querystring parameters WITHOUT `?` or empty string ''
 */
export const stringifySearchParams = (params = {}) =>
  typeof params === 'object' && params !== null ? new URLSearchParams(params).toString() : '';

/**
 * Returns the active cache instance for the current session
 * If 'cacheIdentifier' is undefined or different from the current cacheIdentifier, the cache is reset
 * @param {string} cacheIdentifier some identifier that is tied to the current session
 * @returns {Cache} The cache for this identifier
 */
export const getCache = cacheIdentifier => {
  if (cacheIdentifier == null || cacheIdentifier !== currentCacheIdentifier) {
    currentCacheIdentifier = cacheIdentifier;
    cache = new Cache();
  }
  return cache;
};

/**
 * @param {CacheOptions} options Options to match cache
 * @returns {ValidatedCacheOptions}
 */
export const validateCacheOptions = ({
  useCache = false,
  methods = ['get'],
  timeToLive,
  invalidateUrls,
  invalidateUrlsRegex,
  requestIdentificationFn,
}) => {
  // validate 'cache'
  if (typeof useCache !== 'boolean') {
    throw new Error('Property `useCache` should be `true` or `false`');
  }

  if (methods[0] !== 'get' || methods.length !== 1) {
    throw new Error('Functionality to use cache on anything except "get" is not yet supported');
  }

  // validate 'timeToLive', default 1 hour
  if (timeToLive === undefined) {
    timeToLive = DEFAULT_TIME_TO_LIVE;
  }
  if (typeof timeToLive === 'number' && !Number.isNaN(timeToLive)) {
    throw new Error('Property `timeToLive` must be of type `number`');
  }
  // validate 'invalidateUrls', must be an `Array` or `falsy`
  if (invalidateUrls) {
    if (!Array.isArray(invalidateUrls)) {
      throw new Error('Property `invalidateUrls` must be of type `Array` or `falsy`');
    }
  }
  // validate 'invalidateUrlsRegex', must be an regex expression or `falsy`
  if (invalidateUrlsRegex) {
    if (!(invalidateUrlsRegex instanceof RegExp)) {
      throw new Error('Property `invalidateUrlsRegex` must be of type `RegExp` or `falsy`');
    }
  }
  // validate 'requestIdentificationFn', default is url + searchParams
  if (requestIdentificationFn) {
    if (typeof requestIdentificationFn !== 'function') {
      throw new Error('Property `requestIdentificationFn` must be of type `function`');
    }
  } else {
    // eslint-disable-next-line no-shadow
    requestIdentificationFn = /** @param {any} data */ ({ url, params }, stringifySearchParams) => {
      const serializedParams = stringifySearchParams(params);
      return serializedParams ? `${url}?${serializedParams}` : url;
    };
  }

  return {
    useCache,
    methods,
    timeToLive,
    invalidateUrls,
    invalidateUrlsRegex,
    requestIdentificationFn,
  };
};
