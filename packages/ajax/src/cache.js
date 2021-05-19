import './typedef.js';

class Cache {
  constructor() {
    /**
     * @type {{ [requestKey: string]: { createdAt: number, response: CacheResponse } }}
     * @private
     */
    this._cachedRequests = {};
    /**
     * @type {{ [requestKey: string]: { promise: Promise<void>, resolve: (value?: any) => void } }}
     * @private
     */
    this._pendingRequests = {};
  }

  /**
   * Creates a promise for a pending request with given key
   * @param {string} requestKey
   */
  setPendingRequest(requestKey) {
    if (this._pendingRequests[requestKey]) {
      return;
    }
    /** @type {(value?: any) => void } */
    let resolve;
    const promise = new Promise(_resolve => {
      resolve = _resolve;
    });
    // @ts-ignore
    this._pendingRequests[requestKey] = { promise, resolve };
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
   * @param {number} maxCacheAge maximum age of a cached request to serve from cache
   * @returns {CacheResponse | undefined}
   */
  get(requestKey, maxCacheAge) {
    const cachedRequest = this._cachedRequests[requestKey];
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
 * Stringify URL search params
 * @param {Params} params query string parameters object
 * @returns {string} of querystring parameters WITHOUT `?` or empty string ''
 */
export const stringifySearchParams = (params = {}) =>
  typeof params === 'object' && params !== null ? new URLSearchParams(params).toString() : '';

/**
 * Returns the active cache instance for the current session
 * @param {string} cacheIdentifier The identifier that is tied to the current session
 * @returns {Cache} The cache corresponding to given cache identifier
 */
export const getCache = cacheIdentifier => {
  const shouldResetCache = !cacheIdentifier || cacheIdentifier !== currentCacheIdentifier;
  if (shouldResetCache) {
    currentCacheIdentifier = cacheIdentifier;
    cache = new Cache();
  }
  return cache;
};

/**
 * Defaults to 1 hour
 */
const DEFAULT_TIME_TO_LIVE = 1000 * 60 * 60;

/**
 * Returns requestKey, which uniquely identifies a Request
 * @param {Partial<CacheRequest>} request Request object
 * @param {function} serializeSearchParams Function to serialize URL search params
 * @returns {string} requestKey to uniquely identify a request
 */
const DEFAULT_REQUEST_IDENTIFICATION_FN = ({ url, params }, serializeSearchParams) => {
  const serializedParams = serializeSearchParams(params);
  const requestKey = serializedParams ? `${url}?${serializedParams}` : url;
  return String(requestKey);
};

/**
 * @param {CacheOptions} options Options to match cache
 * @returns {ValidatedCacheOptions}
 */
export const validateCacheOptions = ({
  useCache = false,
  methods = ['get'],
  timeToLive = DEFAULT_TIME_TO_LIVE,
  requestIdentificationFn = DEFAULT_REQUEST_IDENTIFICATION_FN,
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
  if (requestIdentificationFn && typeof requestIdentificationFn !== 'function') {
    throw new Error('Property `requestIdentificationFn` must be a `function`');
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
