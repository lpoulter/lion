import './typedef.js';

class Cache {
  constructor() {
    /**
     * @type {{ [requestId: string]: { createdAt: number, response: CacheResponse } }}
     * @private
     */
    this._cachedRequests = {};
    /**
     * @type {{ [requestId: string]: { promise: Promise<void>, resolve: (value?: any) => void } }}
     * @private
     */
    this._pendingRequests = {};
  }

  /**
   * Creates a promise for a pending request with given key
   * @param {string} requestId
   */
  setPendingRequest(requestId) {
    if (this._pendingRequests[requestId]) {
      return;
    }
    /** @type {(value?: any) => void } */
    let resolve;
    const promise = new Promise(_resolve => {
      resolve = _resolve;
    });
    // @ts-ignore
    this._pendingRequests[requestId] = { promise, resolve };
  }

  /**
   * Gets the promise for a pending request with given key
   * @param {string} requestId
   * @returns {Promise<void> | undefined}
   */
  getPendingRequest(requestId) {
    return this._pendingRequests[requestId]?.promise;
  }

  /**
   * Resolves the promise for a pending request with given key
   * @param {string} requestId
   */
  resolvePendingRequest(requestId) {
    this._pendingRequests[requestId]?.resolve();
    delete this._pendingRequests[requestId];
  }

  /**
   * Store an item in the cache
   * @param {string} requestId key by which the request is stored
   * @param {Response} response the cached response
   */
  set(requestId, response) {
    this._cachedRequests[requestId] = {
      createdAt: Date.now(),
      response,
    };
  }

  /**
   * Retrieve an item from the cache
   * @param {string} requestId key by which the cache is stored
   * @param {number} maxCacheAge maximum age of a cached request to serve from cache
   * @returns {CacheResponse | undefined}
   */
  get(requestId, maxCacheAge) {
    const cachedRequest = this._cachedRequests[requestId];
    if (!cachedRequest) {
      return;
    }
    const cachedRequestAge = Date.now() - cachedRequest.createdAt;
    if (Number.isFinite(maxCacheAge) && cachedRequestAge < maxCacheAge) {
      // eslint-disable-next-line consistent-return
      return cachedRequest.response;
    }
  }

  /**
   * Delete all items from the cache that match given regex/string
   * @param {RegExp | string } regex an regular expression to match cache entries
   */
  deleteMatched(regex) {
    Object.keys(this._cachedRequests).forEach(requestId => {
      if (new RegExp(regex).test(requestId)) {
        delete this._cachedRequests[requestId];
        this.resolvePendingRequest(requestId);
      }
    });
  }
}

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
export const getCache = cacheId => {
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
export const stringifySearchParams = (params = {}) =>
  typeof params === 'object' && params !== null ? new URLSearchParams(params).toString() : '';

/**
 * Returns request key string, which uniquely identifies a Request
 * @param {Partial<CacheRequest>} request Request object
 * @param {function} serializeSearchParams Function to serialize URL search params
 * @returns {string} requestId to uniquely identify a request
 */
const DEFAULT_GET_REQUEST_ID = ({ url = '', params }, serializeSearchParams) => {
  const serializedParams = serializeSearchParams(params);
  return serializedParams ? `${url}?${serializedParams}` : url;
};

/**
 * Defaults to 1 hour
 */
const DEFAULT_TIME_TO_LIVE = 1000 * 60 * 60;

/**
 * @param {CacheOptions} options Options to match cache
 * @returns {ValidatedCacheOptions}
 */
export const sanitiseCacheOptions = ({
  useCache = false,
  methods = ['get'],
  timeToLive = DEFAULT_TIME_TO_LIVE,
  getRequestId = DEFAULT_GET_REQUEST_ID,
  invalidateUrls,
  invalidateUrlsRegex,
}) => {
  if (typeof useCache !== 'boolean') {
    throw new Error('Property `useCache` must be a `boolean`');
  }
  if (JSON.stringify(methods) !== JSON.stringify(['get'])) {
    throw new Error('Cache can only be utilized with `GET` method');
  }
  if (!Number.isFinite(timeToLive)) {
    throw new Error('Property `timeToLive` must be a finite `number`');
  }
  if (invalidateUrls && !Array.isArray(invalidateUrls)) {
    throw new Error('Property `invalidateUrls` must be an `Array` or `falsy`');
  }
  if (invalidateUrlsRegex && !(invalidateUrlsRegex instanceof RegExp)) {
    throw new Error('Property `invalidateUrlsRegex` must be a `RegExp` or `falsy`');
  }
  if (getRequestId && typeof getRequestId !== 'function') {
    throw new Error('Property `getRequestId` must be a `function`');
  }

  return {
    useCache,
    methods,
    timeToLive,
    invalidateUrls,
    invalidateUrlsRegex,
    getRequestId,
  };
};
