import './typedef.js';

export default class Cache {
  constructor() {
    /**
     * @type {{ [requestId: string]: { createdAt: number, response: CacheResponse } }}
     * @private
     */
    this._cachedRequests = {};
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
   * @param {number} maxAge maximum age of a cached request to serve from cache, in milliseconds
   * @returns {CacheResponse | undefined}
   */
  get(requestId, maxAge = 0) {
    const cachedRequest = this._cachedRequests[requestId];
    if (!cachedRequest) {
      return;
    }
    const cachedRequestAge = Date.now() - cachedRequest.createdAt;
    if (Number.isFinite(maxAge) && cachedRequestAge < maxAge) {
      // eslint-disable-next-line consistent-return
      return cachedRequest.response;
    }
  }

  /**
   * Delete all items from the cache that match given regex/string
   * @param {RegExp | string } regex an regular expression to match cache entries
   */
  delete(regex) {
    Object.keys(this._cachedRequests).forEach(requestId => {
      if (new RegExp(regex).test(requestId)) {
        delete this._cachedRequests[requestId];
      }
    });
  }

  reset() {
    this._cachedRequests = {};
  }
}
