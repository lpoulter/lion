import './typedef.js';

export default class Cache {
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
